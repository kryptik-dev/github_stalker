import { Client, GatewayIntentBits, Partials, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import schedule from 'node-schedule';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import express from 'express';

// Discord bot token and client
const TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_TOKEN_HERE';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

// Setup lowdb for persistent storage
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');

// Ensure the data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { users: {} });

// Helper: ensure db structure
async function initDB() {
  await db.read();
  db.data ||= { users: {} };
  await db.write();
}

// Register slash commands
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('stalkuser')
      .setDescription('Start stalking a GitHub user')
      .addStringOption(option =>
        option.setName('username').setDescription('GitHub username').setRequired(true)),
    new SlashCommandBuilder()
      .setName('stalkrepo')
      .setDescription('Start stalking a GitHub repository')
      .addStringOption(option =>
        option.setName('repo').setDescription('GitHub repo (owner/repo)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('unstalkuser')
      .setDescription('Stop stalking a GitHub user')
      .addStringOption(option =>
        option.setName('username').setDescription('GitHub username').setRequired(true)),
    new SlashCommandBuilder()
      .setName('unstalkrepo')
      .setDescription('Stop stalking a GitHub repository')
      .addStringOption(option =>
        option.setName('repo').setDescription('GitHub repo (owner/repo)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('stalked')
      .setDescription('Show GitHub users and repos you are stalking'),
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands((client.application?.id || client.user?.id)),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Helper: GitHub API request
async function githubRequest(url) {
  try {
    const headers = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {};
    console.log(`[GitHub API] Requesting: ${url}`);
    const res = await axios.get(url, { headers });
    console.log(`[GitHub API] Response for ${url}:`, JSON.stringify(res.data).slice(0, 300));
    return res.data;
  } catch (err) {
    console.error(`[GitHub API] Error for ${url}:`, err?.response?.data || err);
    return null;
  }
}

// Helper: check if GitHub user exists
async function doesGitHubUserExist(username) {
  const data = await githubRequest(`https://api.github.com/users/${username}`);
  return !!data && !!data.login;
}

// Helper: check if GitHub repo exists
async function doesGitHubRepoExist(repo) {
  const data = await githubRequest(`https://api.github.com/repos/${repo}`);
  return !!data && !!data.full_name;
}

// Helper: get latest event for user
async function getLatestUserEvent(username) {
  const events = await githubRequest(`https://api.github.com/users/${username}/events/public`);
  return Array.isArray(events) && events.length > 0 ? events[0].id : null;
}

// Helper: get latest event for repo
async function getLatestRepoEvent(repo) {
  const events = await githubRequest(`https://api.github.com/repos/${repo}/events`);
  return Array.isArray(events) && events.length > 0 ? events[0].id : null;
}

// Helper: get event details for user
async function getUserEventDetails(username) {
  const events = await githubRequest(`https://api.github.com/users/${username}/events/public`);
  return Array.isArray(events) && events.length > 0 ? events[0] : null;
}

// Helper: get event details for repo
async function getRepoEventDetails(repo) {
  const events = await githubRequest(`https://api.github.com/repos/${repo}/events`);
  return Array.isArray(events) && events.length > 0 ? events[0] : null;
}

// Command handlers
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Restrict commands to a specific channel, but allow in DMs
  const allowedChannelId = '1396206251364450344';
  if (interaction.guild && interaction.channelId !== allowedChannelId) {
    await interaction.reply({
      content: `Please use this command in <#${allowedChannelId}> or in a DM with me.`,
      ephemeral: true
    });
    return;
  }

  await initDB();
  const userId = interaction.user.id;
  db.data.users[userId] ||= { stalkedUsers: {}, stalkedRepos: {} };
  const userData = db.data.users[userId];

  if (interaction.commandName === 'stalkuser') {
    const username = interaction.options.getString('username').toLowerCase();
    if (userData.stalkedUsers[username]) {
      await interaction.reply({
        embeds: [{
            title: 'Already Stalking',
          description: `You are already stalking **${username}**.`,
          color: 0x24292e,
          footer: { text: 'GitHub Stalker Bot' },
            timestamp: new Date().toISOString(),
        }],
        flags: 4096
      });
      return;
    }
    const exists = await doesGitHubUserExist(username);
    if (!exists) {
      await interaction.reply({
        embeds: [{
            title: 'User Not Found',
          description: `That GitHub username does not exist.`,
          color: 0xED4245,
          footer: { text: 'GitHub Stalker Bot' },
            timestamp: new Date().toISOString(),
        }],
        flags: 4096
      });
      return;
    }
    // Fetch user profile info for avatar
    const userProfile = await githubRequest(`https://api.github.com/users/${username}`);
    const latest = await getLatestUserEvent(username);
    userData.stalkedUsers[username] = latest;
    await db.write();
    await interaction.reply({
      embeds: [{
          title: 'Stalking Started',
        description: `Now stalking **${username}**. You'll get a DM when they have new activity!`,
        thumbnail: userProfile && userProfile.avatar_url ? { url: userProfile.avatar_url } : undefined,
        color: 0x24292e,
        footer: { text: 'GitHub Stalker Bot' },
        timestamp: new Date().toISOString(),
      }],
      flags: 4096
    });
  } else if (interaction.commandName === 'stalkrepo') {
    const repo = interaction.options.getString('repo');
    if (!repo.includes('/')) {
      await interaction.reply({
        embeds: [{
          title: 'Invalid Repo Format',
          description: 'Please use the format `owner/repo` (e.g., `octocat/Hello-World`).',
          color: 0xED4245,
          footer: { text: 'GitHub Stalker Bot' },
          timestamp: new Date().toISOString(),
        }],
        flags: 4096
      });
      return;
    }
    if (userData.stalkedRepos[repo]) {
      await interaction.reply({
        embeds: [{
          title: 'Already Stalking',
          description: `You are already stalking **${repo}**.`,
          color: 0x24292e,
          footer: { text: 'GitHub Stalker Bot' },
          timestamp: new Date().toISOString(),
        }],
        flags: 4096
      });
      return;
    }
    const exists = await doesGitHubRepoExist(repo);
    if (!exists) {
      await interaction.reply({
        embeds: [{
          title: 'Repo Not Found',
          description: `That GitHub repository does not exist.`,
          color: 0xED4245,
          footer: { text: 'GitHub Stalker Bot' },
          timestamp: new Date().toISOString(),
        }],
        flags: 4096
      });
      return;
    }
    // Fetch repo info for owner's avatar
    const repoProfile = await githubRequest(`https://api.github.com/repos/${repo}`);
    const ownerAvatar = repoProfile && repoProfile.owner && repoProfile.owner.avatar_url ? repoProfile.owner.avatar_url : undefined;
    const latest = await getLatestRepoEvent(repo);
    userData.stalkedRepos[repo] = latest;
    await db.write();
    await interaction.reply({
      embeds: [{
        title: 'Stalking Started',
        description: `Now stalking **${repo}**. You'll get a DM when there is new activity!`,
        thumbnail: ownerAvatar ? { url: ownerAvatar } : undefined,
        color: 0x24292e,
        footer: { text: 'GitHub Stalker Bot' },
        timestamp: new Date().toISOString(),
      }],
      flags: 4096
    });
  } else if (interaction.commandName === 'unstalkuser') {
    const username = interaction.options.getString('username').toLowerCase();
    if (!userData.stalkedUsers[username]) {
      await interaction.reply({
        embeds: [{
            title: 'Not Stalking',
          description: `You are not stalking **${username}**.`,
            color: 0xED4245,
          footer: { text: 'GitHub Stalker Bot' },
            timestamp: new Date().toISOString(),
        }],
        flags: 4096
      });
      return;
    }
    delete userData.stalkedUsers[username];
    await db.write();
    await interaction.reply({
      embeds: [{
          title: 'Stalking Stopped',
        description: `No longer stalking **${username}**.`,
        color: 0x24292e,
        footer: { text: 'GitHub Stalker Bot' },
        timestamp: new Date().toISOString(),
      }],
      flags: 4096
    });
  } else if (interaction.commandName === 'unstalkrepo') {
    const repo = interaction.options.getString('repo');
    if (!userData.stalkedRepos[repo]) {
      await interaction.reply({
        embeds: [{
          title: 'Not Stalking',
          description: `You are not stalking **${repo}**.`,
          color: 0xED4245,
          footer: { text: 'GitHub Stalker Bot' },
          timestamp: new Date().toISOString(),
        }],
        flags: 4096
      });
      return;
    }
    delete userData.stalkedRepos[repo];
    await db.write();
    await interaction.reply({
      embeds: [{
        title: 'Stalking Stopped',
        description: `No longer stalking **${repo}**.`,
        color: 0x24292e,
        footer: { text: 'GitHub Stalker Bot' },
        timestamp: new Date().toISOString(),
      }],
      flags: 4096
    });
  } else if (interaction.commandName === 'stalked') {
    const stalkedUsers = Object.keys(userData.stalkedUsers);
    const stalkedRepos = Object.keys(userData.stalkedRepos);
    let desc = '';
    let fields = [];
    if (stalkedUsers.length === 0 && stalkedRepos.length === 0) {
      desc = 'You are not stalking any GitHub users or repositories.';
      await interaction.reply({
        embeds: [{
          title: 'Currently Stalking',
          description: desc,
          color: 0x24292e,
          footer: { text: 'GitHub Stalker Bot' },
            timestamp: new Date().toISOString(),
        }],
        flags: 4096
      });
      return;
    }
    // If only one, show as before
    if (stalkedUsers.length + stalkedRepos.length === 1) {
      let thumbnail = undefined;
      if (stalkedUsers.length === 1) {
        const profile = await githubRequest(`https://api.github.com/users/${stalkedUsers[0]}`);
        if (profile && profile.avatar_url) {
          thumbnail = { url: profile.avatar_url };
        }
        desc = `**Users:**\n${stalkedUsers[0]}`;
      } else if (stalkedRepos.length === 1) {
        const repoProfile = await githubRequest(`https://api.github.com/repos/${stalkedRepos[0]}`);
        if (repoProfile && repoProfile.owner && repoProfile.owner.avatar_url) {
          thumbnail = { url: repoProfile.owner.avatar_url };
        }
        desc = `**Repositories:**\n${stalkedRepos[0]}`;
      }
      await interaction.reply({
        embeds: [{
            title: 'Currently Stalking',
          description: desc,
          color: 0x24292e,
          footer: { text: 'GitHub Stalker Bot' },
            timestamp: new Date().toISOString(),
          thumbnail,
        }],
        flags: 4096
      });
      return;
    }
    // Multiple stalks: send one ephemeral embed per user/repo
    await interaction.reply({ content: 'You are currently stalking:', ephemeral: true });
    for (const u of stalkedUsers) {
      const profile = await githubRequest(`https://api.github.com/users/${u}`);
      await interaction.followUp({
        embeds: [{
          title: 'Currently Stalking',
          description: `**User:** ${u}`,
          color: 0x24292e,
          footer: { text: 'GitHub Stalker Bot' },
          timestamp: new Date().toISOString(),
          thumbnail: profile && profile.avatar_url ? { url: profile.avatar_url } : undefined,
        }],
        ephemeral: true
      });
    }
    for (const r of stalkedRepos) {
      const repoProfile = await githubRequest(`https://api.github.com/repos/${r}`);
      await interaction.followUp({
        embeds: [{
          title: 'Currently Stalking',
          description: `**Repository:** ${r}`,
          color: 0x24292e,
          footer: { text: 'GitHub Stalker Bot' },
          timestamp: new Date().toISOString(),
          thumbnail: repoProfile && repoProfile.owner && repoProfile.owner.avatar_url ? { url: repoProfile.owner.avatar_url } : undefined,
        }],
        ephemeral: true
      });
    }
    return;
  }
});

// Periodic check for new GitHub activity
schedule.scheduleJob('*/5 * * * *', async () => {
  console.log('[Scheduler] Starting periodic GitHub activity check...');
  await initDB();
  for (const [userId, userData] of Object.entries(db.data.users)) {
    console.log(`[Scheduler] Checking userId: ${userId}`);
    // Check stalked users
    for (const username of Object.keys(userData.stalkedUsers)) {
      console.log(`[Scheduler] Checking stalked user: ${username}`);
      const latest = await getLatestUserEvent(username);
      console.log(`[Scheduler] Latest event for user ${username}: ${latest}`);
      if (!latest) continue;
      if (userData.stalkedUsers[username] !== latest) {
        // New event detected
        if (userData.stalkedUsers[username]) {
          try {
            const user = await client.users.fetch(userId);
            const event = await getUserEventDetails(username);
            const url = event?.repo?.url?.replace('api.github.com/repos', 'github.com') || `https://github.com/${username}`;
            console.log(`[Scheduler] Sending DM to ${userId} about new user event for ${username}`);
            await user.send({
              embeds: [{
                title: `New activity by ${username}`,
                url,
                description: `Type: **${event?.type}**\nRepo: **${event?.repo?.name}**\n[View on GitHub](${url})`,
                color: 0x24292e,
                footer: { text: 'GitHub Stalker Bot' },
                timestamp: new Date().toISOString(),
              }],
            });
          } catch (e) {
            console.error(`[Scheduler] Failed to DM user ${userId}:`, e);
          }
        } else {
          console.log(`[Scheduler] First event for user ${username}, not notifying.`);
        }
        userData.stalkedUsers[username] = latest;
        await db.write();
      } else {
        console.log(`[Scheduler] No new event for user ${username}.`);
      }
    }
    // Check stalked repos
    for (const repo of Object.keys(userData.stalkedRepos)) {
      console.log(`[Scheduler] Checking stalked repo: ${repo}`);
      const latest = await getLatestRepoEvent(repo);
      console.log(`[Scheduler] Latest event for repo ${repo}: ${latest}`);
      if (!latest) continue;
      if (userData.stalkedRepos[repo] !== latest) {
        // New event detected
        if (userData.stalkedRepos[repo]) {
          try {
            const user = await client.users.fetch(userId);
            const event = await getRepoEventDetails(repo);
            const url = event?.repo?.url?.replace('api.github.com/repos', 'github.com') || `https://github.com/${repo}`;
            console.log(`[Scheduler] Sending DM to ${userId} about new repo event for ${repo}`);
            await user.send({
              embeds: [{
                title: `New activity in ${repo}`,
                url,
                description: `Type: **${event?.type}**\n[View on GitHub](${url})`,
                color: 0x24292e,
                footer: { text: 'GitHub Stalker Bot' },
                  timestamp: new Date().toISOString(),
              }],
            });
          } catch (e) {
            console.error(`[Scheduler] Failed to DM user ${userId}:`, e);
          }
        } else {
          console.log(`[Scheduler] First event for repo ${repo}, not notifying.`);
        }
        userData.stalkedRepos[repo] = latest;
        await db.write();
      } else {
        console.log(`[Scheduler] No new event for repo ${repo}.`);
      }
    }
  }
  console.log('[Scheduler] GitHub activity check complete.');
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
  await initDB();
});

client.login(TOKEN);

// Express server for Render webservice
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('GitHub Stalker Bot is running!');
});
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
}); 