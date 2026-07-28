const express = require('express');
const { all, get, run, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
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
router.get('/', async (req, res) => {
  const start = isDate(req.query.start) ? req.query.start : weekStart(today());
  const days = Math.min(intOr(req.query.days, 7), 42);
  const end = addDays(start, days - 1);

  const rows = await all(`${SHIFT_SELECT}
    WHERE s.work_date BETWEEN :start AND :end
    ORDER BY s.work_date, s.start_time, e.name`, { start, end });

  const byDate = {};
  for (let i = 0; i < days; i += 1) byDate[addDays(start, i)] = [];
  for (const row of rows) (byDate[row.work_date] ||= []).push(row);

  res.json({ start, end, days, by_date: byDate, shifts: rows });
});

/** My upcoming shifts — the first thing most staff want. */
router.get('/mine', async (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : today();
  res.json(await all(`${SHIFT_SELECT}
    WHERE s.employee_id=:me AND s.work_date >= :from
    ORDER BY s.work_date, s.start_time LIMIT 40`, { me: req.employee.id, from }));
});

/** Shifts flagged for cover that nobody has taken yet. */
router.get('/open-cover', async (req, res) => {
  res.json(await all(`${SHIFT_SELECT}
    WHERE s.cover_status IS NOT NULL AND s.work_date >= :from
    ORDER BY s.work_date, s.start_time`, { from: today() }));
});

router.post('/', manager, async (req, res) => {
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
  if (!await get('SELECT 1 AS ok FROM employees WHERE id=:id AND active=1', { id: employeeId })) {
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
    const result = await run(`UPDATE shifts SET employee_id=:employee_id,work_date=:work_date,
      start_time=:start_time,end_time=:end_time,position=:position,location=:location,
      trailer_event_id=:trailer_event_id,notes=:notes,published=:published WHERE id=:id`,
      { ...fields, id });
    if (!result.changes) return res.status(404).json({ error: 'Shift not found' });
    await log(req.employee.id, 'shift', id, 'updated', timeLabel(fields));
  } else {
    const result = await run(`INSERT INTO shifts
      (employee_id,work_date,start_time,end_time,position,location,trailer_event_id,notes,published)
      VALUES (:employee_id,:work_date,:start_time,:end_time,:position,:location,:trailer_event_id,:notes,:published)`,
      fields);
    await log(req.employee.id, 'shift', result.lastInsertRowid, 'created', timeLabel(fields));
  }

  res.json({ ok: true });
});

router.delete('/:id', manager, async (req, res) => {
  const shift = await get('SELECT * FROM shifts WHERE id=:id', { id: Number(req.params.id) });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  await run('DELETE FROM shifts WHERE id=:id', { id: shift.id });
  await log(req.employee.id, 'shift', shift.id, 'deleted', timeLabel(shift));
  res.json({ ok: true });
});

/** Copy a whole week forward — the usual way a repeating schedule gets built. */
router.post('/copy-week', manager, async (req, res) => {
  const from = isDate(req.body.from) ? weekStart(req.body.from) : null;
  const to = isDate(req.body.to) ? weekStart(req.body.to) : null;
  if (!from || !to || from === to) return res.status(400).json({ error: 'Pick two different weeks' });

  const source = await all('SELECT * FROM shifts WHERE work_date BETWEEN :from AND :end',
    { from, end: addDays(from, 6) });
  if (!source.length) return res.status(400).json({ error: 'That week has no shifts to copy' });

  const offset = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  let created = 0;
  for (const shift of source) {
    const workDate = addDays(shift.work_date, offset);
    const clash = await get(
      'SELECT 1 AS ok FROM shifts WHERE employee_id=:employee_id AND work_date=:work_date AND start_time=:start_time',
      { employee_id: shift.employee_id, work_date: workDate, start_time: shift.start_time }
    );
    if (clash) continue;
    await run(`INSERT INTO shifts
      (employee_id,work_date,start_time,end_time,position,location,notes,published)
      VALUES (:employee_id,:work_date,:start_time,:end_time,:position,:location,:notes,:published)`, {
      employee_id: shift.employee_id,
      work_date: workDate,
      start_time: shift.start_time,
      end_time: shift.end_time,
      position: shift.position,
      location: shift.location,
      notes: shift.notes,
      published: shift.published
    });
    created += 1;
  }

  await log(req.employee.id, 'shift', null, 'week_copied', `${from} → ${to} (${created} shifts)`);
  await notify({
    title: 'Schedule updated',
    body: `Week of ${to} is posted`,
    url: '/#schedule',
    exceptId: req.employee.id
  });
  res.json({ ok: true, created });
});

// ── Cover requests ────────────────────────────────────────────────────────────
router.post('/:id/cover-request', async (req, res) => {
  const shift = await get('SELECT * FROM shifts WHERE id=:id', { id: Number(req.params.id) });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (shift.employee_id !== req.employee.id && req.employee.role !== 'manager') {
    return res.status(403).json({ error: 'That is not your shift' });
  }

  await run(`UPDATE shifts SET cover_status='requested', cover_note=:note, cover_claimed_by=NULL
             WHERE id=:id`, { note: str(req.body.note, 300), id: shift.id });
  await log(req.employee.id, 'shift', shift.id, 'cover_requested', timeLabel(shift));
  await notify({
    title: 'Shift needs cover',
    body: `${req.employee.name} needs cover for ${timeLabel(shift)}`,
    url: '/#schedule',
    exceptId: req.employee.id
  });
  res.json({ ok: true });
});

router.post('/:id/cover-claim', async (req, res) => {
  const shift = await get('SELECT * FROM shifts WHERE id=:id', { id: Number(req.params.id) });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (shift.cover_status !== 'requested') {
    return res.status(400).json({ error: 'That shift is not open for cover' });
  }
  if (shift.employee_id === req.employee.id) {
    return res.status(400).json({ error: 'That is already your shift' });
  }

  await run("UPDATE shifts SET cover_status='claimed', cover_claimed_by=:me WHERE id=:id",
    { me: req.employee.id, id: shift.id });
  await log(req.employee.id, 'shift', shift.id, 'cover_claimed', timeLabel(shift));
  await notify({
    title: 'Cover offered',
    body: `${req.employee.name} can take ${timeLabel(shift)} — needs a manager OK`,
    url: '/#schedule',
    exceptId: req.employee.id
  });
  res.json({ ok: true });
});

/** Manager approval is what actually reassigns the shift. */
router.post('/:id/cover-approve', manager, async (req, res) => {
  const shift = await get('SELECT * FROM shifts WHERE id=:id', { id: Number(req.params.id) });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (shift.cover_status !== 'claimed' || !shift.cover_claimed_by) {
    return res.status(400).json({ error: 'Nobody has claimed that shift yet' });
  }

  const previous = await get('SELECT name FROM employees WHERE id=:id', { id: shift.employee_id });
  const taker = await get('SELECT name FROM employees WHERE id=:id', { id: shift.cover_claimed_by });

  await run(`UPDATE shifts SET employee_id=:taker, cover_status=NULL, cover_claimed_by=NULL,
    cover_note=NULL, notes=COALESCE(notes || ' · ', '') || :note WHERE id=:id`, {
    taker: shift.cover_claimed_by,
    note: `covering for ${previous?.name || 'staff'}`,
    id: shift.id
  });

  await log(req.employee.id, 'shift', shift.id, 'cover_approved', `${previous?.name} → ${taker?.name}`);
  await notify({
    title: 'Cover approved',
    body: `${taker?.name} now has ${timeLabel(shift)}`,
    url: '/#schedule'
  });
  res.json({ ok: true });
});

router.post('/:id/cover-cancel', async (req, res) => {
  const shift = await get('SELECT * FROM shifts WHERE id=:id', { id: Number(req.params.id) });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  const mine = shift.employee_id === req.employee.id || shift.cover_claimed_by === req.employee.id;
  if (!mine && req.employee.role !== 'manager') {
    return res.status(403).json({ error: 'Not your request' });
  }

  await run(`UPDATE shifts SET cover_status=NULL, cover_claimed_by=NULL, cover_note=NULL
             WHERE id=:id`, { id: shift.id });
  await log(req.employee.id, 'shift', shift.id, 'cover_cancelled', timeLabel(shift));
  res.json({ ok: true });
});

module.exports = router;
