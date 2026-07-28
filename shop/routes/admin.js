const express = require('express');
const { db, log, allSettings, setSetting } = require('../lib/db');
const { auth, manager, hashPin, validPin } = require('../lib/auth');
const { broadcast } = require('../lib/bus');
const { str, intOr, oneOf } = require('../lib/validate');

const router = express.Router();
router.use(auth);

const PALETTE = ['#8b5e3c', '#c08457', '#3f7d6e', '#5b6ea8', '#a8555b', '#7a6ca8', '#4c7a4c', '#b07d2b'];

/** Everyone can see the team list — it's how you know who's on with you. */
router.get('/staff', (req, res) => {
  const rows = db.prepare(`SELECT id,name,role,color,active,
    CASE WHEN push_sub IS NULL THEN 0 ELSE 1 END AS push_enabled,
    ${req.employee.role === 'manager' ? 'phone' : 'NULL AS phone'}
    FROM employees ORDER BY active DESC, name`).all();
  res.json(rows);
});

router.post('/staff', manager, (req, res) => {
  const name = str(req.body.name, 60);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const role = oneOf(req.body.role, ['staff', 'manager']) || 'staff';
  const id = Number(req.body.id) || null;
  const fields = {
    name,
    role,
    phone: str(req.body.phone, 40),
    color: str(req.body.color, 20) || PALETTE[Math.floor(Math.random() * PALETTE.length)],
    active: req.body.active === false || req.body.active === 0 ? 0 : 1
  };

  try {
    if (id) {
      // Don't let the last manager demote or deactivate themselves out of access.
      const managers = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE role='manager' AND active=1").get().n;
      const target = db.prepare('SELECT * FROM employees WHERE id=?').get(id);
      if (!target) return res.status(404).json({ error: 'Employee not found' });
      const losingManager = target.role === 'manager' && target.active
        && (fields.role !== 'manager' || !fields.active);
      if (losingManager && managers <= 1) {
        return res.status(400).json({ error: 'Promote another manager first' });
      }

      db.prepare(`UPDATE employees SET name=@name,role=@role,phone=@phone,color=@color,active=@active
        WHERE id=@id`).run({ ...fields, id });
      log(req.employee.id, 'employee', id, 'updated', name);

      const newPin = req.body.pin ? String(req.body.pin) : null;
      if (newPin) {
        if (!validPin(newPin)) return res.status(400).json({ error: 'PIN must be 4–8 digits' });
        db.prepare('UPDATE employees SET pin_hash=? WHERE id=?').run(hashPin(newPin), id);
        log(req.employee.id, 'employee', id, 'pin_reset');
      }
      broadcast('staff');
      return res.json({ ok: true, id });
    }

    const pin = String(req.body.pin ?? '');
    if (!validPin(pin)) return res.status(400).json({ error: 'Give them a 4–8 digit PIN' });
    const result = db.prepare(`INSERT INTO employees (name,role,phone,color,active,pin_hash)
      VALUES (@name,@role,@phone,@color,@active,@pin_hash)`)
      .run({ ...fields, pin_hash: hashPin(pin) });
    log(req.employee.id, 'employee', result.lastInsertRowid, 'created', `${name} (${role})`);
    broadcast('staff');
    return res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Someone already has that name' });
    }
    throw err;
  }
});

/** Deactivate rather than delete, so their history stays intact. */
router.delete('/staff/:id', manager, (req, res) => {
  const target = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Employee not found' });
  const managers = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE role='manager' AND active=1").get().n;
  if (target.role === 'manager' && target.active && managers <= 1) {
    return res.status(400).json({ error: 'Promote another manager first' });
  }
  db.prepare('UPDATE employees SET active=0, push_sub=NULL WHERE id=?').run(target.id);
  log(req.employee.id, 'employee', target.id, 'deactivated', target.name);
  broadcast('staff');
  res.json({ ok: true });
});

// ── Shop settings ─────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const settings = allSettings();
  res.json({
    shop_name: settings.shop_name,
    timezone: settings.timezone,
    expiry_warn_days: Number(settings.expiry_warn_days)
  });
});

router.post('/settings', manager, (req, res) => {
  const name = str(req.body.shop_name, 80);
  if (name) setSetting('shop_name', name);

  const tz = str(req.body.timezone, 60);
  if (tz) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
      setSetting('timezone', tz);
    } catch {
      return res.status(400).json({ error: `Unknown timezone: ${tz}` });
    }
  }

  if (req.body.expiry_warn_days !== undefined) {
    setSetting('expiry_warn_days', intOr(req.body.expiry_warn_days, 2));
  }

  log(req.employee.id, 'settings', null, 'updated');
  broadcast('settings');
  res.json({ ok: true, ...allSettings() });
});

/** One place to see everything that happened, newest first. */
router.get('/activity', (req, res) => {
  const limit = Math.min(intOr(req.query.limit, 100), 500);
  const rows = db.prepare(`
    SELECT a.*, e.name AS employee_name, e.color AS employee_color
    FROM activity_log a LEFT JOIN employees e ON e.id = a.employee_id
    ORDER BY a.at DESC, a.id DESC LIMIT ${limit}`).all();
  res.json(rows);
});

module.exports = router;
