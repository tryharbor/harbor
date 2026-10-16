import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, createUploadTicket, hasBearerToken, hasUploadTicket, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { sender } from './helpers.ts';

const TOKEN = 'test-internal-token-0123456789abcdef';

let db: Db;
let app: App;
const send = sender(() => app);

beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated', internalToken: TOKEN });
});
afterAll(async () => db.close());
afterEach(() => vi.unstubAllEnvs());

/** As the API sees a request on its public hostname (Railway), optionally with the web app's bearer token. */
const fromOutside = (path: string, opts: { method?: string; token?: string; body?: unknown } = {}) =>
  app.request(`https://api.example.com${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      host: 'api.example.com',
      'x-forwarded-for': '203.0.113.9',
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

describe('internal token (HARBOR_INTERNAL_TOKEN)', () => {
  it('compares the bearer token exactly', () => {
    expect(hasBearerToken(new Headers({ authorization: `Bearer ${TOKEN}` }), TOKEN)).toBe(true);
    expect(hasBearerToken(new Headers({ authorization: `bearer ${TOKEN}` }), TOKEN)).toBe(true);
    expect(hasBearerToken(new Headers({ authorization: `Bearer ${TOKEN}x` }), TOKEN)).toBe(false);
    expect(hasBearerToken(new Headers({ authorization: `Bearer ${TOKEN.slice(0, -1)}` }), TOKEN)).toBe(false);
    expect(hasBearerToken(new Headers({ authorization: TOKEN }), TOKEN)).toBe(false);
    expect(hasBearerToken(new Headers(), TOKEN)).toBe(false);
  });

  it('answers /v1 without the token with 401 JSON, locally and from outside', async () => {
    for (const [path, method] of [['/v1/brands', 'GET'], ['/v1/brands', 'POST'], ['/v1/mode', 'GET'], ['/v1/api-keys', 'POST'], ['/v1/channels/x/connect?brandId=b', 'GET'], ['/v1/nope', 'GET']] as const) {
      const res = await send(method, path, method === 'POST' ? {} : undefined);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect((await res.json()).error.code).toBe('UNAUTHORIZED');
      expect((await fromOutside(path, { method })).status, `outside ${method} ${path}`).toBe(401);
    }
    expect((await fromOutside('/v1/brands', { token: 'wrong' })).status).toBe(401);
    expect((await fromOutside('/v1/brands', { token: `${TOKEN} ` })).status).toBe(200);
  });

  it('lets the token through, including from a public hostname (it replaces the local-only gate)', async () => {
    expect((await fromOutside('/v1/brands', { token: TOKEN })).status).toBe(200);
    const created = await fromOutside('/v1/brands', { method: 'POST', token: TOKEN, body: { name: 'Token Co' } });
    expect(created.status).toBe(201);
    expect((await fromOutside('/v1/mode', { token: TOKEN })).status).toBe(200);
  });

  it('keeps health, media, OAuth callbacks and MCP public', async () => {
    expect((await fromOutside('/health')).status).toBe(200);
    expect((await send('GET', '/health')).status).toBe(200);
    // Reached the route (not the token check): an unknown state is the callback's own error, an unknown asset the media route's.
    const callback = await fromOutside('/v1/channels/x/callback?state=nope');
    expect(callback.status).not.toBe(401);
    expect((await callback.json()).error.message).toMatch(/invalid or was already used/);
    expect((await fromOutside('/media/med_missing/square.jpg')).status).toBe(404);
    expect((await fromOutside('/media/med_missing/square.jpg', { method: 'HEAD' })).status).toBe(404);
    // /mcp answers with its own API-key error.
    const mcp = await fromOutside('/mcp', { method: 'POST' });
    expect(mcp.status).toBe(401);
    expect((await mcp.json()).error.message).toMatch(/Harbor API key/);
  });

  it('still answers CORS preflights for the local web app', async () => {
    const res = await app.request('http://localhost:4800/v1/brands', {
      method: 'OPTIONS',
      headers: { host: 'localhost:4800', origin: 'http://localhost:4801', 'access-control-request-method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:4801');
  });

  it('reads HARBOR_INTERNAL_TOKEN from the environment', async () => {
    vi.stubEnv('HARBOR_INTERNAL_TOKEN', TOKEN);
    const envApp = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' });
    expect((await envApp.request('/v1/brands')).status).toBe(401);
    expect((await envApp.request('/v1/brands', { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
  });
});

describe('without HARBOR_INTERNAL_TOKEN', () => {
  it('keeps the local-only gate, and HARBOR_PUBLIC_API=all turns it off', async () => {
    vi.stubEnv('HARBOR_INTERNAL_TOKEN', '');
    const local = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' });
    const tunneled = (a: App) => a.request('https://stunned-example.ngrok-free.dev/v1/brands', { headers: { host: 'stunned-example.ngrok-free.dev', 'x-forwarded-for': '203.0.113.9' } });
    expect((await tunneled(local)).status).toBe(404);
    expect((await local.request('http://localhost:4800/v1/brands', { headers: { host: 'localhost:4800' } })).status).toBe(200);

    vi.stubEnv('HARBOR_PUBLIC_API', 'all');
    expect((await tunneled(createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' }))).status).toBe(200);
  });
});

describe('upload tickets (browser uploads straight to the API)', () => {
  const upload = (brandId: string, ticket?: string, method = 'POST') =>
    app.request(`https://api.example.com/v1/brands/${brandId}/media`, {
      method,
      headers: { host: 'api.example.com', 'x-forwarded-for': '203.0.113.9', ...(ticket ? { 'harbor-upload-ticket': ticket } : {}) },
      body: method === 'POST' ? new FormData() : undefined,
    });

  it('accepts a ticket only for its own brand, before it expires, signed with the token', () => {
    const now = 1_800_000_000_000;
    const t = createUploadTicket(TOKEN, 'brd_a', now);
    const h = (v: string) => new Headers({ 'harbor-upload-ticket': v });
    expect(hasUploadTicket(h(t), TOKEN, 'brd_a', now)).toBe(true);
    expect(hasUploadTicket(h(t), TOKEN, 'brd_b', now)).toBe(false);
    expect(hasUploadTicket(h(t), TOKEN, 'brd_a', now + 11 * 60_000)).toBe(false);
    expect(hasUploadTicket(h(t), `${TOKEN}x`, 'brd_a', now)).toBe(false);
    expect(hasUploadTicket(h(`${now + 60_000_000}.${t.split('.')[1]}`), TOKEN, 'brd_a', now)).toBe(false);
    expect(hasUploadTicket(h('garbage'), TOKEN, 'brd_a', now)).toBe(false);
    expect(hasUploadTicket(new Headers(), TOKEN, 'brd_a', now)).toBe(false);
  });

  it('lets a ticketed upload past the token check, and nothing else', async () => {
    const ticket = createUploadTicket(TOKEN, 'brd_x');
    // Past auth: the empty form fails validation or the brand lookup, not with 401.
    expect((await upload('brd_x', ticket)).status).not.toBe(401);
    expect((await upload('brd_x')).status).toBe(401);
    expect((await upload('brd_other', ticket)).status).toBe(401);
    // A ticket doesn't open the media list (or anything other than the upload).
    expect((await upload('brd_x', ticket, 'GET')).status).toBe(401);
  });

  it('answers the browser preflight for the ticket header from the web app', async () => {
    const res = await app.request('https://api.example.com/v1/brands/brd_x/media', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:4801', 'access-control-request-method': 'POST', 'access-control-request-headers': 'harbor-upload-ticket' },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:4801');
    expect((res.headers.get('access-control-allow-headers') ?? '').toLowerCase()).toContain('harbor-upload-ticket');
  });
});

