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
  update(id, { name, age, notes }) {
    const rows = Children.all();
    const c = rows.find((r) => r.id === id);
    if (!c) return null;
    c.name = name; c.age = age ?? null; c.notes = notes ?? '';
    write(KEYS.children, rows);
    return c;
  },
  remove(id) {
    write(KEYS.children, Children.all().filter((c) => c.id !== id));
    write(KEYS.logs, Logs.all().filter((l) => l.childId !== id));
  },
};

const Logs = {
  all: () => read(KEYS.logs, []),
  get: (id) => Logs.all().find((l) => l.id === id) || null,
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
  update(id, data) {
    const rows = Logs.all();
    const l = rows.find((r) => r.id === id);
    if (!l) return null;
    l.date = data.date || l.date;
    l.environment = data.environment;
    l.reaction = data.reaction;
    l.intensity = Number(data.intensity) || 3;
    l.activity = data.activity ?? '';
    l.triggers = Array.isArray(data.triggers) ? data.triggers : [];
    l.notes = data.notes ?? '';
    write(KEYS.logs, rows);
    return l;
  },
  remove(id) {
    write(KEYS.logs, Logs.all().filter((l) => l.id !== id));
  },
};

// ---------------- export / import ----------------
function exportData() {
  const email = currentEmail();
  const children = Children.forParent(email);
  const childIds = new Set(children.map((c) => c.id));
  const logs = Logs.all().filter((l) => childIds.has(l.childId));
  const payload = {
    app: 'KidCompass', version: 1, exportedAt: new Date().toISOString(),
    account: email, children, logs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kidcompass-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.app !== 'KidCompass' || !Array.isArray(data.children) || !Array.isArray(data.logs)) {
        alert('Not a valid KidCompass backup file.');
        return;
      }
      const email = currentEmail();
      const existingChildren = Children.all();
      const existingLogs = Logs.all();
      const childIds = new Set(existingChildren.map((c) => c.id));
      const logIds = new Set(existingLogs.map((l) => l.id));
      let addedC = 0, addedL = 0;
      for (const c of data.children) {
        if (childIds.has(c.id)) continue;
        existingChildren.push({ ...c, parentEmail: email });
        childIds.add(c.id); addedC++;
      }
      const validChildIds = new Set(existingChildren.map((c) => c.id));
      for (const l of data.logs) {
        if (logIds.has(l.id) || !validChildIds.has(l.childId)) continue;
        existingLogs.push(l);
        logIds.add(l.id); addedL++;
      }
      write(KEYS.children, existingChildren);
      write(KEYS.logs, existingLogs);
      alert(`Imported ${addedC} child(ren) and ${addedL} log(s).`);
      activeChild = null;
      loadChildren();
    } catch (e) {
      alert('Could not read the file: ' + e.message);
    }
  };
  reader.readAsText(file);
}

// ---------------- state ----------------
let mode = 'login';
let activeChild = null;
let selectedTriggers = new Set();
let editingLogId = null;
let editingChildId = null;
let windowDays = 30;

// Comfort score for a single log (mirrors engine.js logScore).
function logScoreOf(log) {
  const valence = (REACTIONS[log.reaction] || {}).valence ?? 0;
  const intensity = Math.min(5, Math.max(1, Number(log.intensity) || 3));
  return valence * (intensity / 3);
}

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
      <div class="ci-main">
        ${esc(c.name)}
        <div class="meta">${c.age != null ? 'Age ' + c.age : ''}${c.notes ? ' · ' + esc(c.notes) : ''}</div>
      </div>
      <div class="ci-actions">
        <button class="icon" data-act="edit" title="Edit">✏️</button>
        <button class="icon" data-act="del" title="Delete">🗑️</button>
      </div>
    </li>`).join('');
  $('childList').querySelectorAll('li').forEach((li) => {
    const child = children.find((c) => c.id === li.dataset.id);
    li.querySelector('.ci-main').onclick = () => selectChild(child);
    li.querySelector('[data-act="edit"]').onclick = (e) => { e.stopPropagation(); startEditChild(child); };
    li.querySelector('[data-act="del"]').onclick = (e) => { e.stopPropagation(); deleteChild(child); };
  });
}

function startEditChild(child) {
  editingChildId = child.id;
  $('childName').value = child.name;
  $('childAge').value = child.age ?? '';
  $('childNotes').value = child.notes ?? '';
  $('addChildBtn').textContent = 'Save changes';
  $('addChildSummary').textContent = 'Editing child';
  const details = $('addChildDetails');
  if (details) details.open = true;
  $('cancelChildEdit').classList.remove('hidden');
}

function cancelEditChild() {
  editingChildId = null;
  $('childName').value = ''; $('childAge').value = ''; $('childNotes').value = '';
  $('addChildBtn').textContent = 'Add';
  $('addChildSummary').textContent = '+ Add child';
  $('cancelChildEdit').classList.add('hidden');
  $('childMsg').textContent = '';
}

function deleteChild(child) {
  if (!confirm(`Delete "${child.name}" and all their logs? This cannot be undone.`)) return;
  Children.remove(child.id);
  if (activeChild && activeChild.id === child.id) activeChild = null;
  if (editingChildId === child.id) cancelEditChild();
  loadChildren();
}

function addChild() {
  const name = $('childName').value.trim();
  const age = $('childAge').value;
  const notes = $('childNotes').value.trim();
  const m = $('childMsg');
  if (!name) { m.className = 'msg err'; m.textContent = 'Name is required'; return; }
  const ageNum = age === '' ? null : Number(age);
  if (editingChildId) {
    Children.update(editingChildId, { name, age: ageNum, notes });
    const id = editingChildId;
    cancelEditChild();
    m.className = 'msg ok'; m.textContent = 'Saved!';
    loadChildren();
    const updated = Children.get(currentEmail(), id);
    if (updated) selectChild(updated);
    return;
  }
  const child = Children.add(currentEmail(), { name, age: ageNum, notes });
  $('childName').value = ''; $('childAge').value = ''; $('childNotes').value = '';
  m.className = 'msg ok'; m.textContent = 'Added!';
  loadChildren();
  selectChild(child);
}

function selectChild(child) {
  if (!child) return;
  activeChild = child;
  cancelEditLog();
  renderChildList(Children.forParent(currentEmail()));
  $('noChild').classList.add('hidden');
  $('childPanel').classList.remove('hidden');
  $('childTitle').textContent = `${child.name}${child.age != null ? ` · age ${child.age}` : ''}`;
  loadSuggestions();
  loadHistory();
}

function setTriggerChips(triggers) {
  selectedTriggers = new Set(triggers || []);
  $('triggerChips').querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('on', selectedTriggers.has(c.dataset.t));
  });
}

function startEditLog(log) {
  editingLogId = log.id;
  $('logDate').value = log.date;
  $('logEnv').value = log.environment;
  $('logReaction').value = log.reaction;
  $('logIntensity').value = log.intensity;
  $('intensityVal').textContent = log.intensity;
  $('logActivity').value = log.activity || '';
  $('logNotes').value = log.notes || '';
  setTriggerChips(log.triggers);
  $('addLogBtn').textContent = 'Update log';
  $('cancelLogEdit').classList.remove('hidden');
  $('logForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditLog() {
  editingLogId = null;
  $('addLogBtn').textContent = 'Save log';
  $('cancelLogEdit').classList.add('hidden');
  $('logActivity').value = ''; $('logNotes').value = '';
  setTriggerChips([]);
  $('logMsg').textContent = '';
}

function deleteLog(log) {
  if (!confirm('Delete this log entry?')) return;
  Logs.remove(log.id);
  if (editingLogId === log.id) cancelEditLog();
  loadSuggestions();
  loadHistory();
}

function addLog() {
  const m = $('logMsg');
  const data = {
    date: $('logDate').value,
    environment: $('logEnv').value,
    reaction: $('logReaction').value,
    intensity: Number($('logIntensity').value),
    activity: $('logActivity').value.trim(),
    triggers: [...selectedTriggers],
    notes: $('logNotes').value.trim(),
  };
  if (editingLogId) {
    Logs.update(editingLogId, data);
    cancelEditLog();
    m.className = 'msg ok'; m.textContent = 'Log updated.';
  } else {
    Logs.add(activeChild.id, data);
    m.className = 'msg ok'; m.textContent = 'Log saved.';
    $('logActivity').value = ''; $('logNotes').value = '';
    selectedTriggers.clear();
    $('triggerChips').querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
  }
  loadSuggestions();
  loadHistory();
}

function loadHistory() {
  const logs = Logs.forChild(activeChild.id);
  if (!logs.length) { $('history').innerHTML = '<p class="sub">No logs yet.</p>'; return; }
  const rLabel = (k) => (REACTIONS[k] || {}).label || k;
  $('history').innerHTML = logs.slice(0, 20).map((l) => `
    <div class="log-item" data-id="${l.id}">
      <div class="top">
        <strong>${esc(l.environment)}</strong>
        <span class="li-right"><span class="sub">${esc(l.date)}</span>
          <button class="icon" data-act="edit" title="Edit">✏️</button>
          <button class="icon" data-act="del" title="Delete">🗑️</button>
        </span>
      </div>
      <div>${esc(rLabel(l.reaction))} · intensity ${l.intensity}${l.activity ? ' · ' + esc(l.activity) : ''}</div>
      ${(l.triggers && l.triggers.length) ? `<div class="tags">triggers: ${l.triggers.map(esc).join(', ')}</div>` : ''}
      ${l.notes ? `<div class="tags">${esc(l.notes)}</div>` : ''}
    </div>`).join('');
  $('history').querySelectorAll('.log-item').forEach((item) => {
    const log = logs.find((l) => l.id === item.dataset.id);
    item.querySelector('[data-act="edit"]').onclick = () => startEditLog(log);
    item.querySelector('[data-act="del"]').onclick = () => deleteLog(log);
  });
}

// Build an SVG sparkline of daily average comfort over the window.
function renderChart(logs) {
  const el = $('trendChart');
  const cutoff = windowDays >= 100000 ? '0000-00-00'
    : new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const recent = logs.filter((l) => l.date >= cutoff);
  const byDate = {};
  for (const l of recent) (byDate[l.date] ||= []).push(logScoreOf(l));
  const days = Object.keys(byDate).sort();
  if (days.length < 2) { el.innerHTML = '<p class="sub">Log on at least two different days to see a trend chart.</p>'; return; }
  const points = days.map((d) => byDate[d].reduce((a, b) => a + b, 0) / byDate[d].length);

  const W = 600, H = 140, pad = 24, minY = -4, maxY = 4;
  const x = (i) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (v) => pad + ((maxY - v) / (maxY - minY)) * (H - 2 * pad);
  const zeroY = y(0);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots = points.map((v, i) => {
    const color = v >= 1 ? '#16a34a' : v >= 0 ? '#d97706' : '#dc2626';
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${color}"><title>${esc(days[i])}: ${v.toFixed(2)}</title></circle>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="spark" preserveAspectRatio="none" role="img" aria-label="Comfort trend chart">
    <line x1="${pad}" y1="${zeroY}" x2="${W - pad}" y2="${zeroY}" stroke="#d1d5db" stroke-dasharray="4 4"/>
    <text x="2" y="${pad + 4}" font-size="9" fill="#9ca3af">+4 thrives</text>
    <text x="2" y="${H - pad + 4}" font-size="9" fill="#9ca3af">-4 distress</text>
    <path d="${line}" fill="none" stroke="var(--brand)" stroke-width="2"/>
    ${dots}
  </svg>`;
}

function loadSuggestions() {
  const logs = Logs.forChild(activeChild.id);
  renderChart(logs);
  const s = computeSuggestions(logs, { days: windowDays });
  const el = $('suggestions');
  if (!s.totalLogs) { el.innerHTML = `<p class="sub">${esc(s.message)}</p>`; return; }
  const levelClass = (lvl) => (lvl === 'high-distress' ? 'highdistress' : lvl);
  const trend = s.trend ? ` · trend: <strong>${s.trend.direction}</strong>` : '';
  const windowLabel = windowDays >= 100000 ? 'all time' : `last ${s.window} days`;

  let html = `<div class="overall">
    <span class="badge ${levelClass(s.overallLevel)}">${esc(s.overallLevel)}</span>
    <span class="sub">${s.totalLogs} log(s), ${windowLabel}${trend}</span>
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
$('cancelChildEdit').onclick = cancelEditChild;
$('addLogBtn').onclick = addLog;
$('cancelLogEdit').onclick = cancelEditLog;
$('refreshSug').onclick = () => activeChild && loadSuggestions();
$('logIntensity').oninput = (e) => ($('intensityVal').textContent = e.target.value);
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
$('windowSelect').onchange = (e) => { windowDays = Number(e.target.value); if (activeChild) loadSuggestions(); };
$('exportBtn').onclick = exportData;
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };

// ---------------- boot ----------------
(function boot() {
  const session = Session.get();
  if (session) enterDashboard(session);
  else { show('auth'); setMode('login'); }
})();
