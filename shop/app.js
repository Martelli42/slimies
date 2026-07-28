/* The Express app, with no listener of its own, so it can be used two ways:
   shop/server.js listens on a port for local/self-hosted running, and
   api/index.js hands it to Vercel as a serverless function. */

const path = require('path');
const express = require('express');
const { get, getSetting, refreshSettings, IS_REMOTE } = require('./lib/db');
const { hasSecret } = require('./lib/auth');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// Static files are served by the app rather than the host, so the same paths
// work locally and on Vercel without a second copy of the assets.
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

// Every API route needs the schema in place and the settings cache warm.
app.use('/api', refreshSettings);

app.use('/api', require('./routes/session'));
app.use('/api/today', require('./routes/dashboard'));
app.use('/api/bakery', require('./routes/bakery'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/trailer', require('./routes/trailer'));
app.use('/api/board', require('./routes/board'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', async (req, res) => {
  const staff = await get('SELECT COUNT(*) AS n FROM employees WHERE active=1');
  res.json({
    ok: true,
    staff: staff.n,
    timezone: getSetting('timezone'),
    database: IS_REMOTE ? 'hosted' : 'local file',
    jwt_secret_set: hasSecret
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint' }));

// Single-page app: anything else serves the shell.
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[shop]', err);
  if (res.headersSent) return;

  // A misconfigured deployment is by far the most likely cause of a hard
  // failure, so say which knob to check instead of "something went wrong".
  if (err?.constructor?.name === 'LibsqlError' || /libsql|URL_INVALID/i.test(String(err?.message))) {
    return res.status(503).json({
      error: 'Cannot reach the database. Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.'
    });
  }
  res.status(500).json({ error: 'Something went wrong on our end' });
});

module.exports = app;
