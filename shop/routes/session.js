const express = require('express');
const { db, log, allSettings } = require('../lib/db');
const { auth, hashPin, verifyPin, validPin, signToken } = require('../lib/auth');
const { publicKey } = require('../lib/push');
const { today, nowTime } = require('../lib/dates');
const { str } = require('../lib/validate');

const router = express.Router();

// Simple in-memory throttle so a shared tablet can't be brute-forced quickly.
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

/** Tiles on the login screen. No PINs or contact details leave the server here. */
router.get('/roster', (req, res) => {
  const staff = db.prepare('SELECT id,name,color,role FROM employees WHERE active=1 ORDER BY name').all();
  const settings = allSettings();
  res.json({
    shop_name: settings.shop_name,
    needs_setup: staff.length === 0,
    staff
  });
});

/** First run: create the first manager account. Disabled once staff exist. */
router.post('/bootstrap', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM employees').get().n;
  if (count > 0) return res.status(409).json({ error: 'Already set up' });

  const name = str(req.body.name, 60);
  const pin = String(req.body.pin ?? '');
  if (!name) return res.status(400).json({ error: 'Enter your name' });
  if (!validPin(pin)) return res.status(400).json({ error: 'PIN must be 4–8 digits' });

  const result = db.prepare(`INSERT INTO employees (name,role,pin_hash,color)
    VALUES (?,'manager',?,?)`).run(name, hashPin(pin), '#8b5e3c');
  const employee = db.prepare('SELECT * FROM employees WHERE id=?').get(result.lastInsertRowid);
  log(employee.id, 'employee', employee.id, 'created', 'first manager');

  res.status(201).json({ token: signToken(employee), employee: publicEmployee(employee) });
});

router.post('/login', (req, res) => {
  const employeeId = Number(req.body.employee_id) || null;
  const pin = String(req.body.pin ?? '');
  const employee = employeeId
    ? db.prepare('SELECT * FROM employees WHERE id=? AND active=1').get(employeeId)
    : null;

  if (!employee) return res.status(401).json({ error: 'Pick your name and enter your PIN' });
  if (tooManyAttempts(employee.id)) {
    return res.status(429).json({ error: 'Too many tries — wait 5 minutes or ask a manager' });
  }
  if (!verifyPin(pin, employee.pin_hash)) {
    noteFailure(employee.id);
    return res.status(401).json({ error: 'That PIN does not match' });
  }

  attempts.delete(employee.id);
  log(employee.id, 'employee', employee.id, 'signed_in');
  res.json({ token: signToken(employee), employee: publicEmployee(employee) });
});

function publicEmployee(employee) {
  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    color: employee.color,
    phone: employee.phone || null
  };
}

router.get('/me', auth, (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id=?').get(req.employee.id);
  const settings = allSettings();
  res.json({
    employee: publicEmployee(employee),
    push_enabled: !!employee.push_sub,
    shop: { name: settings.shop_name, timezone: settings.timezone },
    clock: { date: today(settings.timezone), time: nowTime(settings.timezone) }
  });
});

router.post('/me/pin', auth, (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id=?').get(req.employee.id);
  const current = String(req.body.current_pin ?? '');
  const next = String(req.body.new_pin ?? '');

  if (!verifyPin(current, employee.pin_hash)) {
    return res.status(401).json({ error: 'Current PIN is wrong' });
  }
  if (!validPin(next)) return res.status(400).json({ error: 'New PIN must be 4–8 digits' });

  db.prepare('UPDATE employees SET pin_hash=? WHERE id=?').run(hashPin(next), employee.id);
  log(employee.id, 'employee', employee.id, 'pin_changed');
  res.json({ ok: true });
});

// ── Push notifications ────────────────────────────────────────────────────────
router.get('/push/key', (req, res) => res.json({ key: publicKey }));

router.post('/push/subscribe', auth, (req, res) => {
  if (!req.body?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  db.prepare('UPDATE employees SET push_sub=? WHERE id=?')
    .run(JSON.stringify(req.body), req.employee.id);
  res.json({ ok: true });
});

router.post('/push/unsubscribe', auth, (req, res) => {
  db.prepare('UPDATE employees SET push_sub=NULL WHERE id=?').run(req.employee.id);
  res.json({ ok: true });
});

module.exports = router;
