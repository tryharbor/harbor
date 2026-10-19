import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, isPublicRequest, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';

let db: Db;
let app: App;

beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' });
});
afterAll(async () => db.close());

const viaTunnel = (path: string, method = 'GET') =>
  app.request(`https://stunned-example.ngrok-free.dev${path}`, { method, headers: { host: 'stunned-example.ngrok-free.dev', 'x-forwarded-for': '203.0.113.9' } });

describe('public gate', () => {
  it('tells local requests from tunneled ones', () => {
    expect(isPublicRequest(new Headers({ host: 'localhost:4800' }))).toBe(false);
    expect(isPublicRequest(new Headers({ host: '127.0.0.1:4800' }))).toBe(false);
    expect(isPublicRequest(new Headers({ host: 'localhost:4800', 'x-forwarded-for': '203.0.113.9' }))).toBe(true);
    expect(isPublicRequest(new Headers({ host: 'stunned-example.ngrok-free.dev' }))).toBe(true);
  });

  it('keeps the API closed to the internet, except callbacks, media, MCP and health', async () => {
    for (const [path, method] of [['/v1/brands', 'GET'], ['/v1/posts', 'POST'], ['/v1/api-keys', 'POST'], ['/v1/channels/x/connect?brandId=b', 'GET'], ['/v1/mode', 'GET']] as const) {
      const res = await viaTunnel(path, method);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect((await res.json()).error.message).toMatch(/public address/);
    }
    expect((await viaTunnel('/health')).status).toBe(200);
    // Reached the route (not the gate): an unknown state is the callback's own error, an unknown asset the media route's.
    expect((await (await viaTunnel('/v1/channels/x/callback?state=nope')).json()).error.message).toMatch(/invalid or was already used/);
    expect((await (await viaTunnel('/media/med_missing/square.jpg')).json()).error?.message ?? '').not.toMatch(/public address/);
    expect((await viaTunnel('/mcp', 'POST')).status).toBe(401);
    // Meta's callbacks reach the route, which wants a signed_request; the deletion status page is public too.
    expect((await (await viaTunnel('/v1/channels/instagram/data-deletion', 'POST')).json()).error.message).not.toMatch(/public address/);
    expect((await (await viaTunnel('/v1/channels/threads/deauthorize', 'POST')).json()).error.message).not.toMatch(/public address/);
    expect((await viaTunnel('/v1/channels/x/deauthorize', 'POST')).status).toBe(404);
    expect(await (await viaTunnel('/data-deletion/0123456789abcdef0123')).text()).toMatch(/Deletion request not found/);
  });

  it('leaves local requests alone', async () => {
    expect((await app.request('http://localhost:4800/v1/brands', { headers: { host: 'localhost:4800' } })).status).toBe(200);
  });
});
