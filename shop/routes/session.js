const express = require('express');
const { all, get, run, log, allSettings } = require('../lib/db');
const { auth, hashPin, verifyPin, validPin, signToken, hasSecret } = require('../lib/auth');
const { publicKey } = require('../lib/push');
const { stamp } = require('../lib/pulse');
const { today, nowTime } = require('../lib/dates');
const { str } = require('../lib/validate');

const router = express.Router();

// Simple throttle so a shared tablet can't be brute-forced quickly. Per instance,
// which is enough of a speed bump when paired with the 4–8 digit PIN.
const attempts = new Map();
const MAX_ATTEMPTS = 6;
const LOCKOUT_MS = 5 * 60 * 1000;

function tooManyAttempts(employeeId) {
  const record = attempts.get(employeeId);
  if (!record) return false;
  if (Date.now() - record.at > LOCKOUT_MS) {
    attempts.delete(employeeId);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function noteFailure(employeeId) {
  const record = attempts.get(employeeId);
  if (record && Date.now() - record.at <= LOCKOUT_MS) {
    record.count += 1;
    record.at = Date.now();
  } else {
    attempts.set(employeeId, { count: 1, at: Date.now() });
  }
}

function publicEmployee(employee) {
  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    color: employee.color,
    phone: employee.phone || null
  };
}

/** Tiles on the login screen. No PINs or contact details leave the server here. */
router.get('/roster', async (req, res) => {
  const staff = await all('SELECT id,name,color,role FROM employees WHERE active=1 ORDER BY name');
  res.json({
    shop_name: allSettings().shop_name,
    needs_setup: staff.length === 0,
    configured: hasSecret,
    staff
  });
});

/** First run: create the first manager account. Disabled once staff exist. */
router.post('/bootstrap', async (req, res) => {
  const count = (await get('SELECT COUNT(*) AS n FROM employees')).n;
  if (count > 0) return res.status(409).json({ error: 'Already set up' });

  const name = str(req.body.name, 60);
  const pin = String(req.body.pin ?? '');
  if (!name) return res.status(400).json({ error: 'Enter your name' });
  if (!validPin(pin)) return res.status(400).json({ error: 'PIN must be 4–8 digits' });
  if (!hasSecret) return res.status(500).json({ error: 'SHOP_JWT_SECRET is not set on the server' });

  const result = await run(
    "INSERT INTO employees (name,role,pin_hash,color) VALUES (:name,'manager',:pin,:color)",
    { name, pin: hashPin(pin), color: '#8b5e3c' }
  );
  const employee = await get('SELECT * FROM employees WHERE id=:id', { id: result.lastInsertRowid });
  await log(employee.id, 'employee', employee.id, 'created', 'first manager');

  res.status(201).json({ token: signToken(employee), employee: publicEmployee(employee) });
});

router.post('/login', async (req, res) => {
  const employeeId = Number(req.body.employee_id) || null;
  const pin = String(req.body.pin ?? '');
  const employee = employeeId
    ? await get('SELECT * FROM employees WHERE id=:id AND active=1', { id: employeeId })
    : null;

  if (!employee) return res.status(401).json({ error: 'Pick your name and enter your PIN' });
  if (!hasSecret) return res.status(500).json({ error: 'SHOP_JWT_SECRET is not set on the server' });
  if (tooManyAttempts(employee.id)) {
    return res.status(429).json({ error: 'Too many tries — wait 5 minutes or ask a manager' });
  }
  if (!verifyPin(pin, employee.pin_hash)) {
    noteFailure(employee.id);
    return res.status(401).json({ error: 'That PIN does not match' });
  }

  attempts.delete(employee.id);
  await log(employee.id, 'employee', employee.id, 'signed_in');
  res.json({ token: signToken(employee), employee: publicEmployee(employee) });
});

router.get('/me', auth, async (req, res) => {
  const employee = await get('SELECT * FROM employees WHERE id=:id', { id: req.employee.id });
  const settings = allSettings();
  res.json({
    employee: publicEmployee(employee),
    push_enabled: !!employee.push_sub,
    shop: { name: settings.shop_name, timezone: settings.timezone },
    clock: { date: today(settings.timezone), time: nowTime(settings.timezone) }
  });
});

router.post('/me/pin', auth, async (req, res) => {
  const employee = await get('SELECT * FROM employees WHERE id=:id', { id: req.employee.id });
  const current = String(req.body.current_pin ?? '');
  const next = String(req.body.new_pin ?? '');

  if (!verifyPin(current, employee.pin_hash)) {
    return res.status(401).json({ error: 'Current PIN is wrong' });
  }
  if (!validPin(next)) return res.status(400).json({ error: 'New PIN must be 4–8 digits' });

  await run('UPDATE employees SET pin_hash=:pin WHERE id=:id',
    { pin: hashPin(next), id: employee.id });
  await log(employee.id, 'employee', employee.id, 'pin_changed');
  res.json({ ok: true });
});

/**
 * Change stamp for live updates. Screens poll this instead of holding a socket,
 * which is what lets the app run on a serverless host.
 */
router.get('/pulse', auth, async (req, res) => {
  res.json({ stamp: await stamp() });
});

// ── Push notifications ────────────────────────────────────────────────────────
router.get('/push/key', async (req, res) => res.json({ key: await publicKey() }));

router.post('/push/subscribe', auth, async (req, res) => {
  if (!req.body?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  await run('UPDATE employees SET push_sub=:sub WHERE id=:id',
    { sub: JSON.stringify(req.body), id: req.employee.id });
  res.json({ ok: true });
});

router.post('/push/unsubscribe', auth, async (req, res) => {
  await run('UPDATE employees SET push_sub=NULL WHERE id=:id', { id: req.employee.id });
  res.json({ ok: true });
});

module.exports = router;
