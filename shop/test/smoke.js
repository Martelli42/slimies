/* End-to-end smoke test: boots the real server against a throwaway database
   and walks the whole app the way a shift would.
   Run with:  npm run test:shop  */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shopboard-'));
const DB_PATH = path.join(DB_DIR, 'test.db');
process.env.SHOP_DB_URL = `file:${DB_PATH}`;
process.env.SHOP_JWT_SECRET = 'test_secret';
process.env.SHOP_TZ = 'America/Chicago';

const app = require('../app');
const { ready, run } = require('../lib/db');
const { today, addDays } = require('../lib/dates');

let server;
let base;
let managerToken;
let staffToken;
const checks = [];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

function check(name, fn) {
  checks.push({ name, fn });
}

// ── Sign-in and staff ─────────────────────────────────────────────────────────
check('the first visit asks for setup', async () => {
  const { data } = await call('GET', '/roster');
  assert.equal(data.needs_setup, true);
});

check('bootstrap creates the first manager', async () => {
  const { status, data } = await call('POST', '/bootstrap', { body: { name: 'Rae', pin: '2468' } });
  assert.equal(status, 201);
  assert.equal(data.employee.role, 'manager');
  managerToken = data.token;
});

check('bootstrap only works once', async () => {
  const { status } = await call('POST', '/bootstrap', { body: { name: 'Nope', pin: '1111' } });
  assert.equal(status, 409);
});

check('a manager can add staff, and the wrong PIN is rejected', async () => {
  const created = await call('POST', '/admin/staff',
    { token: managerToken, body: { name: 'Jules', pin: '1357', role: 'staff' } });
  assert.equal(created.status, 201);

  const bad = await call('POST', '/login', { body: { employee_id: created.data.id, pin: '0000' } });
  assert.equal(bad.status, 401);

  const good = await call('POST', '/login', { body: { employee_id: created.data.id, pin: '1357' } });
  assert.equal(good.status, 200);
  staffToken = good.data.token;
});

check('staff cannot reach manager-only routes', async () => {
  const { status } = await call('POST', '/admin/staff', { token: staffToken, body: { name: 'X', pin: '1234' } });
  assert.equal(status, 403);
});

check('requests without a token are refused', async () => {
  const { status } = await call('GET', '/today');
  assert.equal(status, 401);
});

// ── Baked goods lifecycle ─────────────────────────────────────────────────────
let croissantId;
let batchId;

check('the seeded bakery menu is there', async () => {
  const { data } = await call('GET', '/bakery/products', { token: staffToken });
  assert.ok(data.length > 5);
  croissantId = data.find((product) => product.name === 'Butter Croissant').id;
});

check('a delivery into the freezer gets a freezer discard date', async () => {
  const { status, data } = await call('POST', '/bakery/deliveries', {
    token: staffToken,
    body: { product_id: croissantId, qty: 48, destination: 'freezer', lot_code: 'INV-9001' }
  });
  assert.equal(status, 201);
  assert.equal(data.state, 'frozen');
  assert.equal(data.frozen_on, today());
  assert.equal(data.discard_by, addDays(today(), 60));
  batchId = data.id;
});

let thawingId;
check('pulling part of a batch to thaw splits it and leaves the rest frozen', async () => {
  const moved = await call('POST', `/bakery/batches/${batchId}/move`,
    { token: staffToken, body: { to: 'thawing', qty: 12, note: 'for tomorrow' } });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.state, 'thawing');
  assert.equal(moved.data.qty, 12);
  assert.ok(moved.data.thaw_ready_at, 'thaw clock started');
  thawingId = moved.data.id;

  const { data: batches } = await call('GET', '/bakery/batches?state=frozen', { token: staffToken });
  const parent = batches.find((batch) => batch.id === batchId);
  assert.equal(parent.qty, 36, 'the freezer keeps the remainder');
});

check('putting it on the floor sets the floor discard date', async () => {
  const { data } = await call('POST', `/bakery/batches/${thawingId}/move`,
    { token: staffToken, body: { to: 'floor' } });
  assert.equal(data.state, 'floor');
  assert.equal(data.floor_on, today());
  assert.equal(data.discard_by, addDays(today(), 1));
});

check('illegal moves are refused', async () => {
  const { status, data } = await call('POST', `/bakery/batches/${thawingId}/move`,
    { token: staffToken, body: { to: 'frozen' } });
  assert.equal(status, 400);
  assert.match(data.error, /Can't go from floor/);
});

check('discarding part of what is on the floor is recorded', async () => {
  const { data } = await call('POST', `/bakery/batches/${thawingId}/move`,
    { token: staffToken, body: { to: 'discarded', qty: 3, note: 'end of day' } });
  assert.equal(data.state, 'discarded');
  assert.equal(data.qty, 3);

  const summary = await call('GET', '/bakery/summary', { token: staffToken });
  assert.equal(summary.data.waste_today, 3);
  assert.equal(summary.data.by_state.floor.qty, 9, '9 left in the case');
});

check('every step of a batch is in its history', async () => {
  const { data } = await call('GET', `/bakery/batches/${batchId}`, { token: staffToken });
  const types = data.events.map((event) => event.type);
  assert.deepEqual(types, ['delivered', 'frozen', 'split']);
  assert.equal(data.events[0].employee_name, 'Jules');
});

check('a recount is logged rather than silently overwritten', async () => {
  const { data } = await call('POST', `/bakery/batches/${batchId}/adjust`,
    { token: managerToken, body: { qty: 35, note: 'miscount at delivery' } });
  assert.equal(data.qty, 35);

  const detail = await call('GET', `/bakery/batches/${batchId}`, { token: staffToken });
  assert.ok(detail.data.events.some((event) => event.type === 'adjust' && event.note.includes('miscount')));
});

check('an out-of-date item shows up as expired', async () => {
  const stale = await call('POST', '/bakery/deliveries', {
    token: managerToken,
    body: {
      product_id: croissantId, qty: 6, destination: 'floor',
      delivered_on: addDays(today(), -5)
    }
  });
  assert.equal(stale.status, 201);

  // Backdate the floor date so the discard date lands in the past.
  await run('UPDATE batches SET floor_on=?, discard_by=? WHERE id=?',
    [addDays(today(), -3), addDays(today(), -2), stale.data.id]);

  const { data } = await call('GET', '/today', { token: staffToken });
  assert.ok(data.bakery.expired.some((batch) => batch.id === stale.data.id));
});

// ── Shift checklists ──────────────────────────────────────────────────────────
check('the opening and closing lists come seeded and can be ticked off', async () => {
  const { data } = await call('GET', '/tasks', { token: staffToken });
  assert.ok(data.shifts.opening.total > 5);
  assert.ok(data.shifts.closing.total > 5);

  const task = data.shifts.opening.tasks[0];
  const toggled = await call('POST', `/tasks/${task.id}/toggle`, { token: staffToken, body: {} });
  assert.equal(toggled.data.done, true);

  const after = await call('GET', '/tasks?shift=opening', { token: staffToken });
  const done = after.data.shifts.opening.tasks.find((row) => row.id === task.id);
  assert.equal(done.done, true);
  assert.equal(done.employee_name, 'Jules', 'the board shows who did it');

  const untoggled = await call('POST', `/tasks/${task.id}/toggle`, { token: staffToken, body: {} });
  assert.equal(untoggled.data.done, false);
});

check('checklists are per day', async () => {
  const { data } = await call('GET', '/tasks', { token: staffToken });
  const task = data.shifts.closing.tasks[0];
  await call('POST', `/tasks/${task.id}/toggle`,
    { token: staffToken, body: { business_date: addDays(today(), -1) } });

  const todayList = await call('GET', '/tasks?shift=closing', { token: staffToken });
  assert.equal(todayList.data.shifts.closing.done, 0, 'yesterday does not tick today');

  const yesterday = await call('GET', `/tasks?date=${addDays(today(), -1)}&shift=closing`, { token: staffToken });
  assert.equal(yesterday.data.shifts.closing.done, 1);
});

check('managers can add a task to a list', async () => {
  const added = await call('POST', '/tasks/templates',
    { token: managerToken, body: { shift: 'opening', title: 'Check the pastry case light', area: 'bakery' } });
  assert.equal(added.status, 200);
  const { data } = await call('GET', '/tasks?shift=opening', { token: staffToken });
  assert.ok(data.shifts.opening.tasks.some((task) => task.title === 'Check the pastry case light'));
});

// ── Schedule and cover ────────────────────────────────────────────────────────
let shiftId;
let julesId;

check('a manager can post a shift and staff see it', async () => {
  const staff = await call('GET', '/admin/staff', { token: managerToken });
  julesId = staff.data.find((person) => person.name === 'Jules').id;

  const created = await call('POST', '/schedule', {
    token: managerToken,
    body: {
      employee_id: julesId, work_date: addDays(today(), 2),
      start_time: '06:30', end_time: '14:00', position: 'Bar'
    }
  });
  assert.equal(created.status, 200);

  const mine = await call('GET', '/schedule/mine', { token: staffToken });
  assert.equal(mine.data.length, 1);
  shiftId = mine.data[0].id;
});

check('a shift with a bad time range is refused', async () => {
  const { status } = await call('POST', '/schedule', {
    token: managerToken,
    body: { employee_id: julesId, work_date: today(), start_time: '14:00', end_time: '06:00' }
  });
  assert.equal(status, 400);
});

check('cover goes request → claim → manager approval', async () => {
  const requested = await call('POST', `/schedule/${shiftId}/cover-request`,
    { token: staffToken, body: { note: 'dentist' } });
  assert.equal(requested.status, 200);

  const open = await call('GET', '/schedule/open-cover', { token: managerToken });
  assert.equal(open.data.length, 1);

  const claimed = await call('POST', `/schedule/${shiftId}/cover-claim`, { token: managerToken });
  assert.equal(claimed.status, 200);

  // Only a manager can finalise it, and that is what moves the shift.
  const staffApproval = await call('POST', `/schedule/${shiftId}/cover-approve`, { token: staffToken });
  assert.equal(staffApproval.status, 403);

  const approved = await call('POST', `/schedule/${shiftId}/cover-approve`, { token: managerToken });
  assert.equal(approved.status, 200);

  const mine = await call('GET', '/schedule/mine', { token: staffToken });
  assert.equal(mine.data.length, 0, 'the shift moved off Jules');
});

check('copying a week brings the shifts forward', async () => {
  const from = require('../lib/dates').weekStart(today());
  const result = await call('POST', '/schedule/copy-week',
    { token: managerToken, body: { from, to: addDays(from, 7) } });
  assert.equal(result.status, 200);
  assert.ok(result.data.created >= 1);
});

// ── Trailer ───────────────────────────────────────────────────────────────────
let eventId;

check('a trailer booking with crew shows on the schedule too', async () => {
  const created = await call('POST', '/trailer', {
    token: managerToken,
    body: {
      title: 'Farmers Market', event_date: addDays(today(), 5), start_time: '07:00',
      end_time: '13:00', location: 'Riverside Park', status: 'confirmed', menu: 'Drip, cold brew, croissants'
    }
  });
  assert.equal(created.status, 200);
  eventId = created.data.id;

  const crew = await call('POST', `/trailer/${eventId}/crew`, { token: managerToken, body: { employee_id: julesId } });
  assert.equal(crew.status, 200);
  assert.equal(crew.data.crew.length, 1);

  const week = await call('GET', `/schedule?start=${addDays(today(), 5)}&days=1`, { token: staffToken });
  const trailerShift = week.data.shifts.find((shift) => shift.trailer_event_id === eventId);
  assert.ok(trailerShift, 'trailer work lands on the schedule');
  assert.equal(trailerShift.location, 'trailer');
  assert.equal(trailerShift.trailer_event_title, 'Farmers Market');
});

check('the same person cannot be double-booked on one event', async () => {
  const { status } = await call('POST', `/trailer/${eventId}/crew`,
    { token: managerToken, body: { employee_id: julesId } });
  assert.equal(status, 409);
});

check('staff cannot edit the trailer calendar', async () => {
  const { status } = await call('POST', '/trailer',
    { token: staffToken, body: { title: 'Nope', event_date: today() } });
  assert.equal(status, 403);
});

// ── Board ─────────────────────────────────────────────────────────────────────
check('a post is unread until someone confirms it', async () => {
  const posted = await call('POST', '/board',
    { token: managerToken, body: { body: 'New oat milk vendor starts Monday', pinned: true } });
  assert.equal(posted.status, 201);

  const unread = await call('GET', '/board/unread-count', { token: staffToken });
  assert.equal(unread.data.unread, 1);

  const board = await call('GET', '/board', { token: staffToken });
  assert.equal(board.data.posts[0].read_count, 1, 'the author counts as having read it');
  assert.equal(board.data.posts[0].read_by_me, false);

  await call('POST', `/board/${posted.data.id}/read`, { token: staffToken });
  const after = await call('GET', '/board', { token: staffToken });
  assert.equal(after.data.posts[0].read_count, 2);
  assert.equal(after.data.posts[0].read_by_me, true);
  assert.equal(after.data.staff_count, 2);

  const cleared = await call('GET', '/board/unread-count', { token: staffToken });
  assert.equal(cleared.data.unread, 0);
});

// ── Dashboard and audit ───────────────────────────────────────────────────────
check('the Today screen pulls it all together', async () => {
  const { data } = await call('GET', '/today', { token: staffToken });
  assert.equal(data.date, today());
  assert.ok(data.tasks.opening.total > 0);
  assert.ok(Array.isArray(data.shifts_today));
  assert.ok(data.trailer.upcoming.some((event) => event.title === 'Farmers Market'));
  assert.ok(data.board.pinned.length === 1);
});

check('the activity log has the whole shift on it', async () => {
  const { data } = await call('GET', '/admin/activity', { token: managerToken });
  const actions = data.map((row) => `${row.entity}:${row.action}`);
  for (const expected of ['batch:delivered', 'batch:frozen', 'task:checked', 'shift:created',
    'shift:cover_approved', 'trailer_event:created', 'announcement:posted', 'employee:created']) {
    assert.ok(actions.includes(expected), `missing ${expected}`);
  }
});

check('the shop timezone drives the dates', async () => {
  const saved = await call('POST', '/admin/settings',
    { token: managerToken, body: { shop_name: 'Slimies Coffee', expiry_warn_days: 3 } });
  assert.equal(saved.status, 200);
  const roster = await call('GET', '/roster');
  assert.equal(roster.data.shop_name, 'Slimies Coffee');

  const bad = await call('POST', '/admin/settings', { token: managerToken, body: { timezone: 'Mars/Olympus' } });
  assert.equal(bad.status, 400);
});

check('the change stamp moves when something happens', async () => {
  const before = await call('GET', '/pulse', { token: staffToken });
  assert.ok(before.data.stamp);

  const same = await call('GET', '/pulse', { token: staffToken });
  assert.equal(same.data.stamp, before.data.stamp, 'quiet shop, same stamp');

  await call('POST', '/board', { token: staffToken, body: { body: 'Milk delivery is late' } });
  const after = await call('GET', '/pulse', { token: staffToken });
  assert.notEqual(after.data.stamp, before.data.stamp, 'a new post moves the stamp');
});

// Timestamps are stored in UTC but the shop's day is local, so "today" has to be
// a range, not a UTC calendar date. Without this, waste logged by a closing shift
// after ~6pm Chicago vanished from the day's total.
check('waste counts against the shop day, not the UTC day', async () => {
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Midway', 'America/Chicago']) {
    const saved = await call('POST', '/admin/settings', { token: managerToken, body: { timezone: tz } });
    assert.equal(saved.status, 200, `could not switch to ${tz}`);

    const delivered = await call('POST', '/bakery/deliveries', {
      token: managerToken,
      body: { product_id: croissantId, qty: 4, destination: 'floor' }
    });
    const before = await call('GET', '/bakery/summary', { token: managerToken });
    await call('POST', `/bakery/batches/${delivered.data.id}/move`,
      { token: managerToken, body: { to: 'discarded', qty: 4, note: 'boundary check' } });
    const after = await call('GET', '/bakery/summary', { token: managerToken });

    assert.equal(after.data.waste_today - before.data.waste_today, 4,
      `discard did not land on the same shop day in ${tz}`);
  }
});

check('business days are the right length, including the DST days', async () => {
  const { dayRange } = require('../lib/dates');
  const hours = (day, tz) => {
    const { start, end } = dayRange(day, tz);
    return (Date.parse(`${end.replace(' ', 'T')}Z`) - Date.parse(`${start.replace(' ', 'T')}Z`)) / 3600000;
  };

  assert.equal(hours('2026-07-28', 'America/Chicago'), 24);
  assert.equal(hours('2026-03-08', 'America/Chicago'), 23, 'spring forward is a 23-hour day');
  assert.equal(hours('2026-11-01', 'America/Chicago'), 25, 'fall back is a 25-hour day');
  assert.equal(hours('2026-10-25', 'Europe/London'), 25);
  assert.equal(hours('2026-04-05', 'Australia/Sydney'), 25);
});

check('health reports how it is wired up', async () => {
  const { data } = await call('GET', '/health');
  assert.equal(data.ok, true);
  assert.equal(data.jwt_secret_set, true);
  assert.equal(data.database, 'local file');
});

// ── Runner ────────────────────────────────────────────────────────────────────
(async () => {
  await ready();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  let failed = 0;
  for (const { name, fn } of checks) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${name}\n      ${err.message}`);
    }
  }

  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  server.close();
  fs.rmSync(DB_DIR, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
