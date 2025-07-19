# TikTok Stalker Discord Bot

This bot lets you monitor TikTok users and get private Discord DMs when they post new videos.

## Features
- `/stalk <username>`: Start stalking a TikTok user (unlimited per user)
- `/unstalk <username>`: Stop stalking a TikTok user
- `/stalked`: See who you are stalking
- Private DMs: Only you get notified when your stalked user posts

## Setup
1. Install dependencies:
   ```sh
   npm install
   ```
2. Set your Discord bot token in `index.js` (already set for you).
3. Run the bot:
   ```sh
   node index.js
   ```
4. Invite the bot to your server with permissions: Send Messages, Read Messages, Embed Links (optional).

## Usage
- Use `/stalk <username>` in any server where the bot is present.
- You will receive a DM when your stalked user posts a new TikTok.
- Use `/unstalk <username>` to stop stalking.
- Use `/stalked` to see your current list.

## Notes
- The bot checks TikTok every 5 minutes.
- Data is stored in `db.json` for persistence.
- If you restart the bot, your stalked list is preserved. 