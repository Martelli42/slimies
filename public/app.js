// ── State ─────────────────────────────────────────────────────────────────────
let token        = null;
let me           = null;   // { id, display_name, slime_color }
let partner      = null;   // { id, display_name, slime_color }
let myMood       = {};
let partnerMood  = {};
let socket       = null;
let selectedColor = 'blue';

const MOOD_KEYS = ['hungry','tired','sad','need_attention','stressed','happy','alone_time','miss_you'];
const MOOD_EMOJI = { hungry:'🍕', tired:'😴', sad:'😢', need_attention:'🤗',
  stressed:'😰', happy:'😊', alone_time:'🧘', miss_you:'💕', ok:'✨' };

// ── Boot ──────────────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
if (params.get('token')) {
  token = params.get('token');
  localStorage.setItem('token', token);
  window.history.replaceState({}, '', '/');
} else {
  token = localStorage.getItem('token');
}

buildColorPicker();
if (token) bootApp(); // skip login screen

// ── App boot ──────────────────────────────────────────────────────────────────
async function bootApp() {
  try {
    const [meRes, partnerRes] = await Promise.all([
      api('GET', '/api/me'),
      api('GET', '/api/partner'),
    ]);
    me = meRes.user;
    myMood = meRes.mood || {};
    selectedColor = me.slime_color || 'blue';

    // Need setup?
    if (params.get('new') === '1' || !me.display_name) {
      document.getElementById('setup-name').value = me.display_name || '';
      showScreen('setup-screen');
      return;
    }

    if (!me.partner_id) {
      await generateInviteCode();
      showScreen('pair-screen');
      return;
    }

    partner = partnerRes.partner;
    partnerMood = partnerRes.mood || {};
    launchApp();
  } catch(e) {
    localStorage.clear();
    showScreen('login-screen');
  }
}

// ── Setup screen ──────────────────────────────────────────────────────────────
function buildColorPicker() {
  const picker = document.getElementById('color-picker');
  const colors = Object.keys(PALETTES);
  picker.innerHTML = '';
  colors.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'color-dot' + (c === selectedColor ? ' selected' : '');
    dot.style.background = PALETTES[c].body;
    dot.style.boxShadow  = `0 2px 8px ${PALETTES[c].body}88`;
    dot.onclick = () => {
      selectedColor = c;
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
    };
    picker.appendChild(dot);
  });
}

async function saveSetup() {
  const name = document.getElementById('setup-name').value.trim();
  if (!name) return;
  await api('POST', '/api/setup', { display_name: name, slime_color: selectedColor });
  me.display_name = name;
  me.slime_color  = selectedColor;
  if (!me.partner_id) {
    await generateInviteCode();
    showScreen('pair-screen');
  } else {
    launchApp();
  }
}

// ── Pair screen ───────────────────────────────────────────────────────────────
async function generateInviteCode() {
  const { code } = await api('POST', '/api/invite/generate');
  document.getElementById('invite-code').textContent = code;
}

function copyCode() {
  const code = document.getElementById('invite-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    document.getElementById('copy-hint').textContent = '✓ copied!';
    setTimeout(() => document.getElementById('copy-hint').textContent = 'tap to copy', 2000);
  });
}

async function acceptCode() {
  const code = document.getElementById('partner-code').value.trim();
  const err  = document.getElementById('pair-error');
  err.style.display = 'none';
  try {
    const res = await api('POST', '/api/invite/accept', { code });
    if (res.ok) {
      me.partner_id = res.partnerId;
      const pRes = await api('GET', '/api/partner');
      partner = pRes.partner;
      partnerMood = pRes.mood || {};
      launchApp();
    }
  } catch(e) {
    err.textContent = e.message || 'Invalid code';
    err.style.display = 'block';
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
function launchApp() {
  showScreen('app-screen');
  updateHeader();
  initCanvas();
  connectSocket();
  registerPush();
  updateInteractionButtons();
}

function updateHeader() {
  document.getElementById('header-my-name').textContent      = me.display_name;
  document.getElementById('header-partner-name').textContent = partner?.display_name || 'Partner';
  document.getElementById('label-me').textContent            = me.display_name;
  document.getElementById('label-partner').textContent       = partner?.display_name || 'Partner';
  document.getElementById('my-mood-badge').textContent       = MOOD_EMOJI[getDominant(myMood)] || '';
  document.getElementById('partner-mood-badge').textContent  = MOOD_EMOJI[getDominant(partnerMood)] || '';
}

function getDominant(mood) {
  const priority = ['stressed','sad','need_attention','hungry','tired','miss_you','alone_time','happy'];
  for (const m of priority) if (mood[m]) return m;
  return 'ok';
}

function updateInteractionButtons() {
  const has = !!partner;
  ['feed','hug','cheer','love'].forEach(t => {
    document.getElementById(`btn-${t}`).disabled = !has;
  });
}

// ── Canvas ────────────────────────────────────────────────────────────────────
let canvas, ctx;
let mySlimeAI, partnerSlimeAI;
let lastTs = null;
let interactionAnim = null; // { type, timer }

function initCanvas() {
  canvas = document.getElementById('slime-canvas');
  ctx = canvas.getContext('2d');

  mySlimeAI      = new SlimeAI('right');
  partnerSlimeAI = new SlimeAI('left');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(renderLoop);
}

function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  mySlimeAI.init(canvas.width, canvas.height);
  partnerSlimeAI.init(canvas.width, canvas.height);
}

function renderLoop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;

  const W = canvas.width, H = canvas.height;

  // Background
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#0f3460');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Ground line
  ctx.strokeStyle = '#ffffff15';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H-8); ctx.lineTo(W, H-8);
  ctx.stroke();

  const myMoodKey      = getDominant(myMood);
  const partnerMoodKey = getDominant(partnerMood);

  // Update AIs
  mySlimeAI.update(dt,      myMoodKey,      partnerSlimeAI.x, partnerSlimeAI.y);
  partnerSlimeAI.update(dt, partnerMoodKey, mySlimeAI.x,      mySlimeAI.y);

  // Interaction animation
  if (interactionAnim) {
    interactionAnim.timer -= dt;
    if (interactionAnim.timer <= 0) interactionAnim = null;
    else triggerParticleEffect(interactionAnim.type);
  }

  // Check proximity → hearts
  const dist = Math.hypot(mySlimeAI.x - partnerSlimeAI.x, mySlimeAI.y - partnerSlimeAI.y);
  if (dist < 80 && Math.random() < 0.04) {
    const mx = (mySlimeAI.x + partnerSlimeAI.x)/2;
    const my = (mySlimeAI.y + partnerSlimeAI.y)/2;
    spawnParticles(mx, my - 20, '✨', 1);
  }

  // Draw partner slime (left side)
  drawSlime(ctx, partnerSlimeAI.x, partnerSlimeAI.y,
    partner?.slime_color || 'pink', partnerMoodKey, partnerSlimeAI.squish, false);

  // Draw my slime (right side)
  drawSlime(ctx, mySlimeAI.x, mySlimeAI.y,
    me?.slime_color || 'blue', myMoodKey, mySlimeAI.squish, false);

  updateParticles(ctx);
  requestAnimationFrame(renderLoop);
}

function triggerParticleEffect(type) {
  if (Math.random() > 0.15) return;
  const emoji = { feed:'🍕', hug:'💞', cheer:'✨', love:'💕' }[type] || '✨';
  spawnParticles(mySlimeAI.x + (Math.random()-0.5)*60,
                 mySlimeAI.y - 30 + (Math.random()-0.5)*40, emoji, 1);
}

// ── Mood modal ────────────────────────────────────────────────────────────────
function openMoodModal() {
  // Pre-fill current mood
  MOOD_KEYS.forEach(k => {
    const el = document.getElementById(`m-${k}`);
    if (el) el.checked = !!myMood[k];
  });
  document.getElementById('mood-modal').classList.add('open');
}
function closeMoodModal() { document.getElementById('mood-modal').classList.remove('open'); }

async function submitMood() {
  const mood = {};
  MOOD_KEYS.forEach(k => { mood[k] = document.getElementById(`m-${k}`)?.checked ? 1 : 0; });
  await api('POST', '/api/mood/update', mood);
  myMood = mood;
  document.getElementById('my-mood-badge').textContent = MOOD_EMOJI[getDominant(myMood)] || '';
  closeMoodModal();
  showBanner('Slimie updated! 🫧');
}

// ── History ───────────────────────────────────────────────────────────────────
async function openHistory() {
  const history = await api('GET', '/api/mood/history');
  const grid = document.getElementById('history-grid');
  grid.innerHTML = '';
  if (!history.length) { grid.innerHTML = '<p style="color:var(--muted)">No history yet</p>'; }
  history.forEach(day => {
    const dominant = getDominant(day);
    const date = new Date(day.day + 'T12:00:00');
    const label = date.toLocaleDateString('en',{weekday:'short'});
    grid.innerHTML += `
      <div class="history-day">
        <div class="day-label">${label}</div>
        <div class="day-emoji">${MOOD_EMOJI[dominant]||'✨'}</div>
        <div class="day-mood">${dominant.replace('_',' ')}</div>
      </div>`;
  });
  document.getElementById('history-modal').classList.add('open');
}
function closeHistory() { document.getElementById('history-modal').classList.remove('open'); }

// ── Interactions ──────────────────────────────────────────────────────────────
async function sendInteraction(type) {
  await api('POST', '/api/interaction', { type });
  interactionAnim = { type, timer: 3 };
  showBanner({ feed:'🍕 Fed your partner!', hug:'🤗 Sent a hug!', cheer:'✨ Cheered them up!', love:'💕 Sent love!' }[type]);
}

// ── Socket ────────────────────────────────────────────────────────────────────
function connectSocket() {
  socket = io({ auth: { token } });

  socket.on('partner-mood', ({ mood }) => {
    partnerMood = mood;
    document.getElementById('partner-mood-badge').textContent = MOOD_EMOJI[getDominant(partnerMood)] || '';
    const dominant = getDominant(mood);
    showBanner(`${partner?.display_name||'Partner'} updated: ${MOOD_EMOJI[dominant]} ${dominant.replace('_',' ')}`);
  });

  socket.on('interaction', ({ type, fromName }) => {
    const emoji = { feed:'🍕', hug:'🤗', cheer:'✨', love:'💕' }[type] || '✨';
    spawnParticles(mySlimeAI.x, mySlimeAI.y - 40, emoji, 8);
    showBanner(`${fromName} sent you ${emoji}!`);
  });

  socket.on('partner-status', ({ online }) => {
    document.getElementById('partner-dot').className = 'header-dot' + (online ? ' online' : '');
  });

  socket.on('paired', async () => {
    const pRes = await api('GET', '/api/partner');
    partner = pRes.partner;
    partnerMood = pRes.mood || {};
    launchApp();
  });
}

// ── Push notifications ────────────────────────────────────────────────────────
async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const { key } = await api('GET', '/api/vapid-key');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key)
    });
    await api('POST', '/api/push/subscribe', sub.toJSON());
    document.getElementById('notif-btn').textContent = '🔔';
  } catch {}
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  if (perm === 'granted') registerPush();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen, #app-screen').forEach(s => {
    s.classList.remove('active');
    if (s.id === 'app-screen') s.style.display = '';
  });
  const el = document.getElementById(id);
  if (id === 'app-screen') { el.style.display = 'flex'; el.classList.add('active'); }
  else el.classList.add('active');
}

let bannerTimer;
function showBanner(msg) {
  const b = document.getElementById('notif-banner');
  b.textContent = msg;
  b.style.display = 'block';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.style.display = 'none'; }, 3000);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': token || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
