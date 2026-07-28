/* Data layer.
   One client for both worlds: a local file during development
   (`file:shop.db`) and a hosted Turso database in production, which is what
   makes this deployable to Vercel where there is no persistent disk. */

const path = require('path');

const LOCAL_FILE = `file:${path.join(__dirname, '..', '..', 'shop.db')}`;
const DB_URL = process.env.TURSO_DATABASE_URL || process.env.SHOP_DB_URL || LOCAL_FILE;
const IS_REMOTE = !DB_URL.startsWith('file:');

// The web entry point talks to a hosted database over plain HTTP with no native
// module, which keeps the serverless bundle small and portable. Only local file
// databases need the native binding.
const { createClient } = IS_REMOTE
  ? require('@libsql/client/web')
  : require('@libsql/client');

const client = createClient({
  url: DB_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

function toRow(columns, values) {
  const row = {};
  columns.forEach((column, index) => {
    const value = values[index];
    row[column] = typeof value === 'bigint' ? Number(value) : value;
  });
  return row;
}

function shape(result) {
  return {
    rows: result.rows.map((values) => toRow(result.columns, values)),
    changes: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid == null ? null : Number(result.lastInsertRowid)
  };
}

async function all(sql, args = {}) {
  return shape(await client.execute({ sql, args })).rows;
}

async function get(sql, args = {}) {
  const rows = await all(sql, args);
  return rows[0] ?? null;
}

async function run(sql, args = {}) {
  return shape(await client.execute({ sql, args }));
}

/**
 * Runs fn inside a write transaction, rolling back if it throws.
 * The handle exposes the same get/all/run helpers.
 */
async function withTx(fn) {
  const tx = await client.transaction('write');
  const handle = {
    all: async (sql, args = {}) => shape(await tx.execute({ sql, args })).rows,
    get: async (sql, args = {}) => (await handle.all(sql, args))[0] ?? null,
    run: async (sql, args = {}) => shape(await tx.execute({ sql, args }))
  };
  try {
    const result = await fn(handle);
    await tx.commit();
    return result;
  } catch (err) {
    try { await tx.rollback(); } catch { /* already gone */ }
    throw err;
  }
}

// ── Schema ────────────────────────────────────────────────────────────────────
// Table order matters: a table must exist before another references it.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    role       TEXT NOT NULL DEFAULT 'staff',
    color      TEXT NOT NULL DEFAULT '#c08457',
    phone      TEXT,
    pin_hash   TEXT NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1,
    push_sub   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL UNIQUE,
    category         TEXT NOT NULL DEFAULT 'pastry',
    unit             TEXT NOT NULL DEFAULT 'each',
    supplier         TEXT,
    fresh_life_days  INTEGER NOT NULL DEFAULT 2,
    frozen_life_days INTEGER NOT NULL DEFAULT 60,
    thaw_hours       INTEGER NOT NULL DEFAULT 12,
    floor_life_days  INTEGER NOT NULL DEFAULT 1,
    par_level        REAL,
    notes            TEXT,
    active           INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS batches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      INTEGER NOT NULL REFERENCES products(id),
    parent_id       INTEGER REFERENCES batches(id),
    lot_code        TEXT,
    qty             REAL NOT NULL,
    state           TEXT NOT NULL,
    location        TEXT NOT NULL DEFAULT 'shop',
    delivered_on    TEXT,
    frozen_on       TEXT,
    thaw_started_at TEXT,
    thaw_ready_at   TEXT,
    floor_on        TEXT,
    discard_by      TEXT,
    closed_at       TEXT,
    supplier        TEXT,
    notes           TEXT,
    created_by      INTEGER REFERENCES employees(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_batches_state ON batches(state)',
  'CREATE INDEX IF NOT EXISTS idx_batches_discard ON batches(discard_by)',
  `CREATE TABLE IF NOT EXISTS batch_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id    INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    qty         REAL,
    from_state  TEXT,
    to_state    TEXT,
    note        TEXT,
    employee_id INTEGER REFERENCES employees(id),
    at          TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_batch_events_batch ON batch_events(batch_id)',
  `CREATE TABLE IF NOT EXISTS task_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    shift      TEXT NOT NULL,
    title      TEXT NOT NULL,
    area       TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1,
    UNIQUE(shift, title)
  )`,
  `CREATE TABLE IF NOT EXISTS task_completions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id   INTEGER NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
    business_date TEXT NOT NULL,
    employee_id   INTEGER REFERENCES employees(id),
    note          TEXT,
    completed_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(template_id, business_date)
  )`,
  `CREATE TABLE IF NOT EXISTS trailer_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    event_date TEXT NOT NULL,
    start_time TEXT,
    end_time   TEXT,
    location   TEXT,
    address    TEXT,
    contact    TEXT,
    status     TEXT NOT NULL DEFAULT 'confirmed',
    menu       TEXT,
    notes      TEXT,
    created_by INTEGER REFERENCES employees(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_trailer_date ON trailer_events(event_date)',
  `CREATE TABLE IF NOT EXISTS shifts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id      INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    work_date        TEXT NOT NULL,
    start_time       TEXT NOT NULL,
    end_time         TEXT NOT NULL,
    position         TEXT,
    location         TEXT NOT NULL DEFAULT 'shop',
    trailer_event_id INTEGER REFERENCES trailer_events(id) ON DELETE SET NULL,
    notes            TEXT,
    published        INTEGER NOT NULL DEFAULT 1,
    cover_status     TEXT,
    cover_claimed_by INTEGER REFERENCES employees(id),
    cover_note       TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(work_date)',
  `CREATE TABLE IF NOT EXISTS announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    body       TEXT NOT NULL,
    author_id  INTEGER REFERENCES employees(id),
    pinned     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    read_at         TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (announcement_id, employee_id)
  )`,
  `CREATE TABLE IF NOT EXISTS activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER REFERENCES employees(id),
    entity      TEXT NOT NULL,
    entity_id   INTEGER,
    action      TEXT NOT NULL,
    detail      TEXT,
    at          TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_activity_at ON activity_log(at)'
];

// ── Settings ──────────────────────────────────────────────────────────────────
// Cached, because date maths needs the timezone synchronously. The cache is
// refreshed per request once it goes stale (see refreshSettings below).
const DEFAULT_SETTINGS = {
  shop_name: 'Our Coffee Shop',
  timezone: process.env.SHOP_TZ || 'America/Chicago',
  expiry_warn_days: '2'
};

const CACHE_TTL_MS = 60 * 1000;
let cache = { ...DEFAULT_SETTINGS };
let cachedAt = 0;

async function loadSettings() {
  const rows = await all('SELECT key,value FROM settings');
  const next = { ...DEFAULT_SETTINGS };
  for (const row of rows) next[row.key] = row.value;
  cache = next;
  cachedAt = Date.now();
  return cache;
}

function getSetting(key, fallback = null) {
  return cache[key] ?? fallback;
}

async function setSetting(key, value) {
  await run(`INSERT INTO settings (key,value) VALUES (:key,:value)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    { key, value: String(value) });
  cache[key] = String(value);
}

function allSettings() {
  return { ...cache };
}

/** Express middleware: keeps the settings cache warm without a query per request. */
async function refreshSettings(req, res, next) {
  try {
    await ready();
    if (Date.now() - cachedAt > CACHE_TTL_MS) await loadSettings();
    next();
  } catch (err) {
    next(err);
  }
}

// ── Activity log ──────────────────────────────────────────────────────────────
async function log(employeeId, entity, entityId, action, detail = null) {
  await run(`INSERT INTO activity_log (employee_id,entity,entity_id,action,detail)
             VALUES (:employee_id,:entity,:entity_id,:action,:detail)`, {
    employee_id: employeeId ?? null,
    entity,
    entity_id: entityId ?? null,
    action,
    detail
  });
}

// ── Seed data ─────────────────────────────────────────────────────────────────
// Runs once on an empty database. Everything here is editable in the app.
const SEED_PRODUCTS = [
  // name,                    category,  unit,   fresh, frozen, thaw, floor
  ['Butter Croissant',        'pastry', 'each',   1,     60,   12,   1],
  ['Almond Croissant',        'pastry', 'each',   1,     60,   12,   1],
  ['Chocolate Croissant',     'pastry', 'each',   1,     60,   12,   1],
  ['Ham & Cheese Croissant',  'pastry', 'each',   1,     45,   12,   1],
  ['Blueberry Muffin',        'pastry', 'each',   2,     60,    8,   2],
  ['Banana Bread Slice',      'pastry', 'each',   3,     60,    8,   2],
  ['Cinnamon Roll',           'pastry', 'each',   1,     45,   12,   1],
  ['Seasonal Scone',          'pastry', 'each',   2,     60,    8,   2],
  ['Chocolate Chip Cookie',   'cookie', 'each',   5,     90,    4,   4],
  ['Gluten-Free Brownie',     'cookie', 'each',   4,     90,    4,   3],
  ['Bagel — Plain',           'bread',  'each',   2,     60,    6,   2],
  ['Bagel — Everything',      'bread',  'each',   2,     60,    6,   2],
  ['Sourdough Loaf',          'bread',  'each',   3,     60,   12,   3],
  ['Quiche Slice',            'savory', 'each',   2,     45,   24,   1],
  ['Breakfast Sandwich',      'savory', 'each',   2,     45,   24,   1]
];

const SEED_TASKS = {
  opening: [
    ['Unlock, disarm alarm, lights on', 'front'],
    ['Turn on espresso machine + hot water boiler', 'bar'],
    ['Pull tomorrow-thaw items from freezer (check the Bakery tab)', 'bakery'],
    ['Case the thawed pastries, label with date pulled', 'bakery'],
    ['Check every date in the case — pull anything past discard-by', 'bakery'],
    ['Dial in espresso, pull + taste test shots', 'bar'],
    ['Brew drip coffee + iced coffee', 'bar'],
    ['Stock milk fridge, fill pitchers, check dates', 'bar'],
    ['Make fresh sanitizer buckets + test strips', 'bar'],
    ['Count opening till, log the drawer', 'front'],
    ['Stock cups, lids, sleeves, straws, napkins', 'front'],
    ['Wipe tables, sweep patio, put out sidewalk sign', 'front'],
    ['Read the Board for today’s notes', 'front'],
    ['Unlock doors, flip the OPEN sign', 'front']
  ],
  mid: [
    ['Rotate the case — oldest to the front', 'bakery'],
    ['Restock milk, syrups, cups', 'bar'],
    ['Backflush espresso machine, wipe steam wands', 'bar'],
    ['Bathroom check + restock', 'front'],
    ['Trash check, wipe tables', 'front']
  ],
  closing: [
    ['Count and log every unsold baked good (Bakery → Sold out / Discard)', 'bakery'],
    ['Empty and wipe down the pastry case', 'bakery'],
    ['Pull tomorrow’s items from the freezer to thaw', 'bakery'],
    ['Backflush espresso machine + clean group heads', 'bar'],
    ['Soak steam wand tips, clean drip trays', 'bar'],
    ['Dump, rinse, and clean drip brewers + urns', 'bar'],
    ['Wash all dishes, run final rack', 'bar'],
    ['Break down and clean blender', 'bar'],
    ['Take out trash, recycling, compost', 'back'],
    ['Sanitize all counters and the bar', 'bar'],
    ['Restock for open (cups, lids, sleeves, pastry bags)', 'front'],
    ['Sweep and mop floors', 'front'],
    ['Count till, drop cash, log the total', 'front'],
    ['Post anything the opener needs to know on the Board', 'front'],
    ['Lights off, arm alarm, lock up', 'front']
  ]
};

/** Everything here is INSERT OR IGNORE, so two cold starts racing is harmless. */
async function seed() {
  const statements = SEED_PRODUCTS.map((values) => ({
    sql: `INSERT OR IGNORE INTO products
      (name,category,unit,fresh_life_days,frozen_life_days,thaw_hours,floor_life_days)
      VALUES (?,?,?,?,?,?,?)`,
    args: values
  }));

  for (const [shift, list] of Object.entries(SEED_TASKS)) {
    list.forEach(([title, area], index) => statements.push({
      sql: 'INSERT OR IGNORE INTO task_templates (shift,title,area,sort_order) VALUES (?,?,?,?)',
      args: [shift, title, area, index * 10]
    }));
  }

  statements.push({
    sql: 'INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)',
    args: ['seeded_at', new Date().toISOString()]
  });

  await client.batch(statements, 'write');
}

// ── One-time init, cached per process ─────────────────────────────────────────
let readyPromise = null;

async function init() {
  await client.batch(SCHEMA, 'write');
  const seeded = await get("SELECT value FROM settings WHERE key='seeded_at'");
  if (!seeded) await seed();
  await loadSettings();
}

/** Awaited before the first query in each server instance. */
function ready() {
  if (!readyPromise) {
    readyPromise = init().catch((err) => {
      readyPromise = null; // let the next request retry
      throw err;
    });
  }
  return readyPromise;
}

module.exports = {
  client, all, get, run, withTx, ready, refreshSettings,
  getSetting, setSetting, allSettings, loadSettings, log,
  DB_URL, IS_REMOTE
};
