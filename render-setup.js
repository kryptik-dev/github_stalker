// Render deployment setup script
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a path that will persist across deployments
const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');

// Ensure the data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { users: {} });

// Initialize the database
async function initDB() {
  await db.read();
  db.data ||= { users: {} };
  await db.write();
  console.log(`Database initialized at: ${dbFile}`);
}

initDB().catch(console.error); 