const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { db, DB_PATH, getSetting } = require('./lib/db');
const { readToken } = require('./lib/auth');
const { setIo } = require('./lib/bus');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { serveClient: true });
setIo(io);

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use('/api', require('./routes/session'));
app.use('/api/today', require('./routes/dashboard'));
app.use('/api/bakery', require('./routes/bakery'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/trailer', require('./routes/trailer'));
app.use('/api/board', require('./routes/board'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    staff: db.prepare('SELECT COUNT(*) AS n FROM employees WHERE active=1').get().n,
    timezone: getSetting('timezone')
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint' }));

// Single-page app: anything else serves the shell.
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[shop]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong on our end' });
});

// Live updates: one room, every signed-in screen refreshes together.
io.use((socket, next) => {
  const claims = readToken(socket.handshake.auth?.token);
  if (!claims) return next(new Error('Unauthorized'));
  const employee = db.prepare('SELECT id,name,active FROM employees WHERE id=?').get(claims.id);
  if (!employee || !employee.active) return next(new Error('Unauthorized'));
  socket.employee = employee;
  next();
});

io.on('connection', (socket) => {
  socket.join('shop');
  io.to('shop').emit('presence', { online: onlineNames() });
  socket.on('disconnect', () => io.to('shop').emit('presence', { online: onlineNames() }));
});

function onlineNames() {
  const names = new Set();
  for (const socket of io.sockets.sockets.values()) {
    if (socket.employee) names.add(socket.employee.name);
  }
  return [...names].sort();
}

const PORT = Number(process.env.SHOP_PORT || process.env.PORT || 4000);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`☕ Shop app on http://localhost:${PORT}  (db: ${DB_PATH})`);
  });
}

module.exports = { app, server, io };
