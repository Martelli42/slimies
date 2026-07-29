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

/** Minutes the zone is ahead of UTC at that instant (handles DST). */
function offsetMinutes(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return (asUtc - date.getTime()) / 60000;
}

function startOfDayUtc(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const localMidnight = Date.UTC(y, m - 1, d);

  // Two passes: guess with the offset at that instant, then re-check with the
  // offset actually in effect at the candidate moment. On the two DST days a
  // year the two differ, and only the second answer puts midnight in the right
  // place — which is what keeps those days 23 and 25 hours long.
  const firstGuess = offsetMinutes(new Date(localMidnight), tz);
  const candidate = new Date(localMidnight - firstGuess * 60000);
  const settled = offsetMinutes(candidate, tz);
  return settled === firstGuess ? candidate : new Date(localMidnight - settled * 60000);
}

/**
 * The UTC timestamp range covering one business day in the shop's timezone.
 * Timestamps are stored in UTC, so anything counting "what happened today" has
 * to compare against this rather than the UTC calendar date — otherwise a
 * closing shift logged after 6pm Chicago lands on the next UTC day.
 */
function dayRange(dateStr, tz = getSetting('timezone')) {
  const toStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
  return {
    start: toStamp(startOfDayUtc(dateStr, tz)),
    end: toStamp(startOfDayUtc(addDays(dateStr, 1), tz))
  };
}

function isDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function isTime(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

module.exports = {
  today, nowTime, nowStamp, addDays, addHours, daysBetween, weekStart, dayRange, isDate, isTime
};
