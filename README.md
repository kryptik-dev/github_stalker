# GitHub Stalker Discord Bot

This bot lets you monitor GitHub users and repositories and get private Discord DMs when they have new activity.

## Features
- `/stalkuser <username>`: Start stalking a GitHub user
- `/stalkrepo <owner/repo>`: Start stalking a GitHub repository
- `/unstalkuser <username>`: Stop stalking a GitHub user
- `/unstalkrepo <owner/repo>`: Stop stalking a GitHub repository
- `/stalked`: See who you are stalking
- Private DMs: Only you get notified when your stalked users/repos have new activity

## Setup
1. Install dependencies:
   ```sh
   npm install
   ```
2. Set your Discord bot token in environment variables:
   ```sh
   DISCORD_TOKEN=your_discord_token_here
   GITHUB_TOKEN=your_github_token_here  # Optional, for higher rate limits
   ```
3. Run the bot:
   ```sh
   node index.mjs
   ```
4. Invite the bot to your server with permissions: Send Messages, Read Messages, Embed Links.

## Deployment on Render

When deploying to Render, the database file will be automatically created in the `data/` directory. The bot will:

1. Create a persistent `data/db.json` file that survives deployments
2. Automatically initialize the database structure on startup
3. Preserve all user data across deployments

### Environment Variables for Render:
- `DISCORD_TOKEN`: Your Discord bot token
- `GITHUB_TOKEN`: Your GitHub personal access token (optional)
- `DB_FILE`: Custom database file path (optional, defaults to `data/db.json`)

## Usage
- Use `/stalkuser <username>` to start monitoring a GitHub user
- Use `/stalkrepo <owner/repo>` to start monitoring a GitHub repository
- You will receive a DM when your stalked users/repos have new activity
- Use `/unstalkuser <username>` or `/unstalkrepo <owner/repo>` to stop stalking
- Use `/stalked` to see your current list

## Notes
- The bot checks GitHub every 5 minutes for new activity
- Data is stored in `data/db.json` for persistence
- If you restart the bot, your stalked list is preserved
- The database file is excluded from Git to prevent data loss during deployments 