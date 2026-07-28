const webpush = require('web-push');
const { all, run, get, setSetting } = require('./db');

/**
 * VAPID keys, read from the environment first so every serverless instance
 * agrees. If they aren't set we generate a pair once and store it, then read
 * back whichever pair won the race.
 */
let configured = null;

async function configure() {
  if (configured !== null) return configured;

  let publicKey = process.env.VAPID_PUBLIC;
  let privateKey = process.env.VAPID_PRIVATE;

  if (!publicKey || !privateKey) {
    const stored = await all(
      "SELECT key,value FROM settings WHERE key IN ('vapid_public','vapid_private')"
    );
    publicKey = stored.find((row) => row.key === 'vapid_public')?.value;
    privateKey = stored.find((row) => row.key === 'vapid_private')?.value;
  }

  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    await run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)',
      ['vapid_public', generated.publicKey]);
    await run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)',
      ['vapid_private', generated.privateKey]);
    publicKey = (await get("SELECT value FROM settings WHERE key='vapid_public'"))?.value;
    privateKey = (await get("SELECT value FROM settings WHERE key='vapid_private'"))?.value;
  }

  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:manager@coffeeshop.local',
    publicKey, privateKey
  );
  configured = { publicKey, privateKey };
  return configured;
}

async function publicKey() {
  const keys = await configure();
  return keys ? keys.publicKey : null;
}

/**
 * Notifies staff. Awaited rather than fire-and-forget: on a serverless host the
 * instance can be frozen the moment the response is sent, which would drop
 * anything still in flight. Dead subscriptions are cleared.
 */
async function notify({ title, body, url = '/', exceptId = null }) {
  const keys = await configure();
  if (!keys) return;

  const rows = await all(
    'SELECT id,push_sub FROM employees WHERE active=1 AND push_sub IS NOT NULL'
  );

  await Promise.all(rows.map(async (row) => {
    if (exceptId && row.id === exceptId) return;
    let sub;
    try {
      sub = JSON.parse(row.push_sub);
    } catch {
      return;
    }
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, url }));
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await run('UPDATE employees SET push_sub=NULL WHERE id=:id', { id: row.id });
      }
    }
  }));
}

module.exports = { notify, publicKey };
