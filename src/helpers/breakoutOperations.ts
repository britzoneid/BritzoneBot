import { ChannelType, type Guild, type VoiceChannel, type GuildMember, type CommandInteraction } from 'discord.js';
import breakoutRoomManager from './breakoutRoomManager.js';
import stateManager from './breakoutStateManager.js';
import createChannel from './createChannel.js';
import moveUser from './moveUser.js';
import type { OperationResult } from '../types/index.js';
import type { UserDistribution } from './distributeUsers.js';

/**
 * Result of checking for existing breakout rooms
 */
export interface ExistingRoomsResult {
  exists: boolean;
  rooms: VoiceChannel[];
  source?: 'stored' | 'pattern';
}

/**
 * Checks if breakout rooms already exist for the guild
 */
export async function hasExistingBreakoutRooms(guild: Guild): Promise<ExistingRoomsResult> {
  // Check in room manager first
  const storedRooms = breakoutRoomManager.getRooms(guild.id);
  if (storedRooms && storedRooms.length > 0) {
    // Verify rooms still exist in guild
    const existingRooms = storedRooms.filter((room) => guild.channels.cache.has(room.id));

    if (existingRooms.length > 0) {
      return {
        exists: true,
        rooms: existingRooms,
        source: 'stored',
      };
    }
  }

  // Fallback: Check for rooms by naming pattern
  const patternRooms = Array.from(
    guild.channels.cache
      .filter(
        (channel) =>
          channel.type === ChannelType.GuildVoice && channel.name.startsWith('breakout-room-'),
      )
      .values(),
  ) as VoiceChannel[];

  if (patternRooms.length > 0) {
    return {
      exists: true,
      rooms: patternRooms,
      source: 'pattern',
    };
  }

  return { exists: false, rooms: [] };
}

/**
 * Checks if a distribution is currently active
 */
export async function hasActiveDistribution(guildId: string): Promise<boolean> {
  const mainRoom = breakoutRoomManager.getMainRoom(guildId);
  if (!mainRoom) return false;

  const rooms = breakoutRoomManager.getRooms(guildId);
  if (!rooms || rooms.length === 0) return false;

  // Check if at least one room has members in it
  return rooms.some((room) => room.members && room.members.size > 0);
}

/**
 * Create breakout rooms with checkpointing
 */
export async function createBreakoutRooms(
  interaction: CommandInteraction,
  numRooms: number,
  force: boolean = false,
): Promise<OperationResult> {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    return {
      success: false,
      message: 'This command can only be used in a guild.',
    };
  }

  const operationType = 'create';

  // Check if there's an operation in progress
  const inProgress = await stateManager.hasOperationInProgress(guildId);
  if (inProgress) {
    return await resumeOperation(interaction);
  }

  // Check for existing breakout rooms
  const existingRooms = await hasExistingBreakoutRooms(interaction.guild);
  if (existingRooms.exists && !force) {
    return {
      success: false,
      message: `There are already ${existingRooms.rooms.length} breakout rooms in this server. Use '/breakout create' with the force flag set to true to replace them, or '/breakout end' first to clean up existing rooms.`,
    };
  }

  // If force is true and rooms exist, end the current session first
  if (force && existingRooms.exists && interaction.channel) {
    console.log(`🔄 Force flag enabled, cleaning up ${existingRooms.rooms.length} existing rooms`);
    const mainChannel = interaction.channel; // Use current channel as fallback
    await endBreakoutSession(interaction, mainChannel as VoiceChannel, true);
  }

  // Start new operation
  await stateManager.startOperation(guildId, operationType, { numRooms });

  try {
    const createdChannels: VoiceChannel[] = [];
    const parent = (interaction.channel as any)?.parent || interaction.guild;

    // Create each breakout room with checkpointing
    for (let i = 1; i <= numRooms; i++) {
      const roomName = `breakout-room-${i}`;

      // Check if this step was already completed in a previous attempt
      const steps = await stateManager.getCompletedSteps(guildId);
      if (steps[`create_room_${i}`]) {
        console.log(`⏭️ Room ${roomName} was already created, skipping`);

        // Try to find the existing channel
        const existingChannel = interaction.guild.channels.cache.find(
          (c) => c.name === roomName && c.type === ChannelType.GuildVoice,
        );

        if (existingChannel) {
          createdChannels.push(existingChannel as VoiceChannel);
          continue;
        }
      }

      console.log(`📂 Creating voice channel: ${roomName}`);
      try {
        const channel = await createChannel(parent, roomName);
        createdChannels.push(channel);
        await stateManager.updateProgress(guildId, `create_room_${i}`, { channelId: channel.id });
      } catch (error) {
        console.error(`❌ Failed to create ${roomName}:`, error);
        throw error;
      }
    }

    // Store the created breakout rooms
    await stateManager.updateProgress(guildId, 'store_rooms', {
      roomIds: createdChannels.map((c) => c.id),
    });
    breakoutRoomManager.storeRooms(guildId, createdChannels);

    // Complete operation
    await stateManager.completeOperation(guildId);

    return {
      success: true,
      message: `Successfully created ${numRooms} breakout voice channels${
        (interaction.channel as any)?.parent ? ' in the same category' : ''
      }!`,
    };
  } catch (error) {
    console.error(`❌ Error in createBreakoutRooms:`, error);
    return {
      success: false,
      message:
        'An error occurred while creating breakout rooms. You can try running the command again to resume the process.',
    };
  }
}

/**
 * Distribute users to breakout rooms with checkpointing
 */
export async function distributeToBreakoutRooms(
  interaction: CommandInteraction,
  mainRoom: VoiceChannel,
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

  // Check if there's an operation in progress
  const inProgress = await stateManager.hasOperationInProgress(guildId);
  if (inProgress) {
    return await resumeOperation(interaction);
  }

  // Check if distribution is already active
  const isDistributionActive = await hasActiveDistribution(guildId);
  if (isDistributionActive && !force) {
    return {
      success: false,
      message:
        "Users are already distributed to breakout rooms. Use '/breakout distribute' with the force flag set to true to redistribute, or use '/breakout end' first to end the current session.",
    };
  }

  // If force is true and distribution is active, end current session first
  if (force && isDistributionActive) {
    console.log(`🔄 Force flag enabled, ending current distribution before redistribution`);
    await endBreakoutSession(interaction, mainRoom, true);
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

  try {
    // Store the main room for future reference
    await stateManager.updateProgress(guildId, 'set_main_room');
    breakoutRoomManager.setMainRoom(guildId, mainRoom);

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

      // Check which users were already moved in a previous attempt
      const steps = await stateManager.getCompletedSteps(guildId);

      for (const user of users) {
        const moveKey = `move_user_${user.id}_to_${roomId}`;

        if (steps[moveKey]) {
          console.log(`⏭️ User ${user.user.tag} was already moved to ${room.name}, skipping`);
          moveResults.success.push(`${user.user.tag} → ${room.name}`);
          continue;
        }

        console.log(`🚚 Attempting to move ${user.user.tag} to channel: ${room.name}`);

        movePromises.push(
          moveUser(user, room)
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
    console.error(`❌ Error in distributeToBreakoutRooms:`, error);
    return {
      success: false,
      message:
        'An error occurred while distributing users. You can try running the command again to resume the process.',
    };
  }
}

/**
 * End breakout sessions with checkpointing
 */
export async function endBreakoutSession(
  interaction: CommandInteraction,
  mainChannel: VoiceChannel,
  force: boolean = false,
): Promise<OperationResult> {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    return {
      success: false,
      message: 'This command can only be used in a guild.',
    };
  }

  const operationType = 'end';

  // Check if there's an operation in progress
  const inProgress = await stateManager.hasOperationInProgress(guildId);
  if (inProgress) {
    return await resumeOperation(interaction);
  }

  // Get breakout rooms
  let breakoutRooms = breakoutRoomManager.getRooms(guildId);

  // If no stored rooms, identify them by name pattern as fallback
  if (!breakoutRooms || breakoutRooms.length === 0) {
    breakoutRooms = Array.from(
      interaction.guild.channels.cache
        .filter(
          (channel) =>
            channel.type === ChannelType.GuildVoice && channel.name.startsWith('breakout-room-'),
        )
        .values(),
    ) as VoiceChannel[];
  }

  if (breakoutRooms.length === 0) {
    console.log(`⚠️ No breakout rooms found to end.`);
    return {
      success: false,
      message: 'No breakout rooms found to end!',
    };
  }

  // Check if any rooms have users in them
  let hasUsers = false;
  let totalUsers = 0;

  for (const room of breakoutRooms) {
    const guildRoom = interaction.guild.channels.cache.get(room.id) as VoiceChannel | undefined;
    if (guildRoom && guildRoom.members && guildRoom.members.size > 0) {
      hasUsers = true;
      totalUsers += guildRoom.members.size;
    }
  }

  // If no users are found and we're not forcing, warn the user
  if (!hasUsers && !force) {
    return {
      success: false,
      message: `No users found in any breakout rooms. Use '/breakout end' with the force flag set to true if you still want to end the session and delete the rooms.`,
    };
  }

  // Start new operation
  await stateManager.startOperation(guildId, operationType, {
    mainRoomId: mainChannel.id,
    roomIds: breakoutRooms.map((room) => room.id),
  });

  console.log(
    `🔍 Found ${breakoutRooms.length} breakout room(s) to process with ${totalUsers} total users.`,
  );

  let totalMoved = 0;
  let totalRooms = breakoutRooms.length;
  let deletedRooms = 0;

  try {
    // Process each room one by one with checkpoints
    for (const room of breakoutRooms) {
      if (!room) continue;

      console.log(`📌 Processing breakout room: ${room.name} (${room.id})`);

      // Check if we already processed this room
      const steps = await stateManager.getCompletedSteps(guildId);
      const roomProcessedKey = `room_processed_${room.id}`;

      if (steps[roomProcessedKey]) {
        console.log(`⏭️ Room ${room.name} was already processed, skipping`);
        deletedRooms++;
        continue;
      }

      // Move members first
      try {
        // Check if the room still exists in the guild
        const guildRoom = interaction.guild.channels.cache.get(room.id) as VoiceChannel | undefined;
        if (!guildRoom) {
          console.log(`⚠️ Room ${room.name} (${room.id}) no longer exists, skipping`);
          await stateManager.updateProgress(guildId, roomProcessedKey, { skipped: true });
          deletedRooms++; // Count as deleted since it doesn't exist anymore
          continue;
        }

        // Move each member
        if (guildRoom.members && guildRoom.members.size > 0) {
          for (const [memberId, member] of guildRoom.members) {
            const memberMovedKey = `member_moved_${memberId}_from_${room.id}`;

            if (steps[memberMovedKey]) {
              console.log(`⏭️ Member ${member.user.tag} was already moved, skipping`);
              totalMoved++;
              continue;
            }

            try {
              await member.voice.setChannel(mainChannel);
              console.log(`✅ Moved ${member.user.tag} from ${room.name} to ${mainChannel.name}`);
              await stateManager.updateProgress(guildId, memberMovedKey);
              totalMoved++;
            } catch (error) {
              console.error(`❌ Failed to move ${member.user.tag} from ${room.name}:`, error);
            }
          }
        }

        // Then delete the room
        const roomDeletedKey = `room_deleted_${room.id}`;
        if (!steps[roomDeletedKey]) {
          try {
            await guildRoom.delete('Breakout room ended and members moved back to main room');
            console.log(`🗑️ Deleted breakout room: ${room.name}`);
            await stateManager.updateProgress(guildId, roomDeletedKey);
            deletedRooms++;
          } catch (error) {
            console.error(`❌ Failed to delete breakout room ${room.name}:`, error);
          }
        } else {
          console.log(`⏭️ Room ${room.name} was already deleted, skipping`);
          deletedRooms++;
        }

        // Mark this room as fully processed
        await stateManager.updateProgress(guildId, roomProcessedKey);
      } catch (error) {
        console.error(`❌ Error processing room ${room.name}:`, error);
        // Continue with other rooms even if one fails
      }
    }

    // Clear the stored session data
    await stateManager.updateProgress(guildId, 'clear_session');
    breakoutRoomManager.clearSession(guildId);

    // Complete operation
    await stateManager.completeOperation(guildId);

    console.log(
      `🎉 Successfully moved ${totalMoved} member(s) back to ${mainChannel.name} and deleted ${deletedRooms}/${totalRooms} breakout room(s).`,
    );

    return {
      success: true,
      message: `Successfully moved ${totalMoved} member(s) back to ${mainChannel.name} and deleted ${deletedRooms}/${totalRooms} breakout room(s)!`,
    };
  } catch (error) {
    console.error(`❌ Error in endBreakoutSession:`, error);
    return {
      success: false,
      message:
        'An error occurred while ending the breakout session. You can try running the command again to resume the process.',
    };
  }
}

/**
 * Resume an in-progress operation
 */
async function resumeOperation(interaction: CommandInteraction): Promise<OperationResult> {
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    return {
      success: false,
      message: 'This command can only be used in a guild.',
    };
  }

  const currentOp = await stateManager.getCurrentOperation(guildId);

  if (!currentOp) {
    return {
      success: false,
      message: 'There was a problem resuming the previous operation. Please try starting a new command.',
    };
  }

  console.log(`🔁 Resuming ${currentOp.type} operation for guild ${guildId}`);

  switch (currentOp.type) {
    case 'create':
      // For create, just restart with the same params
      return await createBreakoutRooms(interaction, currentOp.params.numRooms);

    case 'distribute': {
      // For distribute, we need to reconstruct the distribution
      const mainRoom = interaction.guild.channels.cache.get(
        currentOp.params.mainRoomId,
      ) as VoiceChannel | undefined;
      if (!mainRoom) {
        await stateManager.completeOperation(guildId);
        return {
          success: false,
          message: 'Could not find the main room from the previous distribute operation.',
        };
      }

      // Reconstruct distribution from stored plan
      const distribution: UserDistribution = {};
      for (const [roomId, userIds] of Object.entries(
        currentOp.params.distribution as Record<string, string[]>,
      )) {
        distribution[roomId] = (userIds as string[])
          .map((id) => interaction.guild!.members.cache.get(id))
          .filter((member): member is GuildMember => member !== undefined);
      }

      return await distributeToBreakoutRooms(interaction, mainRoom, distribution);
    }

    case 'end': {
      // For end, just restart with the same main channel
      const mainChannel = interaction.guild.channels.cache.get(
        currentOp.params.mainRoomId,
      ) as VoiceChannel | undefined;
      if (!mainChannel) {
        await stateManager.completeOperation(guildId);
        return {
          success: false,
          message: 'Could not find the main room from the previous end operation.',
        };
      }

      return await endBreakoutSession(interaction, mainChannel);
    }

    default:
      await stateManager.completeOperation(guildId);
      return {
        success: false,
        message: 'Unknown operation type found. Starting fresh.',
      };
  }
}
