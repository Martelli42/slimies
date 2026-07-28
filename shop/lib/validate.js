/** Trimmed string, or null when empty/missing. */
function str(value, max = 500) {
  if (value === undefined || value === null) return null;
  const out = String(value).trim().slice(0, max);
  return out.length ? out : null;
}

/** Positive number, or null when missing/invalid. */
function posNum(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Non-negative integer with a fallback. */
function intOr(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function oneOf(value, allowed) {
  return allowed.includes(value) ? value : null;
}

module.exports = { str, posNum, intOr, oneOf };
