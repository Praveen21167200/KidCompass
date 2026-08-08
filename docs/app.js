import { computeSuggestions, REACTIONS, ENVIRONMENTS, TRIGGERS } from './engine.js';

const $ = (id) => document.getElementById(id);

// ---------------- local storage layer ----------------
const KEYS = { users: 'kc_users', session: 'kc_session', children: 'kc_children', logs: 'kc_logs' };
const read = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const data = enc.encode(saltHex + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const Users = {
  all: () => read(KEYS.users, {}),
  get: (email) => Users.all()[email.toLowerCase()] || null,
  async register(name, email, password) {
    const users = Users.all();
    const key = email.toLowerCase();
    if (users[key]) return { error: 'Account already exists' };
    const salt = newSalt();
    users[key] = { name, email: key, salt, hash: await hashPassword(password, salt), provider: 'password' };
    write(KEYS.users, users);
    return { user: { email: key, name, provider: 'password' } };
  },
  async validate(email, password) {
    const u = Users.get(email);
    if (!u) return false;
    return (await hashPassword(password, u.salt)) === u.hash;
  },
};

const Session = {
  get: () => read(KEYS.session, null),
  set: (s) => write(KEYS.session, s),
  clear: () => localStorage.removeItem(KEYS.session),
};

const Children = {
  all: () => read(KEYS.children, []),
  forParent: (email) => Children.all().filter((c) => c.parentEmail === email.toLowerCase()),
  get: (email, id) => Children.all().find((c) => c.id === id && c.parentEmail === email.toLowerCase()) || null,
  add(email, { name, age, notes }) {
    const rows = Children.all();
    const child = { id: uid(), parentEmail: email.toLowerCase(), name, age: age ?? null, notes: notes ?? '', createdAt: new Date().toISOString() };
    rows.push(child);
    write(KEYS.children, rows);
    return child;
  },
};

const Logs = {
  all: () => read(KEYS.logs, []),
  forChild: (childId) => Logs.all().filter((l) => l.childId === childId).sort((a, b) => (a.date < b.date ? 1 : -1)),
  add(childId, data) {
    const rows = Logs.all();
    const log = {
      id: uid(), childId,
      date: data.date || new Date().toISOString().slice(0, 10),
      environment: data.environment, activity: data.activity ?? '',
      reaction: data.reaction, intensity: Number(data.intensity) || 3,
      triggers: Array.isArray(data.triggers) ? data.triggers : [],
      notes: data.notes ?? '', createdAt: new Date().toISOString(),
    };
    rows.push(log);
    write(KEYS.logs, rows);
    return log;
  },
};

// ---------------- state ----------------
let mode = 'login';
let activeChild = null;
let selectedTriggers = new Set();

function show(view) {
  $('authView').classList.toggle('hidden', view !== 'auth');
  $('dashView').classList.toggle('hidden', view !== 'dash');
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------------- auth ----------------
function setMode(next) {
  mode = next;
  $('tabLogin').classList.toggle('active', mode === 'login');
  $('tabSignup').classList.toggle('active', mode === 'signup');
  $('nameRow').classList.toggle('hidden', mode !== 'signup');
  $('confirmRow').classList.toggle('hidden', mode !== 'signup');
  $('submitBtn').textContent = mode === 'login' ? 'Log in' : 'Sign up';
  $('msg').textContent = '';
}
function authMsg(text, ok = false) {
  const m = $('msg');
  m.textContent = text;
  m.className = 'msg ' + (ok ? 'ok' : 'err');
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function submitAuth() {
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!EMAIL_RE.test(email)) return authMsg('Enter a valid email');
  try {
    if (mode === 'signup') {
      const name = $('name').value.trim();
      const confirm = $('confirm').value;
      if (!name) return authMsg('Enter your name');
      if (password.length < 6) return authMsg('Password must be at least 6 characters');
      if (password !== confirm) return authMsg('Passwords do not match');
      const res = await Users.register(name, email, password);
      if (res.error) return authMsg(res.error);
      Session.set(res.user);
      enterDashboard(res.user);
    } else {
      if (!(await Users.validate(email, password))) return authMsg('Invalid email or password');
      const u = Users.get(email);
      const user = { email: u.email, name: u.name, provider: 'password' };
      Session.set(user);
      enterDashboard(user);
    }
  } catch (e) {
    authMsg(e.message);
  }
}

function logout() {
  Session.clear();
  activeChild = null;
  show('auth');
  $('password').value = '';
  setMode('login');
}

// ---------------- dashboard ----------------
function enterDashboard(user) {
  $('whoami').textContent = user.name ? `${user.name} (${user.email})` : user.email;
  show('dash');
  populateLogForm();
  loadChildren();
}

function populateLogForm() {
  $('logEnv').innerHTML = ENVIRONMENTS.map((e) => `<option value="${e}">${e}</option>`).join('');
  $('logReaction').innerHTML = Object.entries(REACTIONS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  $('triggerChips').innerHTML = TRIGGERS.map((t) => `<span class="chip" data-t="${esc(t)}">${esc(t)}</span>`).join('');
  $('triggerChips').querySelectorAll('.chip').forEach((chip) => {
    chip.onclick = () => {
      const t = chip.dataset.t;
      if (selectedTriggers.has(t)) { selectedTriggers.delete(t); chip.classList.remove('on'); }
      else { selectedTriggers.add(t); chip.classList.add('on'); }
    };
  });
  $('logDate').value = new Date().toISOString().slice(0, 10);
}

function currentEmail() { return Session.get().email; }

function loadChildren() {
  const children = Children.forParent(currentEmail());
  renderChildList(children);
  if (children.length && !activeChild) selectChild(children[0]);
  if (!children.length) {
    activeChild = null;
    $('childPanel').classList.add('hidden');
    $('noChild').classList.remove('hidden');
  }
}

function renderChildList(children) {
  $('childList').innerHTML = children.map((c) => `
    <li data-id="${c.id}" class="${activeChild && activeChild.id === c.id ? 'active' : ''}">
      ${esc(c.name)}
      <div class="meta">${c.age != null ? 'Age ' + c.age : ''}${c.notes ? ' · ' + esc(c.notes) : ''}</div>
    </li>`).join('');
  $('childList').querySelectorAll('li').forEach((li) => {
    li.onclick = () => selectChild(children.find((c) => c.id === li.dataset.id));
  });
}

function addChild() {
  const name = $('childName').value.trim();
  const age = $('childAge').value;
  const notes = $('childNotes').value.trim();
  const m = $('childMsg');
  if (!name) { m.className = 'msg err'; m.textContent = 'Name is required'; return; }
  const ageNum = age === '' ? null : Number(age);
  const child = Children.add(currentEmail(), { name, age: ageNum, notes });
  $('childName').value = ''; $('childAge').value = ''; $('childNotes').value = '';
  m.className = 'msg ok'; m.textContent = 'Added!';
  loadChildren();
  selectChild(child);
}

function selectChild(child) {
  if (!child) return;
  activeChild = child;
  renderChildList(Children.forParent(currentEmail()));
  $('noChild').classList.add('hidden');
  $('childPanel').classList.remove('hidden');
  $('childTitle').textContent = `${child.name}${child.age != null ? ` · age ${child.age}` : ''}`;
  loadSuggestions();
  loadHistory();
}

function addLog() {
  const m = $('logMsg');
  Logs.add(activeChild.id, {
    date: $('logDate').value,
    environment: $('logEnv').value,
    reaction: $('logReaction').value,
    intensity: Number($('logIntensity').value),
    activity: $('logActivity').value.trim(),
    triggers: [...selectedTriggers],
    notes: $('logNotes').value.trim(),
  });
  m.className = 'msg ok'; m.textContent = 'Log saved.';
  $('logActivity').value = ''; $('logNotes').value = '';
  selectedTriggers.clear();
  $('triggerChips').querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
  loadSuggestions();
  loadHistory();
}

function loadHistory() {
  const logs = Logs.forChild(activeChild.id);
  if (!logs.length) { $('history').innerHTML = '<p class="sub">No logs yet.</p>'; return; }
  const rLabel = (k) => (REACTIONS[k] || {}).label || k;
  $('history').innerHTML = logs.slice(0, 12).map((l) => `
    <div class="log-item">
      <div class="top"><strong>${esc(l.environment)}</strong><span class="sub">${esc(l.date)}</span></div>
      <div>${esc(rLabel(l.reaction))} · intensity ${l.intensity}${l.activity ? ' · ' + esc(l.activity) : ''}</div>
      ${(l.triggers && l.triggers.length) ? `<div class="tags">triggers: ${l.triggers.map(esc).join(', ')}</div>` : ''}
      ${l.notes ? `<div class="tags">${esc(l.notes)}</div>` : ''}
    </div>`).join('');
}

function loadSuggestions() {
  const s = computeSuggestions(Logs.forChild(activeChild.id), { days: 30 });
  const el = $('suggestions');
  if (!s.totalLogs) { el.innerHTML = `<p class="sub">${esc(s.message)}</p>`; return; }
  const levelClass = (lvl) => (lvl === 'high-distress' ? 'highdistress' : lvl);
  const trend = s.trend ? ` · trend: <strong>${s.trend.direction}</strong>` : '';

  let html = `<div class="overall">
    <span class="badge ${levelClass(s.overallLevel)}">${esc(s.overallLevel)}</span>
    <span class="sub">${s.totalLogs} log(s), last ${s.window} days${trend}</span>
  </div>`;

  html += s.environments.map((e) => {
    const pct = Math.round(((e.score + 4) / 8) * 100);
    const color = e.score >= 1 ? '#16a34a' : e.score >= 0 ? '#d97706' : '#dc2626';
    return `<div class="envbar">
      <span style="width:90px">${esc(e.environment)}</span>
      <div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
      <span style="width:44px;text-align:right">${e.score}</span>
    </div>`;
  }).join('');

  html += '<div style="margin-top:14px">' + s.recommendations.map((r) => `
    <div class="rec ${r.priority}">
      <h4>${esc(r.title)}</h4>
      <p class="reason">${esc(r.reason)}</p>
      ${(r.actions && r.actions.length) ? `<ul>${r.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>`).join('') + '</div>';

  el.innerHTML = html;
}

// ---------------- wire up ----------------
$('tabLogin').onclick = () => setMode('login');
$('tabSignup').onclick = () => setMode('signup');
$('submitBtn').onclick = submitAuth;
$('logoutBtn').onclick = logout;
$('addChildBtn').onclick = addChild;
$('addLogBtn').onclick = addLog;
$('refreshSug').onclick = () => activeChild && loadSuggestions();
$('logIntensity').oninput = (e) => ($('intensityVal').textContent = e.target.value);
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });

// ---------------- boot ----------------
(function boot() {
  const session = Session.get();
  if (session) enterDashboard(session);
  else { show('auth'); setMode('login'); }
})();
