const express = require('express');
const { db, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
const { broadcast } = require('../lib/bus');
const { notify } = require('../lib/push');
const { today, addDays, isDate, isTime } = require('../lib/dates');
const { str, intOr, oneOf } = require('../lib/validate');

const router = express.Router();
router.use(auth);

const STATUSES = ['confirmed', 'tentative', 'cancelled'];

const EVENT_SELECT = `
  SELECT t.*, e.name AS created_by_name
  FROM trailer_events t
  LEFT JOIN employees e ON e.id = t.created_by
`;

/** Staff assigned to an event, taken from trailer shifts on the schedule. */
function crewFor(eventId) {
  return db.prepare(`
    SELECT s.id AS shift_id, s.start_time, s.end_time, s.position,
           e.id AS employee_id, e.name, e.color
    FROM shifts s JOIN employees e ON e.id = s.employee_id
    WHERE s.trailer_event_id = ? ORDER BY s.start_time, e.name`).all(eventId);
}

/** Calendar feed. Defaults to this month plus the next two. */
router.get('/', (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : addDays(today(), -14);
  const to = isDate(req.query.to) ? req.query.to : addDays(from, 120);
  const rows = db.prepare(`${EVENT_SELECT} WHERE t.event_date BETWEEN ? AND ?
    ORDER BY t.event_date, t.start_time`).all(from, to);
  res.json({
    from,
    to,
    events: rows.map((row) => ({ ...row, crew: crewFor(row.id) }))
  });
});

router.get('/:id', (req, res) => {
  const event = db.prepare(`${EVENT_SELECT} WHERE t.id=?`).get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ ...event, crew: crewFor(event.id) });
});

router.post('/', manager, (req, res) => {
  const title = str(req.body.title, 120);
  const eventDate = isDate(req.body.event_date) ? req.body.event_date : null;
  if (!title || !eventDate) return res.status(400).json({ error: 'Title and date are required' });

  const startTime = isTime(req.body.start_time) ? req.body.start_time : null;
  const endTime = isTime(req.body.end_time) ? req.body.end_time : null;
  if (startTime && endTime && endTime <= startTime) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }

  const fields = {
    title,
    event_date: eventDate,
    start_time: startTime,
    end_time: endTime,
    location: str(req.body.location, 120),
    address: str(req.body.address, 200),
    contact: str(req.body.contact, 120),
    status: oneOf(req.body.status, STATUSES) || 'confirmed',
    menu: str(req.body.menu, 1000),
    notes: str(req.body.notes, 1000)
  };

  const id = Number(req.body.id) || null;
  let eventId = id;
  if (id) {
    const result = db.prepare(`UPDATE trailer_events SET title=@title,event_date=@event_date,
      start_time=@start_time,end_time=@end_time,location=@location,address=@address,contact=@contact,
      status=@status,menu=@menu,notes=@notes WHERE id=@id`).run({ ...fields, id });
    if (!result.changes) return res.status(404).json({ error: 'Event not found' });
    log(req.employee.id, 'trailer_event', id, 'updated', `${title} · ${eventDate}`);
  } else {
    const result = db.prepare(`INSERT INTO trailer_events
      (title,event_date,start_time,end_time,location,address,contact,status,menu,notes,created_by)
      VALUES (@title,@event_date,@start_time,@end_time,@location,@address,@contact,@status,@menu,@notes,@created_by)`)
      .run({ ...fields, created_by: req.employee.id });
    eventId = Number(result.lastInsertRowid);
    log(req.employee.id, 'trailer_event', eventId, 'created', `${title} · ${eventDate}`);
    notify({
      title: 'New trailer booking',
      body: `${title} — ${eventDate}${fields.location ? ` at ${fields.location}` : ''}`,
      url: '/#trailer',
      exceptId: req.employee.id
    });
  }

  broadcast('trailer');
  res.json({ ok: true, id: eventId });
});

router.delete('/:id', manager, (req, res) => {
  const event = db.prepare('SELECT * FROM trailer_events WHERE id=?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM trailer_events WHERE id=?').run(event.id);
  log(req.employee.id, 'trailer_event', event.id, 'deleted', `${event.title} · ${event.event_date}`);
  broadcast('trailer');
  broadcast('schedule');
  res.json({ ok: true });
});

/** Assigning crew creates a real trailer shift, so it shows on the schedule too. */
router.post('/:id/crew', manager, (req, res) => {
  const event = db.prepare('SELECT * FROM trailer_events WHERE id=?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const employeeId = Number(req.body.employee_id) || null;
  if (!employeeId || !db.prepare('SELECT 1 FROM employees WHERE id=? AND active=1').get(employeeId)) {
    return res.status(400).json({ error: 'Pick an active employee' });
  }

  const startTime = isTime(req.body.start_time) ? req.body.start_time
    : (event.start_time || '08:00');
  const endTime = isTime(req.body.end_time) ? req.body.end_time
    : (event.end_time || '16:00');
  if (endTime <= startTime) return res.status(400).json({ error: 'End time must be after start time' });

  const existing = db.prepare(
    'SELECT 1 FROM shifts WHERE trailer_event_id=? AND employee_id=?'
  ).get(event.id, employeeId);
  if (existing) return res.status(409).json({ error: 'Already on this event' });

  // No notes: the schedule already shows the event title from the join.
  db.prepare(`INSERT INTO shifts
    (employee_id,work_date,start_time,end_time,position,location,trailer_event_id,notes)
    VALUES (?,?,?,?,?,'trailer',?,NULL)`)
    .run(employeeId, event.event_date, startTime, endTime,
      str(req.body.position, 40) || 'Trailer', event.id);

  log(req.employee.id, 'trailer_event', event.id, 'crew_added', String(employeeId));
  broadcast('trailer');
  broadcast('schedule');
  res.json({ ok: true, crew: crewFor(event.id) });
});

router.delete('/:id/crew/:shiftId', manager, (req, res) => {
  const result = db.prepare('DELETE FROM shifts WHERE id=? AND trailer_event_id=?')
    .run(req.params.shiftId, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not on this event' });
  log(req.employee.id, 'trailer_event', Number(req.params.id), 'crew_removed', req.params.shiftId);
  broadcast('trailer');
  broadcast('schedule');
  res.json({ ok: true, crew: crewFor(req.params.id) });
});

/** Next few bookings, for the Today screen. */
router.get('/feed/upcoming', (req, res) => {
  const limit = Math.min(intOr(req.query.limit, 5), 20);
  const rows = db.prepare(`${EVENT_SELECT}
    WHERE t.event_date >= ? AND t.status != 'cancelled'
    ORDER BY t.event_date, t.start_time LIMIT ${limit}`).all(today());
  res.json(rows.map((row) => ({ ...row, crew: crewFor(row.id) })));
});

module.exports = router;
