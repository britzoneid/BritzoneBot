# BritzoneBot: Complete TypeScript Migration Guide

This guide will help you migrate your Discord.js v14 JavaScript bot to TypeScript. It covers setup, migration strategies, type definitions, and best practices learned from the discord.js codebase.

---

## Table of Contents

1. [Why Migrate to TypeScript?](#why-migrate)
2. [Phase 1: Setup & Configuration](#phase-1-setup)
3. [Phase 2: Type Definitions](#phase-2-types)
4. [Phase 3: Incremental Migration](#phase-3-migration)
5. [Phase 4: Advanced Patterns](#phase-4-advanced)
6. [Build & Deployment](#build-deployment)
7. [Common Issues & Solutions](#common-issues)

---

## Why Migrate to TypeScript?

### Benefits:
- **Type Safety**: Catch errors at compile-time instead of runtime
- **Better IDE Support**: Autocomplete, inline documentation, refactoring
- **Maintainability**: Self-documenting code through type annotations
- **Scalability**: Easier to refactor large codebases
- **Discord.js Native Support**: discord.js v14 has comprehensive native type definitions

### Your Bot's Current Structure:
```
BritzoneBot/
├── index.js              (entry point)
├── commands/
│   ├── main/
│   │   └── breakout.js   (slash commands)
│   └── utility/
├── events/
│   ├── ready.js
│   └── interactionCreate.js
└── helpers/              (utility functions)
```

---

## Phase 1: Setup & Configuration

### Step 1.1: Add TypeScript Dependencies

```bash
bun add -D typescript @types/node
```

**Why these packages?**
- `typescript`: TypeScript compiler
- `@types/node`: Type definitions for Node.js APIs (fs, path, process, etc.)

### Step 1.2: Create `tsconfig.json`

Create a `tsconfig.json` in your project root:

```json
{
  "compilerOptions": {
    // Language and Environment
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020"],
    
    // Module Resolution
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    
    // Emit Settings
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    
    // Type Checking - STRICT (recommended for new code)
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    
    // Interop Constraints
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts"
  ]
}
```

**Key Explanations:**
- `target: "ES2020"`: Modern JavaScript features that Node.js 22+ supports
- `module: "ES2020"`: ESM modules (matching your `"type": "module"`)
- `strict: true`: Enables all strict type-checking options
- `noUnusedLocals/Parameters`: Catches dead code automatically
- `allowJs: true`: Allows gradual migration (JS and TS can coexist)

### Step 1.3: Update `package.json`

```json
{
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "bun dist/index.js",
    "dev": "bun --watch src/index.ts",
    "deploy": "bun dist/deployCommandsLocal.js",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.9.0"
  }
}
```

### Step 1.4: Create Directory Structure

```bash
# Create src directory and migrate files
mkdir -p src/{commands/{main,utility},events,helpers,types}
```

Your new structure will be:
```
BritzoneBot/
├── src/
│   ├── index.ts              (migrated entry point)
│   ├── deployCommandsLocal.ts (migrated deploy script)
│   ├── types/
│   │   ├── command.ts        (command type definitions)
│   │   ├── event.ts          (event type definitions)
│   │   └── index.ts          (export all types)
│   ├── commands/
│   │   ├── main/
│   │   │   └── breakout.ts
│   │   └── utility/
│   ├── events/
│   │   ├── ready.ts
│   │   └── interactionCreate.ts
│   └── helpers/
│       ├── safeReply.ts
│       ├── isAdmin.ts
│       └── ...
├── dist/                     (compiled output)
├── tsconfig.json
└── package.json
```

---

## Phase 2: Type Definitions

This is the foundation of your TypeScript migration. Define types that match your code patterns.

### Step 2.1: Command Type Definition

Create `src/types/command.ts`:

```typescript
import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ContextMenuCommandBuilder } from 'discord.js';

/**
 * Represents a slash command in your bot
 * Extends discord.js native types with your specific structure
 */
export interface Command {
  data: SlashCommandBuilder | ContextMenuCommandBuilder;
  /** Execute the command */
  execute(interaction: CommandInteraction): Promise<void>;
  /** Optional: command cooldown in seconds */
  cooldown?: number;
}

/**
 * Result from command operations
 * Used in your breakout command and other helpers
 */
export interface OperationResult {
  success: boolean;
  message: string;
  moveResults?: {
    failed: string[];
  };
}
```

**Why this structure?**
- Matches your `data` and `execute` pattern from `breakout.js`
- Includes optional `cooldown` for future extensibility
- `OperationResult` directly matches your JSDoc typedef

### Step 2.2: Event Type Definition

Create `src/types/event.ts`:

```typescript
import { ClientEvents, Client } from 'discord.js';

/**
 * Base event handler interface
 * All events follow this structure
 */
export interface Event<EventName extends keyof ClientEvents = keyof ClientEvents> {
  name: EventName;
  once?: boolean;
  execute(...args: ClientEvents[EventName]): Awaitable<void>;
}

/** Utility type for any awaitable value */
export type Awaitable<T> = T | Promise<T>;
```

**Why this approach?**
- `ClientEvents` is a union of all Discord.js events with their argument types
- This ensures your event handlers have correctly typed `args`
- `once?: boolean` matches your current pattern in `ready.js` and `interactionCreate.js`

### Step 2.3: Extend Client Type

Create `src/types/client.ts`:

```typescript
import { Collection, Client } from 'discord.js';
import { Command } from './command.js';

/**
 * Extended Client with custom properties
 * This allows TypeScript to understand client.commands
 */
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TOKEN: string;
      NODE_ENV?: 'development' | 'production';
    }
  }
}

export interface BritzoneClient extends Client {
  commands: Collection<string, Command>;
}
```

**Why extend?**
- Your code does `client.commands = new Collection()` in `index.js`
- This tells TypeScript that `BritzoneClient.commands` exists and is typed
- Ensures `client.commands.set()` and `.get()` have proper type checking

### Step 2.4: Export All Types

Create `src/types/index.ts`:

```typescript
export type { Command, OperationResult } from './command.js';
export type { Event, Awaitable } from './event.js';
export type { BritzoneClient } from './client.js';
```

---

## Phase 3: Incremental Migration

### Step 3.1: Migrate Entry Point (`index.js` → `index.ts`)

**BEFORE** (`index.js`):
```javascript
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import consoleStamp from 'console-stamp';

const __dirname = import.meta.dirname;

// ... rest of code
```

**AFTER** (`src/index.ts`):
```typescript
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection, GatewayIntentBits, Events } from 'discord.js';
import consoleStamp from 'console-stamp';
import type { BritzoneClient, Command, Event } from './types/index.js';

const __dirname = import.meta.dirname;

// Configure console-stamp
consoleStamp(console, { format: ':date(HH:MM:ss)' });

// Modify console.log to write to a log file
const logDir = path.join(__dirname, 'log');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}
const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);

const originalConsoleLog = console.log;

/**
 * Logs messages to both console and file
 * @param message The message to log
 * @param optionalParams Additional parameters
 */
console.log = function(message: string, ...optionalParams: any[]): void {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
  originalConsoleLog.apply(console, [message, ...optionalParams]);
};

console.log('🚀 Starting the bot...');

const token = process.env.TOKEN;
if (!token) {
  throw new Error('TOKEN environment variable is not defined');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
}) as BritzoneClient;

// Initialize commands collection with proper typing
client.commands = new Collection<string, Command>();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

console.log('📂 Loading commands...');
for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.ts'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const module = (await import(filePath)) as { default: Command };
    const command = module.default;
    
    // Type guard: ensure command has required properties
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`✅ Command loaded: ${command.data.name}`);
    } else {
      console.log(`⚠️ [WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.ts'));

console.log('🎉 Loading events...');
for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const module = (await import(filePath)) as { default: Event };
  const event = module.default;
  
  // Type guard with proper event type checking
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
    console.log(`🔄 One-time event loaded: ${event.name}`);
  } else {
    client.on(event.name, (...args) => event.execute(...args));
    console.log(`🔁 Event loaded: ${event.name}`);
  }
}

console.log('🔑 Logging in...');
client.login(token)
  .then(() => {
    console.log('✅ Bot logged in successfully!');
  })
  .catch((err: Error) => {
    console.log(`❌ Failed to log in: ${err.message}`);
    process.exit(1);
  });
```

**Key Changes:**
- Import types using `import type { ... }`
- Cast client as `BritzoneClient` for custom properties
- Use `as` type assertion for dynamic imports: `(await import(filePath)) as { default: Command }`
- Add proper error handling for missing TOKEN
- Filter for `.ts` files instead of `.js`
- Type guard checks still work the same way

### Step 3.2: Migrate Events

**BEFORE** (`events/ready.js`):
```javascript
import { Events } from 'discord.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`✅ Ready! Logged in as ${client.user.tag}`);
  },
};
```

**AFTER** (`src/events/ready.ts`):
```typescript
import { Events, Client } from 'discord.js';
import type { Event } from '../types/index.js';

const event: Event<typeof Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client) {
    // TypeScript knows client.user exists and is not null
    console.log(`✅ Ready! Logged in as ${client.user?.tag}`);
  },
};

export default event;
```

**Key Points:**
- Event is explicitly typed as `Event<typeof Events.ClientReady>`
- TypeScript auto-completes the event name and argument types
- `async` allows proper error handling if needed

**BEFORE** (`events/interactionCreate.js`):
```javascript
import { Events, MessageFlags, CommandInteraction } from 'discord.js';
import safeReply from '../helpers/safeReply.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;
    // ... rest of code
  },
};
```

**AFTER** (`src/events/interactionCreate.ts`):
```typescript
import { Events } from 'discord.js';
import type { Interaction } from 'discord.js';
import type { Event, BritzoneClient } from '../types/index.js';

const event: Event<typeof Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    // Type guard narrows the type
    if (!interaction.isChatInputCommand()) return;

    const client = interaction.client as BritzoneClient;
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    // Log command execution with details
    const options = interaction.options.data.map((opt) => {
      const value = opt.value;
      // Handle subcommands and subcommand groups
      if (opt.type === 1 || opt.type === 2) {
        return `${opt.name}[${opt.options?.map((o) => `${o.name}=${o.value}`).join(', ')}]`;
      }
      return `${opt.name}=${value}`;
    });

    console.log(`🔵 Command executed: ${interaction.commandName} ${options.join(' ')}`);

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      // Handle already replied/deferred interactions
      if (interaction.replied) {
        await interaction.followUp({
          content: '❌ An error occurred while executing this command.',
          ephemeral: true,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ An error occurred while executing this command.',
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred while executing this command.',
          ephemeral: true,
        });
      }
    }
  },
};

export default event;
```

### Step 3.3: Migrate Helpers

**BEFORE** (`helpers/safeReply.js`):
```javascript
/**
 * Safely handles Discord interactions with built-in error handling
 * @param {import('discord.js').Interaction} interaction - The Discord interaction
 * @param {Function} handler - Async function that handles the interaction
 * @param {Object} options - Options for handling the interaction
 * @param {boolean} options.deferReply - Whether to defer the reply before executing
 * @param {boolean} options.ephemeral - Whether the reply should be ephemeral
 */
async function safeReply(interaction, handler, options = {}) {
  const { deferReply = false, ephemeral = false } = options;
  // ... implementation
}
```

**AFTER** (`src/helpers/safeReply.ts`):
```typescript
import type { Interaction } from 'discord.js';

export interface SafeReplyOptions {
  deferReply?: boolean;
  ephemeral?: boolean;
}

/**
 * Safely handles Discord interactions with built-in error handling for expired interactions
 * @param interaction The Discord interaction to handle
 * @param handler Async function that handles the interaction
 * @param options Options for handling the interaction
 * @returns boolean indicating success
 */
export async function safeReply(
  interaction: Interaction,
  handler: () => Promise<void>,
  options: SafeReplyOptions = {},
): Promise<boolean> {
  const { deferReply = false, ephemeral = false } = options;

  try {
    // If deferReply is true, try to defer the reply first
    if (deferReply && !interaction.replied && !interaction.deferred) {
      try {
        // Set a timeout to avoid getting stuck on network issues
        const deferPromise = interaction.deferReply({ ephemeral });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Defer reply timeout')), 2500),
        );

        await Promise.race([deferPromise, timeoutPromise]);
        console.log(`🔄 Successfully deferred interaction ${interaction.id}`);
      } catch (deferError) {
        const error = deferError instanceof Error ? deferError : new Error(String(deferError));

        // If we can't defer, the interaction likely expired
        if (
          'code' in error &&
          error.code === 10062
        ) {
          console.log(`⏱️ Interaction ${interaction.id} expired before deferring`);
          return false;
        }

        // Handle network errors gracefully
        if (error.code === 'EAI_AGAIN' || error.message === 'Defer reply timeout') {
          console.log(`🌐 Network issue while deferring interaction ${interaction.id}: ${error.message}`);
          return false;
        }

        console.log(`❓ Unknown error while deferring interaction: ${error.message}`);
        return false;
      }
    }

    // Execute the handler function with timeout protection
    try {
      const handlerPromise = handler();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Handler execution timeout')), 8000),
      );

      await Promise.race([handlerPromise, timeoutPromise]);
      return true;
    } catch (handlerError) {
      const error = handlerError instanceof Error ? handlerError : new Error(String(handlerError));
      console.log(`❌ Handler error for interaction ${interaction.id}: ${error.message}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Unexpected error in safeReply for interaction ${interaction.id}`);
    return false;
  }
}

export default safeReply;
```

**Key Changes:**
- Define `SafeReplyOptions` interface instead of JSDoc
- Type function parameters with `Interaction`, `Promise<void>`, etc.
- Use `Promise<never>` for timeout promises that always reject
- Handle error types safely with `instanceof Error` checks
- Return type is explicit: `Promise<boolean>`

**BEFORE** (`helpers/isAdmin.js`):
```javascript
/**
 * Checks if a user has admin permissions
 * @param {import('discord.js').GuildMember} member - The guild member to check
 * @returns {boolean} True if the user is an admin
 */
export default function isAdmin(member) {
  return member.permissions.has('Administrator');
}
```

**AFTER** (`src/helpers/isAdmin.ts`):
```typescript
import type { GuildMember } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

/**
 * Checks if a user has admin permissions
 * @param member The guild member to check
 * @returns True if the user is an admin
 */
export default function isAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}
```

### Step 3.4: Migrate Complex Commands

**BEFORE** (`commands/main/breakout.js`):
```javascript
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from "discord.js";
import safeReply, { replyOrEdit } from "../../helpers/safeReply.js";
// ... other imports

/**
 * @typedef {Object} OperationResult
 * @property {boolean} success
 * @property {string} message
 * @property {Object} [moveResults]
 * @property {string[]} [moveResults.failed]
 */

export default {
  data: new SlashCommandBuilder()
    .setName("breakout")
    .setDescription("Manage breakout rooms for your voice channels")
    // ... slash command builder code
  
  async execute(interaction) {
    // ... command implementation
  }
};
```

**AFTER** (`src/commands/main/breakout.ts`):
```typescript
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  type CommandInteraction,
} from 'discord.js';
import type { Command } from '../../types/index.js';
import safeReply from '../../helpers/safeReply.js';
// ... other imports

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('breakout')
    .setDescription('Manage breakout rooms for your voice channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    // Create subcommand
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Creates multiple breakout voice channels')
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Number of breakout rooms to create')
            .setMinValue(1)
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName('force')
            .setDescription('Force creation even if rooms already exist')
            .setRequired(false),
        ),
    )
    // ... more subcommands
    .toJSON(),

  async execute(interaction: CommandInteraction): Promise<void> {
    // TypeScript knows interaction type and all methods
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create': {
        await safeReply(
          interaction,
          async () => {
            // TypeScript infers correct method signatures
            const count = interaction.options.getInteger('number', true);
            const force = interaction.options.getBoolean('force') ?? false;

            await interaction.reply({
              content: `Creating ${count} breakout rooms...`,
              ephemeral: true,
            });
            // ... rest of implementation
          },
          { deferReply: true, ephemeral: true },
        );
        break;
      }
      case 'distribute': {
        // ... distribute implementation
        break;
      }
      case 'end': {
        // ... end implementation
        break;
      }
    }
  },
};

export default command;
```

**Key TypeScript Benefits Here:**
- `interaction.options.getInteger()` has proper type checking
- `interaction.options.getBoolean()` returns `boolean | null`, handled with nullish coalescing
- `switch` ensures all subcommands are handled
- Full autocomplete and error detection

---

## Phase 4: Advanced Patterns

### Using Discriminated Unions for Command Types

As your bot grows, you might want different command types (slash, context menu). TypeScript shines here:

```typescript
// src/types/command.ts
import type {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  CommandInteraction,
  ContextMenuCommandInteraction,
} from 'discord.js';

export interface SlashCommand {
  type: 'slash';
  data: SlashCommandBuilder;
  execute(interaction: CommandInteraction): Promise<void>;
}

export interface ContextMenuCommand {
  type: 'context-menu';
  data: ContextMenuCommandBuilder;
  execute(interaction: ContextMenuCommandInteraction): Promise<void>;
}

export type Command = SlashCommand | ContextMenuCommand;
```

### Type Guards for Events

Events come in different shapes. Use type guards:

```typescript
// src/types/event.ts
import type { ClientEvents } from 'discord.js';

export type EventName = keyof ClientEvents;

export interface Event<T extends EventName = EventName> {
  name: T;
  once?: boolean;
  execute(...args: ClientEvents[T]): Promise<void> | void;
}

// Usage with proper typing:
import { Events } from 'discord.js';
import type { Event } from '../types/index.js';

const event: Event<typeof Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    //   ^? client is properly typed as Client
  },
};
```

### Configuration with TypeScript

Create a typed config file:

```typescript
// src/config.ts
export interface BotConfig {
  /** Discord bot token */
  token: string;
  /** Command prefix (if using prefix commands) */
  prefix: string;
  /** Default log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Feature flags */
  features: {
    breakoutRooms: boolean;
    logging: boolean;
  };
}

export const config: BotConfig = {
  token: process.env.TOKEN || '',
  prefix: process.env.PREFIX || '!',
  logLevel: (process.env.LOG_LEVEL as BotConfig['logLevel']) || 'info',
  features: {
    breakoutRooms: process.env.FEATURE_BREAKOUT_ROOMS !== 'false',
    logging: process.env.FEATURE_LOGGING !== 'false',
  },
};

// Type-safe usage:
import { config } from './config.js';
// config.logLevel is typed as 'debug' | 'info' | 'warn' | 'error'
// config.features.breakoutRooms is typed as boolean
```

---

## Build & Deployment

### Compilation

```bash
# Type check without building
bun run type-check

# Build to dist/
bun run build

# Development with watch mode
bun --watch src/index.ts
```

### Production Deployment

```bash
# 1. Type check
bun run type-check

# 2. Build
bun run build

# 3. Run compiled version
bun dist/index.js
```

### Docker Deployment

If you use Docker:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN bun run build

# Run compiled JavaScript
CMD ["bun", "dist/index.js"]
```

### GitHub Actions CI/CD

```yaml
name: TypeScript Check & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run type-check
      - run: bun run build

  deploy:
    needs: type-check
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - name: Deploy to server
        run: |
          # Your deployment script here
          echo "Deploying to production..."
```

---

## Common Issues & Solutions

### Issue 1: "Cannot find module" for Helpers

**Problem:**
```typescript
// Error: Cannot find module './helpers/safeReply'
import safeReply from '../../helpers/safeReply';
```

**Solution:**
Add `.js` extension in imports:
```typescript
import safeReply from '../../helpers/safeReply.js';
```

This is required for ESM modules in TypeScript.

### Issue 2: Dynamic Imports Lose Types

**Problem:**
```typescript
const module = await import(filePath);
const command = module.default; // TypeScript: unknown type
```

**Solution:**
Cast the import result:
```typescript
const module = (await import(filePath)) as { default: Command };
const command = module.default; // TypeScript: Command type
```

### Issue 3: Client Properties Not Recognized

**Problem:**
```typescript
client.commands.set(...); // Error: Property 'commands' does not exist
```

**Solution:**
Cast to extended client type:
```typescript
const botClient = client as BritzoneClient;
botClient.commands.set(...); // No error
```

Or in your event handler:
```typescript
const client = interaction.client as BritzoneClient;
```

### Issue 4: Promise Rejections in Timeouts

**Problem:**
```typescript
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Timeout')), 1000),
);
// TypeScript: Type 'Promise<never>' is not assignable to type 'Promise<string>'
```

**Solution:**
Explicitly type as `Promise<never>`:
```typescript
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('Timeout')), 1000),
);
```

### Issue 5: Null Safety with Discord.js

**Problem:**
```typescript
console.log(client.user.tag); // Error: Object is possibly 'null'
```

**Solution:**
Use optional chaining or type guard:
```typescript
// Option 1: Optional chaining
console.log(client.user?.tag);

// Option 2: Type guard
if (client.user) {
  console.log(client.user.tag);
}

// Option 3: Non-null assertion (use with caution)
console.log(client.user!.tag);
```

### Issue 6: Subcommand Type Safety

**Problem:**
```typescript
const subcommand = interaction.options.getSubcommand();
// subcommand is typed as 'string', not your specific subcommand names
```

**Solution:**
Type it explicitly:
```typescript
const subcommand = interaction.options.getSubcommand() as 'create' | 'distribute' | 'end';
// Or use a discriminated union pattern
```

### Issue 7: REST/API Calls with discord-api-types

**Problem:**
```typescript
const result = await rest.get(Routes.guildChannels(guildId));
// TypeScript: unknown type
```

**Solution:**
Import and cast types from discord-api-types:
```typescript
import type { APIChannel } from 'discord-api-types/v10';

const result = (await rest.get(Routes.guildChannels(guildId))) as APIChannel[];
// Now properly typed
```

---

## Migration Checklist

- [ ] **Setup Phase**
  - [ ] Add TypeScript and @types/node dependencies
  - [ ] Create tsconfig.json with strict settings
  - [ ] Update package.json with build scripts
  - [ ] Create src/ directory structure

- [ ] **Type Definitions Phase**
  - [ ] Create Command interface in src/types/command.ts
  - [ ] Create Event interface in src/types/event.ts
  - [ ] Create BritzoneClient interface in src/types/client.ts
  - [ ] Export all types from src/types/index.ts

- [ ] **Migration Phase**
  - [ ] Migrate src/index.ts (entry point)
  - [ ] Migrate src/events/*.ts (all event handlers)
  - [ ] Migrate src/helpers/*.ts (all helper functions)
  - [ ] Migrate src/commands/**/*.ts (all commands)
  - [ ] Update any deployment/utility scripts

- [ ] **Verification Phase**
  - [ ] Run `bun run type-check` - no errors
  - [ ] Run `bun run build` - compiles successfully
  - [ ] Run `bun dist/index.js` - bot starts correctly
  - [ ] Test all commands and event handlers
  - [ ] Verify logging works correctly

- [ ] **Cleanup Phase**
  - [ ] Delete old .js files from root
  - [ ] Remove JavaScript files from src/ if migrated
  - [ ] Update README.md with TypeScript setup info
  - [ ] Commit migration to git

---

## Best Practices Learned from discord.js

The discord.js codebase follows several TypeScript patterns worth adopting:

### 1. **Use ESM and strict module resolution:**
```typescript
// ✅ Good: explicit imports with extensions
import type { Client } from 'discord.js';
import { Events } from 'discord.js';

// ❌ Avoid: implicit imports
const { Client } = require('discord.js');
```

### 2. **Prefer type imports:**
```typescript
// ✅ Good: separates types from values
import type { CommandInteraction } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

// ❌ Avoid: mixing types and values
import { CommandInteraction, PermissionFlagsBits } from 'discord.js';
```

### 3. **Use discriminated unions for related types:**
```typescript
// ✅ Good: type-safe polymorphism
type Command = SlashCommand | ContextMenuCommand;

// ❌ Avoid: optional properties everywhere
interface Command {
  slashCommandData?: SlashCommandBuilder;
  contextMenuData?: ContextMenuCommandBuilder;
}
```

### 4. **Leverage TypeScript's type inference:**
```typescript
// ✅ Good: let TypeScript infer
const command: Command = {
  data: new SlashCommandBuilder()...
  execute: async (interaction) => {
    // interaction is inferred as CommandInteraction
  }
};

// ❌ Avoid: redundant annotations
const command: Command = {
  data: new SlashCommandBuilder() as SlashCommandBuilder,
  execute: async (interaction: CommandInteraction) => {
    // Too explicit
  }
};
```

### 5. **Use strict null checks:**
```typescript
// ✅ Good: explicit null handling
if (member) {
  console.log(member.user.tag);
}

// ❌ Avoid: trusting that values exist
console.log(member.user.tag); // Could be null!
```

---

## Resources

- [discord.js Documentation](https://discord.js.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [discord-api-types Reference](https://discord-api-types.dev)
- [discord.js GitHub Repository](https://github.com/discordjs/discord.js)

---

## Next Steps

1. **Start with Phase 1-2**: Setup TypeScript and define your types
2. **Migrate incrementally**: Do one file at a time, starting with helpers
3. **Use `allowJs: true`**: Mix JS and TS during migration
4. **Run type checking often**: `bun run type-check` after each file
5. **Test thoroughly**: Verify commands and events work after migration
6. **Remove old files**: Once everything is migrated, delete .js files

Good luck with your migration! TypeScript will make your bot more maintainable and catch bugs early.
