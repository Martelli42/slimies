/* Shop Board — internal coffee shop app.
   One page, six tabs, kept current by polling a change stamp. */

const POLL_MS = 15000;

const state = {
  token: localStorage.getItem('shop_token'),
  me: null,
  shop: { name: 'Shop Board', timezone: 'local' },
  tab: location.hash.replace('#', '') || 'today',
  bakeryTab: 'floor',
  taskShift: 'opening',
  taskDate: null,
  weekStart: null,
  trailerMonths: 3,
  adminTab: 'staff',
  pulse: null,
  pollTimer: null,
  staff: [],
  products: []
};

// ── Small helpers ─────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && state.me) return signOut();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  // Our own writes move the change stamp; adopt the new one silently rather than
  // redrawing a screen we are about to redraw anyway.
  if (options.method && options.method !== 'GET') state.pulse = null;
  return data;
}

let toastTimer;
function toast(message, bad = false) {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 2800);
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'a' : 'p';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${suffix}`;
}

function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);
}

function fmtStamp(stamp) {
  if (!stamp) return '';
  const date = new Date(`${stamp.replace(' ', 'T')}Z`);
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 20) return `${Math.round(mins / 60)}h ago`;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayOf(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function isManager() {
  return state.me?.role === 'manager';
}

function dayCountLabel(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return `${Math.abs(days)}d past`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

// ── Modal + form builder ──────────────────────────────────────────────────────
function closeModal() {
  $('#modal-root').innerHTML = '';
}

function openModal(title, bodyHtml, onMount) {
  $('#modal-root').innerHTML = `
    <div class="modal-backdrop" data-close="1">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="row"><h3 class="grow">${esc(title)}</h3>
          <button class="btn small ghost" data-close="1">Close</button></div>
        ${bodyHtml}
      </div>
    </div>`;
  const backdrop = $('.modal-backdrop');
  backdrop.addEventListener('click', (event) => {
    if (event.target.dataset.close) closeModal();
  });
  if (onMount) onMount($('.modal'));
}

/** Renders a form from a field spec and hands back the values on submit. */
function formModal({ title, fields, submit = 'Save', onSubmit, extra = '' }) {
  const inputs = fields.map((field) => {
    const id = `f_${field.name}`;
    const value = field.value ?? '';
    if (field.type === 'select') {
      const options = field.options.map((opt) => {
        const optValue = opt.value ?? opt;
        const label = opt.label ?? opt;
        return `<option value="${esc(optValue)}"${String(optValue) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
      }).join('');
      return `<label class="field"><span>${esc(field.label)}</span>
        <select id="${id}" name="${field.name}">${options}</select></label>`;
    }
    if (field.type === 'textarea') {
      return `<label class="field"><span>${esc(field.label)}</span>
        <textarea id="${id}" name="${field.name}" placeholder="${esc(field.placeholder || '')}">${esc(value)}</textarea></label>`;
    }
    if (field.type === 'checkbox') {
      return `<label class="row"><input type="checkbox" id="${id}" name="${field.name}"${value ? ' checked' : ''}>
        <span>${esc(field.label)}</span></label>`;
    }
    return `<label class="field"><span>${esc(field.label)}</span>
      <input class="input" id="${id}" name="${field.name}" type="${field.type || 'text'}"
        ${field.type === 'number' ? `step="${field.step || 'any'}" min="${field.min ?? 0}"` : ''}
        ${field.inputmode ? `inputmode="${field.inputmode}"` : ''}
        ${field.maxlength ? `maxlength="${field.maxlength}"` : ''}
        placeholder="${esc(field.placeholder || '')}" value="${esc(value)}">
      ${field.hint ? `<small class="muted">${esc(field.hint)}</small>` : ''}</label>`;
  }).join('');

  openModal(title, `
    <form class="stack" id="modal-form" novalidate>
      ${inputs}
      ${extra}
      <p class="error" id="modal-error"></p>
      <button class="btn primary full" type="submit">${esc(submit)}</button>
    </form>`, (modal) => {
    const form = modal.querySelector('#modal-form');
    const first = form.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus(), 50);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = {};
      for (const field of fields) {
        const node = form.querySelector(`[name="${field.name}"]`);
        if (!node) continue;
        values[field.name] = field.type === 'checkbox' ? node.checked : node.value.trim();
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await onSubmit(values, form);
        closeModal();
      } catch (err) {
        form.querySelector('#modal-error').textContent = err.message;
        button.disabled = false;
      }
    });
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
let selectedEmployee = null;

async function showLogin() {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');

  let roster;
  try {
    roster = await api('/roster');
  } catch (err) {
    // Usually a fresh deployment missing its environment variables — say so
    // rather than showing an empty screen.
    $('#roster').classList.add('hidden');
    $('#login-hint').textContent = 'The app cannot reach its server.';
    $('#login-error').textContent = err.message;
    return;
  }

  $('#login-shop').textContent = roster.shop_name;
  if (roster.configured === false) {
    $('#login-error').textContent = 'SHOP_JWT_SECRET is not set on the server — sign-in will fail.';
  }

  if (roster.needs_setup) {
    $('#roster').classList.add('hidden');
    $('#login-hint').textContent = 'First time here?';
    $('#setup-form').classList.remove('hidden');
    return;
  }

  $('#roster').innerHTML = roster.staff.map((person) => `
    <button data-id="${person.id}" data-name="${esc(person.name)}">
      <span class="chip-initials" style="background:${esc(person.color)}">${esc(initials(person.name))}</span>
      <span>${esc(person.name)}</span>
      <span class="chip-role">${person.role === 'manager' ? 'manager' : 'staff'}</span>
    </button>`).join('');
}

function wireLogin() {
  $('#roster').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    selectedEmployee = Number(button.dataset.id);
    $('#pin-name').textContent = button.dataset.name;
    $('#roster').classList.add('hidden');
    $('#pin-form').classList.remove('hidden');
    $('#pin-input').value = '';
    $('#pin-input').focus();
  });

  $('#pin-back').addEventListener('click', () => {
    $('#pin-form').classList.add('hidden');
    $('#roster').classList.remove('hidden');
    $('#login-error').textContent = '';
  });

  $('#pin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#login-error').textContent = '';
    try {
      const result = await api('/login', {
        method: 'POST',
        body: { employee_id: selectedEmployee, pin: $('#pin-input').value }
      });
      finishSignIn(result);
    } catch (err) {
      $('#login-error').textContent = err.message;
      $('#pin-input').value = '';
    }
  });

  $('#setup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#login-error').textContent = '';
    try {
      const result = await api('/bootstrap', {
        method: 'POST',
        body: { name: $('#setup-name').value, pin: $('#setup-pin').value }
      });
      finishSignIn(result);
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });
}

function finishSignIn(result) {
  state.token = result.token;
  localStorage.setItem('shop_token', result.token);
  boot();
}

function signOut() {
  state.token = null;
  state.me = null;
  state.pulse = null;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
  localStorage.removeItem('shop_token');
  showLogin();
}

// ── App frame ─────────────────────────────────────────────────────────────────
async function boot() {
  if (!state.token) return showLogin();
  let me;
  try {
    me = await api('/me');
  } catch {
    return signOut();
  }

  state.me = me.employee;
  state.shop = me.shop;
  state.taskDate = state.taskDate || me.clock.date;
  state.weekStart = state.weekStart || mondayOf(me.clock.date);

  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#shop-name').textContent = me.shop.name;
  $('#clock').textContent = `${fmtDate(me.clock.date)} · ${fmtTime(me.clock.time)}`;
  const avatar = $('#who');
  avatar.textContent = initials(state.me.name);
  avatar.style.background = state.me.color;

  startPolling();
  refreshBadge();
  render();
}

/**
 * Keeps every screen current without a persistent connection: ask the server for
 * a change stamp, and only refetch the view when it differs. Cheap enough to run
 * on a tablet all day, and it works on hosts that can't hold a socket open.
 */
function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(checkPulse, POLL_MS);
  checkPulse();
}

async function checkPulse() {
  if (!state.me || document.hidden) return;
  try {
    const { stamp } = await api('/pulse');
    if (state.pulse === null) {
      state.pulse = stamp;
      return;
    }
    if (stamp !== state.pulse) {
      state.pulse = stamp;
      render({ quiet: true });
      refreshBadge();
    }
  } catch { /* offline for a moment; the next tick retries */ }
}


async function refreshBadge() {
  try {
    const { unread } = await api('/board/unread-count');
    const badge = $('#board-badge');
    badge.textContent = unread;
    badge.classList.toggle('hidden', !unread);
  } catch { /* not fatal */ }
}

const VIEWS = {
  today: viewToday,
  bakery: viewBakery,
  tasks: viewTasks,
  schedule: viewSchedule,
  trailer: viewTrailer,
  board: viewBoard,
  admin: viewAdmin
};

async function render({ quiet = false } = {}) {
  const view = $('#view');
  if (!VIEWS[state.tab]) state.tab = 'today';
  document.querySelectorAll('.tabbar button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.tab);
  });
  location.hash = state.tab;
  if (!quiet) view.innerHTML = '<p class="empty">Loading…</p>';
  try {
    view.innerHTML = await VIEWS[state.tab]();
    const now = new Date();
    $('#presence').textContent = `updated ${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  } catch (err) {
    view.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

function go(tab) {
  state.tab = tab;
  render();
}

// ── Today ─────────────────────────────────────────────────────────────────────
function batchLine(batch) {
  return `${esc(batch.product_name)} — ${batch.qty} ${esc(batch.unit)}`;
}

async function viewToday() {
  const data = await api('/today');
  const bakery = data.bakery;
  const parts = [];

  parts.push(`<h2 class="section">${esc(fmtDate(data.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</h2>`);

  if (bakery.expired.length) {
    parts.push(`<div class="card alert bad">
      <h3>Pull these now — past discard date</h3>
      <div class="list">${bakery.expired.map((b) => `<div class="line">
        <span class="grow">${batchLine(b)}</span>
        <span class="pill bad">${esc(dayCountLabel(b.days_left))}</span></div>`).join('')}</div>
      <button class="btn small" data-act="go" data-tab="bakery">Open Bakery</button></div>`);
  }
  if (bakery.thaw_ready.length) {
    parts.push(`<div class="card alert cold">
      <h3>Thawed and ready to case</h3>
      <div class="list">${bakery.thaw_ready.map((b) => `<div class="line">
        <span class="grow">${batchLine(b)}</span>
        <button class="btn small primary" data-act="move" data-id="${b.id}" data-to="floor">Onto floor</button>
        </div>`).join('')}</div></div>`);
  }
  if (bakery.expiring_soon.length) {
    parts.push(`<div class="card alert warn">
      <h3>Use up soon</h3>
      <div class="list">${bakery.expiring_soon.map((b) => `<div class="line">
        <span class="grow">${batchLine(b)}</span>
        <span class="pill warn">${esc(dayCountLabel(b.days_left))}</span></div>`).join('')}</div></div>`);
  }

  const counts = [
    ['On floor', bakery.on_floor],
    ['Thawing', bakery.thawing],
    ['Freezer', bakery.in_freezer],
    ['Unplaced', bakery.unplaced]
  ];
  parts.push(`<div class="stat-row">${counts.map(([label, list]) => `
    <div class="stat"><b>${list.reduce((sum, b) => sum + b.qty, 0)}</b><small>${esc(label)}</small></div>`).join('')}</div>`);

  parts.push('<h2 class="section">Shift checklists</h2>');
  parts.push('<div class="card">');
  for (const shift of ['opening', 'mid', 'closing']) {
    const stat = data.tasks[shift] || { done: 0, total: 0 };
    const pct = stat.total ? Math.round((stat.done / stat.total) * 100) : 0;
    parts.push(`<div style="margin-bottom:10px">
      <div class="row"><strong style="text-transform:capitalize">${shift}</strong>
        <span class="muted right">${stat.done}/${stat.total}</span></div>
      <div class="progress"><i style="width:${pct}%"></i></div></div>`);
  }
  parts.push(`<button class="btn small" data-act="go" data-tab="tasks">Open checklist</button></div>`);

  parts.push('<h2 class="section">On today</h2>');
  parts.push(data.shifts_today.length ? `<div class="card">${data.shifts_today.map((shift) => `
    <div class="shift-chip${shift.employee_id === state.me.id ? ' mine' : ''}">
      <span class="dot" style="background:${esc(shift.employee_color || '#999')}"></span>
      <span class="time">${fmtTime(shift.start_time)}–${fmtTime(shift.end_time)}</span>
      <span class="grow">${esc(shift.employee_name || 'Open')}${shift.position ? ` · ${esc(shift.position)}` : ''}</span>
      ${shift.location === 'trailer' ? `<span class="pill">🚚 ${esc(shift.trailer_event_title || 'Trailer')}</span>` : ''}
      ${shift.cover_status ? `<span class="pill warn">${esc(shift.cover_status)}</span>` : ''}
    </div>`).join('')}</div>` : '<div class="card muted">Nobody scheduled today.</div>');

  if (data.my_next_shift) {
    const shift = data.my_next_shift;
    parts.push(`<div class="card"><h3>Your next shift</h3>
      <p style="margin:0">${esc(fmtDate(shift.work_date))} · ${fmtTime(shift.start_time)}–${fmtTime(shift.end_time)}
      ${shift.location === 'trailer' ? ' · 🚚 trailer' : ''}</p></div>`);
  }

  if (data.cover_needed.length) {
    parts.push('<h2 class="section">Cover needed</h2>');
    parts.push(`<div class="card">${data.cover_needed.map((shift) => `<div class="line">
      <span class="grow">${esc(fmtDate(shift.work_date))} ${fmtTime(shift.start_time)}–${fmtTime(shift.end_time)}
        · ${esc(shift.employee_name || '')}</span>
      <span class="pill warn">${esc(shift.cover_status)}</span></div>`).join('')}
      <button class="btn small" data-act="go" data-tab="schedule">Open schedule</button></div>`);
  }

  const trailer = [...data.trailer.today, ...data.trailer.upcoming];
  parts.push('<h2 class="section">Trailer</h2>');
  parts.push(trailer.length ? `<div class="card">${trailer.map((event) => `<div class="line">
      <span class="grow"><strong>${esc(event.title)}</strong><br>
        <span class="muted">${esc(fmtDate(event.event_date))}${event.start_time ? ` · ${fmtTime(event.start_time)}` : ''}
        ${event.location ? ` · ${esc(event.location)}` : ''}</span></span>
      <span class="pill ${event.status === 'tentative' ? 'warn' : 'good'}">${esc(event.status)}</span>
    </div>`).join('')}</div>` : '<div class="card muted">No trailer bookings on the calendar.</div>');

  if (data.board.pinned.length) {
    parts.push('<h2 class="section">Pinned notes</h2>');
    parts.push(`<div class="card">${data.board.pinned.map((post) => `<div class="line">
      <span class="grow">${esc(post.body)}<br><span class="who">${esc(post.author_name || '')}</span></span>
      </div>`).join('')}</div>`);
  }
  if (data.board.unread) {
    parts.push(`<button class="btn full" data-act="go" data-tab="board">
      ${data.board.unread} unread board ${data.board.unread === 1 ? 'note' : 'notes'}</button>`);
  }

  return parts.join('');
}

// ── Bakery ────────────────────────────────────────────────────────────────────
const NEXT_MOVES = {
  delivered: [['frozen', 'Into freezer'], ['floor', 'Onto floor'], ['discarded', 'Discard']],
  frozen: [['thawing', 'Pull to thaw'], ['floor', 'Straight to floor'], ['discarded', 'Discard']],
  thawing: [['floor', 'Onto floor'], ['frozen', 'Back to freezer'], ['discarded', 'Discard']],
  floor: [['sold_out', 'Sold out'], ['discarded', 'Discard']]
};

const BAKERY_TABS = [
  ['floor', 'In the case'],
  ['thawing', 'Thawing'],
  ['frozen', 'Freezer'],
  ['delivered', 'Just delivered'],
  ['all', 'Everything open'],
  ['history', 'Log']
];

function batchCard(batch) {
  const dates = [];
  if (batch.delivered_on) dates.push(`delivered ${fmtDate(batch.delivered_on, { month: 'short', day: 'numeric' })}`);
  if (batch.frozen_on) dates.push(`frozen ${fmtDate(batch.frozen_on, { month: 'short', day: 'numeric' })}`);
  if (batch.thaw_ready_at) dates.push(`thaw done ${fmtStamp(batch.thaw_ready_at)}`);
  if (batch.floor_on) dates.push(`on floor ${fmtDate(batch.floor_on, { month: 'short', day: 'numeric' })}`);

  const expiryClass = batch.expired ? 'bad' : batch.expiring_soon ? 'warn' : '';
  const moves = NEXT_MOVES[batch.state] || [];

  return `<div class="card${expiryClass ? ` alert ${expiryClass}` : ''}">
    <div class="row">
      <h3 class="grow">${esc(batch.product_name)}</h3>
      <span class="pill ${esc(batch.state)}">${esc(batch.state.replace('_', ' '))}</span>
    </div>
    <div class="row" style="margin-bottom:6px">
      <strong>${batch.qty} ${esc(batch.unit)}</strong>
      ${batch.discard_by ? `<span class="pill ${expiryClass || 'good'}">discard by
        ${esc(fmtDate(batch.discard_by, { month: 'short', day: 'numeric' }))} · ${esc(dayCountLabel(batch.days_left))}</span>` : ''}
      ${batch.thaw_ready ? '<span class="pill good">thawed</span>' : ''}
      ${batch.location === 'trailer' ? '<span class="pill">🚚 trailer</span>' : ''}
    </div>
    <p class="muted" style="margin:0 0 8px;font-size:13px">
      ${esc(dates.join(' · '))}${batch.lot_code ? ` · lot ${esc(batch.lot_code)}` : ''}</p>
    <div class="row">
      ${moves.map(([to, label]) => `<button class="btn small${to === 'discarded' ? ' danger' : ''}"
        data-act="move" data-id="${batch.id}" data-to="${to}" data-qty="${batch.qty}"
        data-name="${esc(batch.product_name)}" data-unit="${esc(batch.unit)}">${esc(label)}</button>`).join('')}
      <button class="btn small ghost" data-act="batch-detail" data-id="${batch.id}">History</button>
      <button class="btn small ghost" data-act="recount" data-id="${batch.id}" data-qty="${batch.qty}">Recount</button>
    </div>
  </div>`;
}

async function viewBakery() {
  const tabs = `<div class="tabs">${BAKERY_TABS.map(([key, label]) => `
    <button data-act="bakery-tab" data-key="${key}" class="${state.bakeryTab === key ? 'active' : ''}">${esc(label)}</button>`).join('')}</div>`;

  const header = `<div class="row" style="margin-bottom:10px">
    <button class="btn primary" data-act="log-delivery">+ Log a delivery</button>
    ${isManager() ? '<button class="btn" data-act="go" data-tab="admin" data-admin-tab="products">Bakery menu</button>' : ''}</div>`;

  if (state.bakeryTab === 'history') {
    const events = await api('/bakery/history?limit=150');
    return `${header}${tabs}<div class="card"><ul class="timeline">${events.map((event) => `
      <li><div><strong>${esc(event.product_name)}</strong> — ${esc(event.label)}
        ${event.qty ? ` · ${event.qty} ${esc(event.unit)}` : ''}
        <div class="when">${esc(fmtStamp(event.at))}${event.employee_name ? ` · ${esc(event.employee_name)}` : ''}
        ${event.note ? ` · ${esc(event.note)}` : ''}</div></div></li>`).join('') || '<li class="muted">Nothing logged yet.</li>'}
      </ul></div>`;
  }

  const query = state.bakeryTab === 'all' ? '' : `?state=${state.bakeryTab}`;
  const batches = await api(`/bakery/batches${query}`);
  const body = batches.length
    ? batches.map(batchCard).join('')
    : `<p class="empty">Nothing here yet. Log a delivery to get started.</p>`;
  return `${header}${tabs}${body}`;
}

async function logDelivery() {
  state.products = await api('/bakery/products');
  if (!state.products.length) {
    return toast('Add a product in the bakery menu first', true);
  }
  formModal({
    title: 'Log a delivery',
    fields: [
      { name: 'product_id', label: 'Item', type: 'select',
        options: state.products.map((p) => ({ value: p.id, label: `${p.name} (${p.unit})` })) },
      { name: 'qty', label: 'How many', type: 'number', step: 'any', min: 0, placeholder: 'e.g. 24' },
      { name: 'destination', label: 'Where is it going', type: 'select', value: 'freezer',
        options: [
          { value: 'freezer', label: 'Straight into the freezer' },
          { value: 'floor', label: 'Straight onto the floor' },
          { value: 'back', label: 'Holding in back — decide later' }
        ] },
      { name: 'delivered_on', label: 'Delivery date', type: 'date', value: state.taskDate },
      { name: 'location', label: 'For', type: 'select', value: 'shop',
        options: [{ value: 'shop', label: 'The shop' }, { value: 'trailer', label: 'The trailer' }] },
      { name: 'lot_code', label: 'Lot / invoice code (optional)', maxlength: 40 },
      { name: 'supplier', label: 'Supplier (optional)', maxlength: 80 },
      { name: 'notes', label: 'Notes (optional)', type: 'textarea' }
    ],
    submit: 'Log delivery',
    onSubmit: async (values) => {
      await api('/bakery/deliveries', { method: 'POST', body: values });
      toast('Delivery logged');
      render();
    }
  });
}

function moveBatch({ id, to, qty, name, unit }) {
  const labels = {
    frozen: 'Into the freezer', floor: 'Onto the floor', thawing: 'Pull to thaw',
    sold_out: 'Mark sold out', discarded: 'Discard'
  };
  formModal({
    title: `${labels[to] || to} — ${name || ''}`,
    fields: [
      { name: 'qty', label: `How many ${unit || ''}`.trim(), type: 'number', step: 'any', min: 0, value: qty,
        hint: 'Less than the full batch splits it, so the rest keeps its own dates.' },
      { name: 'note', label: 'Note (optional)', type: 'textarea',
        placeholder: to === 'discarded' ? 'Reason for waste' : '' }
    ],
    submit: 'Confirm',
    onSubmit: async (values) => {
      await api(`/bakery/batches/${id}/move`, { method: 'POST', body: { to, ...values } });
      toast('Logged');
      render();
    }
  });
}

async function batchDetail(id) {
  const { batch, events } = await api(`/bakery/batches/${id}`);
  openModal(`${batch.product_name} — batch #${batch.id}`, `
    <p class="muted" style="margin-top:0">${batch.qty} ${esc(batch.unit)} ·
      ${esc(batch.state.replace('_', ' '))}${batch.discard_by ? ` · discard by ${esc(batch.discard_by)}` : ''}
      ${batch.lot_code ? ` · lot ${esc(batch.lot_code)}` : ''}
      ${batch.created_by_name ? ` · received by ${esc(batch.created_by_name)}` : ''}</p>
    <ul class="timeline">${events.map((event) => `<li><div>
      <strong>${esc(event.label)}</strong>${event.qty ? ` · ${event.qty} ${esc(batch.unit)}` : ''}
      <div class="when">${esc(fmtStamp(event.at))}${event.employee_name ? ` · ${esc(event.employee_name)}` : ''}</div>
      ${event.note ? `<div class="muted">${esc(event.note)}</div>` : ''}</div></li>`).join('')}</ul>
    <form class="stack" id="note-form" style="margin-top:12px">
      <textarea name="note" placeholder="Add a note to this batch"></textarea>
      <button class="btn full" type="submit">Add note</button>
    </form>`, (modal) => {
    modal.querySelector('#note-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const note = modal.querySelector('[name="note"]').value.trim();
      if (!note) return;
      try {
        await api(`/bakery/batches/${id}/note`, { method: 'POST', body: { note } });
        closeModal();
        toast('Note added');
      } catch (err) { toast(err.message, true); }
    });
  });
}

function recountBatch({ id, qty }) {
  formModal({
    title: 'Recount batch',
    fields: [
      { name: 'qty', label: 'Actual count', type: 'number', step: 'any', min: 0, value: qty },
      { name: 'note', label: 'Why', type: 'textarea', placeholder: 'Miscount at delivery, comped, dropped…' }
    ],
    submit: 'Save count',
    onSubmit: async (values) => {
      await api(`/bakery/batches/${id}/adjust`, { method: 'POST', body: values });
      toast('Count updated');
      render();
    }
  });
}

// ── Shift checklists ──────────────────────────────────────────────────────────
async function viewTasks() {
  const data = await api(`/tasks?date=${state.taskDate}`);
  const shift = data.shifts[state.taskShift] || { tasks: [], done: 0, total: 0 };
  const pct = shift.total ? Math.round((shift.done / shift.total) * 100) : 0;

  const tabs = `<div class="tabs">${['opening', 'mid', 'closing'].map((key) => {
    const bucket = data.shifts[key] || { done: 0, total: 0 };
    return `<button data-act="task-shift" data-key="${key}" class="${state.taskShift === key ? 'active' : ''}">
      ${key[0].toUpperCase()}${key.slice(1)} ${bucket.done}/${bucket.total}</button>`;
  }).join('')}</div>`;

  const dateRow = `<div class="row" style="margin-bottom:10px">
    <button class="btn small" data-act="task-day" data-delta="-1">‹</button>
    <input class="input grow" type="date" value="${esc(state.taskDate)}" data-act="task-date" style="max-width:190px">
    <button class="btn small" data-act="task-day" data-delta="1">›</button>
    ${isManager() ? '<button class="btn small right" data-act="edit-tasks">Edit list</button>' : ''}</div>`;

  const list = shift.tasks.map((task) => `
    <div class="task${task.done ? ' done' : ''}" data-act="toggle-task" data-id="${task.id}">
      <div class="box">${task.done ? '✓' : ''}</div>
      <div class="grow">
        <div class="title">${esc(task.title)}</div>
        ${task.done
          ? `<div class="meta">${esc(task.employee_name || 'done')} · ${esc(fmtStamp(task.completed_at))}</div>`
          : task.area ? `<div class="meta">${esc(task.area)}</div>` : ''}
      </div>
    </div>`).join('');

  return `${dateRow}${tabs}
    <div class="card"><div class="row"><strong>${shift.done} of ${shift.total} done</strong>
      <span class="muted right">${pct}%</span></div>
      <div class="progress"><i style="width:${pct}%"></i></div></div>
    <div class="stack">${list || '<p class="empty">No tasks on this list yet.</p>'}</div>`;
}

async function editTaskTemplates() {
  const templates = await api('/tasks/templates');
  openModal('Shift task lists', `
    <div class="stack" id="template-list">
      ${['opening', 'mid', 'closing'].map((shift) => `
        <h2 class="section" style="margin:6px 0 0">${shift}</h2>
        ${templates.filter((t) => t.shift === shift).map((t) => `
          <div class="line">
            <span class="grow${t.active ? '' : ' muted'}">${esc(t.title)}${t.active ? '' : ' (retired)'}</span>
            <button class="btn small ghost" data-act="edit-template" data-id="${t.id}">Edit</button>
            ${t.active ? `<button class="btn small danger" data-act="retire-template" data-id="${t.id}">Retire</button>` : ''}
          </div>`).join('') || '<p class="muted">Nothing yet.</p>'}
        <button class="btn small" data-act="new-template" data-shift="${shift}">+ Add ${shift} task</button>`).join('')}
    </div>`);
}

function templateForm(template, shift) {
  formModal({
    title: template ? 'Edit task' : 'New task',
    fields: [
      { name: 'title', label: 'Task', value: template?.title, maxlength: 200 },
      { name: 'shift', label: 'Shift', type: 'select', value: template?.shift || shift,
        options: [
          { value: 'opening', label: 'Opening' },
          { value: 'mid', label: 'Mid-day' },
          { value: 'closing', label: 'Closing' }
        ] },
      { name: 'area', label: 'Area (bar, bakery, front…)', value: template?.area, maxlength: 40 },
      { name: 'active', label: 'Active', type: 'checkbox', value: template ? !!template.active : true }
    ],
    onSubmit: async (values) => {
      await api('/tasks/templates', { method: 'POST', body: { ...values, id: template?.id } });
      toast('Saved');
      editTaskTemplates();
    }
  });
}

// ── Schedule ──────────────────────────────────────────────────────────────────
async function viewSchedule() {
  const [data, meResponse] = await Promise.all([
    api(`/schedule?start=${state.weekStart}&days=7`),
    api('/me')
  ]);
  const todayIso = meResponse.clock.date;

  const nav = `<div class="row" style="margin-bottom:10px">
    <button class="btn small" data-act="week" data-delta="-7">‹</button>
    <strong class="grow" style="text-align:center">Week of ${esc(fmtDate(state.weekStart))}</strong>
    <button class="btn small" data-act="week" data-delta="7">›</button></div>
    <div class="row" style="margin-bottom:10px">
      <button class="btn small ghost" data-act="week-today">This week</button>
      ${isManager() ? `<button class="btn small primary" data-act="new-shift">+ Shift</button>
        <button class="btn small" data-act="copy-week">Copy this week →</button>` : ''}
    </div>`;

  const days = Object.entries(data.by_date).map(([date, shifts]) => `
    <div class="day${date === todayIso ? ' today' : ''}">
      <h4>${esc(fmtDate(date))} ${date === todayIso ? '<span class="pill good">today</span>' : ''}
        <span class="muted right" style="font-weight:400">${shifts.length || ''}</span></h4>
      ${shifts.map((shift) => shiftChip(shift)).join('') || '<p class="muted" style="margin:0">No one on.</p>'}
    </div>`).join('');

  return `${nav}${days}`;
}

function shiftChip(shift) {
  const mine = shift.employee_id === state.me.id;
  const actions = [];
  if (mine && !shift.cover_status) {
    actions.push(`<button class="btn small ghost" data-act="cover-request" data-id="${shift.id}">Need cover</button>`);
  }
  if (!mine && shift.cover_status === 'requested') {
    actions.push(`<button class="btn small primary" data-act="cover-claim" data-id="${shift.id}">I'll take it</button>`);
  }
  if (shift.cover_status === 'claimed' && isManager()) {
    actions.push(`<button class="btn small primary" data-act="cover-approve" data-id="${shift.id}">Approve</button>`);
  }
  if (shift.cover_status && (mine || isManager() || shift.cover_claimed_by === state.me.id)) {
    actions.push(`<button class="btn small ghost" data-act="cover-cancel" data-id="${shift.id}">Cancel</button>`);
  }
  if (isManager()) {
    actions.push(`<button class="btn small ghost" data-act="edit-shift" data-id="${shift.id}">Edit</button>`);
    actions.push(`<button class="btn small danger" data-act="delete-shift" data-id="${shift.id}">✕</button>`);
  }

  return `<div class="shift-chip${mine ? ' mine' : ''}">
    <span class="dot" style="background:${esc(shift.employee_color || '#999')}"></span>
    <span class="time">${fmtTime(shift.start_time)}–${fmtTime(shift.end_time)}</span>
    <span class="grow">${esc(shift.employee_name || 'Open')}${shift.position ? ` · ${esc(shift.position)}` : ''}
      ${shift.location === 'trailer' ? `<span class="pill">🚚 ${esc(shift.trailer_event_title || 'Trailer')}</span>` : ''}
      ${shift.cover_status === 'requested' ? '<span class="pill warn">needs cover</span>' : ''}
      ${shift.cover_status === 'claimed' ? `<span class="pill warn">${esc(shift.cover_claimed_by_name || '')} offered</span>` : ''}
      ${shift.cover_note ? `<br><span class="who">${esc(shift.cover_note)}</span>` : ''}
      ${shift.notes ? `<br><span class="who">${esc(shift.notes)}</span>` : ''}</span>
    ${actions.join('')}</div>`;
}

async function shiftForm(shiftId) {
  const [staff, trailerData] = await Promise.all([api('/admin/staff'), api('/trailer')]);
  state.staff = staff.filter((person) => person.active);
  let shift = null;
  if (shiftId) {
    const week = await api(`/schedule?start=${state.weekStart}&days=7`);
    shift = week.shifts.find((row) => row.id === Number(shiftId));
  }

  formModal({
    title: shift ? 'Edit shift' : 'New shift',
    fields: [
      { name: 'employee_id', label: 'Who', type: 'select', value: shift?.employee_id,
        options: state.staff.map((person) => ({ value: person.id, label: person.name })) },
      { name: 'work_date', label: 'Date', type: 'date', value: shift?.work_date || state.weekStart },
      { name: 'start_time', label: 'Starts', type: 'time', value: shift?.start_time || '06:30' },
      { name: 'end_time', label: 'Ends', type: 'time', value: shift?.end_time || '14:00' },
      { name: 'position', label: 'Position (bar, register, baker…)', value: shift?.position, maxlength: 40 },
      { name: 'location', label: 'Where', type: 'select', value: shift?.location || 'shop',
        options: [{ value: 'shop', label: 'Shop' }, { value: 'trailer', label: 'Trailer' }] },
      { name: 'trailer_event_id', label: 'Trailer event (optional)', type: 'select',
        value: shift?.trailer_event_id || '',
        options: [{ value: '', label: '—' }, ...trailerData.events.map((event) => ({
          value: event.id, label: `${event.event_date} · ${event.title}`
        }))] },
      { name: 'notes', label: 'Notes', value: shift?.notes, maxlength: 300 }
    ],
    onSubmit: async (values) => {
      await api('/schedule', { method: 'POST', body: { ...values, id: shift?.id } });
      toast('Schedule updated');
      render();
    }
  });
}

function copyWeekForm() {
  formModal({
    title: 'Copy this week forward',
    fields: [
      { name: 'to', label: 'Copy into the week of', type: 'date', value: addDays(state.weekStart, 7),
        hint: 'Existing shifts at the same time are left alone.' }
    ],
    submit: 'Copy shifts',
    onSubmit: async (values) => {
      const result = await api('/schedule/copy-week', {
        method: 'POST', body: { from: state.weekStart, to: values.to }
      });
      toast(`${result.created} shifts copied`);
      state.weekStart = mondayOf(values.to);
      render();
    }
  });
}

// ── Trailer ───────────────────────────────────────────────────────────────────
async function viewTrailer() {
  const data = await api(`/trailer?from=${addDays(state.taskDate, -14)}`);
  const header = isManager()
    ? '<div class="row" style="margin-bottom:10px"><button class="btn primary" data-act="new-event">+ Book the trailer</button></div>'
    : '';

  if (!data.events.length) {
    return `${header}<p class="empty">No trailer bookings on the calendar yet.</p>`;
  }

  let lastMonth = '';
  const cards = data.events.map((event) => {
    const month = fmtDate(event.event_date, { month: 'long', year: 'numeric' });
    const heading = month === lastMonth ? '' : `<h2 class="section">${esc(month)}</h2>`;
    lastMonth = month;
    const mine = event.crew.some((member) => member.employee_id === state.me.id);

    return `${heading}<div class="card${mine ? ' alert good' : ''}">
      <div class="row"><h3 class="grow">${esc(event.title)}</h3>
        <span class="pill ${event.status === 'confirmed' ? 'good' : event.status === 'tentative' ? 'warn' : 'bad'}">${esc(event.status)}</span></div>
      <p style="margin:0 0 6px"><strong>${esc(fmtDate(event.event_date))}</strong>
        ${event.start_time ? ` · ${fmtTime(event.start_time)}${event.end_time ? `–${fmtTime(event.end_time)}` : ''}` : ''}</p>
      ${event.location ? `<p class="muted" style="margin:0 0 6px">📍 ${esc(event.location)}${event.address ? ` — ${esc(event.address)}` : ''}</p>` : ''}
      ${event.contact ? `<p class="muted" style="margin:0 0 6px">☎ ${esc(event.contact)}</p>` : ''}
      ${event.menu ? `<p style="margin:0 0 6px"><strong>Menu:</strong> ${esc(event.menu)}</p>` : ''}
      ${event.notes ? `<p class="muted" style="margin:0 0 6px">${esc(event.notes)}</p>` : ''}
      <div class="row" style="margin:8px 0">
        <span class="muted" style="font-size:13px">Crew:</span>
        ${event.crew.map((member) => `<span class="pill" style="background:${esc(member.color)};color:#fff;border:none">
          ${esc(member.name)} ${fmtTime(member.start_time)}–${fmtTime(member.end_time)}
          ${isManager() ? `<button class="btn small ghost" style="padding:0 4px;min-height:auto"
            data-act="remove-crew" data-id="${event.id}" data-shift="${member.shift_id}">✕</button>` : ''}</span>`).join('')
          || '<span class="muted" style="font-size:13px">nobody assigned</span>'}
      </div>
      ${isManager() ? `<div class="row">
        <button class="btn small" data-act="add-crew" data-id="${event.id}">+ Crew</button>
        <button class="btn small ghost" data-act="edit-event" data-id="${event.id}">Edit</button>
        <button class="btn small danger" data-act="delete-event" data-id="${event.id}">Delete</button></div>` : ''}
    </div>`;
  }).join('');

  return `${header}${cards}`;
}

async function eventForm(eventId) {
  const event = eventId ? await api(`/trailer/${eventId}`) : null;
  formModal({
    title: event ? 'Edit booking' : 'Book the trailer',
    fields: [
      { name: 'title', label: 'Event', value: event?.title, maxlength: 120 },
      { name: 'event_date', label: 'Date', type: 'date', value: event?.event_date || state.taskDate },
      { name: 'start_time', label: 'Starts', type: 'time', value: event?.start_time || '' },
      { name: 'end_time', label: 'Ends', type: 'time', value: event?.end_time || '' },
      { name: 'location', label: 'Location', value: event?.location, maxlength: 120 },
      { name: 'address', label: 'Address', value: event?.address, maxlength: 200 },
      { name: 'contact', label: 'Contact', value: event?.contact, maxlength: 120 },
      { name: 'status', label: 'Status', type: 'select', value: event?.status || 'confirmed',
        options: [
          { value: 'confirmed', label: 'Confirmed' },
          { value: 'tentative', label: 'Tentative' },
          { value: 'cancelled', label: 'Cancelled' }
        ] },
      { name: 'menu', label: 'Menu / what we bring', type: 'textarea', value: event?.menu },
      { name: 'notes', label: 'Notes', type: 'textarea', value: event?.notes }
    ],
    onSubmit: async (values) => {
      await api('/trailer', { method: 'POST', body: { ...values, id: event?.id } });
      toast('Saved');
      render();
    }
  });
}

async function crewForm(eventId) {
  const [staff, event] = await Promise.all([api('/admin/staff'), api(`/trailer/${eventId}`)]);
  const assigned = new Set(event.crew.map((member) => member.employee_id));
  const available = staff.filter((person) => person.active && !assigned.has(person.id));
  if (!available.length) return toast('Everyone active is already on it', true);

  formModal({
    title: `Crew for ${event.title}`,
    fields: [
      { name: 'employee_id', label: 'Who', type: 'select',
        options: available.map((person) => ({ value: person.id, label: person.name })) },
      { name: 'start_time', label: 'Starts', type: 'time', value: event.start_time || '08:00' },
      { name: 'end_time', label: 'Ends', type: 'time', value: event.end_time || '16:00' },
      { name: 'position', label: 'Position', value: 'Trailer', maxlength: 40 }
    ],
    submit: 'Assign',
    onSubmit: async (values) => {
      await api(`/trailer/${eventId}/crew`, { method: 'POST', body: values });
      toast('Added to the crew — it shows on the schedule too');
      render();
    }
  });
}

// ── Board ─────────────────────────────────────────────────────────────────────
async function viewBoard() {
  const data = await api('/board');
  const composer = `<div class="card">
    <form id="post-form" class="stack">
      <textarea name="body" placeholder="Note for the team — what the next shift needs to know"></textarea>
      <div class="row">
        ${isManager() ? '<label class="row"><input type="checkbox" name="pinned"><span>Pin it</span></label>' : ''}
        <button class="btn primary right" type="submit">Post</button>
      </div>
    </form></div>`;

  const posts = data.posts.map((post) => `
    <div class="card${post.pinned ? ' alert warn' : ''}">
      <div class="row">
        <span class="dot" style="background:${esc(post.author_color || '#999')}"></span>
        <strong>${esc(post.author_name || 'Someone')}</strong>
        <span class="who">${esc(fmtStamp(post.created_at))}</span>
        ${post.pinned ? '<span class="pill warn">pinned</span>' : ''}
      </div>
      <p style="white-space:pre-wrap;margin:8px 0">${esc(post.body)}</p>
      <div class="row">
        <button class="btn small ghost" data-act="readers" data-id="${post.id}">
          seen by ${post.read_count}/${data.staff_count}</button>
        ${post.read_by_me ? '<span class="pill good">you read this</span>'
          : `<button class="btn small primary" data-act="mark-read" data-id="${post.id}">Got it</button>`}
        ${isManager() ? `<button class="btn small ghost" data-act="pin-post" data-id="${post.id}">
          ${post.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
        ${(isManager() || post.author_id === state.me.id)
          ? `<button class="btn small danger" data-act="delete-post" data-id="${post.id}">Delete</button>` : ''}
      </div>
    </div>`).join('');

  window.__boardReaders = Object.fromEntries(data.posts.map((post) => [post.id, post.readers]));
  return `${composer}${posts || '<p class="empty">Nothing posted yet.</p>'}`;
}

// ── Admin ─────────────────────────────────────────────────────────────────────
const ADMIN_TABS = [
  ['staff', 'Team'],
  ['products', 'Bakery menu'],
  ['tasks', 'Task lists'],
  ['settings', 'Shop'],
  ['activity', 'Everything log']
];

async function viewAdmin() {
  const tabs = `<div class="tabs">${ADMIN_TABS.map(([key, label]) => `
    <button data-act="admin-tab" data-key="${key}" class="${state.adminTab === key ? 'active' : ''}">${esc(label)}</button>`).join('')}</div>`;

  if (state.adminTab === 'staff') {
    const staff = await api('/admin/staff');
    return `${tabs}
      ${isManager() ? '<button class="btn primary" data-act="new-staff" style="margin-bottom:10px">+ Add someone</button>' : ''}
      ${staff.map((person) => `<div class="card">
        <div class="row">
          <span class="chip-initials" style="background:${esc(person.color)};width:32px;height:32px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:12px">${esc(initials(person.name))}</span>
          <strong class="grow">${esc(person.name)}${person.active ? '' : ' <span class="muted">(inactive)</span>'}</strong>
          <span class="pill${person.role === 'manager' ? ' good' : ''}">${esc(person.role)}</span>
          ${person.push_enabled ? '<span class="pill">🔔</span>' : ''}
        </div>
        ${person.phone ? `<p class="muted" style="margin:6px 0 0">${esc(person.phone)}</p>` : ''}
        ${isManager() ? `<div class="row" style="margin-top:8px">
          <button class="btn small ghost" data-act="edit-staff" data-id="${person.id}">Edit / reset PIN</button>
          ${person.active ? `<button class="btn small danger" data-act="deactivate-staff" data-id="${person.id}">Deactivate</button>` : ''}
        </div>` : ''}
      </div>`).join('')}`;
  }

  if (state.adminTab === 'products') {
    const products = await api('/bakery/products?all=1');
    return `${tabs}
      ${isManager() ? '<button class="btn primary" data-act="new-product" style="margin-bottom:10px">+ Add an item</button>' : ''}
      ${products.map((product) => `<div class="card">
        <div class="row"><strong class="grow">${esc(product.name)}${product.active ? '' : ' <span class="muted">(off menu)</span>'}</strong>
          <span class="pill">${esc(product.category)}</span></div>
        <p class="muted" style="margin:6px 0 0;font-size:13px">
          fresh ${product.fresh_life_days}d · freezer ${product.frozen_life_days}d ·
          thaw ${product.thaw_hours}h · floor ${product.floor_life_days}d
          ${product.par_level ? ` · par ${product.par_level}` : ''}
          ${product.supplier ? ` · ${esc(product.supplier)}` : ''}</p>
        ${isManager() ? `<button class="btn small ghost" data-act="edit-product" data-id="${product.id}" style="margin-top:8px">Edit</button>` : ''}
      </div>`).join('')}`;
  }

  if (state.adminTab === 'tasks') {
    if (!isManager()) return `${tabs}<p class="empty">Managers only.</p>`;
    const templates = await api('/tasks/templates');
    return `${tabs}${['opening', 'mid', 'closing'].map((shift) => `
      <h2 class="section">${shift}</h2>
      <div class="card">${templates.filter((t) => t.shift === shift).map((t) => `
        <div class="line"><span class="grow${t.active ? '' : ' muted'}">${esc(t.title)}
          ${t.area ? `<span class="who"> · ${esc(t.area)}</span>` : ''}${t.active ? '' : ' (retired)'}</span>
          <button class="btn small ghost" data-act="edit-template" data-id="${t.id}">Edit</button>
          ${t.active ? `<button class="btn small danger" data-act="retire-template" data-id="${t.id}">Retire</button>` : ''}
        </div>`).join('') || '<p class="muted" style="margin:0">Nothing yet.</p>'}
        <button class="btn small" data-act="new-template" data-shift="${shift}" style="margin-top:8px">+ Add task</button>
      </div>`).join('')}`;
  }

  if (state.adminTab === 'settings') {
    const settings = await api('/admin/settings');
    return `${tabs}<div class="card">
      <p class="muted" style="margin-top:0">Shop name, timezone (used for every date in the app), and how many days
        ahead to warn about discard dates.</p>
      <div class="list">
        <div class="line"><span class="grow">Shop name</span><strong>${esc(settings.shop_name)}</strong></div>
        <div class="line"><span class="grow">Timezone</span><strong>${esc(settings.timezone)}</strong></div>
        <div class="line"><span class="grow">Warn me</span><strong>${settings.expiry_warn_days} days ahead</strong></div>
      </div>
      ${isManager() ? '<button class="btn small" data-act="edit-settings" style="margin-top:8px">Edit</button>' : ''}
    </div>`;
  }

  const activity = await api('/admin/activity?limit=200');
  return `${tabs}<div class="card"><ul class="timeline">${activity.map((row) => `
    <li><div><strong>${esc(row.employee_name || 'system')}</strong> ${esc(row.action.replace(/_/g, ' '))}
      ${esc(row.entity.replace(/_/g, ' '))}${row.detail ? ` — ${esc(row.detail)}` : ''}
      <div class="when">${esc(fmtStamp(row.at))}</div></div></li>`).join('')}</ul></div>`;
}

function staffForm(person) {
  formModal({
    title: person ? `Edit ${person.name}` : 'Add someone',
    fields: [
      { name: 'name', label: 'Name', value: person?.name, maxlength: 60 },
      { name: 'role', label: 'Role', type: 'select', value: person?.role || 'staff',
        options: [{ value: 'staff', label: 'Staff' }, { value: 'manager', label: 'Manager' }] },
      { name: 'phone', label: 'Phone (managers only see this)', value: person?.phone, maxlength: 40 },
      { name: 'color', label: 'Colour on the schedule', type: 'text', value: person?.color || '#c08457' },
      { name: 'pin', label: person ? 'New PIN (leave blank to keep)' : 'Starting PIN', type: 'password',
        inputmode: 'numeric', maxlength: 8, hint: '4–8 digits. They can change it themselves later.' },
      { name: 'active', label: 'Active', type: 'checkbox', value: person ? !!person.active : true }
    ],
    onSubmit: async (values) => {
      const body = { ...values, id: person?.id };
      if (!body.pin) delete body.pin;
      await api('/admin/staff', { method: 'POST', body });
      toast('Saved');
      render();
    }
  });
}

function productForm(product) {
  formModal({
    title: product ? `Edit ${product.name}` : 'Add a bakery item',
    fields: [
      { name: 'name', label: 'Name', value: product?.name, maxlength: 80 },
      { name: 'category', label: 'Category', type: 'select', value: product?.category || 'pastry',
        options: ['pastry', 'bread', 'cookie', 'savory', 'other'] },
      { name: 'unit', label: 'Counted in', value: product?.unit || 'each', maxlength: 20 },
      { name: 'supplier', label: 'Supplier', value: product?.supplier, maxlength: 80 },
      { name: 'fresh_life_days', label: 'Days good if delivered fresh', type: 'number',
        value: product?.fresh_life_days ?? 2 },
      { name: 'frozen_life_days', label: 'Days good in the freezer', type: 'number',
        value: product?.frozen_life_days ?? 60 },
      { name: 'thaw_hours', label: 'Hours to thaw', type: 'number', value: product?.thaw_hours ?? 12 },
      { name: 'floor_life_days', label: 'Days good on the floor (0 = same day)', type: 'number',
        value: product?.floor_life_days ?? 1 },
      { name: 'par_level', label: 'Par level in the case (optional)', type: 'number', value: product?.par_level ?? '' },
      { name: 'notes', label: 'Notes', type: 'textarea', value: product?.notes },
      { name: 'active', label: 'On the menu', type: 'checkbox', value: product ? !!product.active : true }
    ],
    onSubmit: async (values) => {
      await api('/bakery/products', { method: 'POST', body: { ...values, id: product?.id } });
      toast('Saved');
      render();
    }
  });
}

async function settingsForm() {
  const settings = await api('/admin/settings');
  formModal({
    title: 'Shop settings',
    fields: [
      { name: 'shop_name', label: 'Shop name', value: settings.shop_name, maxlength: 80 },
      { name: 'timezone', label: 'Timezone', value: settings.timezone,
        hint: 'IANA name, e.g. America/Chicago' },
      { name: 'expiry_warn_days', label: 'Warn this many days before discard date', type: 'number',
        value: settings.expiry_warn_days }
    ],
    onSubmit: async (values) => {
      await api('/admin/settings', { method: 'POST', body: values });
      toast('Saved');
      boot();
    }
  });
}

// ── Account menu ──────────────────────────────────────────────────────────────
async function accountMenu() {
  const me = await api('/me');
  openModal(state.me.name, `
    <p class="muted" style="margin-top:0">${esc(state.me.role)} · ${esc(me.shop.name)} · ${esc(me.shop.timezone)}</p>
    <div class="stack">
      <button class="btn full" data-act="notifications">
        ${me.push_enabled ? '🔔 Notifications on — turn off' : '🔔 Turn on notifications'}</button>
      <button class="btn full" data-act="change-pin">Change my PIN</button>
      <button class="btn full" data-act="go" data-tab="admin" data-close="1">
        ${isManager() ? 'Manage shop' : 'Team, menu & logs'}</button>
      <button class="btn full danger" data-act="sign-out">Sign out</button>
    </div>`);
}

function changePinForm() {
  formModal({
    title: 'Change my PIN',
    fields: [
      { name: 'current_pin', label: 'Current PIN', type: 'password', inputmode: 'numeric', maxlength: 8 },
      { name: 'new_pin', label: 'New PIN', type: 'password', inputmode: 'numeric', maxlength: 8 }
    ],
    onSubmit: async (values) => {
      await api('/me/pin', { method: 'POST', body: values });
      toast('PIN changed');
    }
  });
}

// ── Web push ──────────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function toggleNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return toast('This device does not support notifications', true);
  }
  const registration = await navigator.serviceWorker.register('/sw.js');
  const existing = await registration.pushManager.getSubscription();

  if (existing) {
    await existing.unsubscribe();
    await api('/push/unsubscribe', { method: 'POST' });
    return toast('Notifications off');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return toast('Notifications blocked in your browser', true);

  const { key } = await api('/push/key');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  });
  await api('/push/subscribe', { method: 'POST', body: subscription.toJSON() });
  toast('Notifications on');
}

// ── Action wiring ─────────────────────────────────────────────────────────────
const ACTIONS = {
  go: ({ tab, adminTab }) => {
    closeModal();
    if (adminTab) state.adminTab = adminTab;
    go(tab);
  },

  'bakery-tab': ({ key }) => { state.bakeryTab = key; render(); },
  'log-delivery': () => logDelivery(),
  move: (data) => moveBatch({
    id: data.id, to: data.to, qty: data.qty, name: data.name, unit: data.unit
  }),
  'batch-detail': ({ id }) => batchDetail(id),
  recount: (data) => recountBatch(data),

  'task-shift': ({ key }) => { state.taskShift = key; render(); },
  'task-day': ({ delta }) => { state.taskDate = addDays(state.taskDate, Number(delta)); render(); },
  'toggle-task': async ({ id }) => {
    try {
      await api(`/tasks/${id}/toggle`, { method: 'POST', body: { business_date: state.taskDate } });
      render({ quiet: true });
    } catch (err) { toast(err.message, true); }
  },
  'edit-tasks': () => editTaskTemplates(),
  'new-template': ({ shift }) => templateForm(null, shift),
  'edit-template': async ({ id }) => {
    const templates = await api('/tasks/templates');
    templateForm(templates.find((row) => row.id === Number(id)));
  },
  'retire-template': async ({ id }) => {
    if (!confirm('Retire this task? Old checklists keep it.')) return;
    await api(`/tasks/templates/${id}`, { method: 'DELETE' });
    toast('Retired');
    closeModal();
    render();
  },

  week: ({ delta }) => { state.weekStart = addDays(state.weekStart, Number(delta)); render(); },
  'week-today': () => { state.weekStart = mondayOf(state.taskDate); render(); },
  'new-shift': () => shiftForm(null),
  'edit-shift': ({ id }) => shiftForm(id),
  'delete-shift': async ({ id }) => {
    if (!confirm('Delete this shift?')) return;
    await api(`/schedule/${id}`, { method: 'DELETE' });
    toast('Deleted');
    render();
  },
  'copy-week': () => copyWeekForm(),
  'cover-request': ({ id }) => formModal({
    title: 'Ask for cover',
    fields: [{ name: 'note', label: 'Anything the team should know', type: 'textarea' }],
    submit: 'Post request',
    onSubmit: async (values) => {
      await api(`/schedule/${id}/cover-request`, { method: 'POST', body: values });
      toast('Everyone has been notified');
      render();
    }
  }),
  'cover-claim': async ({ id }) => {
    await api(`/schedule/${id}/cover-claim`, { method: 'POST' });
    toast('Offered — a manager has to approve it');
    render();
  },
  'cover-approve': async ({ id }) => {
    await api(`/schedule/${id}/cover-approve`, { method: 'POST' });
    toast('Shift reassigned');
    render();
  },
  'cover-cancel': async ({ id }) => {
    await api(`/schedule/${id}/cover-cancel`, { method: 'POST' });
    toast('Cover request cleared');
    render();
  },

  'new-event': () => eventForm(null),
  'edit-event': ({ id }) => eventForm(id),
  'delete-event': async ({ id }) => {
    if (!confirm('Delete this booking? Crew shifts on it go too.')) return;
    await api(`/trailer/${id}`, { method: 'DELETE' });
    toast('Deleted');
    render();
  },
  'add-crew': ({ id }) => crewForm(id),
  'remove-crew': async ({ id, shift }) => {
    await api(`/trailer/${id}/crew/${shift}`, { method: 'DELETE' });
    toast('Removed');
    render();
  },

  'mark-read': async ({ id }) => {
    await api(`/board/${id}/read`, { method: 'POST' });
    refreshBadge();
    render({ quiet: true });
  },
  'pin-post': async ({ id }) => {
    await api(`/board/${id}/pin`, { method: 'POST' });
    render({ quiet: true });
  },
  'delete-post': async ({ id }) => {
    if (!confirm('Delete this post?')) return;
    await api(`/board/${id}`, { method: 'DELETE' });
    render();
  },
  readers: ({ id }) => {
    const readers = (window.__boardReaders || {})[id] || [];
    openModal('Who has seen this', readers.length
      ? `<div class="list">${readers.map((reader) => `<div class="line">
          <span class="dot" style="background:${esc(reader.color)}"></span>
          <span class="grow">${esc(reader.name)}</span>
          <span class="who">${esc(fmtStamp(reader.read_at))}</span></div>`).join('')}</div>`
      : '<p class="empty">Nobody yet.</p>');
  },

  'admin-tab': ({ key }) => { state.adminTab = key; render(); },
  'new-staff': () => staffForm(null),
  'edit-staff': async ({ id }) => {
    const staff = await api('/admin/staff');
    staffForm(staff.find((person) => person.id === Number(id)));
  },
  'deactivate-staff': async ({ id }) => {
    if (!confirm('Deactivate this account? Their history stays.')) return;
    await api(`/admin/staff/${id}`, { method: 'DELETE' });
    toast('Deactivated');
    render();
  },
  'new-product': () => productForm(null),
  'edit-product': async ({ id }) => {
    const products = await api('/bakery/products?all=1');
    productForm(products.find((product) => product.id === Number(id)));
  },
  'edit-settings': () => settingsForm(),

  notifications: async () => { closeModal(); await toggleNotifications(); },
  'change-pin': () => changePinForm(),
  'sign-out': () => { closeModal(); signOut(); }
};

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-act]');
  if (!trigger) return;
  const action = ACTIONS[trigger.dataset.act];
  if (!action) return;
  event.preventDefault();
  try {
    await action({ ...trigger.dataset });
  } catch (err) {
    toast(err.message, true);
  }
});

document.addEventListener('change', (event) => {
  if (event.target.dataset.act === 'task-date') {
    state.taskDate = event.target.value;
    render();
  }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'post-form') return;
  event.preventDefault();
  const form = event.target;
  const body = form.querySelector('[name="body"]').value.trim();
  if (!body) return;
  try {
    await api('/board', {
      method: 'POST',
      body: { body, pinned: form.querySelector('[name="pinned"]')?.checked }
    });
    toast('Posted — everyone gets a notification');
    render();
  } catch (err) {
    toast(err.message, true);
  }
});

document.querySelector('.tabbar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (button) go(button.dataset.tab);
});

$('#who').addEventListener('click', () => accountMenu().catch((err) => toast(err.message, true)));

// Coming back to the app should feel instant, not wait for the next tick.
window.addEventListener('focus', () => {
  if (state.me) {
    render({ quiet: true });
    refreshBadge();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.me) checkPulse();
});

// Back/forward buttons, and links like /#bakery from a notification.
window.addEventListener('hashchange', () => {
  const tab = location.hash.replace('#', '') || 'today';
  if (state.me && tab !== state.tab && VIEWS[tab]) {
    state.tab = tab;
    render();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* offline shell is optional */ });
}

wireLogin();
boot();
