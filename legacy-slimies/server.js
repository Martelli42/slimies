const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const webpush = require('web-push');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new Database('slimies.db');

const JWT_SECRET        = process.env.JWT_SECRET        || 'slimies_secret_dev';
const GOOGLE_CLIENT_ID  = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BASE_URL          = process.env.BASE_URL          || 'http://localhost:3000';
const VAPID_PUBLIC      = process.env.VAPID_PUBLIC      || 'BEXH86UZx5O6oXqXEoluXBa4J4w9wLpw_6qi0ZUDufmbgpnI-DvxWXNta7sqE8B4pywMcxTE9u6R9l4l6XCfv7w';
const VAPID_PRIVATE     = process.env.VAPID_PRIVATE     || 'leXiaiJEZhMY576mXxMpBWXys2zFeQg-VzQCLf2FioM';

webpush.setVapidDetails('mailto:slimies@app.com', VAPID_PUBLIC, VAPID_PRIVATE);

// ── Database ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    slime_color TEXT DEFAULT 'blue',
    partner_id INTEGER,
    push_sub TEXT
  );
  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    code TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS moods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hungry   INTEGER DEFAULT 0,
    tired    INTEGER DEFAULT 0,
    sad      INTEGER DEFAULT 0,
    need_attention INTEGER DEFAULT 0,
    stressed INTEGER DEFAULT 0,
    happy    INTEGER DEFAULT 1,
    alone_time INTEGER DEFAULT 0,
    miss_you INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id   INTEGER NOT NULL,
    type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Auth ──────────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(session({ secret: JWT_SECRET, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

if (!GOOGLE_CLIENT_ID) console.warn('⚠️  GOOGLE_CLIENT_ID not set — Google login disabled');

if (GOOGLE_CLIENT_ID) passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: `${BASE_URL}/auth/google/callback`
}, (_, __, profile, done) => {
  const email = profile.emails?.[0]?.value || '';
  let user = db.prepare('SELECT * FROM users WHERE google_id=?').get(profile.id);
  let isNew = false;
  if (!user) {
    const r = db.prepare('INSERT INTO users (google_id,display_name,email) VALUES (?,?,?)').run(profile.id, profile.displayName||'Slimie', email);
    user = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    isNew = true;
  }
  user.isNew = isNew;
  done(null, user);
}));

passport.serializeUser((u, done) => done(null, u.id));
passport.deserializeUser((id, done) => done(null, db.prepare('SELECT * FROM users WHERE id=?').get(id)));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile','email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect:'/' }), (req, res) => {
  const token = jwt.sign({ id: req.user.id }, JWT_SECRET);
  res.redirect(`/?token=${token}&new=${req.user.isNew?'1':'0'}`);
});

// ── Middleware ────────────────────────────────────────────────────────────────
function auth(req, res, next) {
  try {
    const { id } = jwt.verify(req.headers.authorization, JWT_SECRET);
    req.userId = id;
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
}

// ── API ───────────────────────────────────────────────────────────────────────
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT id,display_name,slime_color,partner_id FROM users WHERE id=?').get(req.userId);
  const mood = db.prepare('SELECT * FROM moods WHERE user_id=? ORDER BY id DESC LIMIT 1').get(req.userId);
  res.json({ user, mood: mood || null });
});

app.get('/api/partner', auth, (req, res) => {
  const me = db.prepare('SELECT partner_id FROM users WHERE id=?').get(req.userId);
  if (!me?.partner_id) return res.json({ partner: null });
  const partner = db.prepare('SELECT id,display_name,slime_color FROM users WHERE id=?').get(me.partner_id);
  const mood = db.prepare('SELECT * FROM moods WHERE user_id=? ORDER BY id DESC LIMIT 1').get(me.partner_id);
  res.json({ partner, mood: mood || null });
});

app.post('/api/setup', auth, (req, res) => {
  const { display_name, slime_color } = req.body;
  if (display_name) db.prepare('UPDATE users SET display_name=? WHERE id=?').run(display_name.trim(), req.userId);
  if (slime_color)  db.prepare('UPDATE users SET slime_color=? WHERE id=?').run(slime_color, req.userId);
  res.json({ ok: true });
});

// Invite codes
app.post('/api/invite/generate', auth, (req, res) => {
  db.prepare('DELETE FROM invite_codes WHERE user_id=?').run(req.userId);
  const code = uuidv4().slice(0,6).toUpperCase();
  db.prepare('INSERT INTO invite_codes (user_id,code) VALUES (?,?)').run(req.userId, code);
  res.json({ code });
});

app.post('/api/invite/accept', auth, (req, res) => {
  const { code } = req.body;
  const inv = db.prepare('SELECT * FROM invite_codes WHERE code=?').get(code?.toUpperCase());
  if (!inv) return res.status(404).json({ error: 'Invalid code' });
  if (inv.user_id === req.userId) return res.status(400).json({ error: "That's your own code!" });

  // Check neither already paired
  const me = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  const them = db.prepare('SELECT * FROM users WHERE id=?').get(inv.user_id);
  if (me.partner_id || them.partner_id) return res.status(400).json({ error: 'Already paired' });

  db.prepare('UPDATE users SET partner_id=? WHERE id=?').run(inv.user_id, req.userId);
  db.prepare('UPDATE users SET partner_id=? WHERE id=?').run(req.userId, inv.user_id);
  db.prepare('DELETE FROM invite_codes WHERE code=?').run(code.toUpperCase());

  // Notify partner via socket if online
  const partnerSocket = [...io.sockets.sockets.values()].find(s => s.userId === inv.user_id);
  if (partnerSocket) partnerSocket.emit('paired', { partnerId: req.userId });

  res.json({ ok: true, partnerId: inv.user_id });
});

// Mood
app.post('/api/mood/update', auth, (req, res) => {
  const { hungry=0, tired=0, sad=0, need_attention=0, stressed=0, happy=0, alone_time=0, miss_you=0 } = req.body;
  db.prepare(`INSERT INTO moods (user_id,hungry,tired,sad,need_attention,stressed,happy,alone_time,miss_you)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(req.userId, hungry, tired, sad, need_attention, stressed, happy, alone_time, miss_you);

  const me = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  const mood = { hungry, tired, sad, need_attention, stressed, happy, alone_time, miss_you };

  // Emit to partner via socket
  if (me.partner_id) {
    const ps = [...io.sockets.sockets.values()].find(s => s.userId === me.partner_id);
    if (ps) ps.emit('partner-mood', { mood, from: req.userId });
  }

  // Push notification to partner
  if (me.partner_id) {
    const partner = db.prepare('SELECT push_sub FROM users WHERE id=?').get(me.partner_id);
    if (partner?.push_sub) {
      try {
        const dominant = getDominantMood(mood);
        const moodEmoji = { hungry:'🍕', tired:'😴', sad:'😢', need_attention:'🤗', stressed:'😰', happy:'😊', alone_time:'🧘', miss_you:'💕', ok:'✨' };
        webpush.sendNotification(JSON.parse(partner.push_sub), JSON.stringify({
          title: `${me.display_name} updated their slime`,
          body: `They're feeling: ${moodEmoji[dominant]} ${dominant.replace('_',' ')}`,
          icon: '/icon-192.png'
        })).catch(() => {});
      } catch {}
    }
  }

  res.json({ ok: true });
});

app.get('/api/mood/history', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT date(created_at) as day,
      AVG(hungry) as hungry, AVG(tired) as tired, AVG(sad) as sad,
      AVG(need_attention) as need_attention, AVG(stressed) as stressed,
      AVG(happy) as happy, AVG(alone_time) as alone_time, AVG(miss_you) as miss_you
    FROM moods WHERE user_id=? AND created_at >= date('now','-6 days')
    GROUP BY day ORDER BY day ASC
  `).all(req.userId);
  res.json(rows);
});

// Interaction
app.post('/api/interaction', auth, (req, res) => {
  const { type } = req.body;
  const me = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
  if (!me.partner_id) return res.status(400).json({ error: 'No partner' });

  db.prepare('INSERT INTO interactions (from_user_id,to_user_id,type) VALUES (?,?,?)').run(req.userId, me.partner_id, type);

  const ps = [...io.sockets.sockets.values()].find(s => s.userId === me.partner_id);
  if (ps) ps.emit('interaction', { type, from: req.userId, fromName: me.display_name });

  // Push notification
  const partner = db.prepare('SELECT push_sub,display_name FROM users WHERE id=?').get(me.partner_id);
  if (partner?.push_sub) {
    try {
      const icons = { feed:'🍕', hug:'🤗', cheer:'✨', love:'💕' };
      webpush.sendNotification(JSON.parse(partner.push_sub), JSON.stringify({
        title: `${me.display_name} sent you ${icons[type]||'something'}!`,
        body: `Open Slimies to see!`,
        icon: '/icon-192.png'
      })).catch(() => {});
    } catch {}
  }

  res.json({ ok: true });
});

// Push subscription
app.post('/api/push/subscribe', auth, (req, res) => {
  db.prepare('UPDATE users SET push_sub=? WHERE id=?').run(JSON.stringify(req.body), req.userId);
  res.json({ ok: true });
});

app.get('/api/vapid-key', (_, res) => res.json({ key: VAPID_PUBLIC }));

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.use((socket, next) => {
  try {
    const { id } = jwt.verify(socket.handshake.auth.token, JWT_SECRET);
    socket.userId = id;
    next();
  } catch { next(new Error('Unauthorized')); }
});

io.on('connection', (socket) => {
  const me = db.prepare('SELECT partner_id FROM users WHERE id=?').get(socket.userId);
  if (me?.partner_id) {
    const ps = [...io.sockets.sockets.values()].find(s => s.userId === me.partner_id);
    if (ps) ps.emit('partner-status', { online: true });
  }
  socket.on('disconnect', () => {
    const me2 = db.prepare('SELECT partner_id FROM users WHERE id=?').get(socket.userId);
    if (me2?.partner_id) {
      const ps = [...io.sockets.sockets.values()].find(s => s.userId === me2.partner_id);
      if (ps) ps.emit('partner-status', { online: false });
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDominantMood(mood) {
  const priority = ['stressed','sad','need_attention','hungry','tired','miss_you','alone_time','happy'];
  for (const m of priority) if (mood[m]) return m;
  return 'ok';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Slimies running on http://localhost:${PORT}`));
