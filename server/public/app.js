const $ = (id) => document.getElementById(id);
const API = '';

let token = localStorage.getItem('token') || null;
let mode = 'login';
let meta = null;
let children = [];
let activeChild = null;
let selectedTriggers = new Set();

// ---------- helpers ----------
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function show(view) {
  $('authView').classList.toggle('hidden', view !== 'auth');
  $('dashView').classList.toggle('hidden', view !== 'dash');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- auth ----------
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

async function submitAuth() {
  const email = $('email').value.trim();
  const password = $('password').value;
  try {
    let data;
    if (mode === 'signup') {
      const name = $('name').value.trim();
      const confirm = $('confirm').value;
      if (!name) return authMsg('Enter your name');
      if (password.length < 6) return authMsg('Password must be at least 6 characters');
      if (password !== confirm) return authMsg('Passwords do not match');
      data = await api('/auth/signup', { method: 'POST', auth: false, body: { name, email, password } });
    } else {
      data = await api('/auth/login', { method: 'POST', auth: false, body: { email, password } });
    }
    token = data.token;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(data.user));
    await enterDashboard(data.user);
  } catch (e) {
    authMsg(e.message);
  }
}

function logout() {
  localStorage.clear();
  token = null;
  activeChild = null;
  children = [];
  show('auth');
  $('password').value = '';
  setMode('login');
}

// ---------- dashboard ----------
async function enterDashboard(user) {
  $('whoami').textContent = user.name ? `${user.name} (${user.email})` : user.email;
  show('dash');
  if (!meta) meta = await api('/meta', { auth: false });
  populateLogForm();
  await loadChildren();
}

function populateLogForm() {
  $('logEnv').innerHTML = meta.environments
    .map((e) => `<option value="${e}">${e}</option>`).join('');
  $('logReaction').innerHTML = meta.reactions
    .map((r) => `<option value="${r.key}">${esc(r.label)}</option>`).join('');
  $('triggerChips').innerHTML = meta.triggers
    .map((t) => `<span class="chip" data-t="${esc(t)}">${esc(t)}</span>`).join('');
  $('triggerChips').querySelectorAll('.chip').forEach((chip) => {
    chip.onclick = () => {
      const t = chip.dataset.t;
      if (selectedTriggers.has(t)) { selectedTriggers.delete(t); chip.classList.remove('on'); }
      else { selectedTriggers.add(t); chip.classList.add('on'); }
    };
  });
  $('logDate').value = new Date().toISOString().slice(0, 10);
}

async function loadChildren() {
  const data = await api('/children');
  children = data.children;
  renderChildList();
  if (children.length && !activeChild) selectChild(children[0]);
  if (!children.length) {
    activeChild = null;
    $('childPanel').classList.add('hidden');
    $('noChild').classList.remove('hidden');
  }
}

function renderChildList() {
  $('childList').innerHTML = children.map((c) => `
    <li data-id="${c.id}" class="${activeChild && activeChild.id === c.id ? 'active' : ''}">
      ${esc(c.name)}
      <div class="meta">${c.age != null ? 'Age ' + c.age : ''}${c.notes ? ' · ' + esc(c.notes) : ''}</div>
    </li>`).join('');
  $('childList').querySelectorAll('li').forEach((li) => {
    li.onclick = () => selectChild(children.find((c) => c.id === li.dataset.id));
  });
}

async function addChild() {
  const name = $('childName').value.trim();
  const age = $('childAge').value;
  const notes = $('childNotes').value.trim();
  const m = $('childMsg');
  if (!name) { m.className = 'msg err'; m.textContent = 'Name is required'; return; }
  try {
    const { child } = await api('/children', { method: 'POST', body: { name, age, notes } });
    $('childName').value = ''; $('childAge').value = ''; $('childNotes').value = '';
    m.className = 'msg ok'; m.textContent = 'Added!';
    await loadChildren();
    selectChild(child);
  } catch (e) {
    m.className = 'msg err'; m.textContent = e.message;
  }
}

async function selectChild(child) {
  if (!child) return;
  activeChild = child;
  renderChildList();
  $('noChild').classList.add('hidden');
  $('childPanel').classList.remove('hidden');
  $('childTitle').textContent = `${child.name}${child.age != null ? ` · age ${child.age}` : ''}`;
  await Promise.all([loadSuggestions(), loadHistory()]);
}

async function addLog() {
  const m = $('logMsg');
  try {
    const body = {
      date: $('logDate').value,
      environment: $('logEnv').value,
      reaction: $('logReaction').value,
      intensity: Number($('logIntensity').value),
      activity: $('logActivity').value.trim(),
      triggers: [...selectedTriggers],
      notes: $('logNotes').value.trim(),
    };
    await api(`/children/${activeChild.id}/logs`, { method: 'POST', body });
    m.className = 'msg ok'; m.textContent = 'Log saved.';
    $('logActivity').value = ''; $('logNotes').value = '';
    selectedTriggers.clear();
    $('triggerChips').querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
    await Promise.all([loadSuggestions(), loadHistory()]);
  } catch (e) {
    m.className = 'msg err'; m.textContent = e.message;
  }
}

async function loadHistory() {
  const { logs } = await api(`/children/${activeChild.id}/logs`);
  if (!logs.length) { $('history').innerHTML = '<p class="sub">No logs yet.</p>'; return; }
  const rLabel = (k) => (meta.reactions.find((r) => r.key === k) || {}).label || k;
  $('history').innerHTML = logs.slice(0, 12).map((l) => `
    <div class="log-item">
      <div class="top">
        <strong>${esc(l.environment)}</strong>
        <span class="sub">${esc(l.date)}</span>
      </div>
      <div>${esc(rLabel(l.reaction))} · intensity ${l.intensity}${l.activity ? ' · ' + esc(l.activity) : ''}</div>
      ${(l.triggers && l.triggers.length) ? `<div class="tags">triggers: ${l.triggers.map(esc).join(', ')}</div>` : ''}
      ${l.notes ? `<div class="tags">${esc(l.notes)}</div>` : ''}
    </div>`).join('');
}

async function loadSuggestions() {
  const { suggestions: s } = await api(`/children/${activeChild.id}/suggestions?days=30`);
  const el = $('suggestions');
  if (!s.totalLogs) { el.innerHTML = `<p class="sub">${esc(s.message)}</p>`; return; }

  const levelClass = (lvl) => lvl === 'high-distress' ? 'highdistress' : lvl;
  const trend = s.trend
    ? ` · trend: <strong>${s.trend.direction}</strong>`
    : '';

  let html = `<div class="overall">
    <span class="badge ${levelClass(s.overallLevel)}">${esc(s.overallLevel)}</span>
    <span class="sub">${s.totalLogs} log(s), last ${s.window} days${trend}</span>
  </div>`;

  // Environment bars
  html += s.environments.map((e) => {
    const pct = Math.round(((e.score + 4) / 8) * 100); // map -4..4 -> 0..100
    const color = e.score >= 1 ? '#16a34a' : e.score >= 0 ? '#d97706' : '#dc2626';
    return `<div class="envbar">
      <span style="width:90px">${esc(e.environment)}</span>
      <div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
      <span style="width:44px;text-align:right">${e.score}</span>
    </div>`;
  }).join('');

  // Recommendations
  html += '<div style="margin-top:14px">' + s.recommendations.map((r) => `
    <div class="rec ${r.priority}">
      <h4>${esc(r.title)}</h4>
      <p class="reason">${esc(r.reason)}</p>
      ${(r.actions && r.actions.length) ? `<ul>${r.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>`).join('') + '</div>';

  el.innerHTML = html;
}

// ---------- wire up ----------
$('tabLogin').onclick = () => setMode('login');
$('tabSignup').onclick = () => setMode('signup');
$('submitBtn').onclick = submitAuth;
$('googleBtn').onclick = () =>
  authMsg('Google SSO requires GOOGLE_WEB_CLIENT_ID configured on the server.');
$('logoutBtn').onclick = logout;
$('addChildBtn').onclick = addChild;
$('addLogBtn').onclick = addLog;
$('refreshSug').onclick = () => activeChild && loadSuggestions();
$('logIntensity').oninput = (e) => ($('intensityVal').textContent = e.target.value);

// ---------- boot ----------
(async function boot() {
  if (token) {
    try {
      const user = await api('/me');
      await enterDashboard(user);
      return;
    } catch {
      localStorage.clear();
      token = null;
    }
  }
  show('auth');
  setMode('login');
})();
