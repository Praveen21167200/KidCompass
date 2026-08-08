import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CHILDREN_FILE = path.join(DATA_DIR, 'children.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function read(file) {
  ensureDir();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
  } catch {
    return [];
  }
}

function write(file, rows) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
}

const id = () => crypto.randomBytes(8).toString('hex');

export const store = {
  // --- Children ---
  listChildren(parentEmail) {
    return read(CHILDREN_FILE).filter((c) => c.parentEmail === parentEmail.toLowerCase());
  },
  getChild(parentEmail, childId) {
    return read(CHILDREN_FILE).find(
      (c) => c.id === childId && c.parentEmail === parentEmail.toLowerCase()
    ) || null;
  },
  addChild(parentEmail, { name, age, notes }) {
    const rows = read(CHILDREN_FILE);
    const child = {
      id: id(),
      parentEmail: parentEmail.toLowerCase(),
      name,
      age: age ?? null,
      notes: notes ?? '',
      createdAt: new Date().toISOString(),
    };
    rows.push(child);
    write(CHILDREN_FILE, rows);
    return child;
  },

  // --- Logs ---
  listLogs(childId) {
    return read(LOGS_FILE)
      .filter((l) => l.childId === childId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  },
  addLog(childId, { date, environment, activity, reaction, intensity, triggers, notes }) {
    const rows = read(LOGS_FILE);
    const log = {
      id: id(),
      childId,
      date: date || new Date().toISOString().slice(0, 10),
      environment,
      activity: activity ?? '',
      reaction,
      intensity: Number(intensity) || 3,
      triggers: Array.isArray(triggers) ? triggers : [],
      notes: notes ?? '',
      createdAt: new Date().toISOString(),
    };
    rows.push(log);
    write(LOGS_FILE, rows);
    return log;
  },
};
