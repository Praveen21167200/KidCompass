import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function writeAll(users) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

export const db = {
  findByEmail(email) {
    const users = readAll();
    return users[email.toLowerCase()] || null;
  },
  insert(user) {
    const users = readAll();
    const key = user.email.toLowerCase();
    users[key] = user;
    writeAll(users);
    return user;
  },
  upsertByEmail(email, patch) {
    const users = readAll();
    const key = email.toLowerCase();
    users[key] = { ...(users[key] || {}), ...patch, email: key };
    writeAll(users);
    return users[key];
  },
};
