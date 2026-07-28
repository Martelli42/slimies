const express = require('express');
const { all, get, run, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
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
  return all(`
    SELECT s.id AS shift_id, s.start_time, s.end_time, s.position,
           e.id AS employee_id, e.name, e.color
    FROM shifts s JOIN employees e ON e.id = s.employee_id
    WHERE s.trailer_event_id = :id ORDER BY s.start_time, e.name`, { id: Number(eventId) });
}

async function withCrew(events) {
  return Promise.all(events.map(async (event) => ({ ...event, crew: await crewFor(event.id) })));
}

/** Calendar feed. Defaults to a couple of weeks back through the next few months. */
router.get('/', async (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : addDays(today(), -14);
  const to = isDate(req.query.to) ? req.query.to : addDays(from, 120);
  const rows = await all(`${EVENT_SELECT} WHERE t.event_date BETWEEN :from AND :to
    ORDER BY t.event_date, t.start_time`, { from, to });
  res.json({ from, to, events: await withCrew(rows) });
});

router.get('/:id', async (req, res) => {
  const event = await get(`${EVENT_SELECT} WHERE t.id=:id`, { id: Number(req.params.id) });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ ...event, crew: await crewFor(event.id) });
});

router.post('/', manager, async (req, res) => {
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
    const result = await run(`UPDATE trailer_events SET title=:title,event_date=:event_date,
      start_time=:start_time,end_time=:end_time,location=:location,address=:address,contact=:contact,
      status=:status,menu=:menu,notes=:notes WHERE id=:id`, { ...fields, id });
    if (!result.changes) return res.status(404).json({ error: 'Event not found' });
    await log(req.employee.id, 'trailer_event', id, 'updated', `${title} · ${eventDate}`);
  } else {
    const result = await run(`INSERT INTO trailer_events
      (title,event_date,start_time,end_time,location,address,contact,status,menu,notes,created_by)
      VALUES (:title,:event_date,:start_time,:end_time,:location,:address,:contact,:status,:menu,:notes,:created_by)`,
      { ...fields, created_by: req.employee.id });
    eventId = result.lastInsertRowid;
    await log(req.employee.id, 'trailer_event', eventId, 'created', `${title} · ${eventDate}`);
    await notify({
      title: 'New trailer booking',
      body: `${title} — ${eventDate}${fields.location ? ` at ${fields.location}` : ''}`,
      url: '/#trailer',
      exceptId: req.employee.id
    });
  }

  res.json({ ok: true, id: eventId });
});

router.delete('/:id', manager, async (req, res) => {
  const event = await get('SELECT * FROM trailer_events WHERE id=:id', { id: Number(req.params.id) });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  await run('DELETE FROM trailer_events WHERE id=:id', { id: event.id });
  await log(req.employee.id, 'trailer_event', event.id, 'deleted', `${event.title} · ${event.event_date}`);
  res.json({ ok: true });
});

/** Assigning crew creates a real trailer shift, so it shows on the schedule too. */
router.post('/:id/crew', manager, async (req, res) => {
  const event = await get('SELECT * FROM trailer_events WHERE id=:id', { id: Number(req.params.id) });
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const employeeId = Number(req.body.employee_id) || null;
  if (!employeeId
    || !await get('SELECT 1 AS ok FROM employees WHERE id=:id AND active=1', { id: employeeId })) {
    return res.status(400).json({ error: 'Pick an active employee' });
  }

  const startTime = isTime(req.body.start_time) ? req.body.start_time : (event.start_time || '08:00');
  const endTime = isTime(req.body.end_time) ? req.body.end_time : (event.end_time || '16:00');
  if (endTime <= startTime) return res.status(400).json({ error: 'End time must be after start time' });

  const existing = await get(
    'SELECT 1 AS ok FROM shifts WHERE trailer_event_id=:event AND employee_id=:employee',
    { event: event.id, employee: employeeId }
  );
  if (existing) return res.status(409).json({ error: 'Already on this event' });

  // No notes: the schedule already shows the event title from the join.
  await run(`INSERT INTO shifts
    (employee_id,work_date,start_time,end_time,position,location,trailer_event_id,notes)
    VALUES (:employee,:work_date,:start_time,:end_time,:position,'trailer',:event,NULL)`, {
    employee: employeeId,
    work_date: event.event_date,
    start_time: startTime,
    end_time: endTime,
    position: str(req.body.position, 40) || 'Trailer',
    event: event.id
  });

  await log(req.employee.id, 'trailer_event', event.id, 'crew_added', String(employeeId));
  res.json({ ok: true, crew: await crewFor(event.id) });
});

router.delete('/:id/crew/:shiftId', manager, async (req, res) => {
  const result = await run('DELETE FROM shifts WHERE id=:shift AND trailer_event_id=:event',
    { shift: Number(req.params.shiftId), event: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: 'Not on this event' });
  await log(req.employee.id, 'trailer_event', Number(req.params.id), 'crew_removed', req.params.shiftId);
  res.json({ ok: true, crew: await crewFor(req.params.id) });
});

/** Next few bookings, for the Today screen. */
router.get('/feed/upcoming', async (req, res) => {
  const limit = Math.min(intOr(req.query.limit, 5), 20);
  const rows = await all(`${EVENT_SELECT}
    WHERE t.event_date >= :from AND t.status != 'cancelled'
    ORDER BY t.event_date, t.start_time LIMIT ${limit}`, { from: today() });
  res.json(await withCrew(rows));
});

module.exports = router;
