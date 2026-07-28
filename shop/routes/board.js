const express = require('express');
const { all, get, run, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
const { notify } = require('../lib/push');
const { str, intOr } = require('../lib/validate');

const router = express.Router();
router.use(auth);

const BOARD_SELECT = `
  SELECT a.*, e.name AS author_name, e.color AS author_color,
         (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count,
         EXISTS(SELECT 1 FROM announcement_reads r
                WHERE r.announcement_id = a.id AND r.employee_id = :me) AS read_by_me
  FROM announcements a
  LEFT JOIN employees e ON e.id = a.author_id
`;

router.get('/', async (req, res) => {
  const limit = Math.min(intOr(req.query.limit, 40), 200);
  const rows = await all(`${BOARD_SELECT}
    ORDER BY a.pinned DESC, a.created_at DESC LIMIT ${limit}`, { me: req.employee.id });
  const staffCount = (await get('SELECT COUNT(*) AS n FROM employees WHERE active=1')).n;

  const posts = await Promise.all(rows.map(async (row) => ({
    ...row,
    read_by_me: !!row.read_by_me,
    readers: await all(`SELECT e.name, e.color, r.read_at FROM announcement_reads r
      JOIN employees e ON e.id = r.employee_id
      WHERE r.announcement_id=:id ORDER BY r.read_at`, { id: row.id })
  })));

  res.json({ staff_count: staffCount, posts });
});

router.get('/unread-count', async (req, res) => {
  const { n } = await get(`SELECT COUNT(*) AS n FROM announcements a
    WHERE NOT EXISTS (SELECT 1 FROM announcement_reads r
      WHERE r.announcement_id = a.id AND r.employee_id = :me)`, { me: req.employee.id });
  res.json({ unread: n });
});

router.post('/', async (req, res) => {
  const body = str(req.body.body, 2000);
  if (!body) return res.status(400).json({ error: 'Write something first' });
  const pinned = req.body.pinned ? 1 : 0;

  const result = await run(
    'INSERT INTO announcements (body,author_id,pinned) VALUES (:body,:author,:pinned)',
    { body, author: req.employee.id, pinned }
  );
  // Authors have obviously read their own post.
  await run('INSERT OR IGNORE INTO announcement_reads (announcement_id,employee_id) VALUES (:id,:me)',
    { id: result.lastInsertRowid, me: req.employee.id });
  await log(req.employee.id, 'announcement', result.lastInsertRowid, 'posted', body.slice(0, 80));

  await notify({
    title: `${req.employee.name} posted on the board`,
    body: body.slice(0, 120),
    url: '/#board',
    exceptId: req.employee.id
  });
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

/** Read receipts are how "everyone is up to date" becomes checkable. */
router.post('/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  if (!await get('SELECT 1 AS ok FROM announcements WHERE id=:id', { id })) {
    return res.status(404).json({ error: 'Post not found' });
  }
  await run('INSERT OR IGNORE INTO announcement_reads (announcement_id,employee_id) VALUES (:id,:me)',
    { id, me: req.employee.id });
  res.json({ ok: true });
});

router.post('/:id/pin', manager, async (req, res) => {
  const post = await get('SELECT * FROM announcements WHERE id=:id', { id: Number(req.params.id) });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const pinned = post.pinned ? 0 : 1;
  await run('UPDATE announcements SET pinned=:pinned WHERE id=:id', { pinned, id: post.id });
  await log(req.employee.id, 'announcement', post.id, pinned ? 'pinned' : 'unpinned');
  res.json({ ok: true, pinned: !!pinned });
});

router.delete('/:id', async (req, res) => {
  const post = await get('SELECT * FROM announcements WHERE id=:id', { id: Number(req.params.id) });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.author_id !== req.employee.id && req.employee.role !== 'manager') {
    return res.status(403).json({ error: 'Only the author or a manager can delete this' });
  }
  await run('DELETE FROM announcements WHERE id=:id', { id: post.id });
  await log(req.employee.id, 'announcement', post.id, 'deleted');
  res.json({ ok: true });
});

module.exports = router;
