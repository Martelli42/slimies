const express = require('express');
const { db, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
const { broadcast } = require('../lib/bus');
const { today, addDays, isDate } = require('../lib/dates');
const { str, intOr, oneOf } = require('../lib/validate');

const router = express.Router();
router.use(auth);

const SHIFTS = ['opening', 'mid', 'closing'];

function businessDate(value) {
  return isDate(value) ? value : today();
}

/** Checklist for one day: every active template plus who ticked it, if anyone. */
router.get('/', (req, res) => {
  const day = businessDate(req.query.date);
  const shift = oneOf(req.query.shift, SHIFTS);

  const rows = db.prepare(`
    SELECT t.id, t.shift, t.title, t.area, t.sort_order,
           c.id AS completion_id, c.completed_at, c.note, c.employee_id,
           e.name AS employee_name, e.color AS employee_color
    FROM task_templates t
    LEFT JOIN task_completions c ON c.template_id = t.id AND c.business_date = @day
    LEFT JOIN employees e ON e.id = c.employee_id
    WHERE t.active = 1 ${shift ? 'AND t.shift = @shift' : ''}
    ORDER BY CASE t.shift WHEN 'opening' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END,
             t.sort_order, t.id`).all({ day, shift });

  const shifts = {};
  for (const name of shift ? [shift] : SHIFTS) shifts[name] = { done: 0, total: 0, tasks: [] };
  for (const row of rows) {
    const bucket = shifts[row.shift];
    if (!bucket) continue;
    bucket.total += 1;
    if (row.completion_id) bucket.done += 1;
    bucket.tasks.push({ ...row, done: !!row.completion_id });
  }

  res.json({ business_date: day, shifts });
});

/** Tick or untick a task. Anyone on shift can do either; both are logged. */
router.post('/:templateId/toggle', (req, res) => {
  const template = db.prepare('SELECT * FROM task_templates WHERE id=?').get(req.params.templateId);
  if (!template) return res.status(404).json({ error: 'Task not found' });

  const day = businessDate(req.body.business_date);
  const existing = db.prepare(
    'SELECT * FROM task_completions WHERE template_id=? AND business_date=?'
  ).get(template.id, day);

  let done;
  if (existing) {
    db.prepare('DELETE FROM task_completions WHERE id=?').run(existing.id);
    log(req.employee.id, 'task', template.id, 'unchecked', `${day} · ${template.title}`);
    done = false;
  } else {
    db.prepare(`INSERT INTO task_completions (template_id,business_date,employee_id,note)
                VALUES (?,?,?,?)`).run(template.id, day, req.employee.id, str(req.body.note, 300));
    log(req.employee.id, 'task', template.id, 'checked', `${day} · ${template.title}`);
    done = true;
  }

  broadcast('tasks', { business_date: day });
  res.json({ ok: true, done });
});

/** Progress for the last N days — how consistently the lists get finished. */
router.get('/history', (req, res) => {
  const days = Math.min(intOr(req.query.days, 14), 90);
  const rows = db.prepare(`
    SELECT c.business_date, t.shift, COUNT(*) AS done
    FROM task_completions c JOIN task_templates t ON t.id = c.template_id
    WHERE c.business_date >= @since
    GROUP BY c.business_date, t.shift
    ORDER BY c.business_date DESC`).all({ since: addDays(today(), -days) });

  const totals = {};
  for (const row of db.prepare(
    'SELECT shift, COUNT(*) AS total FROM task_templates WHERE active=1 GROUP BY shift'
  ).all()) totals[row.shift] = row.total;

  res.json({ totals, rows });
});

// ── Template management (managers) ────────────────────────────────────────────
router.get('/templates', manager, (req, res) => {
  res.json(db.prepare(`SELECT * FROM task_templates ORDER BY
    CASE shift WHEN 'opening' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END, sort_order, id`).all());
});

router.post('/templates', manager, (req, res) => {
  const title = str(req.body.title, 200);
  const shift = oneOf(req.body.shift, SHIFTS);
  if (!title || !shift) return res.status(400).json({ error: 'Shift and title are required' });

  const fields = {
    title,
    shift,
    area: str(req.body.area, 40),
    active: req.body.active === false || req.body.active === 0 ? 0 : 1
  };
  const id = Number(req.body.id) || null;

  if (id) {
    db.prepare('UPDATE task_templates SET title=@title,shift=@shift,area=@area,active=@active WHERE id=@id')
      .run({ ...fields, id });
    log(req.employee.id, 'task_template', id, 'updated', title);
  } else {
    const next = db.prepare('SELECT COALESCE(MAX(sort_order),0)+10 AS n FROM task_templates WHERE shift=?')
      .get(shift).n;
    const result = db.prepare(`INSERT INTO task_templates (shift,title,area,sort_order,active)
      VALUES (@shift,@title,@area,@sort_order,@active)`).run({ ...fields, sort_order: next });
    log(req.employee.id, 'task_template', result.lastInsertRowid, 'created', title);
  }

  broadcast('tasks');
  res.json({ ok: true });
});

router.post('/templates/reorder', manager, (req, res) => {
  const order = Array.isArray(req.body.order) ? req.body.order : [];
  const update = db.prepare('UPDATE task_templates SET sort_order=? WHERE id=?');
  db.transaction(() => order.forEach((id, i) => update.run(i * 10, Number(id))))();
  broadcast('tasks');
  res.json({ ok: true });
});

/** Retires a task instead of deleting it, so old checklists stay readable. */
router.delete('/templates/:id', manager, (req, res) => {
  const result = db.prepare('UPDATE task_templates SET active=0 WHERE id=?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Task not found' });
  log(req.employee.id, 'task_template', Number(req.params.id), 'retired');
  broadcast('tasks');
  res.json({ ok: true });
});

module.exports = router;
