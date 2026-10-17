import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, createDeps, type App, type AppDeps } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { SANDBOX_DEV_SECRET_KEY } from '../src/lib/modes.ts';
import { tick } from '../src/worker.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
let deps: AppDeps;
let brandId: string;
const send = sender(() => app);

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  db = await openDb('memory://');
  deps = createDeps(db, { webUrl: 'http://web.test', secretKey: undefined });
  app = createApp(db, {}, deps);
  brandId = (await (await send('POST', '/v1/brands', { name: 'Harbor', memory: RICH_MEMORY })).json()).id;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});

const channel = async (platform: string, handle: string) => {
  const res = await send('POST', '/v1/sandbox/channels', { brandId, platform, handle });
  expect(res.status).toBe(201);
  return res.json();
};

describe('modes', () => {
  it('defaults to sandbox publishing and the simulated model', async () => {
    expect(await (await send('GET', '/v1/mode')).json()).toEqual({ publish: 'sandbox', model: 'simulated' });
  });

  it('sends connect to the web app instead of a consent screen', async () => {
    const res = await send('GET', `/v1/channels/x/connect?brandId=${brandId}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`http://web.test/brands/${brandId}/channels?sandbox=x`);
  });

  it('hides sandbox routes in live mode', async () => {
    const live = createApp(db, { publishMode: 'live', registry: new Map() });
    expect(await (await live.request('/v1/mode')).json()).toEqual({ publish: 'live', model: 'simulated' });
    const res = await live.request('/v1/sandbox/advance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"hours":1}' });
    expect(res.status).toBe(404);
  });
});

describe('sandbox channels and publishing', () => {
  let x: { id: string; tokenRef: string };
  let ig: { id: string };

  it('creates connected channels with encrypted fake tokens (dev key when HARBOR_SECRET_KEY is unset)', async () => {
    x = await channel('x', '@harborhq');
    expect(x).toMatchObject({ platform: 'x', status: 'connected', account: { handle: 'harborhq' } });
    const [secret] = await db.query<{ ciphertext: string }>('SELECT ciphertext FROM secrets WHERE ref = $1', [x.tokenRef]);
    expect(secret!.ciphertext).not.toContain('sbx_access');
    expect(await deps.secrets().get(x.tokenRef)).toMatchObject({ accessToken: expect.stringMatching(/^sbx_access_/) });
    expect(deps.secrets()).toBeDefined();
    expect(SANDBOX_DEV_SECRET_KEY).toHaveLength(44);
    ig = await channel('instagram', 'tidewater');
    expect((await send('POST', '/v1/sandbox/channels', { brandId, platform: 'myspace', handle: 'a' })).status).toBe(400);
  });

  it('publishes X threads with sandbox ids', async () => {
    const post = await (await send('POST', '/v1/posts', { channelId: x.id, parts: [{ text: 'Main' }, { text: 'Reply' }] })).json();
    expect(post).toMatchObject({ status: 'published', platformPostId: expect.stringMatching(/^sbx_/) });
    expect(post.url).toBe(`https://sandbox.harbor.local/x/${post.platformPostId}`);
    expect(post.error).toBeUndefined();
  });

  it('goes through pending on Instagram, then the worker finalizes', async () => {
    const post = await (await send('POST', '/v1/posts', { channelId: ig.id, parts: [{ text: 'Batch #42', media: [{ kind: 'image', url: 'https://cdn.example/a.jpg' }] }] })).json();
    expect(post.status).toBe('pending');
    await db.query("UPDATE posts SET next_check_at = now() - interval '1 second' WHERE id = $1", [post.id]);
    await tick(deps.publishDeps());
    expect((await (await send('GET', `/v1/posts/${post.id}`)).json()).status).toBe('published');
  });

  it('fails on demand', async () => {
    const unknown = await (await send('POST', '/v1/posts', { channelId: x.id, parts: [{ text: 'Test #fail-unknown' }] })).json();
    expect(unknown).toMatchObject({ status: 'unknown', error: { kind: 'outcome_unknown' } });
    const rate = await (await send('POST', '/v1/posts', { channelId: x.id, parts: [{ text: 'Test #fail-rate' }] })).json();
    expect(rate.status).toBe('scheduled');
    expect(rate.error.kind).toBe('rate_limited');
    expect(Date.parse(rate.scheduledFor) - Date.now()).toBeGreaterThan(55_000);
    await send('DELETE', `/v1/posts/${rate.id}`);
  });

  it('publishes a saved draft by draftId, matching the platform', async () => {
    const draft = await (await send('POST', '/v1/drafts', { brandId, platform: 'x', parts: [{ text: 'From the Studio' }] })).json();
    const post = await (await send('POST', '/v1/posts', { channelId: x.id, draftId: draft.id })).json();
    expect(post).toMatchObject({ status: 'published', parts: [{ text: 'From the Studio' }] });
    const li = await (await send('POST', '/v1/drafts', { brandId, platform: 'linkedin', parts: [{ text: 'Wrong platform' }] })).json();
    expect((await send('POST', '/v1/posts', { channelId: x.id, draftId: li.id })).status).toBe(400);
    expect((await send('POST', '/v1/posts', { channelId: x.id })).status).toBe(400);
    expect((await send('POST', '/v1/posts', { channelId: x.id, draftId: draft.id, parts: [{ text: 'both' }] })).status).toBe(400);
  });
});

describe('sandbox time travel', () => {
  it('advances time so each growth-curve snapshot is taken at its age', async () => {
    const res = await send('POST', '/v1/sandbox/advance', { hours: 24 * 7 + 1 });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.shiftedPosts).toBeGreaterThanOrEqual(3);
    expect(out.snapshotsTaken).toBeGreaterThanOrEqual(15);

    const posts = (await (await send('GET', `/v1/posts?brandId=${brandId}&status=published`)).json()).data;
    const xPost = posts.find((p: { channel: { platform: string }; parts: { text: string }[] }) => p.channel.platform === 'x' && p.parts[0]?.text === 'Main');
    const detail = await (await send('GET', `/v1/posts/${xPost.id}`)).json();
    const ages = detail.snapshots.map((s: { ageHours: number }) => Math.round(s.ageHours));
    expect(ages).toEqual([1, 6, 24, 72, 168]);
    const views = detail.snapshots.map((s: { metrics: { views: number } }) => s.metrics.views);
    expect([...views].sort((a, b) => a - b)).toEqual(views);
    expect(views[4]).toBeGreaterThan(views[0]);
    expect(Object.keys(detail.snapshots[0].metrics)).not.toContain('reach');

    const igPost = posts.find((p: { channel: { platform: string } }) => p.channel.platform === 'instagram');
    const igDetail = await (await send('GET', `/v1/posts/${igPost.id}`)).json();
    expect(Object.keys(igDetail.snapshots.at(-1).metrics)).toContain('reach');
    // Published time moved back with the clock.
    expect(Date.now() - Date.parse(xPost.publishedAt)).toBeGreaterThan(168 * 3_600_000);
  });

  it('turns snapshots into post_performance signals that ideas cite', async () => {
    const { data } = await (await send('POST', '/v1/ideas/generate', { brandId, count: 5 })).json();
    const signals = (await (await send('GET', `/v1/brands/${brandId}/signals`)).json()).data;
    const perf = signals.filter((s: { kind: string }) => s.kind === 'post_performance');
    expect(perf.length).toBeGreaterThanOrEqual(3);
    expect(perf[0].summary).toMatch(/x the brand median/);
    expect(perf[0].source.postId).toMatch(/^pst_/);
    const cited = new Set(data.flatMap((i: { basis: { signalId: string }[] }) => i.basis.map((b) => b.signalId)));
    expect(perf.some((s: { id: string }) => cited.has(s.id))).toBe(true);
    // One signal per post, updated on re-run.
    await send('POST', '/v1/ideas/generate', { brandId, count: 1 });
    const again = (await (await send('GET', `/v1/brands/${brandId}/signals`)).json()).data.filter((s: { kind: string }) => s.kind === 'post_performance');
    expect(again).toHaveLength(perf.length);
  });
});

describe('placeholders never go out', () => {
  it('refuses to post or schedule text with an unfilled [placeholder], from any path', async () => {
    const ch = await channel('threads', 'placeholdercheck');
    const now = await send('POST', '/v1/posts', { channelId: ch.id, parts: [{ text: 'Week 1: [24h views] views at 24h.', media: [] }] });
    expect(now.status).toBe(400);
    expect((await now.json()).error.message).toMatch(/Fill in \[24h views\]/);
    const later = await send('POST', '/v1/posts', {
      channelId: ch.id,
      parts: [{ text: 'Stars so far: [stars].', media: [] }],
      scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(later.status).toBe(400);
    const filled = await send('POST', '/v1/posts', { channelId: ch.id, parts: [{ text: 'Week 1: 412 views at 24h.', media: [] }], scheduledFor: new Date(Date.now() + 86_400_000).toISOString() });
    expect(filled.status).toBe(201);
  });
});
