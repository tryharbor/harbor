import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Platform } from '@harbor/core';
import { createApp, createDeps, type App, type AppDeps } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { createSignedRequest, parseSignedRequest } from '../src/lib/signed-request.ts';
import { upsertChannel } from '../src/services/channels.ts';
import { sender } from './helpers.ts';

const IG_SECRET = 'instagram-app-secret';
const TH_SECRET = 'threads-app-secret';
const TOKEN = 'test-internal-token-0123456789abcdef';

let db: Db;
let deps: AppDeps;
let app: App;
const send = sender(() => app);

beforeAll(async () => {
  db = await openDb('memory://');
  const opts = { publishMode: 'sandbox' as const, modelMode: 'simulated' as const, metaAppSecrets: { instagram: [IG_SECRET], threads: [TH_SECRET] } };
  deps = createDeps(db, opts);
  app = createApp(db, opts, deps);
});
afterAll(async () => db.close());

const brand = async (name: string) => ((await (await send('POST', '/v1/brands', { name })).json()) as { id: string }).id;

const connect = async (brandId: string, platform: Platform, platformAccountId: string, appScopedId?: string) => {
  const channel = await upsertChannel(db, deps.secrets(), brandId, platform, {
    accessToken: `token-${platformAccountId}`,
    refreshToken: `token-${platformAccountId}`,
    scopes: [],
    account: { platformAccountId, handle: `h${platformAccountId}`, ...(appScopedId ? { appScopedId } : {}) },
  });
  await db.query(`INSERT INTO posts (id, brand_id, channel_id, status, platform_post_id) VALUES ($1, $2, $3, 'published', $4)`, [
    `post_${channel.id}`, brandId, channel.id, `pp_${platformAccountId}`,
  ]);
  return channel;
};

/** As Meta calls it: a form POST from outside, no bearer token. */
const meta = (a: App, path: string, signedRequest?: string) =>
  a.request(`https://api.example.com${path}`, {
    method: 'POST',
    headers: { host: 'api.example.com', 'x-forwarded-for': '173.252.127.1', 'content-type': 'application/x-www-form-urlencoded' },
    body: signedRequest === undefined ? '' : new URLSearchParams({ signed_request: signedRequest }).toString(),
  });

const exists = async (table: string, id: string) => (await db.query(`SELECT 1 FROM ${table} WHERE ${table === 'secrets' ? 'ref' : 'id'} = $1`, [id])).length > 0;

describe('signed_request', () => {
  it('verifies the HMAC and decodes the payload', () => {
    const signed = createSignedRequest({ user_id: '42' }, IG_SECRET);
    expect(parseSignedRequest(signed, [IG_SECRET])).toMatchObject({ user_id: '42', algorithm: 'HMAC-SHA256' });
    expect(parseSignedRequest(signed, ['other', IG_SECRET])).toMatchObject({ user_id: '42' });
    expect(parseSignedRequest(signed, ['wrong'])).toBeUndefined();
    expect(parseSignedRequest(signed, [])).toBeUndefined();
    const [sig, payload] = signed.split('.');
    const tampered = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '43' })).toString('base64url');
    expect(parseSignedRequest(`${sig}.${tampered}`, [IG_SECRET])).toBeUndefined();
    expect(parseSignedRequest(`${sig}.${payload}.x`, [IG_SECRET])).toBeUndefined();
    expect(parseSignedRequest('garbage', [IG_SECRET])).toBeUndefined();
  });
});

describe('Meta data deletion callback', () => {
  it("deletes the account's channels in every brand, with tokens and posts, and leaves others alone", async () => {
    const [a, b] = [await brand('Meta A'), await brand('Meta B')];
    const igA = await connect(a, 'instagram', '1784', 'ig-scoped-1');
    const igB = await connect(b, 'instagram', '1784', 'ig-scoped-1');
    const otherIg = await connect(a, 'instagram', '9999', 'ig-scoped-2');
    const th = await connect(a, 'threads', 'ig-scoped-1'); // same id on another platform: untouched

    const res = await meta(app, '/v1/channels/instagram/data-deletion', createSignedRequest({ user_id: 'ig-scoped-1' }, IG_SECRET));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; confirmation_code: string };
    expect(body.confirmation_code).toMatch(/^[0-9a-f]{20}$/);
    expect(body.url).toMatch(new RegExp(`/data-deletion/${body.confirmation_code}$`));

    for (const ch of [igA, igB]) {
      expect(await exists('channels', ch.id)).toBe(false);
      expect(await exists('secrets', ch.tokenRef)).toBe(false);
      expect(await exists('posts', `post_${ch.id}`)).toBe(false);
    }
    for (const ch of [otherIg, th]) {
      expect(await exists('channels', ch.id)).toBe(true);
      expect(await exists('secrets', ch.tokenRef)).toBe(true);
    }

    const page = await app.request(`https://api.example.com/data-deletion/${body.confirmation_code}`, { headers: { host: 'api.example.com', 'x-forwarded-for': '203.0.113.9' } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(body.confirmation_code);
    expect(html).toMatch(/completed/);
    expect(html).toMatch(/deleted the Instagram accounts connected to it \(2\)/);
    expect(html).not.toContain('1784');
  });

  it('matches Instagram channels by the professional account id too, and Threads by its user id', async () => {
    const a = await brand('Meta C');
    const ig = await connect(a, 'instagram', '5555');
    const th = await connect(a, 'threads', '7777');
    expect((await meta(app, '/v1/channels/instagram/data-deletion', createSignedRequest({ user_id: 5555 }, IG_SECRET))).status).toBe(200);
    expect(await exists('channels', ig.id)).toBe(false);
    expect((await meta(app, '/v1/channels/threads/data-deletion', createSignedRequest({ user_id: '7777' }, TH_SECRET))).status).toBe(200);
    expect(await exists('channels', th.id)).toBe(false);
  });

  it('confirms a request for an account Harbor holds nothing for', async () => {
    const res = await meta(app, '/v1/channels/threads/data-deletion', createSignedRequest({ user_id: 'nobody' }, TH_SECRET));
    const { confirmation_code } = (await res.json()) as { confirmation_code: string };
    const html = await (await app.request(`/data-deletion/${confirmation_code}`)).text();
    expect(html).toMatch(/held no data for this Threads account/);
  });

  it('refuses requests Meta did not sign with that platform’s secret', async () => {
    const a = await brand('Meta D');
    const ig = await connect(a, 'instagram', '3131');
    for (const [path, signed] of [
      ['/v1/channels/instagram/data-deletion', createSignedRequest({ user_id: '3131' }, TH_SECRET)],
      ['/v1/channels/instagram/data-deletion', createSignedRequest({ user_id: '3131' }, 'guess')],
      ['/v1/channels/instagram/deauthorize', undefined],
      ['/v1/channels/instagram/deauthorize', createSignedRequest({}, IG_SECRET)],
    ] as const) {
      const res = await meta(app, path, signed);
      expect(res.status, `${path} ${signed}`).toBe(400);
    }
    expect(await exists('channels', ig.id)).toBe(true);
    expect((await meta(app, '/v1/channels/x/data-deletion', createSignedRequest({ user_id: '3131' }, IG_SECRET))).status).toBe(404);
  });

  it('says which secret is missing when the platform is not configured', async () => {
    const opts = { publishMode: 'sandbox' as const, modelMode: 'simulated' as const, metaAppSecrets: { instagram: [], threads: [] } };
    const bare = createApp(db, opts);
    const res = await meta(bare, '/v1/channels/threads/data-deletion', createSignedRequest({ user_id: '1' }, TH_SECRET));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/THREADS_APP_SECRET/);
  });

  it('shows a 404 page for an unknown code', async () => {
    for (const code of ['0123456789abcdef0123', '<script>']) {
      const res = await app.request(`/data-deletion/${encodeURIComponent(code)}`);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('<script>');
    }
  });
});

describe('Meta deauthorize callback', () => {
  it('deletes the channels and tokens for the account', async () => {
    const a = await brand('Meta E');
    const th = await connect(a, 'threads', '8080');
    const res = await meta(app, '/v1/channels/threads/deauthorize', createSignedRequest({ user_id: '8080' }, TH_SECRET));
    expect(res.status).toBe(200);
    expect(await exists('channels', th.id)).toBe(false);
    expect(await exists('secrets', th.tokenRef)).toBe(false);
  });

  it('is reachable without the internal token, which still guards everything else', async () => {
    const guarded = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated', internalToken: TOKEN, metaAppSecrets: { instagram: [IG_SECRET], threads: [TH_SECRET] } });
    expect((await meta(guarded, '/v1/channels/instagram/deauthorize', createSignedRequest({ user_id: 'none' }, IG_SECRET))).status).toBe(200);
    expect((await meta(guarded, '/v1/channels/x/deauthorize', createSignedRequest({ user_id: 'none' }, IG_SECRET))).status).toBe(401);
    expect((await meta(guarded, '/v1/channels/instagram/connect')).status).toBe(401);
  });
});
