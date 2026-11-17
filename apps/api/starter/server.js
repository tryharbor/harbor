// The app's web server. Plain Node, no packages: each route is one entry in ROUTES below.
// Add a feature by adding a route (and a table in lib/db.js if it needs to store something).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import config from './config.js';
import { db } from './lib/db.js';
import * as auth from './lib/auth.js';
import * as payments from './lib/payments.js';
import * as pages from './lib/pages.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = join(process.cwd(), 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp' };

// ---- Small helpers ----

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', ...headers });
  res.end(body);
};
const redirect = (res, to, headers = {}) => send(res, 303, '', { location: to, ...headers });
const json = (res, status, data) => send(res, status, JSON.stringify(data), { 'content-type': 'application/json' });

/** The app's own address, as the visitor sees it (it runs behind a proxy). */
function origin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (String(req.headers.host).endsWith('.vercel.run') ? 'https' : 'http');
  return `${proto}://${req.headers.host}`;
}

/** Form or JSON body, at most 10 KB. */
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 10_000) throw Object.assign(new Error('Too much data.'), { status: 413 });
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (String(req.headers['content-type']).includes('application/json')) return text ? JSON.parse(text) : {};
  return Object.fromEntries(new URLSearchParams(text));
}

/** Forms may only be sent from the app's own pages (stops other sites submitting them on a visitor's behalf). */
function sameOrigin(req) {
  const from = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '');
  return !from || from === origin(req);
}

const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/account');

// ---- Routes: "METHOD /path" → handler(req, res, ctx). ctx has user (or undefined), query and body. ----

const ROUTES = {
  'GET /': (req, res, { user }) => send(res, 200, pages.home(user)),

  'GET /signup': (req, res, { user, query }) => (user ? redirect(res, '/account') : send(res, 200, pages.signUp({ next: query.get('next') }))),
  'POST /signup': async (req, res, { body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const problem = auth.checkSignUp(email, password);
    if (problem) return send(res, 400, pages.signUp({ email, error: problem, next: body.next }));
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return send(res, 400, pages.signUp({ email, error: 'There’s already an account with that email. Sign in instead.', next: body.next }));
    const { lastInsertRowid } = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, await auth.hashPassword(password));
    redirect(res, safeNext(body.next), { 'set-cookie': auth.sessionCookie(req, auth.startSession(Number(lastInsertRowid))) });
  },

  'GET /signin': (req, res, { user, query }) => (user ? redirect(res, '/account') : send(res, 200, pages.signIn({ next: query.get('next') }))),
  'POST /signin': async (req, res, { body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (!auth.allowAttempt(`${req.socket.remoteAddress}|${email}`)) return send(res, 429, pages.signIn({ email, error: 'Too many tries. Wait a minute and try again.', next: body.next }));
    const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    const ok = row ? await auth.checkPassword(String(body.password || ''), row.password_hash) : (await auth.hashPassword('x'), false);
    if (!ok) return send(res, 400, pages.signIn({ email, error: 'That email and password don’t match.', next: body.next }));
    redirect(res, safeNext(body.next), { 'set-cookie': auth.sessionCookie(req, auth.startSession(row.id)) });
  },

  'POST /signout': (req, res) => {
    auth.endSession(auth.tokenFrom(req));
    redirect(res, '/', { 'set-cookie': auth.clearCookie(req) });
  },

  'GET /account': (req, res, { user, query }) => (user ? send(res, 200, pages.account(user, { message: query.get('m') })) : redirect(res, '/signin?next=/account')),

  'POST /checkout': async (req, res, { user }) => {
    if (!user) return redirect(res, '/signin?next=/account');
    if (!payments.enabled()) return redirect(res, '/account?m=nopay');
    const url = await payments.checkout(user, origin(req));
    // Pages inside a frame ask for JSON and open Stripe in a new tab (Stripe can't be shown in a frame).
    if (String(req.headers.accept).includes('application/json')) return json(res, 200, { url });
    redirect(res, url);
  },
  'GET /checkout/return': async (req, res, { query }) => {
    const paidUser = await payments.confirm(String(query.get('session_id') || ''));
    send(res, paidUser ? 200 : 400, pages.paymentResult(!!paidUser));
  },
};

async function serveStatic(req, res, path) {
  const file = normalize(join(PUBLIC, decodeURIComponent(path)));
  if (!file.startsWith(PUBLIC + sep)) return false;
  try {
    const bytes = await readFile(file);
    send(res, 200, bytes, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const handler = ROUTES[`${req.method} ${url.pathname}`];
  try {
    if (!handler) {
      if (req.method === 'GET' && (await serveStatic(req, res, url.pathname))) return;
      return send(res, 404, pages.notFound());
    }
    if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, pages.message('That form came from another site, so it was ignored.'));
    const body = req.method === 'GET' ? {} : await readBody(req);
    await handler(req, res, { user: auth.userFor(auth.tokenFrom(req)), query: url.searchParams, body });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, err.status || 500, pages.message(err.status === 413 ? 'That was too much data.' : 'Something went wrong. Please try again.'));
  }
});

server.listen(PORT, HOST, () => console.log(`${config.productName} running on port ${PORT}`));
