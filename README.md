# BritzoneBot

[![Project Status](https://img.shields.io/badge/Status-Stable-brightgreen.svg)](https://github.com/InvictusNavarchus/BritzoneBot)
[![License](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-%3E=v1.3.0-black?logo=bun)](https://bun.sh)

BritzoneBot is a Discord bot designed to manage breakout rooms for voice channels in a Discord server. It provides commands to create, distribute users among, and end breakout sessions with robust error handling and state management.

## ✨ Features

- **Create Breakout Rooms**: Create multiple breakout voice channels.
- **Distribute Users**: Distribute users from a main voice channel into breakout rooms.
- **End Breakout Sessions**: Move users back to the main voice channel and delete breakout rooms.
- **Set Timer**: Set a timer for breakout sessions with reminders.
- **Broadcast Message**: Broadcast a message to all breakout rooms.
- **Send Message**: Send a message to a specific voice channel.
- **Safe Interaction Handling**: Built-in error handling for expired interactions and network issues.
- **State Management**: Persistent state management to recover from interruptions.

## 🛠️ Installation Guide

Follow these straightforward steps to deploy and configure BritzoneBot on your Discord server:

1.  **Clone the Repository**:

    ```sh
    git clone 'https://github.com/InvictusNavarchus/BritzoneBot.git'
    cd BritzoneBot
    ```

2.  **Install Dependencies**:

    Ensure you have [Bun](https://bun.sh) installed. Navigate to the cloned repository directory in your terminal and run:

    ```sh
    bun install
    ```

3.  **Configuration**:

    *   **Environment Variables**: Copy `.env.example` to `.env` in the root directory.

        ```sh
        cp .env.example .env
        ```

        Fill in your bot credentials obtained from the [Discord Developer Portal](https://discord.com/developers/applications):

        ```env
        BOT_ID=your-bot-id
        TOKEN=your-bot-token
        ```

    *   **Guild List Configuration**: Create a `guildList.json` file in the root directory. This is **required** for the deployment script to know where to register commands. You can copy the example file:

        ```sh
        cp guildList.json.example guildList.json
        ```

        Then edit `guildList.json` to map your Discord server names to their respective IDs:

        ```json
        {
           "YourServerName1": "YourServerID1",
           "YourServerName2": "YourServerID2"
        }
        ```

4.  **Build and Deploy**:

    *   **Build the Project**: Compile the TypeScript source code to JavaScript.

        ```sh
        bun run build
        ```

    *   **Local Command Deployment**: To register the bot's commands within your specified Discord servers, run:

        ```sh
        bun run deploy
        ```
        This script will deploy the commands to the guilds listed in your `guildList.json`.

5.  **Run the Bot**:

    *   **Production**: Start the bot using the compiled output:

        ```sh
        bun start
        ```
        Ensure your terminal remains running to keep the bot online. For production deployments, consider using process managers like `pm2` or `systemd`.

    *   **Development**: Run the bot in development mode with live reloading:

        ```sh
        bun dev
        ```

---

## ⚙️ Command Reference  

BritzoneBot offers a suite of intuitive slash commands to manage breakout rooms effectively. Below is a detailed command reference.  

### 🏠 Breakout Commands  

These commands manage breakout voice channels and require the **Move Members** permission.  

| Command      | Subcommand     | Description                                                              | Options                                                                                                               |
|-------------|--------------|------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `/breakout` | `create`       | Creates multiple breakout voice channels.                                  | `number`: *(Integer, Required)* - The number of breakout rooms to create. Must be a positive integer.              |
| `/breakout` | `distribute`   | Distributes users from a main voice channel into breakout rooms.           | `mainroom`: *(Voice/Stage Channel, Required)* - The main voice channel to distribute users from.                     |
|             |              |                                                                      | `facilitators`: *(String, Optional)* - User mentions to exclude from distribution (facilitators to remain in the main room). |
| `/breakout` | `end`          | Ends the breakout session, moves users back, and deletes breakout rooms.  | `main_room`: *(Voice Channel, Optional)* - The main voice channel to move users back to. If omitted, uses the previously set main room. |
| `/breakout` | `timer`        | Sets a timer for the breakout session.                                    | `minutes`: *(Integer, Required)* - Duration of the breakout session in minutes. Must be a positive integer.          |
| `/breakout` | `broadcast`    | Broadcasts a message to all active breakout rooms.                       | `message`: *(String, Required)* - The message content to broadcast.                                                 |
| `/breakout` | `send-message` | Sends a direct message to a specific voice channel.                      | `channel`: *(Voice Channel, Required)* - The target voice channel to send the message to.                             |
|             |              |                                                                      | `message`: *(String, Required)* - The message content to send.                                                        |

---

### 🛠️ Utility Commands  

These standalone commands provide general information and do not require special permissions.  

| Command      | Description                                        | Options       |
|-------------|------------------------------------------------|--------------|
| `/user`   | Provides information about the user executing the command.  | *No options.* |
| `/server` | Provides information about the Discord server.              | *No options.* |
| `/ping`   | Tests the bot's responsiveness. Replies with "Pong!".       | *No options.* |

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request for any changes or improvements.

## 📜 License

This project is licensed under the GPLv3 License - see the [LICENSE](LICENSE) file for details.

