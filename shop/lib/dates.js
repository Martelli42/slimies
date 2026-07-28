const { getSetting } = require('./db');

/** Current wall-clock date (YYYY-MM-DD) in the shop's timezone. */
function today(tz = getSetting('timezone')) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

/** Current time (HH:MM) in the shop's timezone. */
function nowTime(tz = getSetting('timezone')) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

/** UTC timestamp string, matching SQLite's datetime('now') format. */
function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

function addHours(stamp, hours) {
  const dt = new Date(stamp.replace(' ', 'T') + (stamp.endsWith('Z') ? '' : 'Z'));
  dt.setTime(dt.getTime() + Number(hours || 0) * 3600 * 1000);
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

/** Whole days from `from` to `to`. Negative means `to` is in the past. */
function daysBetween(from, to) {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/** Monday-based start of the week containing dateStr. */
function weekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

function isDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function isTime(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

module.exports = { today, nowTime, nowStamp, addDays, addHours, daysBetween, weekStart, isDate, isTime };
