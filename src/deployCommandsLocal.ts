import 'dotenv/config';
import { REST, Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from './types/index.js';

const __dirname = import.meta.dirname;

const { BOT_ID, TOKEN } = process.env;

if (!BOT_ID || !TOKEN) {
  throw new Error('BOT_ID and TOKEN must be defined in environment variables');
}

/**
 * Guild list structure from guildList.json
 */
interface GuildList {
  [guildName: string]: string;
}

// Read and parse the guildList.json file
const guildListPath = path.join(__dirname, '..', 'guildList.json');

if (!fs.existsSync(guildListPath)) {
  console.error(
    'Error: guildList.json not found. Please copy guildList.json.example to guildList.json and configure your guild IDs.',
  );
  process.exit(1);
}

const guildList: GuildList = JSON.parse(fs.readFileSync(guildListPath, 'utf-8'));

const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
// Grab all the command folders from the commands directory
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  // Grab all the command files from the commands directory
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  console.log(`loading commands from ${folder}/`);
  console.log(commandFiles);

  // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const module = (await import(filePath)) as { default: Command };
    const command = module.default;

    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
      );
    }
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(TOKEN);

/**
 * Deploys commands to a specific guild
 * @param guildName The name of the guild
 * @param guildId The ID of the guild
 */
async function deployCommands(guildName: string, guildId: string): Promise<void> {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands on guild ${guildName} (${guildId}).`,
    );

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = (await rest.put(Routes.applicationGuildCommands(BOT_ID!, guildId), {
      body: commands,
    })) as unknown[];

    console.log(
      `✅ Successfully reloaded ${data.length} application (/) commands on ${guildName} (${guildId}).`,
    );
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
}

// Deploy commands to all guilds in the list
for (const [guildName, guildId] of Object.entries(guildList)) {
  await deployCommands(guildName, guildId);
}
