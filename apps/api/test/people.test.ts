import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, type AuthCallback, type Platform, type PlatformProvider, type TokenSet } from '@harbor/core';
import { createApp, createDeps, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';

/** The account the platform's consent screen is signed in as. */
let signedIn: TokenSet['account'] = { platformAccountId: '7', handle: 'derek', displayName: 'Derek', avatarUrl: 'https://pbs.example/derek.jpg' };
const account = (id: string, handle: string): TokenSet['account'] => ({ platformAccountId: id, handle, displayName: handle, avatarUrl: `https://pbs.example/${handle}.jpg` });

/** Just enough of a platform to connect an account that has an avatar. */
const fakeX = {
  identifier: 'x',
  name: 'X',
  scopes: ['write'],
  reportsReplies: false,
  async generateAuthUrl() {
    return { url: 'https://x.example/auth', codeVerifier: 'v', state: `st_${Date.now()}_${Math.random()}` };
  },
  async authenticate(_cb: AuthCallback): Promise<TokenSet> {
    return { accessToken: 'a', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes: ['write'], account: signedIn };
  },
} as unknown as PlatformProvider;

let db: Db;
let app: App;
let harbor: string;
let ranger: string;

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeAll(async () => {
  db = await openDb('memory://');
  const deps = createDeps(db, { publishMode: 'live', registry: new Map<Platform, PlatformProvider>([['x', fakeX]]), secretKey: randomBytes(32).toString('base64'), webUrl: 'http://web.test' });
  app = createApp(db, {}, deps);
  harbor = (await (await send('POST', '/v1/brands', { name: 'Harbor', memory: { products: [{ name: 'Harbor', summary: 'Open-source content strategist', proofPoints: [] }] } })).json()).id;
  ranger = (await (await send('POST', '/v1/brands', { name: 'Ranger' })).json()).id;
});
afterAll(() => db.close());

describe('personal accounts', () => {
  let person: string;

  it('creates one person per workspace, linked to brands', async () => {
    const res = await json(await send('POST', '/v1/brands', { kind: 'person', name: 'Derek', speaksFor: [harbor, harbor], memory: { topics: ['building in public', 'pricing'] } }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'person', name: 'Derek', speaksFor: [harbor], memory: { topics: ['building in public', 'pricing'] } });
    person = res.body.id;

    const again = await json(await send('POST', '/v1/brands', { kind: 'person', name: 'Someone else' }));
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already has a personal account/);

    const list = (await (await send('GET', '/v1/brands')).json()).data as { id: string; kind: string }[];
    expect(list.find((b) => b.id === harbor)?.kind).toBe('brand');
  });

  it('only links real brands, and only from a person', async () => {
    expect((await send('PATCH', `/v1/brands/${person}`, { speaksFor: [newId('brand')] })).status).toBe(400);
    expect((await send('PATCH', `/v1/brands/${person}`, { speaksFor: [person] })).status).toBe(400);
    expect((await send('PATCH', `/v1/brands/${harbor}`, { speaksFor: [ranger] })).status).toBe(400);
    expect((await send('POST', '/v1/brands', { name: 'Linked', speaksFor: [harbor] })).status).toBe(400);
    const ok = await json(await send('PATCH', `/v1/brands/${person}`, { speaksFor: [harbor, ranger] }));
    expect(ok.body.speaksFor).toEqual([harbor, ranger]);
  });

  it('drops a deleted brand from the links', async () => {
    const temp = (await (await send('POST', '/v1/brands', { name: 'Temp' })).json()).id;
    await send('PATCH', `/v1/brands/${person}`, { speaksFor: [harbor, temp] });
    expect((await send('DELETE', `/v1/brands/${temp}`)).status).toBe(204);
    expect((await (await send('GET', `/v1/brands/${person}`)).json()).speaksFor).toEqual([harbor]);
  });

  it('returns to where connecting started, and takes the account avatar as the picture', async () => {
    const start = await send('GET', `/v1/channels/x/connect?brandId=${person}&returnTo=${encodeURIComponent(`/brands/new?brandId=${person}&kind=person&step=voice`)}`);
    expect(start.status).toBe(302);
    const [st] = await db.query<{ state: string; return_to: string }>('SELECT state, return_to FROM oauth_states ORDER BY created_at DESC LIMIT 1');
    expect(st!.return_to).toBe(`/brands/new?brandId=${person}&kind=person&step=voice`);
    const cb = await send('GET', `/v1/channels/x/callback?code=c&state=${st!.state}`);
    expect(cb.headers.get('location')).toBe(`http://web.test/brands/new?brandId=${person}&kind=person&step=voice&connected=X+%40derek`);
    expect((await (await send('GET', `/v1/brands/${person}`)).json()).logoUrl).toBe('https://pbs.example/derek.jpg');
  });

  it('ignores a return path outside /brands', async () => {
    await send('GET', `/v1/channels/x/connect?brandId=${harbor}&returnTo=${encodeURIComponent('https://evil.example/')}`);
    await send('GET', `/v1/channels/x/connect?brandId=${harbor}&returnTo=${encodeURIComponent('//evil.example/brands/x')}`);
    const rows = await db.query<{ return_to: string | null }>('SELECT return_to FROM oauth_states WHERE brand_id = $1', [harbor]);
    expect(rows.map((r) => r.return_to)).toEqual([null, null]);
  });

  it("doesn't change a brand's logo when connecting it", async () => {
    await send('GET', `/v1/channels/x/connect?brandId=${ranger}`);
    const [st] = await db.query<{ state: string }>('SELECT state FROM oauth_states WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1', [ranger]);
    await send('GET', `/v1/channels/x/callback?code=c&state=${st!.state}`);
    expect((await (await send('GET', `/v1/brands/${ranger}`)).json()).logoUrl).toBeUndefined();
  });

  it("plans a founder's ideas from their topics and their brands' wins", async () => {
    await db.query(
      `INSERT INTO signals (id, brand_id, kind, summary, source, data, observed_at) VALUES ($1, $2, 'post_performance', 'X post: 3.1x', $3, $4, now())`,
      [newId('signal'), harbor, JSON.stringify({ postId: 'pst_win' }), JSON.stringify({ postId: 'pst_win', platform: 'x', text: 'We shipped approvals before autopilot.', ratio: 3.1, metric: 'views' })],
    );
    const res = await json(await send('POST', '/v1/ideas/generate', { brandId: person, count: 8 }));
    expect(res.status).toBe(201);
    const titles = (res.body.data as { title: string }[]).map((i) => i.title);
    expect(titles).toContain("Quote Harbor's win with your take");
    expect(titles).toContain('My take on building in public');
    expect(titles).toContain('A lesson from building Harbor');
    expect(titles.some((t) => /building Derek/.test(t))).toBe(false);
  });
});

describe("a personal account's connected accounts", () => {
  let person: string;
  const connect = async (brandId: string, as: TokenSet['account']) => {
    signedIn = as;
    await send('GET', `/v1/channels/x/connect?brandId=${brandId}`);
    const [st] = await db.query<{ state: string }>('SELECT state FROM oauth_states WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1', [brandId]);
    return send('GET', `/v1/channels/x/callback?code=c&state=${st!.state}`);
  };
  const channels = async (brandId: string) => (await (await send('GET', `/v1/brands/${brandId}/channels`)).json()).data as { id: string; account: { handle: string } }[];
  const logo = async (brandId: string) => (await (await send('GET', `/v1/brands/${brandId}`)).json()).logoUrl as string | undefined;
  const disconnect = async (brandId: string, handle: string) => {
    const ch = (await channels(brandId)).find((c) => c.account.handle === handle)!;
    expect((await send('DELETE', `/v1/channels/${ch.id}`)).status).toBe(204);
  };

  beforeAll(async () => {
    [{ id: person }] = await db.query<{ id: string }>("SELECT id FROM brands WHERE kind = 'person'");
    await connect(harbor, account('100', 'tryharbor'));
  });

  it("refuses an account another brand already posts from", async () => {
    const before = await logo(person);
    const res = await connect(person, account('100', 'tryharbor'));
    const to = new URL(res.headers.get('location')!);
    expect(to.searchParams.get('error')).toMatch(/^@tryharbor is already connected to Harbor\. .*sign in as yourself/);
    expect((await channels(person)).map((c) => c.account.handle)).not.toContain('tryharbor');
    expect(await logo(person)).toBe(before);
    // The brand keeps its own connection.
    expect((await channels(harbor)).map((c) => c.account.handle)).toContain('tryharbor');
  });

  it('gives the picture back when the account it came from is disconnected', async () => {
    await disconnect(person, 'derek');
    expect(await logo(person)).toBeUndefined();
    await connect(person, account('200', 'first'));
    await connect(person, account('300', 'dwkoza'));
    expect(await logo(person)).toBe('https://pbs.example/first.jpg');
    await disconnect(person, 'first');
    expect(await logo(person)).toBe('https://pbs.example/dwkoza.jpg');
    await disconnect(person, 'dwkoza');
    expect(await logo(person)).toBeUndefined();
  });

  it('keeps a picture you set yourself', async () => {
    await connect(person, account('400', 'again'));
    await db.query('UPDATE brands SET logo_url = $2 WHERE id = $1', [person, 'https://example.com/me.png']);
    await disconnect(person, 'again');
    expect(await logo(person)).toBe('https://example.com/me.png');
  });
});
