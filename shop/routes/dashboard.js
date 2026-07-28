const express = require('express');
const { db, getSetting } = require('../lib/db');
const { auth } = require('../lib/auth');
const { today, nowTime, daysBetween, nowStamp } = require('../lib/dates');

const router = express.Router();
router.use(auth);

/** Everything the Today screen needs, in one request. */
router.get('/', (req, res) => {
  const day = today();
  const time = nowTime();
  const warnDays = Number(getSetting('expiry_warn_days'));

  const openBatches = db.prepare(`
    SELECT b.*, p.name AS product_name, p.unit
    FROM batches b JOIN products p ON p.id = b.product_id
    WHERE b.state IN ('delivered','frozen','thawing','floor')`).all();

  const stamp = nowStamp();
  const flag = (batch) => {
    const daysLeft = batch.discard_by ? daysBetween(day, batch.discard_by) : null;
    return {
      id: batch.id,
      product_name: batch.product_name,
      qty: batch.qty,
      unit: batch.unit,
      state: batch.state,
      discard_by: batch.discard_by,
      days_left: daysLeft,
      thaw_ready: batch.state === 'thawing' && !!batch.thaw_ready_at && batch.thaw_ready_at <= stamp
    };
  };

  const flagged = openBatches.map(flag);

  const taskRows = db.prepare(`
    SELECT t.shift, COUNT(*) AS total,
           SUM(CASE WHEN c.id IS NULL THEN 0 ELSE 1 END) AS done
    FROM task_templates t
    LEFT JOIN task_completions c ON c.template_id = t.id AND c.business_date = ?
    WHERE t.active=1 GROUP BY t.shift`).all(day);
  const tasks = {};
  for (const row of taskRows) tasks[row.shift] = { done: row.done, total: row.total };

  const shiftsToday = db.prepare(`
    SELECT s.*, e.name AS employee_name, e.color AS employee_color, t.title AS trailer_event_title
    FROM shifts s LEFT JOIN employees e ON e.id = s.employee_id
    LEFT JOIN trailer_events t ON t.id = s.trailer_event_id
    WHERE s.work_date=? ORDER BY s.start_time`).all(day);

  const myNextShift = db.prepare(`
    SELECT * FROM shifts WHERE employee_id=? AND (work_date > ? OR (work_date = ? AND end_time >= ?))
    ORDER BY work_date, start_time LIMIT 1`).get(req.employee.id, day, day, time);

  const trailerToday = db.prepare(
    "SELECT * FROM trailer_events WHERE event_date=? AND status!='cancelled'"
  ).all(day);
  const trailerNext = db.prepare(`
    SELECT * FROM trailer_events WHERE event_date > ? AND status!='cancelled'
    ORDER BY event_date, start_time LIMIT 3`).all(day);

  const unread = db.prepare(`SELECT COUNT(*) AS n FROM announcements a
    WHERE NOT EXISTS (SELECT 1 FROM announcement_reads r
      WHERE r.announcement_id=a.id AND r.employee_id=?)`).get(req.employee.id).n;

  const pinned = db.prepare(`SELECT a.*, e.name AS author_name FROM announcements a
    LEFT JOIN employees e ON e.id=a.author_id WHERE a.pinned=1
    ORDER BY a.created_at DESC LIMIT 5`).all();

  const coverNeeded = db.prepare(`
    SELECT s.*, e.name AS employee_name FROM shifts s LEFT JOIN employees e ON e.id=s.employee_id
    WHERE s.cover_status IS NOT NULL AND s.work_date >= ? ORDER BY s.work_date LIMIT 10`).all(day);

  res.json({
    date: day,
    time,
    me: req.employee,
    tasks,
    bakery: {
      expired: flagged.filter((b) => b.days_left !== null && b.days_left < 0),
      expiring_soon: flagged.filter((b) => b.days_left !== null && b.days_left >= 0 && b.days_left <= warnDays),
      thaw_ready: flagged.filter((b) => b.thaw_ready),
      on_floor: flagged.filter((b) => b.state === 'floor'),
      in_freezer: flagged.filter((b) => b.state === 'frozen'),
      thawing: flagged.filter((b) => b.state === 'thawing'),
      unplaced: flagged.filter((b) => b.state === 'delivered')
    },
    shifts_today: shiftsToday,
    my_next_shift: myNextShift || null,
    trailer: { today: trailerToday, upcoming: trailerNext },
    board: { unread, pinned },
    cover_needed: coverNeeded
  });
});

module.exports = router;
