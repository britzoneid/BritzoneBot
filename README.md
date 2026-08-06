# BritzoneBot

[![Project Status](https://img.shields.io/badge/Status-Stable-brightgreen.svg)](https://github.com/britzoneid/BritzoneBot)
[![Version](https://img.shields.io/badge/Version-2.0.0-blue.svg)](https://github.com/britzoneid/BritzoneBot/releases)
[![License](https://img.shields.io/badge/License-AGPLv3-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-%3E=v1.3.0-FBF0DF?logo=bun)](https://bun.sh)


BritzoneBot is a Discord bot designed to manage breakout rooms for voice channels in a Discord server. It provides commands to create, distribute users among, recall members from, and delete breakout sessions with robust error handling, operation checkpointing, and persistent state management.

## ✨ Features

- **Create Breakout Rooms**: Create multiple breakout voice channels in the same category as the invoking channel.
- **Distribute Users**: Preview and confirm distribution of users from a main voice channel into breakout rooms, with support for facilitators and excluded users.
- **Recall Members**: Move all users back to the main voice channel while keeping breakout rooms intact.
- **Delete Breakout Rooms**: Safely delete all breakout room channels (with member-presence protection).
- **Set Timer**: Set a countdown timer for breakout sessions with a 5-minute warning and end notification.
- **Broadcast Message**: Broadcast a message to all active breakout rooms.
- **Send Message**: Send a message to a specific voice channel's text chat.
- **Safe Interaction Handling**: Built-in error handling for expired interactions, network issues, and timeouts.
- **Persistent State & Checkpointing**: File-based state management (`data/breakoutState.json`) enables resuming interrupted operations.
- **Structured Logging**: Pino-powered logging with pretty console output and daily-rotating file logs.

## 🏗️ Architecture

The project is written in **TypeScript** and follows a modular architecture:

```
src/
├── commands/          # Slash command definitions (main + utility)
├── events/            # Discord event handlers (interactionCreate, ready)
├── lib/               # Shared utilities (Discord helpers, logger)
├── modules/
│   └── breakout/
│       ├── handlers/  # Interaction-level handlers for each subcommand
│       ├── operations/# Orchestrated multi-step operations with checkpointing
│       ├── services/  # Domain logic (distribution, messaging, rooms, timer)
│       ├── state/     # Persistent state manager (file-backed)
│       └── utils/     # Distribution algorithm, embed builders
├── types/             # Shared TypeScript interfaces and type definitions
└── index.ts           # Entry point: client init, command/event loading, login
```

## 🛠️ Installation Guide

Follow these steps to deploy and configure BritzoneBot on your Discord server:

### 1. Clone the Repository

```sh
git clone https://github.com/britzoneid/BritzoneBot.git
cd BritzoneBot
```

### 2. Install Dependencies

Ensure you have [Bun](https://bun.sh) (≥ 1.3.0) installed, then run:

```sh
bun install
```

### 3. Configuration

#### Environment Variables

Copy `.env.example` to `.env` in the root directory:

```sh
cp .env.example .env
```

Fill in your bot credentials obtained from the [Discord Developer Portal](https://discord.com/developers/applications).

```env
BOT_ID=your-bot-id
TOKEN=your-bot-token

# Optional
NODE_ENV=production
LOG_LEVEL=info   # trace | debug | info | warn | error | fatal | silent
```

#### Guild Configuration

Create a `guildConfig.json` file in the root directory to map each guild ID to its server name and manager role ID. This file is required for both registering slash commands (`bun run deploy`) and enforcing permissions:

```sh
cp guildConfig.json.example guildConfig.json
```

Edit `guildConfig.json` with your Discord server IDs and manager role IDs:

```json
{
  "YourGuildID1": {
    "name": "YourServerName1",
    "managerRoleId": "YourManagerRoleID1"
  },
  "YourGuildID2": {
    "name": "YourServerName2",
    "managerRoleId": "YourManagerRoleID2"
  }
}
```

### 4. Build and Deploy

```sh
# Compile TypeScript → JavaScript
bun run build

# Register slash commands to all guilds in guildConfig.json
bun run deploy
```

### 5. Run the Bot

| Mode        | Command      | Notes                                        |
|-------------|--------------|----------------------------------------------|
| Production  | `bun start`  | Runs the compiled output. Use a process manager (`pm2`, `systemd`) for uptime. |
| Development | `bun dev`    | Live-reload via Bun's watch mode.            |

---

## ⚙️ Command Reference

BritzoneBot offers a suite of slash commands to manage breakout rooms. All breakout commands are restricted to members whose roles include the manager role configured for the current guild in `guildConfig.json`.

### 🏠 Breakout Commands

| Command      | Subcommand     | Description                                                        | Options |
|--------------|----------------|--------------------------------------------------------------------|---------|
| `/breakout`  | `create`       | Creates multiple breakout voice channels.                          | `number` *(Integer, Required)* – Number of rooms to create (≥ 1). |
| `/breakout`  | `distribute`   | Previews and distributes users from a main room into breakout rooms. Shows a confirmation prompt before moving. | `mainroom` *(Voice/Stage Channel, Required)* – The source voice channel. |
|              |                |                                                                    | `exclude` *(String, Optional)* – User mentions to keep in the main room. |
|              |                |                                                                    | `facilitators` *(String, Optional)* – User mentions to assign into breakout rooms first (one per room when possible). |
| `/breakout`  | `recall`       | Moves all members from breakout rooms back to the main voice channel. Breakout rooms remain intact. | `mainroom` *(Voice/Stage Channel, Required)* – The destination channel. |
| `/breakout`  | `delete`       | Deletes all breakout room channels.                                | None |
| `/breakout`  | `timer`        | Sets a countdown timer for the breakout session. Sends periodic reminders and a "time's up" message. | `minutes` *(String, Required)* – Duration preset in minutes (30, 45, 60, 90). |
| `/breakout`  | `broadcast`    | Broadcasts a message to all active breakout rooms.                 | `message` *(String, Required)* – The message content. |
| `/breakout`  | `send-message` | Sends a message to a specific voice channel's text chat.           | `channel` *(Voice Channel, Required)* – Target channel. |
|              |                |                                                                    | `message` *(String, Required)* – The message content. |

### 🛠️ Utility Commands

| Command   | Description                                              | Permissions |
|-----------|----------------------------------------------------------|-------------|
| `/ping`   | Replies with "Pong!" and the bot's WebSocket latency.    | Send Messages |
| `/server` | Displays the server name and member count.               | None        |
| `/user`   | Displays the invoking user's name and join date.         | None        |

---

## 🔄 Operation Lifecycle & Recovery

Every breakout operation (`create`, `distribute`, `recall`, `delete`) is tracked with **checkpoint-based progress** persisted to `data/breakoutState.json`. If the bot restarts or an operation is interrupted:

1. The state file records which steps have already completed.
2. Re-running the same subcommand **resumes** from the last checkpoint.
3. Running a *different* breakout subcommand while one is in progress is blocked with an explanatory message.
4. Completed operations are moved to an in-memory history and the active operation slot is cleared.

This ensures no duplicate channels are created, no users are moved twice, and no rooms are double-deleted.

## 📋 Distribution Preview

When you run `/breakout distribute`, the bot:

1. Calculates a randomized round-robin assignment (facilitators first, then regular members).
2. Displays a **preview embed** showing exactly who will go to which room.
3. Presents **Confirm** / **Cancel** buttons (60-second timeout).
4. Only after confirmation does it begin moving members.

This prevents accidental mass-moves and gives moderators a chance to review the plan.

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request for any changes or improvements.

## 📜 License

This project is licensed under the AGPLv3 License - see the [LICENSE](LICENSE) file for details.

