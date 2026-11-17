// Accounts and sign-in: email + password. Passwords are stored only as scrypt hashes; sessions are random tokens
// kept (hashed) in the database and sent to the browser in an HttpOnly cookie.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 30;
const hashToken = (t) => createHash('sha256').update(t).digest('hex');

export function checkSignUp(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return 'Enter a real email address.';
  if (password.length < 8) return 'Use at least 8 characters for your password.';
  if (password.length > 200) return 'That password is too long.';
  return undefined;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function checkPassword(password, stored) {
  const [kind, salt, key] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const got = await scryptAsync(password, Buffer.from(salt, 'base64'), 64);
  const want = Buffer.from(key, 'base64');
  return got.length === want.length && timingSafeEqual(got, want);
}

export function startSession(userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, Date.now() + SESSION_DAYS * 86_400_000);
  return token;
}

/** The signed-in user ({ id, email, paid_at }), or undefined. */
export function userFor(token) {
  if (!token) return undefined;
  return db.prepare('SELECT u.id, u.email, u.paid_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(hashToken(token), Date.now());
}

export function endSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

// ---- The session cookie ----

export function tokenFrom(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'sid') return v.join('=');
  }
  return undefined;
}

const secure = (req) => String(req.headers['x-forwarded-proto'] || '').startsWith('https') || String(req.headers.host).endsWith('.vercel.run');

/**
 * Over https the cookie is Partitioned with SameSite=None, so sign-in also works while the app is shown inside
 * Harbor's preview; forms are still protected because the server only accepts them from the app's own pages.
 */
const attrs = (req) => (secure(req) ? 'Path=/; HttpOnly; Secure; SameSite=None; Partitioned' : 'Path=/; HttpOnly; SameSite=Lax');
export const sessionCookie = (req, token) => `sid=${token}; ${attrs(req)}; Max-Age=${SESSION_DAYS * 86_400}`;
export const clearCookie = (req) => `sid=; ${attrs(req)}; Max-Age=0`;

// ---- A little protection against password guessing: 8 tries per minute per visitor and email ----

const tries = new Map();
export function allowAttempt(key) {
  const now = Date.now();
  const t = tries.get(key);
  if (!t || t.reset < now) {
    tries.set(key, { n: 1, reset: now + 60_000 });
    if (tries.size > 10_000) for (const [k, v] of tries) if (v.reset < now) tries.delete(k);
    return true;
  }
  t.n += 1;
  return t.n <= 8;
}
