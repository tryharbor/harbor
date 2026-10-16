import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NormalizedMetrics, Platform, PostPart } from '@harbor/core';
import { createApp, createDeps, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { computeBestTimes } from '../src/services/best-times.ts';
import { baselineCurveFor, evaluateOutcome, median, verdictFor, type HistoryPost } from '../src/services/outcomes.ts';
import { insertHistoricalPost } from '../src/services/sandbox-history.ts';
import { sender } from './helpers.ts';

let db: Db;
let app: App;
const send = sender(() => app);
const json = async (method: string, path: string, body?: unknown) => {
  const res = await send(method, path, body);
  return { status: res.status, body: res.status === 204 ? undefined : await res.json() };
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  db = await openDb('memory://');
  app = createApp(db, {}, createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated' }));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});

const brand = async (name: string) => (await json('POST', '/v1/brands', { name })).body as { id: string; name: string };
const channel = async (brandId: string, platform: Platform, handle = 'acct') =>
  (await json('POST', '/v1/sandbox/channels', { brandId, platform, handle })).body as { id: string; platform: Platform };

/** Views grow linearly to `final` at 168h. */
const linear = (final: number) => (age: number): NormalizedMetrics => ({ views: Math.round((final * age) / 168), likes: Math.round((final * age) / 1680) });
const text = (t: string, more: string[] = []): PostPart[] => [{ text: t, media: [] }, ...more.map((m) => ({ text: m, media: [] }))];

/** A local time `daysAgo` days ago at `hour`:00. */
const localAt = (daysAgo: number, hour: number) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

// ---- Pure verdict math ----

const hp = (id: string, publishedAt: number, snaps: [number, number | undefined, number?][], platform: Platform = 'x'): HistoryPost => ({
  id,
  brandId: 'brd_1',
  platform,
  publishedAt,
  parts: [],
  snapshots: snaps.map(([ageHours, views, likes]) => ({ ageHours, metrics: { ...(views !== undefined ? { views } : {}), ...(likes !== undefined ? { likes } : {}) } })),
});

describe('verdict math', () => {
  it('takes the median and applies the thresholds', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(verdictFor(1.3, 3)).toBe('outperformed');
    expect(verdictFor(1.29, 3)).toBe('met');
    expect(verdictFor(0.7, 3)).toBe('met');
    expect(verdictFor(0.69, 3)).toBe('underperformed');
    expect(verdictFor(5, 2)).toBe('inconclusive');
    expect(verdictFor(0, 10)).toBe('inconclusive');
  });

  it('compares with the median of other posts at the same age (±25%), nearest snapshot first', () => {
    const now = Date.now();
    const target = hp('t', now - 2 * DAY, [[1, 10], [6, 60], [24, 600]]);
    const others = [
      hp('a', now - 10 * DAY, [[24, 100], [20, 999]]), // 24 is nearer than 20
      hp('b', now - 9 * DAY, [[29, 200]]), // within 25% of 24
      hp('c', now - 8 * DAY, [[31, 5000]]), // outside: not comparable
      hp('d', now - 7 * DAY, [[23, 300]]),
      hp('e', now - 6 * DAY, [[24, 400]], 'threads'), // other platform
    ];
    const o = evaluateOutcome(target, [target, ...others], now)!;
    expect(o).toEqual({ verdict: 'outperformed', ratio: 3, metric: 'views', atAgeHours: 24, baseline: 200, actual: 600, comparablePosts: 3 });
  });

  it('only compares with posts published before it or in the last 90 days', () => {
    const now = Date.now();
    const target = hp('t', now - 100 * DAY, [[24, 100]]);
    const older = [hp('a', now - 120 * DAY, [[24, 100]]), hp('b', now - 110 * DAY, [[24, 100]])];
    const laterButOld = hp('c', now - 95 * DAY, [[24, 1]]); // after the target and over 90 days ago: excluded
    const recent = hp('d', now - 5 * DAY, [[24, 100]]); // after the target but recent: included
    expect(evaluateOutcome(target, [target, ...older, laterButOld, recent], now)).toMatchObject({ verdict: 'met', ratio: 1, comparablePosts: 3 });
  });

  it('is inconclusive with fewer than 3 comparable posts, and falls back to likes', () => {
    const now = Date.now();
    const target = hp('t', now - DAY, [[6, undefined, 50]]);
    const two = [hp('a', now - 3 * DAY, [[6, undefined, 10]]), hp('b', now - 2 * DAY, [[6, undefined, 30]])];
    expect(evaluateOutcome(target, [target, ...two], now)).toEqual({ verdict: 'inconclusive', ratio: 2.5, metric: 'likes', atAgeHours: 6, baseline: 20, actual: 50, comparablePosts: 2 });
    expect(evaluateOutcome(hp('none', now, [[0.2, 5]]), [], now)).toBeUndefined();
  });

  it('builds the baseline curve only at ages with 3+ comparable posts', () => {
    const now = Date.now();
    const target = hp('t', now - DAY, [[1, 1]]);
    const others = [
      hp('a', now - 9 * DAY, [[1, 10], [24, 100], [168, 1000]]),
      hp('b', now - 8 * DAY, [[1, 20], [24, 200]]),
      hp('c', now - 7 * DAY, [[1, 30], [24, 300], [168, 3000]]),
    ];
    expect(baselineCurveFor(target, [target, ...others], now)).toEqual([
      { ageHours: 1, value: 20 },
      { ageHours: 24, value: 200 },
    ]);
  });
});

// ---- Outcomes through the API ----

describe('outcomes on posts', () => {
  let brandId: string;
  let target: string;
  let lonely: string;

  beforeAll(async () => {
    brandId = (await brand('Outcomes')).id;
    const x = await channel(brandId, 'x');
    const th = await channel(brandId, 'threads');
    for (const [i, final] of [100, 200, 300].entries()) {
      await insertHistoricalPost(db, { brandId, channelId: x.id, platform: 'x', parts: text(`Post ${i}`), publishedAt: new Date(Date.now() - (20 - i) * DAY), metricsAt: linear(final) });
    }
    target = await insertHistoricalPost(db, { brandId, channelId: x.id, platform: 'x', parts: text('The big one'), publishedAt: new Date(Date.now() - 10 * DAY), metricsAt: linear(600) });
    await insertHistoricalPost(db, { brandId, channelId: th.id, platform: 'threads', parts: text('Threads one'), publishedAt: new Date(Date.now() - 12 * DAY), metricsAt: linear(50) });
    lonely = await insertHistoricalPost(db, { brandId, channelId: th.id, platform: 'threads', parts: text('Threads two'), publishedAt: new Date(Date.now() - 11 * DAY), metricsAt: linear(80) });
    expect((await json('POST', `/v1/brands/${brandId}/outcomes`)).body.data).toHaveLength(6);
  });

  it('adds the verdict to every post view', async () => {
    const outcome = { verdict: 'outperformed', ratio: 3, metric: 'views', atAgeHours: 168, baseline: 200, actual: 600, comparablePosts: 3 };
    const list = (await json('GET', `/v1/posts?brandId=${brandId}`)).body.data;
    expect(list.find((p: { id: string }) => p.id === target).outcome).toEqual(outcome);
    expect((await json('GET', `/v1/brands/${brandId}/posts`)).body.data.find((p: { id: string }) => p.id === target).outcome).toEqual(outcome);
    expect(list.find((p: { id: string }) => p.id === lonely).outcome).toMatchObject({ verdict: 'inconclusive', comparablePosts: 1, ratio: 1.6 });

    const detail = (await json('GET', `/v1/posts/${target}`)).body;
    expect(detail.outcome).toEqual(outcome);
    expect(detail.baselineCurve).toEqual([1, 6, 24, 72, 168].map((age) => ({ ageHours: age, value: Math.round((200 * age) / 168) })));
    expect((await json('GET', `/v1/posts/${lonely}`)).body.baselineCurve).toEqual([]);
  });

  it('upserts one outcome per post', async () => {
    await json('POST', `/v1/brands/${brandId}/outcomes`);
    const [{ n }] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM outcomes WHERE post_id = $1', [target]);
    expect(n).toBe(1);
  });

  it('shows the verdict on canvas post cards', async () => {
    const campaign = (await json('POST', '/v1/campaigns', { brandId, name: 'Proof' })).body;
    await json('POST', `/v1/campaigns/${campaign.id}/items`, { kind: 'post', refId: target, x: 0, y: 0 });
    const canvas = (await json('GET', `/v1/campaigns/${campaign.id}/canvas`)).body;
    expect(canvas.items.find((i: { kind: string }) => i.kind === 'post').entity.outcome.verdict).toBe('outperformed');
  });

  it('re-evaluates after every snapshot the worker takes', async () => {
    const x = await channel(brandId, 'x', 'live');
    const post = (await json('POST', '/v1/posts', { channelId: x.id, parts: [{ text: 'Fresh post' }] })).body;
    expect(post.outcome).toBeUndefined();
    await json('POST', '/v1/sandbox/advance', { hours: 2 });
    const after = (await json('GET', `/v1/posts/${post.id}`)).body;
    expect(after.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(after.outcome).toMatchObject({ atAgeHours: 1, metric: 'views', comparablePosts: 4 });
  });
});

// ---- Best times ----

describe('best times', () => {
  it('returns a 7×24 grid from the platform prior when there is no history', async () => {
    const { id } = await brand('No history');
    await channel(id, 'x');
    const res = await json('GET', `/v1/brands/${id}/best-times?platform=x`);
    expect(res.status).toBe(200);
    const bt = res.body;
    expect(bt.platform).toBe('x');
    expect(bt.slots).toHaveLength(168);
    expect(bt.slots[0]).toEqual({ weekday: 0, hour: 0, score: expect.any(Number), basis: 'prior', posts: 0 });
    expect(bt.slots.every((s: { basis: string; score: number }) => s.basis === 'prior' && s.score >= 0 && s.score <= 1)).toBe(true);
    expect(Math.max(...bt.slots.map((s: { score: number }) => s.score))).toBe(1);
    expect(bt.top).toHaveLength(5);
    for (const t of bt.top) {
      expect(t.weekday).toBeGreaterThanOrEqual(1);
      expect(t.weekday).toBeLessThanOrEqual(5);
      expect(t.hour).toBeGreaterThanOrEqual(8);
      expect(t.hour).toBeLessThanOrEqual(10);
    }
    expect((await json('GET', `/v1/brands/${id}/best-times?platform=myspace`)).status).toBe(400);
    // All platforms: the brand's channels' priors.
    const all = (await json('GET', `/v1/brands/${id}/best-times`)).body;
    expect(all.platform).toBeUndefined();
    expect(all.top[0].hour).toBe(9);
  });

  it('shrinks toward the prior and lets history take over as posts come in', () => {
    const sundayNight = (weeksAgo: number) => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() - 7 * weeksAgo);
      d.setHours(21, 0, 0, 0);
      return d.getTime();
    };
    const weekdayMorning = (weeksAgo: number, weekday: number) => sundayNight(weeksAgo) + weekday * DAY - 12 * HOUR;
    const post = (id: string, at: number, views: number): HistoryPost => ({ id, brandId: 'b', platform: 'x', publishedAt: at, parts: [], snapshots: [{ ageHours: 24, metrics: { views } }] });
    const mornings = [1, 2, 3, 4, 5, 6].map((w) => post(`m${w}`, weekdayMorning(w, 1 + (w % 5)), 100));
    const score = (posts: HistoryPost[], weekday: number, hour: number) => computeBestTimes(posts, ['x']).slots.find((s) => s.weekday === weekday && s.hour === hour)!;

    const prior = score(mornings, 0, 21);
    const one = score([...mornings, post('s1', sundayNight(1), 1000)], 0, 21);
    const four = score([...mornings, ...[1, 2, 3, 4].map((w) => post(`s${w}`, sundayNight(w), 1000))], 0, 21);
    expect(prior.basis).toBe('prior');
    expect(one.posts).toBe(1);
    expect(four).toMatchObject({ basis: 'history', posts: 4 });
    expect(one.score).toBeGreaterThan(prior.score);
    expect(four.score).toBeGreaterThan(one.score);
    const bt = computeBestTimes([...mornings, ...[1, 2, 3, 4].map((w) => post(`s${w}`, sundayNight(w), 1000))], ['x']);
    expect(bt.top[0]).toMatchObject({ weekday: 0, hour: 21, score: 1 });
    // A slot with no posts nearby keeps the prior.
    expect(bt.slots.find((s) => s.weekday === 3 && s.hour === 3)!.basis).toBe('prior');
  });
});

// ---- Digest + overview ----

describe('digest', () => {
  let brandId: string;
  let threadIds: string[] = [];

  beforeAll(async () => {
    brandId = (await brand('Digest')).id;
    const x = await channel(brandId, 'x');
    // Planted: X threads get ~2× the views of single posts. Everything else (hour, hook, length) is the same.
    const daysAgo = [44, 41, 38, 35, 32, 29, 26, 23, 20, 17, 13, 6, 4, 2];
    for (let i = 0; i < daysAgo.length; i++) {
      const isThread = i % 2 === 0;
      const id = await insertHistoricalPost(db, {
        brandId, channelId: x.id, platform: 'x',
        parts: isThread ? text('Shipping notes from this week', ['More detail', 'The end']) : text('Shipping notes from this week'),
        publishedAt: localAt(daysAgo[i]!, 9),
        metricsAt: linear((isThread ? 2000 : 1000) + (i % 3) * 50),
      });
      if (isThread) threadIds.push(id);
    }
  });

  it('404s before the first digest', async () => {
    const res = await json('GET', `/v1/brands/${brandId}/digest`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/no digest/i);
    expect((await json('POST', '/v1/brands/brd_nope/digest', {})).status).toBe(404);
    expect((await json('POST', `/v1/brands/${brandId}/digest`, { days: 0 })).status).toBe(400);
  });

  it('generates, stores and returns a digest that finds the planted pattern', async () => {
    const res = await json('POST', `/v1/brands/${brandId}/digest`, { days: 7 });
    expect(res.status).toBe(201);
    const d = res.body;
    expect(Object.keys(d).sort()).toEqual(['brandId', 'generatedAt', 'headline', 'misses', 'model', 'patterns', 'period', 'recommendations', 'run', 'simulated', 'stats', 'wins'].sort());
    expect(d).toMatchObject({ brandId, model: 'simulated-v1', simulated: true, run: { model: 'simulated-v1', simulated: true } });
    expect(Date.parse(d.period.to) - Date.parse(d.period.from)).toBe(7 * DAY);
    expect(d.stats).toMatchObject({ posts: 3, published: 3, medianViews24h: expect.any(Number), change: expect.any(Number) });

    const pattern = d.patterns.find((p: { title: string }) => p.title === 'Threads beat single posts on X');
    expect(pattern).toBeDefined();
    expect(pattern.posts.every((id: string) => threadIds.includes(id))).toBe(true);
    expect(d.recommendations[0].title).toMatch(/^Post threads on X .*; your last 3 did 1\.\d× the median$/);
    expect(d.headline).toMatch(/^3 posts published/);

    // Every citation resolves to a post_performance signal for a cited post.
    const signals = (await json('GET', `/v1/brands/${brandId}/signals`)).body.data as { id: string; kind: string; source: { postId: string } }[];
    const byId = new Map(signals.map((s) => [s.id, s]));
    for (const f of [...d.wins, ...d.misses, ...d.patterns, ...d.recommendations]) {
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
      for (const sid of f.signalIds) {
        expect(byId.get(sid)?.kind).toBe('post_performance');
        expect(f.posts).toContain(byId.get(sid)!.source.postId);
      }
    }
    const insights = await db.query<{ basis: { signalId: string }[]; kind: string; agent_run_id: string }>('SELECT basis, kind, agent_run_id FROM insights WHERE brand_id = $1', [brandId]);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.every((i) => i.basis.length > 0 && i.agent_run_id === d.run.id)).toBe(true);
    expect(new Set(insights.map((i) => i.kind))).toContain('pattern');
    const runs = (await json('GET', `/v1/agent-runs?brandId=${brandId}`)).body.data;
    expect(runs[0]).toMatchObject({ id: d.run.id, kind: 'insights', status: 'succeeded', simulated: true });

    const { run, ...stored } = d;
    expect((await json('GET', `/v1/brands/${brandId}/digest`)).body).toEqual(stored);
  });

  it('is deterministic for the same data', async () => {
    const a = (await json('POST', `/v1/brands/${brandId}/digest`, {})).body;
    const b = (await json('POST', `/v1/brands/${brandId}/digest`, {})).body;
    const strip = (d: Record<string, unknown>) => ({ ...d, run: undefined, generatedAt: undefined, period: undefined });
    expect(strip(a)).toEqual(strip(b));
  });

  it('puts every brand side by side in the overview', async () => {
    const { brands } = (await json('GET', '/v1/insights/overview')).body;
    const row = brands.find((b: { brandId: string }) => b.brandId === brandId);
    expect(row).toMatchObject({ brandName: 'Digest', posts7d: 3, published7d: 3, medianViews24h: expect.any(Number), digestHeadline: expect.stringMatching(/^3 posts published/) });
    expect(row.outperformed + row.underperformed).toBeLessThanOrEqual(3);
    expect(row.topPost).toMatchObject({ platform: 'x', text: 'Shipping notes from this week', url: expect.stringMatching(/^https:\/\/sandbox/) });
    expect(threadIds).toContain(row.topPost.id);
    const empty = brands.find((b: { brandName: string }) => b.brandName === 'No history');
    expect(empty).toMatchObject({ posts7d: 0, published7d: 0, outperformed: 0, underperformed: 0 });
    expect(empty.topPost).toBeUndefined();
    expect(empty.digestHeadline).toBeUndefined();
  });
});

// ---- Reschedule ----

describe('reschedule', () => {
  let channelId: string;
  beforeAll(async () => {
    const { id } = await brand('Calendar');
    channelId = (await channel(id, 'x')).id;
  });
  const later = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

  it('moves a scheduled post', async () => {
    const post = (await json('POST', '/v1/posts', { channelId, parts: [{ text: 'Later' }], scheduledFor: later(24) })).body;
    const res = await json('PATCH', `/v1/posts/${post.id}`, { scheduledFor: later(48) });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('scheduled');
    expect(Math.abs(Date.parse(res.body.scheduledFor) - Date.parse(later(48)))).toBeLessThan(5000);
  });

  it('moves a failed post back to scheduled', async () => {
    const post = (await json('POST', '/v1/posts', { channelId, parts: [{ text: 'Broken' }], scheduledFor: later(1) })).body;
    await db.query(`UPDATE posts SET status = 'failed', attempts = 3, error = '{"kind":"bad_request","message":"nope"}' WHERE id = $1`, [post.id]);
    const res = await json('PATCH', `/v1/posts/${post.id}`, { scheduledFor: later(5) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'scheduled', attempts: 0 });
    expect(res.body.error).toBeUndefined();
  });

  it('refuses posts that went out, and bad input', async () => {
    const published = (await json('POST', '/v1/posts', { channelId, parts: [{ text: 'Now' }] })).body;
    expect(published.status).toBe('published');
    expect((await json('PATCH', `/v1/posts/${published.id}`, { scheduledFor: later(2) })).status).toBe(409);
    expect((await json('PATCH', '/v1/posts/pst_nope', { scheduledFor: later(2) })).status).toBe(404);
    expect((await json('PATCH', `/v1/posts/${published.id}`, { scheduledFor: 'tomorrow' })).status).toBe(400);
    expect((await json('PATCH', `/v1/posts/${published.id}`, { scheduledFor: later(2), status: 'scheduled' })).status).toBe(400);
  });
});
