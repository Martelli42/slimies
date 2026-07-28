const webpush = require('web-push');
const { db, getSetting, setSetting } = require('./db');

// Use configured VAPID keys when present, otherwise generate a pair once and
// keep it in the database so subscriptions survive restarts.
function keys() {
  let publicKey = process.env.VAPID_PUBLIC || getSetting('vapid_public');
  let privateKey = process.env.VAPID_PRIVATE || getSetting('vapid_private');
  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    setSetting('vapid_public', publicKey);
    setSetting('vapid_private', privateKey);
  }
  return { publicKey, privateKey };
}

const { publicKey, privateKey } = keys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:manager@coffeeshop.local', publicKey, privateKey);

/**
 * Fire-and-forget notification to staff. `exceptId` skips the person who
 * triggered it. Dead subscriptions are cleared so we stop retrying them.
 */
function notify({ title, body, url = '/', exceptId = null }) {
  const rows = db.prepare(
    'SELECT id,push_sub FROM employees WHERE active=1 AND push_sub IS NOT NULL'
  ).all();
  for (const row of rows) {
    if (exceptId && row.id === exceptId) continue;
    let sub;
    try {
      sub = JSON.parse(row.push_sub);
    } catch {
      continue;
    }
    webpush.sendNotification(sub, JSON.stringify({ title, body, url })).catch((err) => {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        db.prepare('UPDATE employees SET push_sub=NULL WHERE id=?').run(row.id);
      }
    });
  }
}

module.exports = { notify, publicKey };
