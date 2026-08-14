import {
	type CommandInteraction,
	MessageFlags,
	SlashCommandBuilder,
} from 'discord.js';
import { handleInteraction, replyOrEdit } from '@/lib/discord/response.js';
import type { Command } from '@/types/index.js';

export const HELP_GUIDE_TEXT = `### 🤖 Discord Bot — Quick Guide for Bot Manager

**Before the Session**

1. Get the "Bot Manager" role from the Server Admin.
2. Join the Main Room VC (e.g. "Room-1").

🚀 **Start of Live Stream — 7:30 PM**

3. Create the breakout rooms:
   \`/breakout create\`
   
   *Example: If there are 6 Facilitators, create 5 breakout rooms.*

4. Draft the participant distribution:
   \`/breakout distribute\`
   
   - **Main Room**: Select the Main Room VC.
   - **Exclude**: Tag and exclude:
     - Live-streamer
     - Main Room Host/Facilitator
     - 4 Participants staying in the Main Room
     - Co-facilitators
   - **Facilitators**: Tag all Facilitators except the Main Room Facilitator.
   
   *A preview will appear.*
   
   ⚠️ **DO NOT press "Confirm" yet.**
   
   *If the distribution needs to be changed, run \`/breakout distribute\` again and revise it.*

🗣️ **FGD Starts — 7:45 PM**

5. Confirm the distribution:
   
   - Press **↑ Up Arrow** on your keyboard to retrieve the previous command.
   - Press **Enter**.
   - Check the preview carefully.
   - If everything is correct, press **"Confirm"**.

6. Start the FGD timer:
   \`/breakout timer\`
   
   *Enter the FGD duration in minutes.*

📢 **During the FGD**

7. Send a broadcast message to all breakout rooms when needed:
   \`/breakout broadcast\`

🔙 **End of FGD**

8. If participants do not return to the Main Room as planned, use:
   \`/breakout recall\`
   
   *This will call everyone back to the Main Room.*`;

const command: Command = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Displays the quick guide for Bot Managers'),

	async execute(interaction: CommandInteraction): Promise<void> {
		await handleInteraction(
			interaction,
			async () => {
				await replyOrEdit(interaction, {
					content: HELP_GUIDE_TEXT,
					flags: MessageFlags.Ephemeral,
				});
			},
			{ ephemeral: true },
		);
	},
};

export default command;
