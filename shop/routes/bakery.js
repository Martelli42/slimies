const express = require('express');
const { db, getSetting, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
const { broadcast } = require('../lib/bus');
const { notify } = require('../lib/push');
const { today, nowStamp, addDays, addHours, daysBetween, isDate } = require('../lib/dates');
const { str, posNum, intOr, oneOf } = require('../lib/validate');

const router = express.Router();
router.use(auth);

const STATES = ['delivered', 'frozen', 'thawing', 'floor', 'sold_out', 'discarded'];
const OPEN_STATES = ['delivered', 'frozen', 'thawing', 'floor'];

// Where a batch is allowed to go next.
const TRANSITIONS = {
  delivered: ['frozen', 'floor', 'discarded'],
  frozen:    ['thawing', 'floor', 'discarded'],
  thawing:   ['floor', 'frozen', 'discarded'],
  floor:     ['sold_out', 'discarded'],
  sold_out:  [],
  discarded: []
};

const EVENT_LABELS = {
  delivered: 'Delivered',
  frozen: 'Into the freezer',
  thawing: 'Pulled to thaw',
  floor: 'On the floor',
  sold_out: 'Sold out',
  discarded: 'Discarded',
  adjust: 'Count adjusted',
  split: 'Split from another batch',
  note: 'Note'
};

// ── Products (the bakery menu) ────────────────────────────────────────────────
router.get('/products', (req, res) => {
  const includeInactive = req.query.all === '1';
  const rows = db.prepare(`SELECT * FROM products ${includeInactive ? '' : 'WHERE active=1'}
                           ORDER BY category, name`).all();
  res.json(rows);
});

router.post('/products', manager, (req, res) => {
  const name = str(req.body.name, 80);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const fields = {
    name,
    category: oneOf(str(req.body.category, 20), ['pastry', 'bread', 'cookie', 'savory', 'other']) || 'pastry',
    unit: str(req.body.unit, 20) || 'each',
    supplier: str(req.body.supplier, 80),
    fresh_life_days: intOr(req.body.fresh_life_days, 2),
    frozen_life_days: intOr(req.body.frozen_life_days, 60),
    thaw_hours: intOr(req.body.thaw_hours, 12),
    floor_life_days: intOr(req.body.floor_life_days, 1),
    par_level: posNum(req.body.par_level),
    notes: str(req.body.notes, 500),
    active: req.body.active === false || req.body.active === 0 ? 0 : 1
  };

  const id = Number(req.body.id) || null;
  try {
    if (id) {
      db.prepare(`UPDATE products SET name=@name,category=@category,unit=@unit,supplier=@supplier,
        fresh_life_days=@fresh_life_days,frozen_life_days=@frozen_life_days,thaw_hours=@thaw_hours,
        floor_life_days=@floor_life_days,par_level=@par_level,notes=@notes,active=@active
        WHERE id=@id`).run({ ...fields, id });
      log(req.employee.id, 'product', id, 'updated', name);
    } else {
      const result = db.prepare(`INSERT INTO products
        (name,category,unit,supplier,fresh_life_days,frozen_life_days,thaw_hours,floor_life_days,par_level,notes,active)
        VALUES (@name,@category,@unit,@supplier,@fresh_life_days,@frozen_life_days,@thaw_hours,@floor_life_days,@par_level,@notes,@active)`)
        .run(fields);
      log(req.employee.id, 'product', result.lastInsertRowid, 'created', name);
    }
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'A product with that name already exists' });
    }
    throw err;
  }

  broadcast('bakery');
  res.json({ ok: true });
});

// ── Batches ───────────────────────────────────────────────────────────────────
const BATCH_SELECT = `
  SELECT b.*, p.name AS product_name, p.category, p.unit, p.thaw_hours,
         p.floor_life_days, p.frozen_life_days, e.name AS created_by_name
  FROM batches b
  JOIN products p ON p.id = b.product_id
  LEFT JOIN employees e ON e.id = b.created_by
`;

/** Adds the fields the UI needs but the table doesn't store. */
function decorate(batch, day = today()) {
  const daysLeft = batch.discard_by ? daysBetween(day, batch.discard_by) : null;
  const open = OPEN_STATES.includes(batch.state);
  return {
    ...batch,
    days_left: daysLeft,
    expired: open && daysLeft !== null && daysLeft < 0,
    expiring_soon: open && daysLeft !== null && daysLeft >= 0 && daysLeft <= Number(getSetting('expiry_warn_days')),
    thaw_ready: batch.state === 'thawing' && !!batch.thaw_ready_at && batch.thaw_ready_at <= nowStamp()
  };
}

router.get('/batches', (req, res) => {
  const clauses = [];
  const params = {};

  const state = oneOf(req.query.state, STATES);
  if (state) {
    clauses.push('b.state = @state');
    params.state = state;
  } else if (req.query.include_closed !== '1') {
    clauses.push(`b.state IN ('${OPEN_STATES.join("','")}')`);
  }
  if (req.query.product_id) {
    clauses.push('b.product_id = @product_id');
    params.product_id = Number(req.query.product_id);
  }
  if (req.query.location) {
    clauses.push('b.location = @location');
    params.location = String(req.query.location);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(intOr(req.query.limit, 400), 1000);
  const rows = db.prepare(`${BATCH_SELECT} ${where}
    ORDER BY (b.discard_by IS NULL), b.discard_by, p.name LIMIT ${limit}`).all(params);
  const day = today();
  res.json(rows.map((row) => decorate(row, day)));
});

router.get('/batches/:id', (req, res) => {
  const batch = db.prepare(`${BATCH_SELECT} WHERE b.id=?`).get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  const events = db.prepare(`
    SELECT ev.*, e.name AS employee_name FROM batch_events ev
    LEFT JOIN employees e ON e.id = ev.employee_id
    WHERE ev.batch_id=? ORDER BY ev.at ASC, ev.id ASC`).all(req.params.id);
  res.json({ batch: decorate(batch), events: events.map((ev) => ({ ...ev, label: EVENT_LABELS[ev.type] || ev.type })) });
});

/** Recomputes the dates that depend on the state a batch just entered. */
function datesFor(state, product, batch, day) {
  const patch = {};
  if (state === 'delivered') {
    patch.delivered_on = batch.delivered_on || day;
    patch.discard_by = addDays(patch.delivered_on, product.fresh_life_days);
  }
  if (state === 'frozen') {
    patch.frozen_on = day;
    patch.discard_by = addDays(day, product.frozen_life_days);
  }
  if (state === 'thawing') {
    patch.thaw_started_at = nowStamp();
    patch.thaw_ready_at = addHours(patch.thaw_started_at, product.thaw_hours);
    // Provisional — recomputed for real when it hits the floor.
    patch.discard_by = addDays(day, Math.ceil(product.thaw_hours / 24) + product.floor_life_days);
  }
  if (state === 'floor') {
    patch.floor_on = day;
    patch.discard_by = addDays(day, product.floor_life_days);
  }
  if (state === 'sold_out' || state === 'discarded') {
    patch.closed_at = nowStamp();
  }
  return patch;
}

function writeBatch(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const assignments = keys.map((k) => `${k}=@${k}`).join(',');
  db.prepare(`UPDATE batches SET ${assignments}, updated_at=@updated_at WHERE id=@id`)
    .run({ ...patch, updated_at: nowStamp(), id });
}

function addEvent(batchId, event) {
  db.prepare(`INSERT INTO batch_events (batch_id,type,qty,from_state,to_state,note,employee_id,at)
              VALUES (@batch_id,@type,@qty,@from_state,@to_state,@note,@employee_id,@at)`).run({
    batch_id: batchId,
    type: event.type,
    qty: event.qty ?? null,
    from_state: event.from_state ?? null,
    to_state: event.to_state ?? null,
    note: event.note ?? null,
    employee_id: event.employee_id ?? null,
    at: nowStamp()
  });
}

// Log a delivery. `destination` decides where it lands right away.
router.post('/deliveries', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(Number(req.body.product_id));
  if (!product) return res.status(400).json({ error: 'Pick a product' });

  const qty = posNum(req.body.qty);
  if (!qty) return res.status(400).json({ error: 'Quantity must be greater than zero' });

  const day = today();
  const deliveredOn = isDate(req.body.delivered_on) ? req.body.delivered_on : day;
  const destination = oneOf(req.body.destination, ['freezer', 'floor', 'back']) || 'freezer';
  const state = destination === 'freezer' ? 'frozen' : destination === 'floor' ? 'floor' : 'delivered';

  const base = {
    product_id: product.id,
    lot_code: str(req.body.lot_code, 40),
    qty,
    state,
    location: oneOf(req.body.location, ['shop', 'trailer']) || 'shop',
    delivered_on: deliveredOn,
    supplier: str(req.body.supplier, 80) || product.supplier,
    notes: str(req.body.notes, 500),
    created_by: req.employee.id
  };

  const dates = datesFor(state, product, { delivered_on: deliveredOn }, day);
  const row = {
    frozen_on: null, thaw_started_at: null, thaw_ready_at: null, floor_on: null,
    discard_by: null, closed_at: null, ...base, ...dates, delivered_on: deliveredOn
  };

  const id = db.transaction(() => {
    const result = db.prepare(`INSERT INTO batches
      (product_id,lot_code,qty,state,location,delivered_on,frozen_on,thaw_started_at,thaw_ready_at,
       floor_on,discard_by,closed_at,supplier,notes,created_by)
      VALUES (@product_id,@lot_code,@qty,@state,@location,@delivered_on,@frozen_on,@thaw_started_at,
       @thaw_ready_at,@floor_on,@discard_by,@closed_at,@supplier,@notes,@created_by)`).run(row);
    const batchId = Number(result.lastInsertRowid);
    addEvent(batchId, {
      type: 'delivered', qty, to_state: 'delivered', employee_id: req.employee.id,
      note: `Received ${qty} ${product.unit} of ${product.name}`
    });
    log(req.employee.id, 'batch', batchId, 'delivered', `${product.name} x${qty}`);
    if (state !== 'delivered') {
      addEvent(batchId, {
        type: state, qty, from_state: 'delivered', to_state: state, employee_id: req.employee.id
      });
      log(req.employee.id, 'batch', batchId, state, `${product.name} x${qty} straight from delivery`);
    }
    return batchId;
  })();

  broadcast('bakery');
  const batch = db.prepare(`${BATCH_SELECT} WHERE b.id=?`).get(id);
  res.status(201).json(decorate(batch));
});

// Move a batch along: freezer → thaw → floor → sold out / discarded.
// Passing a qty smaller than the batch splits it, so partial pulls stay accurate.
router.post('/batches/:id/move', (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id=?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const to = oneOf(req.body.to, STATES);
  if (!to) return res.status(400).json({ error: 'Unknown destination' });
  if (!TRANSITIONS[batch.state].includes(to)) {
    return res.status(400).json({ error: `Can't go from ${batch.state} to ${to}` });
  }

  const product = db.prepare('SELECT * FROM products WHERE id=?').get(batch.product_id);
  const note = str(req.body.note, 500);
  const requested = posNum(req.body.qty);
  const qty = requested && requested < batch.qty ? requested : batch.qty;
  const day = today();
  const partial = qty < batch.qty;

  const movedId = db.transaction(() => {
    const dates = datesFor(to, product, batch, day);

    if (!partial) {
      writeBatch(batch.id, { state: to, ...dates });
      addEvent(batch.id, {
        type: to, qty, from_state: batch.state, to_state: to, note, employee_id: req.employee.id
      });
      log(req.employee.id, 'batch', batch.id, to, `${product.name} x${qty}`);
      return batch.id;
    }

    // Split: the moved portion becomes its own batch so both keep honest dates.
    const child = {
      product_id: batch.product_id,
      parent_id: batch.id,
      lot_code: batch.lot_code,
      qty,
      state: to,
      location: batch.location,
      delivered_on: batch.delivered_on,
      frozen_on: batch.frozen_on,
      thaw_started_at: batch.thaw_started_at,
      thaw_ready_at: batch.thaw_ready_at,
      floor_on: batch.floor_on,
      discard_by: batch.discard_by,
      closed_at: null,
      supplier: batch.supplier,
      notes: batch.notes,
      created_by: req.employee.id,
      ...dates
    };
    const result = db.prepare(`INSERT INTO batches
      (product_id,parent_id,lot_code,qty,state,location,delivered_on,frozen_on,thaw_started_at,
       thaw_ready_at,floor_on,discard_by,closed_at,supplier,notes,created_by)
      VALUES (@product_id,@parent_id,@lot_code,@qty,@state,@location,@delivered_on,@frozen_on,
       @thaw_started_at,@thaw_ready_at,@floor_on,@discard_by,@closed_at,@supplier,@notes,@created_by)`)
      .run(child);
    const childId = Number(result.lastInsertRowid);

    writeBatch(batch.id, { qty: batch.qty - qty });
    addEvent(batch.id, {
      type: 'split', qty, from_state: batch.state, to_state: to, employee_id: req.employee.id,
      note: `${qty} ${product.unit} moved to ${to}${note ? ` — ${note}` : ''}`
    });
    addEvent(childId, {
      type: 'split', qty, from_state: batch.state, employee_id: req.employee.id,
      note: `Split off batch #${batch.id}`
    });
    addEvent(childId, {
      type: to, qty, from_state: batch.state, to_state: to, note, employee_id: req.employee.id
    });
    log(req.employee.id, 'batch', childId, to, `${product.name} x${qty} (split from #${batch.id})`);
    return childId;
  })();

  broadcast('bakery');
  if (to === 'discarded') {
    notify({
      title: 'Waste logged',
      body: `${req.employee.name} discarded ${qty} ${product.unit} of ${product.name}`,
      url: '/#bakery',
      exceptId: req.employee.id
    });
  }
  const moved = db.prepare(`${BATCH_SELECT} WHERE b.id=?`).get(movedId);
  res.json(decorate(moved));
});

// Recount without a state change (miscount at delivery, shrink, comped items).
router.post('/batches/:id/adjust', (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id=?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const qty = Number(req.body.qty);
  if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ error: 'Enter a valid count' });

  db.transaction(() => {
    writeBatch(batch.id, { qty });
    addEvent(batch.id, {
      type: 'adjust', qty, from_state: batch.state, to_state: batch.state,
      note: str(req.body.note, 500) || `Count changed ${batch.qty} → ${qty}`,
      employee_id: req.employee.id
    });
    log(req.employee.id, 'batch', batch.id, 'adjusted', `${batch.qty} → ${qty}`);
  })();

  broadcast('bakery');
  res.json(decorate(db.prepare(`${BATCH_SELECT} WHERE b.id=?`).get(batch.id)));
});

router.post('/batches/:id/note', (req, res) => {
  const batch = db.prepare('SELECT * FROM batches WHERE id=?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });
  const note = str(req.body.note, 500);
  if (!note) return res.status(400).json({ error: 'Write something first' });
  addEvent(batch.id, { type: 'note', note, from_state: batch.state, employee_id: req.employee.id });
  broadcast('bakery');
  res.json({ ok: true });
});

// ── Dashboard data ────────────────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const day = today();
  const rows = db.prepare(`${BATCH_SELECT} WHERE b.state IN ('${OPEN_STATES.join("','")}')`).all()
    .map((row) => decorate(row, day));

  const byState = {};
  for (const state of OPEN_STATES) {
    const items = rows.filter((r) => r.state === state);
    byState[state] = {
      batches: items.length,
      qty: Number(items.reduce((sum, r) => sum + r.qty, 0).toFixed(2))
    };
  }

  const wasteToday = db.prepare(`
    SELECT COALESCE(SUM(ev.qty),0) AS qty FROM batch_events ev
    WHERE ev.type='discarded' AND date(ev.at)=?`).get(day).qty;

  res.json({
    today: day,
    by_state: byState,
    expired: rows.filter((r) => r.expired),
    expiring_soon: rows.filter((r) => r.expiring_soon),
    thaw_ready: rows.filter((r) => r.thaw_ready),
    low_stock: db.prepare(`
      SELECT p.id, p.name, p.unit, p.par_level,
             COALESCE((SELECT SUM(qty) FROM batches WHERE product_id=p.id AND state='floor'),0) AS on_floor
      FROM products p
      WHERE p.active=1 AND p.par_level IS NOT NULL
        AND COALESCE((SELECT SUM(qty) FROM batches WHERE product_id=p.id AND state='floor'),0) < p.par_level
      ORDER BY p.name`).all(),
    waste_today: Math.round(Number(wasteToday) * 100) / 100
  });
});

// Full paper trail: every event on every batch, newest first.
router.get('/history', (req, res) => {
  const limit = Math.min(intOr(req.query.limit, 100), 500);
  const rows = db.prepare(`
    SELECT ev.*, b.lot_code, b.state AS batch_state, p.name AS product_name, p.unit,
           e.name AS employee_name
    FROM batch_events ev
    JOIN batches b ON b.id = ev.batch_id
    JOIN products p ON p.id = b.product_id
    LEFT JOIN employees e ON e.id = ev.employee_id
    ORDER BY ev.at DESC, ev.id DESC LIMIT ${limit}`).all();
  res.json(rows.map((row) => ({ ...row, label: EVENT_LABELS[row.type] || row.type })));
});

module.exports = router;
