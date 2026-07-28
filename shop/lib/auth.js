const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.SHOP_JWT_SECRET || 'shop_dev_secret_change_me';
const TOKEN_TTL = process.env.SHOP_TOKEN_TTL || '30d';

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(pin), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function validPin(pin) {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

function signToken(employee) {
  return jwt.sign({ id: employee.id, role: employee.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function readToken(raw) {
  if (!raw) return null;
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Requires a valid token and an active employee; attaches req.employee. */
function auth(req, res, next) {
  const claims = readToken(req.headers.authorization);
  if (!claims) return res.status(401).json({ error: 'Sign in again' });
  const employee = db.prepare(
    'SELECT id,name,role,color,active FROM employees WHERE id=?'
  ).get(claims.id);
  if (!employee || !employee.active) return res.status(401).json({ error: 'Account is inactive' });
  req.employee = employee;
  next();
}

/** Manager-only routes (schedule, menu, staff, task lists). */
function manager(req, res, next) {
  if (req.employee?.role !== 'manager') {
    return res.status(403).json({ error: 'Managers only' });
  }
  next();
}

module.exports = { hashPin, verifyPin, validPin, signToken, readToken, auth, manager, JWT_SECRET };
