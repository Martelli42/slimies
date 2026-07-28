const express = require('express');
const { db, log } = require('../lib/db');
const { auth, manager } = require('../lib/auth');
const { broadcast } = require('../lib/bus');
const { notify } = require('../lib/push');
const { str, intOr } = require('../lib/validate');

const router = express.Router();
router.use(auth);

const BOARD_SELECT = `
  SELECT a.*, e.name AS author_name, e.color AS author_color,
         (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count,
         EXISTS(SELECT 1 FROM announcement_reads r
                WHERE r.announcement_id = a.id AND r.employee_id = @me) AS read_by_me
  FROM announcements a
  LEFT JOIN employees e ON e.id = a.author_id
`;

router.get('/', (req, res) => {
  const limit = Math.min(intOr(req.query.limit, 40), 200);
  const rows = db.prepare(`${BOARD_SELECT}
    ORDER BY a.pinned DESC, a.created_at DESC LIMIT ${limit}`).all({ me: req.employee.id });
  const staffCount = db.prepare('SELECT COUNT(*) AS n FROM employees WHERE active=1').get().n;

  res.json({
    staff_count: staffCount,
    posts: rows.map((row) => ({
      ...row,
      read_by_me: !!row.read_by_me,
      readers: db.prepare(`SELECT e.name, e.color, r.read_at FROM announcement_reads r
        JOIN employees e ON e.id = r.employee_id
        WHERE r.announcement_id=? ORDER BY r.read_at`).all(row.id)
    }))
  });
});

router.get('/unread-count', (req, res) => {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM announcements a
    WHERE NOT EXISTS (SELECT 1 FROM announcement_reads r
      WHERE r.announcement_id = a.id AND r.employee_id = ?)`).get(req.employee.id);
  res.json({ unread: n });
});

router.post('/', (req, res) => {
  const body = str(req.body.body, 2000);
  if (!body) return res.status(400).json({ error: 'Write something first' });
  const pinned = req.body.pinned ? 1 : 0;

  const result = db.prepare('INSERT INTO announcements (body,author_id,pinned) VALUES (?,?,?)')
    .run(body, req.employee.id, pinned);
  // Authors have obviously read their own post.
  db.prepare('INSERT OR IGNORE INTO announcement_reads (announcement_id,employee_id) VALUES (?,?)')
    .run(result.lastInsertRowid, req.employee.id);
  log(req.employee.id, 'announcement', result.lastInsertRowid, 'posted', body.slice(0, 80));

  broadcast('board');
  notify({
    title: `${req.employee.name} posted on the board`,
    body: body.slice(0, 120),
    url: '/#board',
    exceptId: req.employee.id
  });
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

/** Read receipts are how "everyone is up to date" becomes checkable. */
router.post('/:id/read', (req, res) => {
  const exists = db.prepare('SELECT 1 FROM announcements WHERE id=?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Post not found' });
  db.prepare('INSERT OR IGNORE INTO announcement_reads (announcement_id,employee_id) VALUES (?,?)')
    .run(req.params.id, req.employee.id);
  broadcast('board');
  res.json({ ok: true });
});

router.post('/:id/pin', manager, (req, res) => {
  const post = db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const pinned = post.pinned ? 0 : 1;
  db.prepare('UPDATE announcements SET pinned=? WHERE id=?').run(pinned, post.id);
  log(req.employee.id, 'announcement', post.id, pinned ? 'pinned' : 'unpinned');
  broadcast('board');
  res.json({ ok: true, pinned: !!pinned });
});

router.delete('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.author_id !== req.employee.id && req.employee.role !== 'manager') {
    return res.status(403).json({ error: 'Only the author or a manager can delete this' });
  }
  db.prepare('DELETE FROM announcements WHERE id=?').run(post.id);
  log(req.employee.id, 'announcement', post.id, 'deleted');
  broadcast('board');
  res.json({ ok: true });
});

module.exports = router;
