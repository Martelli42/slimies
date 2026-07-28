const express = require('express');
const { db, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
const { broadcast } = require('../lib/bus');
const { notify } = require('../lib/push');
const { today, addDays, weekStart, isDate, isTime } = require('../lib/dates');
const { str, intOr, oneOf } = require('../lib/validate');

const router = express.Router();
router.use(auth);

const SHIFT_SELECT = `
  SELECT s.*, e.name AS employee_name, e.color AS employee_color,
         c.name AS cover_claimed_by_name,
         t.title AS trailer_event_title, t.location AS trailer_event_location
  FROM shifts s
  LEFT JOIN employees e ON e.id = s.employee_id
  LEFT JOIN employees c ON c.id = s.cover_claimed_by
  LEFT JOIN trailer_events t ON t.id = s.trailer_event_id
`;

function timeLabel(shift) {
  return `${shift.work_date} ${shift.start_time}–${shift.end_time}`;
}

/** A week (or any range) of shifts, grouped by day for the grid view. */
router.get('/', (req, res) => {
  const start = isDate(req.query.start) ? req.query.start : weekStart(today());
  const days = Math.min(intOr(req.query.days, 7), 42);
  const end = addDays(start, days - 1);

  const rows = db.prepare(`${SHIFT_SELECT}
    WHERE s.work_date BETWEEN ? AND ?
    ORDER BY s.work_date, s.start_time, e.name`).all(start, end);

  const byDate = {};
  for (let i = 0; i < days; i += 1) byDate[addDays(start, i)] = [];
  for (const row of rows) (byDate[row.work_date] ||= []).push(row);

  res.json({ start, end, days, by_date: byDate, shifts: rows });
});

/** My upcoming shifts — the first thing most staff want. */
router.get('/mine', (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : today();
  const rows = db.prepare(`${SHIFT_SELECT}
    WHERE s.employee_id=? AND s.work_date >= ?
    ORDER BY s.work_date, s.start_time LIMIT 40`).all(req.employee.id, from);
  res.json(rows);
});

/** Shifts flagged for cover that nobody has taken yet. */
router.get('/open-cover', (req, res) => {
  const rows = db.prepare(`${SHIFT_SELECT}
    WHERE s.cover_status IS NOT NULL AND s.work_date >= ?
    ORDER BY s.work_date, s.start_time`).all(today());
  res.json(rows);
});

router.post('/', manager, (req, res) => {
  const employeeId = Number(req.body.employee_id) || null;
  const workDate = isDate(req.body.work_date) ? req.body.work_date : null;
  const startTime = isTime(req.body.start_time) ? req.body.start_time : null;
  const endTime = isTime(req.body.end_time) ? req.body.end_time : null;

  if (!employeeId || !workDate || !startTime || !endTime) {
    return res.status(400).json({ error: 'Employee, date, start and end time are required' });
  }
  if (endTime <= startTime) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }
  if (!db.prepare('SELECT 1 FROM employees WHERE id=? AND active=1').get(employeeId)) {
    return res.status(400).json({ error: 'That employee is not active' });
  }

  const trailerEventId = Number(req.body.trailer_event_id) || null;
  const fields = {
    employee_id: employeeId,
    work_date: workDate,
    start_time: startTime,
    end_time: endTime,
    position: str(req.body.position, 40),
    location: oneOf(req.body.location, ['shop', 'trailer']) || (trailerEventId ? 'trailer' : 'shop'),
    trailer_event_id: trailerEventId,
    notes: str(req.body.notes, 300),
    published: req.body.published === false || req.body.published === 0 ? 0 : 1
  };

  const id = Number(req.body.id) || null;
  if (id) {
    const result = db.prepare(`UPDATE shifts SET employee_id=@employee_id,work_date=@work_date,
      start_time=@start_time,end_time=@end_time,position=@position,location=@location,
      trailer_event_id=@trailer_event_id,notes=@notes,published=@published WHERE id=@id`)
      .run({ ...fields, id });
    if (!result.changes) return res.status(404).json({ error: 'Shift not found' });
    log(req.employee.id, 'shift', id, 'updated', timeLabel(fields));
  } else {
    const result = db.prepare(`INSERT INTO shifts
      (employee_id,work_date,start_time,end_time,position,location,trailer_event_id,notes,published)
      VALUES (@employee_id,@work_date,@start_time,@end_time,@position,@location,@trailer_event_id,@notes,@published)`)
      .run(fields);
    log(req.employee.id, 'shift', result.lastInsertRowid, 'created', timeLabel(fields));
  }

  broadcast('schedule');
  res.json({ ok: true });
});

router.delete('/:id', manager, (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  db.prepare('DELETE FROM shifts WHERE id=?').run(shift.id);
  log(req.employee.id, 'shift', shift.id, 'deleted', timeLabel(shift));
  broadcast('schedule');
  res.json({ ok: true });
});

/** Copy a whole week forward — the usual way a repeating schedule gets built. */
router.post('/copy-week', manager, (req, res) => {
  const from = isDate(req.body.from) ? weekStart(req.body.from) : null;
  const to = isDate(req.body.to) ? weekStart(req.body.to) : null;
  if (!from || !to || from === to) return res.status(400).json({ error: 'Pick two different weeks' });

  const source = db.prepare('SELECT * FROM shifts WHERE work_date BETWEEN ? AND ?')
    .all(from, addDays(from, 6));
  if (!source.length) return res.status(400).json({ error: 'That week has no shifts to copy' });

  const offset = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  const insert = db.prepare(`INSERT INTO shifts
    (employee_id,work_date,start_time,end_time,position,location,notes,published)
    VALUES (?,?,?,?,?,?,?,?)`);

  const created = db.transaction(() => {
    let n = 0;
    for (const shift of source) {
      const workDate = addDays(shift.work_date, offset);
      const clash = db.prepare(
        'SELECT 1 FROM shifts WHERE employee_id=? AND work_date=? AND start_time=?'
      ).get(shift.employee_id, workDate, shift.start_time);
      if (clash) continue;
      insert.run(shift.employee_id, workDate, shift.start_time, shift.end_time,
        shift.position, shift.location, shift.notes, shift.published);
      n += 1;
    }
    return n;
  })();

  log(req.employee.id, 'shift', null, 'week_copied', `${from} → ${to} (${created} shifts)`);
  broadcast('schedule');
  notify({ title: 'Schedule updated', body: `Week of ${to} is posted`, url: '/#schedule', exceptId: req.employee.id });
  res.json({ ok: true, created });
});

// ── Cover requests ────────────────────────────────────────────────────────────
router.post('/:id/cover-request', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (shift.employee_id !== req.employee.id && req.employee.role !== 'manager') {
    return res.status(403).json({ error: 'That is not your shift' });
  }

  db.prepare('UPDATE shifts SET cover_status=?, cover_note=?, cover_claimed_by=NULL WHERE id=?')
    .run('requested', str(req.body.note, 300), shift.id);
  log(req.employee.id, 'shift', shift.id, 'cover_requested', timeLabel(shift));
  broadcast('schedule');
  notify({
    title: 'Shift needs cover',
    body: `${req.employee.name} needs cover for ${timeLabel(shift)}`,
    url: '/#schedule',
    exceptId: req.employee.id
  });
  res.json({ ok: true });
});

router.post('/:id/cover-claim', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (shift.cover_status !== 'requested') {
    return res.status(400).json({ error: 'That shift is not open for cover' });
  }
  if (shift.employee_id === req.employee.id) {
    return res.status(400).json({ error: 'That is already your shift' });
  }

  db.prepare('UPDATE shifts SET cover_status=?, cover_claimed_by=? WHERE id=?')
    .run('claimed', req.employee.id, shift.id);
  log(req.employee.id, 'shift', shift.id, 'cover_claimed', timeLabel(shift));
  broadcast('schedule');
  notify({
    title: 'Cover offered',
    body: `${req.employee.name} can take ${timeLabel(shift)} — needs a manager OK`,
    url: '/#schedule',
    exceptId: req.employee.id
  });
  res.json({ ok: true });
});

/** Manager approval is what actually reassigns the shift. */
router.post('/:id/cover-approve', manager, (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (shift.cover_status !== 'claimed' || !shift.cover_claimed_by) {
    return res.status(400).json({ error: 'Nobody has claimed that shift yet' });
  }

  const previous = db.prepare('SELECT name FROM employees WHERE id=?').get(shift.employee_id);
  const taker = db.prepare('SELECT name FROM employees WHERE id=?').get(shift.cover_claimed_by);
  db.prepare(`UPDATE shifts SET employee_id=?, cover_status=NULL, cover_claimed_by=NULL,
    cover_note=NULL, notes=COALESCE(notes || ' · ', '') || ? WHERE id=?`)
    .run(shift.cover_claimed_by, `covering for ${previous?.name || 'staff'}`, shift.id);

  log(req.employee.id, 'shift', shift.id, 'cover_approved', `${previous?.name} → ${taker?.name}`);
  broadcast('schedule');
  notify({
    title: 'Cover approved',
    body: `${taker?.name} now has ${timeLabel(shift)}`,
    url: '/#schedule'
  });
  res.json({ ok: true });
});

router.post('/:id/cover-cancel', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  const mine = shift.employee_id === req.employee.id || shift.cover_claimed_by === req.employee.id;
  if (!mine && req.employee.role !== 'manager') {
    return res.status(403).json({ error: 'Not your request' });
  }

  db.prepare('UPDATE shifts SET cover_status=NULL, cover_claimed_by=NULL, cover_note=NULL WHERE id=?')
    .run(shift.id);
  log(req.employee.id, 'shift', shift.id, 'cover_cancelled', timeLabel(shift));
  broadcast('schedule');
  res.json({ ok: true });
});

module.exports = router;
