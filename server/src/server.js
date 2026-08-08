import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OAuth2Client } from 'google-auth-library';
import { db } from './db.js';
import { store } from './store.js';
import { makeRequireAuth } from './auth.js';
import { computeSuggestions, REACTIONS, ENVIRONMENTS, TRIGGERS } from './suggestions.js';

// --- Minimal .env loader (no extra dependency) ------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
(function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID || '';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const googleClient = GOOGLE_WEB_CLIENT_ID
  ? new OAuth2Client(GOOGLE_WEB_CLIENT_ID)
  : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issueToken(user) {
  return jwt.sign(
    { sub: user.email, name: user.name, provider: user.provider },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  return { email: user.email, name: user.name, provider: user.provider };
}

// --- Health check -----------------------------------------------------------
app.get('/api', (_req, res) => {
  res.json({
    name: 'Hello World Auth Server',
    endpoints: ['GET /health', 'POST /auth/signup', 'POST /auth/login', 'POST /auth/google', 'GET /me'],
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', googleConfigured: Boolean(googleClient) });
});

// --- Signup -----------------------------------------------------------------
app.post('/auth/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  if (db.findByEmail(email)) {
    return res.status(409).json({ error: 'Account already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = db.insert({
    email: email.toLowerCase(),
    name: name.trim(),
    passwordHash,
    provider: 'password',
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

// --- Login ------------------------------------------------------------------
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.findByEmail(email);
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({ token: issueToken(user), user: publicUser(user) });
});

// --- Google SSO -------------------------------------------------------------
// The Android app sends the Google ID token it received from Credential Manager.
app.post('/auth/google', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'idToken is required' });
  if (!googleClient) {
    return res.status(503).json({ error: 'Google SSO not configured on server (set GOOGLE_WEB_CLIENT_ID)' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_WEB_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    if (!email) return res.status(400).json({ error: 'Google token missing email' });

    const user = db.upsertByEmail(email, {
      name: payload.name || email,
      provider: 'google',
      googleSub: payload.sub,
    });

    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (e) {
    res.status(401).json({ error: 'Invalid Google token', detail: String(e.message || e) });
  }
});

// --- Protected example ------------------------------------------------------
app.get('/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ email: decoded.sub, name: decoded.name, provider: decoded.provider });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// --- Child tracking ---------------------------------------------------------
const requireAuth = makeRequireAuth(JWT_SECRET);

// Metadata for the UI (reaction/environment/trigger vocab).
app.get('/meta', (_req, res) => {
  res.json({
    reactions: Object.entries(REACTIONS).map(([key, v]) => ({ key, ...v })),
    environments: ENVIRONMENTS,
    triggers: TRIGGERS,
  });
});

// List / add children.
app.get('/children', requireAuth, (req, res) => {
  res.json({ children: store.listChildren(req.user.email) });
});

app.post('/children', requireAuth, (req, res) => {
  const { name, age, notes } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Child name is required' });
  const ageNum = age === '' || age == null ? null : Number(age);
  if (ageNum != null && (Number.isNaN(ageNum) || ageNum < 0 || ageNum > 25)) {
    return res.status(400).json({ error: 'Age must be a number between 0 and 25' });
  }
  const child = store.addChild(req.user.email, { name: name.trim(), age: ageNum, notes });
  res.status(201).json({ child });
});

// Logs for a specific child (ownership enforced).
function loadOwnedChild(req, res) {
  const child = store.getChild(req.user.email, req.params.childId);
  if (!child) {
    res.status(404).json({ error: 'Child not found' });
    return null;
  }
  return child;
}

app.get('/children/:childId/logs', requireAuth, (req, res) => {
  const child = loadOwnedChild(req, res);
  if (!child) return;
  res.json({ logs: store.listLogs(child.id) });
});

app.post('/children/:childId/logs', requireAuth, (req, res) => {
  const child = loadOwnedChild(req, res);
  if (!child) return;
  const { date, environment, activity, reaction, intensity, triggers, notes } = req.body || {};
  if (!environment) return res.status(400).json({ error: 'environment is required' });
  if (!reaction || !REACTIONS[reaction]) {
    return res.status(400).json({ error: 'A valid reaction is required' });
  }
  const log = store.addLog(child.id, { date, environment, activity, reaction, intensity, triggers, notes });
  res.status(201).json({ log });
});

// The core feature: personalised suggestions from recent logs.
app.get('/children/:childId/suggestions', requireAuth, (req, res) => {
  const child = loadOwnedChild(req, res);
  if (!child) return;
  const days = Number(req.query.days) || 30;
  const suggestions = computeSuggestions(store.listLogs(child.id), { days });
  res.json({ child: { id: child.id, name: child.name }, suggestions });
});

const server = app.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT}`);
  console.log(`Google SSO ${googleClient ? 'ENABLED' : 'disabled (set GOOGLE_WEB_CLIENT_ID)'}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${PORT} is already in use.`);
    console.error(`  Start on another port:  PORT=3001 npm start`);
    console.error(`  Or free it:  find the process listening on ${PORT} and stop it.\n`);
  } else {
    console.error('✗ Server failed to start:', err.message);
  }
  process.exit(1);
});
