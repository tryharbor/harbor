import { describe, expect, it } from 'vitest';
import { SimulatedModel, digest, hourBand, postTraits, type DigestInput, type DigestPost } from '../src/index.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-15T12:00:00Z');

/** A post with a ratio against its platform median. */
function post(n: number, o: Partial<DigestPost> & { ratio: number }): DigestPost {
  const publishedAt = new Date(NOW - (o.inPeriod ? 2 : 10 + n) * DAY).toISOString();
  return {
    id: `pst_${String(n).padStart(2, '0')}`,
    platform: 'x',
    parts: ['Shipping log for the week'],
    hasMedia: false,
    publishedAt,
    weekday: 2,
    hour: 9,
    inPeriod: false,
    signalId: `sig_${n}`,
    outcome: {
      verdict: o.ratio >= 1.3 ? 'outperformed' : o.ratio >= 0.7 ? 'met' : 'underperformed',
      ratio: o.ratio,
      metric: 'views',
      atAgeHours: 168,
      baseline: 1000,
      actual: Math.round(o.ratio * 1000),
      comparablePosts: 8,
    },
    views24h: Math.round(o.ratio * 800),
    ...o,
  };
}

const thread = ['Shipping log for the week', 'Part two', 'Part three'];

/** Planted pattern: X threads do ~1.8× the median, single posts ~0.9×. */
function plantedInput(): DigestInput {
  const posts: DigestPost[] = [];
  const threadRatios = [1.7, 1.9, 1.8, 2.0, 1.6, 1.85];
  const singleRatios = [0.9, 0.85, 1.0, 0.95, 0.8, 0.9, 1.05, 0.88];
  threadRatios.forEach((ratio, i) => posts.push(post(i, { ratio, parts: thread })));
  singleRatios.forEach((ratio, i) => posts.push(post(10 + i, { ratio })));
  posts.push(post(30, { ratio: 2.1, parts: thread, inPeriod: true }));
  posts.push(post(31, { ratio: 0.5, inPeriod: true, hour: 21 }));
  return {
    brandName: 'Harbor',
    period: { from: new Date(NOW - 7 * DAY).toISOString(), to: new Date(NOW).toISOString() },
    stats: { posts: 2, published: 2, medianViews24h: 1040, change: 1.18 },
    posts,
    bestTimes: [
      { platform: 'x', basis: 'history', top: [{ weekday: 2, hour: 9, score: 1 }, { weekday: 3, hour: 9, score: 0.98 }, { weekday: 1, hour: 9, score: 0.95 }, { weekday: 4, hour: 8, score: 0.9 }, { weekday: 5, hour: 10, score: 0.88 }] },
    ],
  };
}

describe('digest traits', () => {
  it('reads format, hook, length and hour band from a post', () => {
    expect(postTraits({ parts: ['3 things I learned'], hasMedia: false, hour: 9 })).toMatchObject({ numberHook: true, questionHook: false, firstPerson: false, length: 'short', band: 'morning' });
    expect(postTraits({ parts: ['Why do schedulers show totals? A thread.', 'two'], hasMedia: true, hour: 13 })).toMatchObject({ thread: true, media: true, questionHook: true, band: 'midday' });
    expect(postTraits({ parts: ["I'm done with calendars."], hasMedia: false, hour: 20 })).toMatchObject({ firstPerson: true, band: 'evening' });
    expect(postTraits({ parts: ['Instagram is not a strategy.'], hasMedia: false, hour: 2 })).toMatchObject({ firstPerson: false, band: 'night' });
    expect(postTraits({ parts: ['x'.repeat(150)], hasMedia: false, hour: 9 }).length).toBe('medium');
    expect(postTraits({ parts: ['x'.repeat(260)], hasMedia: false, hour: 9 }).length).toBe('long');
    expect([4, 5, 10, 11, 15, 16, 21, 22].map(hourBand)).toEqual(['night', 'morning', 'morning', 'midday', 'midday', 'evening', 'evening', 'night']);
  });
});

describe('SimulatedModel.digest', () => {
  const model = new SimulatedModel();

  it('is deterministic and marked simulated', async () => {
    const a = await model.digest(plantedInput());
    const b = await new SimulatedModel().digest(plantedInput());
    expect(a).toEqual(b);
    expect(a.model).toBe('simulated-v1');
    expect(a.simulated).toBe(true);
    expect(a.usage.outputTokens).toBeGreaterThan(0);
    // Input order doesn't matter.
    expect(digest({ ...plantedInput(), posts: [...plantedInput().posts].reverse() })).toEqual(a.result);
  });

  it('finds the planted pattern: threads outperform single posts on X', () => {
    const d = digest(plantedInput());
    const p = d.patterns.find((f) => /^Threads beat single posts on X/.test(f.title));
    expect(p).toBeDefined();
    expect(p!.detail).toMatch(/7 threads did a median 1\.9× your platform median, against 0\.9× for 9 single posts/);
    expect(p!.posts.length).toBeGreaterThan(0);
    expect(p!.signalIds.every((s) => s.startsWith('sig_'))).toBe(true);
    expect(p!.confidence).toBeGreaterThan(0.5);
    expect(p!.confidence).toBeLessThanOrEqual(1);
    expect(d.headline).toMatch(/^2 posts published, median 1,040 views at 24h \(\+18% vs the previous 7 days\)\. Threads beat single posts on X/);
  });

  it('turns it into a recommendation with the best slots', () => {
    const rec = digest(plantedInput()).recommendations[0]!;
    expect(rec.title).toMatch(/^Post threads on X weekday mornings; your last 3 did 1\.9× the median$/);
    expect(rec.detail).toContain('Tue 9:00, Wed 9:00, Mon 9:00');
    expect(rec.posts).toHaveLength(3);
    expect(rec.posts[0]).toBe('pst_30');
  });

  it('explains the period\'s win and miss', () => {
    const d = digest(plantedInput());
    expect(d.wins).toHaveLength(1);
    expect(d.wins[0]).toMatchObject({ posts: ['pst_30'], signalIds: ['sig_30'] });
    expect(d.wins[0]!.title).toContain('2.1× the median');
    expect(d.wins[0]!.detail).toMatch(/What set it apart: it was a thread/);
    expect(d.misses).toHaveLength(1);
    expect(d.misses[0]!.posts).toEqual(['pst_31']);
    expect(d.misses[0]!.detail).toMatch(/none of what has been working: threads/);
  });

  it('detects hooks, media, hour bands and platform differences when they are in the data', () => {
    const posts: DigestPost[] = [];
    for (let i = 0; i < 5; i++) posts.push(post(i, { ratio: 1.6 + i * 0.05, parts: [`${i + 2} things that worked`] }));
    for (let i = 0; i < 5; i++) posts.push(post(10 + i, { ratio: 0.8 + i * 0.03, hour: 20 }));
    for (let i = 0; i < 4; i++) posts.push(post(20 + i, { ratio: 1.5, platform: 'threads', hasMedia: true, views24h: 5000 }));
    for (let i = 0; i < 4; i++) posts.push(post(30 + i, { ratio: 0.8, platform: 'threads', views24h: 3000 }));
    const d = digest({ ...plantedInput(), posts, stats: { posts: 0, published: 0 } });
    const titles = d.patterns.map((p) => p.title);
    expect(titles).toContain('Posts that open with a number beat other openings on X');
    expect(titles).toContain('Posts with media beat text-only posts on Threads');
    expect(titles.some((t) => /^Evening posts \(16–22h\) trailed other times of day/.test(t))).toBe(true);
    expect(titles.some((t) => /^Threads reaches .* more people than X/.test(t))).toBe(true);
    // No win this period: the best recent outperformer is explained instead.
    expect(titles.some((t) => t.startsWith('Why your best recent post worked'))).toBe(true);
    expect(d.headline).toMatch(/^No posts published in the last 7 days\./);
  });

  it('says so when there is nothing to compare', () => {
    const d = digest({ ...plantedInput(), posts: [], bestTimes: [], stats: { posts: 0, published: 0 } });
    expect(d).toMatchObject({ wins: [], misses: [], patterns: [] });
    expect(d.headline).toBe('No posts published in the last 7 days.');
    expect(d.recommendations[0]!.title).toBe('Publish at least 3 posts per platform');
  });
});
