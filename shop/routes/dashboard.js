const express = require('express');
const { all, get, getSetting } = require('../lib/db');
const { auth } = require('../lib/auth');
const { today, nowTime, nowStamp, daysBetween } = require('../lib/dates');

const router = express.Router();
router.use(auth);

/** Everything the Today screen needs, in one request. */
router.get('/', async (req, res) => {
  const day = today();
  const time = nowTime();
  const warnDays = Number(getSetting('expiry_warn_days'));
  const stamp = nowStamp();

  const openBatches = await all(`
    SELECT b.*, p.name AS product_name, p.unit
    FROM batches b JOIN products p ON p.id = b.product_id
    WHERE b.state IN ('delivered','frozen','thawing','floor')`);

  const flagged = openBatches.map((batch) => {
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
  });

  const taskRows = await all(`
    SELECT t.shift, COUNT(*) AS total,
           SUM(CASE WHEN c.id IS NULL THEN 0 ELSE 1 END) AS done
    FROM task_templates t
    LEFT JOIN task_completions c ON c.template_id = t.id AND c.business_date = :day
    WHERE t.active=1 GROUP BY t.shift`, { day });
  const tasks = {};
  for (const row of taskRows) tasks[row.shift] = { done: row.done, total: row.total };

  const shiftsToday = await all(`
    SELECT s.*, e.name AS employee_name, e.color AS employee_color, t.title AS trailer_event_title
    FROM shifts s LEFT JOIN employees e ON e.id = s.employee_id
    LEFT JOIN trailer_events t ON t.id = s.trailer_event_id
    WHERE s.work_date=:day ORDER BY s.start_time`, { day });

  const myNextShift = await get(`
    SELECT * FROM shifts
    WHERE employee_id=:me AND (work_date > :day OR (work_date = :day AND end_time >= :time))
    ORDER BY work_date, start_time LIMIT 1`, { me: req.employee.id, day, time });

  const trailerToday = await all(
    "SELECT * FROM trailer_events WHERE event_date=:day AND status!='cancelled'", { day }
  );
  const trailerNext = await all(`
    SELECT * FROM trailer_events WHERE event_date > :day AND status!='cancelled'
    ORDER BY event_date, start_time LIMIT 3`, { day });

  const unread = (await get(`SELECT COUNT(*) AS n FROM announcements a
    WHERE NOT EXISTS (SELECT 1 FROM announcement_reads r
      WHERE r.announcement_id=a.id AND r.employee_id=:me)`, { me: req.employee.id })).n;

  const pinned = await all(`SELECT a.*, e.name AS author_name FROM announcements a
    LEFT JOIN employees e ON e.id=a.author_id WHERE a.pinned=1
    ORDER BY a.created_at DESC LIMIT 5`);

  const coverNeeded = await all(`
    SELECT s.*, e.name AS employee_name FROM shifts s LEFT JOIN employees e ON e.id=s.employee_id
    WHERE s.cover_status IS NOT NULL AND s.work_date >= :day
    ORDER BY s.work_date LIMIT 10`, { day });

  res.json({
    date: day,
    time,
    me: req.employee,
    tasks,
    bakery: {
      expired: flagged.filter((batch) => batch.days_left !== null && batch.days_left < 0),
      expiring_soon: flagged.filter((batch) => batch.days_left !== null
        && batch.days_left >= 0 && batch.days_left <= warnDays),
      thaw_ready: flagged.filter((batch) => batch.thaw_ready),
      on_floor: flagged.filter((batch) => batch.state === 'floor'),
      in_freezer: flagged.filter((batch) => batch.state === 'frozen'),
      thawing: flagged.filter((batch) => batch.state === 'thawing'),
      unplaced: flagged.filter((batch) => batch.state === 'delivered')
    },
    shifts_today: shiftsToday,
    my_next_shift: myNextShift || null,
    trailer: { today: trailerToday, upcoming: trailerNext },
    board: { unread, pinned },
    cover_needed: coverNeeded
  });
});

module.exports = router;
