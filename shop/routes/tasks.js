const express = require('express');
const { all, get, run, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
const { today, addDays, isDate } = require('../lib/dates');
const { str, intOr, oneOf } = require('../lib/validate');

const router = express.Router();
router.use(auth);

const SHIFTS = ['opening', 'mid', 'closing'];

function businessDate(value) {
  return isDate(value) ? value : today();
}

/** Checklist for one day: every active template plus who ticked it, if anyone. */
router.get('/', async (req, res) => {
  const day = businessDate(req.query.date);
  const shift = oneOf(req.query.shift, SHIFTS);

  const rows = await all(`
    SELECT t.id, t.shift, t.title, t.area, t.sort_order,
           c.id AS completion_id, c.completed_at, c.note, c.employee_id,
           e.name AS employee_name, e.color AS employee_color
    FROM task_templates t
    LEFT JOIN task_completions c ON c.template_id = t.id AND c.business_date = :day
    LEFT JOIN employees e ON e.id = c.employee_id
    WHERE t.active = 1 ${shift ? 'AND t.shift = :shift' : ''}
    ORDER BY CASE t.shift WHEN 'opening' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END,
             t.sort_order, t.id`, shift ? { day, shift } : { day });

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
router.post('/:templateId/toggle', async (req, res) => {
  const template = await get('SELECT * FROM task_templates WHERE id=:id',
    { id: Number(req.params.templateId) });
  if (!template) return res.status(404).json({ error: 'Task not found' });

  const day = businessDate(req.body.business_date);
  const existing = await get(
    'SELECT * FROM task_completions WHERE template_id=:id AND business_date=:day',
    { id: template.id, day }
  );

  let done;
  if (existing) {
    await run('DELETE FROM task_completions WHERE id=:id', { id: existing.id });
    await log(req.employee.id, 'task', template.id, 'unchecked', `${day} · ${template.title}`);
    done = false;
  } else {
    await run(`INSERT INTO task_completions (template_id,business_date,employee_id,note)
               VALUES (:id,:day,:employee_id,:note)`, {
      id: template.id, day, employee_id: req.employee.id, note: str(req.body.note, 300)
    });
    await log(req.employee.id, 'task', template.id, 'checked', `${day} · ${template.title}`);
    done = true;
  }

  res.json({ ok: true, done });
});

/** Progress for the last N days — how consistently the lists get finished. */
router.get('/history', async (req, res) => {
  const days = Math.min(intOr(req.query.days, 14), 90);
  const rows = await all(`
    SELECT c.business_date, t.shift, COUNT(*) AS done
    FROM task_completions c JOIN task_templates t ON t.id = c.template_id
    WHERE c.business_date >= :since
    GROUP BY c.business_date, t.shift
    ORDER BY c.business_date DESC`, { since: addDays(today(), -days) });

  const totals = {};
  for (const row of await all(
    'SELECT shift, COUNT(*) AS total FROM task_templates WHERE active=1 GROUP BY shift'
  )) totals[row.shift] = row.total;

  res.json({ totals, rows });
});

// ── Template management (managers) ────────────────────────────────────────────
router.get('/templates', manager, async (req, res) => {
  res.json(await all(`SELECT * FROM task_templates ORDER BY
    CASE shift WHEN 'opening' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END, sort_order, id`));
});

router.post('/templates', manager, async (req, res) => {
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

  try {
    if (id) {
      await run(`UPDATE task_templates SET title=:title,shift=:shift,area=:area,active=:active
                 WHERE id=:id`, { ...fields, id });
      await log(req.employee.id, 'task_template', id, 'updated', title);
    } else {
      const next = (await get(
        'SELECT COALESCE(MAX(sort_order),0)+10 AS n FROM task_templates WHERE shift=:shift', { shift }
      )).n;
      const result = await run(`INSERT INTO task_templates (shift,title,area,sort_order,active)
        VALUES (:shift,:title,:area,:sort_order,:active)`, { ...fields, sort_order: next });
      await log(req.employee.id, 'task_template', result.lastInsertRowid, 'created', title);
    }
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That task is already on this list' });
    }
    throw err;
  }

  res.json({ ok: true });
});

router.post('/templates/reorder', manager, async (req, res) => {
  const order = Array.isArray(req.body.order) ? req.body.order : [];
  for (const [index, id] of order.entries()) {
    await run('UPDATE task_templates SET sort_order=:sort WHERE id=:id',
      { sort: index * 10, id: Number(id) });
  }
  res.json({ ok: true });
});

/** Retires a task instead of deleting it, so old checklists stay readable. */
router.delete('/templates/:id', manager, async (req, res) => {
  const result = await run('UPDATE task_templates SET active=0 WHERE id=:id',
    { id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: 'Task not found' });
  await log(req.employee.id, 'task_template', Number(req.params.id), 'retired');
  res.json({ ok: true });
});

module.exports = router;
