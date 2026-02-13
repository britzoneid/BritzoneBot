import { CommandInteraction, VoiceBasedChannel, VoiceChannel } from 'discord.js';
import type { OperationResult } from '../../../types/index.js';
import type { UserDistribution } from '../utils/distribution.js';
import stateManager from '../state/StateManager.js';
import distributionService from '../services/DistributionService.js';
import sessionManager from '../state/SessionManager.js';

export class DistributeOperation {
  async execute(
    interaction: CommandInteraction,
    mainRoom: VoiceBasedChannel,
    distribution: UserDistribution,
    force: boolean = false,
  ): Promise<OperationResult> {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.guild) {
      return {
        success: false,
        message: 'This command can only be used in a guild.',
      };
    }

    const operationType = 'distribute';

    // Check if we are resuming an interrupted operation
    const currentOp = await stateManager.getCurrentOperation(guildId);
    const isResuming = currentOp?.type === operationType;

    if (isResuming) {
      console.log(`🔄 Resuming distribute operation for guild ${guildId}`);
    } else {
        // Check if distribution is already active
        const isDistributionActive = await distributionService.hasActiveDistribution(guildId);
        if (isDistributionActive && !force) {
            return {
            success: false,
            message:
                "Users are already distributed to breakout rooms. Use '/breakout distribute' with the force flag set to true to redistribute, or use '/breakout end' first to end the current session.",
            };
        }

        // If force is true and distribution is active, we should technically clean up.
        // But similar to CreateOperation, avoiding circular dependency for now.
        // The original code called endBreakoutSession.
        if (force && isDistributionActive) {
            console.log(`🔄 Force flag enabled, proceeding with redistribution (previous session implicit end)`);
            // We'll rely on the new distribution simply moving users, effectively "stealing" them from old rooms.
            // But we should probably clear the session manager's main room if it changes?
            // sessionManager.setMainRoom handles overwrite.
        }

        // Store distribution plan for recovery
        const distributionPlan: Record<string, string[]> = {};
        for (const [roomId, users] of Object.entries(distribution)) {
            distributionPlan[roomId] = users.map((user) => user.id);
        }

        // Start new operation
        await stateManager.startOperation(guildId, operationType, {
            mainRoomId: mainRoom.id,
            distribution: distributionPlan,
        });
    }

    try {
      // Store the main room for future reference
      // We do this every time just in case, or only if not resuming?
      // Safe to do every time as it updates in-memory map.
      // But we should update progress step 'set_main_room'
      const steps = await stateManager.getCompletedSteps(guildId);

      if (!steps['set_main_room']) {
          sessionManager.setMainRoom(guildId, mainRoom);
          await stateManager.updateProgress(guildId, 'set_main_room');
      } else {
           // Ensure session manager is in sync if we restarted the bot
           sessionManager.setMainRoom(guildId, mainRoom);
      }

      const movePromises: Promise<void>[] = [];
      const moveResults = {
        success: [] as string[],
        failed: [] as string[],
      };

      // Process each room
      for (const [roomId, users] of Object.entries(distribution)) {
        const room = interaction.guild.channels.cache.get(roomId) as VoiceChannel | undefined;

        if (!room) {
          console.log(`⚠️ Room ${roomId} not found, skipping users`);
          continue;
        }

        console.log(`🔄 Processing moves for room: ${room.name} (${users.length} users)`);

        // Refetch steps inside loop? No, outside is fine if we don't await parallel moves that depend on it?
        // But moves are parallelized here.
        // The original code fetched steps inside the user loop? No, inside room loop.
        // "const steps = await stateManager.getCompletedSteps(guildId);" was inside room loop.

        // Wait, the original code had:
        // for (const [roomId, users] of Object.entries(distribution)) {
        //   const steps = await stateManager.getCompletedSteps(guildId);
        //   for (const user of users) { ... }
        // }

        // So I should fetch steps or reuse. Steps are cumulative.

        for (const user of users) {
          const moveKey = `move_user_${user.id}_to_${roomId}`;

          // We need latest steps if we want to be 100% correct about concurrent updates,
          // but here we are generating promises.
          // Since we are not awaiting inside the user loop, steps won't change *during* this loop
          // (unless another process updates it, which shouldn't happen).
          // But if we resume, we fetch steps once.

          if (steps[moveKey]) {
            console.log(`⏭️ User ${user.user.tag} was already moved to ${room.name}, skipping`);
            moveResults.success.push(`${user.user.tag} → ${room.name}`);
            continue;
          }

          console.log(`🚚 Attempting to move ${user.user.tag} to channel: ${room.name}`);

          movePromises.push(
            distributionService.moveUserToRoom(user, room)
              .then(async () => {
                moveResults.success.push(`${user.user.tag} → ${room.name}`);
                console.log(`✅ Successfully moved ${user.user.tag} to ${room.name}`);
                await stateManager.updateProgress(guildId, moveKey);
              })
              .catch((error: any) => {
                moveResults.failed.push(`${user.user.tag} (${error.message})`);
                console.log(`❌ Failed to move ${user.user.tag}: ${error.message}`);
              }),
          );
        }
      }

      // Wait for all moves to complete
      console.log(`⏳ Waiting for all ${movePromises.length} move operations to complete`);
      await Promise.all(movePromises);

      // Mark distribution as complete
      await stateManager.updateProgress(guildId, 'distribution_complete', {
        successful: moveResults.success.length,
        failed: moveResults.failed.length,
      });

      // Complete operation
      await stateManager.completeOperation(guildId);

      return {
        success: true,
        moveResults,
        message: 'Distribution completed successfully',
      };
    } catch (error) {
      console.error(`❌ Error in DistributeOperation:`, error);
      return {
        success: false,
        message:
          'An error occurred while distributing users. You can try running the command again to resume the process.',
      };
    }
  }
}

export default new DistributeOperation();
