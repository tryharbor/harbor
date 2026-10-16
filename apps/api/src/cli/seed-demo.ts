import { newId } from '@harbor/core';
import { openDb } from '../db/client.ts';

/**
 * Fill a throwaway database with sample brands, ideas, posts and snapshots so the UI can be seen with data.
 * Refuses to run unless DATABASE_URL names a demo database, so it can never touch real data.
 * Sample accounts are fake: publishing from the demo database fails with "reconnect", by design.
 */
const url = process.env.DATABASE_URL ?? '';
if (!url.includes('demo')) {
  console.error('Refusing to seed: DATABASE_URL must point at a demo database (e.g. .pglite-demo).');
  process.exit(1);
}
const db = await openDb(url);
const [existing] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM brands WHERE slug = 'harbor-demo'");
if (existing && Number(existing.n) > 0) {
  console.log('Demo data already present.');
  await db.close();
  process.exit(0);
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function brand(name: string, slug: string, memory: object) {
  const id = newId('brand');
  await db.query('INSERT INTO brands (id, workspace_id, name, slug, memory) VALUES ($1, $2, $3, $4, $5)', [id, 'ws_default', name, slug, JSON.stringify(memory)]);
  return id;
}
async function channel(brandId: string, platform: string, handle: string) {
  const id = newId('channel');
  await db.query(
    `INSERT INTO channels (id, brand_id, platform, platform_account_id, handle, token_ref, scopes, status, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, '[]', 'connected', $7)`,
    [id, brandId, platform, `demo-${handle}`, handle, `demo:${id}`, hoursAhead(24 * 50)],
  );
  return id;
}
async function idea(brandId: string, title: string, status: string, angle = '') {
  await db.query('INSERT INTO ideas (id, brand_id, title, angle, status) VALUES ($1, $2, $3, $4, $5)', [newId('idea'), brandId, title, angle, status]);
}
async function post(brandId: string, channelId: string, platform: string, parts: string[], opts: { status: string; at: string; curve?: [number, Record<string, number>][] }) {
  const draftId = newId('draft');
  await db.query("INSERT INTO drafts (id, brand_id, platform, channel_id, parts, author) VALUES ($1, $2, $3, $4, $5, 'human')", [
    draftId, brandId, platform, channelId, JSON.stringify(parts.map((text) => ({ text, media: [] }))),
  ]);
  const id = newId('post');
  const published = opts.status === 'published';
  await db.query(
    `INSERT INTO posts (id, brand_id, channel_id, draft_id, status, scheduled_for, published_at, platform_post_id, url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, brandId, channelId, draftId, opts.status, opts.at, published ? opts.at : null, published ? `demo-${id}` : null, null],
  );
  for (const [age, metrics] of opts.curve ?? []) {
    await db.query("INSERT INTO snapshots (id, post_id, taken_at, age_hours, raw, metrics, adapter_version) VALUES ($1, $2, $3, $4, '{}', $5, 'demo')", [
      newId('snapshot'), id, new Date(Date.parse(opts.at) + age * 3_600_000).toISOString(), age, JSON.stringify(metrics),
    ]);
  }
}

const harbor = await brand('Harbor (demo)', 'harbor-demo', {
  voice: {
    description: 'Candid, builder-minded and direct. Short declarative sentences, specifics over adjectives, open with a scene not a claim.',
    traits: ['Transparent', 'Specific', 'Anti-hype'],
    do: ['Open with a scene, not a claim', 'Use real numbers', 'End with a low-friction ask'],
    dont: ['leverage, seamless, unlock, transform', 'Hedging ("might help")'],
  },
  offer: { summary: 'The open-source content strategist for builders', callToAction: 'Join the waitlist' },
  audience: { description: 'Builders running two or more products at once.', segments: ['Indie hackers', 'Serial founders'], painPoints: ['Context switching between brands'] },
  examplePosts: [{ text: 'Every Monday I used to open Notion, stare at four content calendars, and feel behind before I wrote a word.' }],
});
const side = await brand('Tidewater Coffee (demo)', 'tidewater-demo', { offer: { summary: 'Small-batch coffee subscription' } });

const hx = await channel(harbor, 'x', 'harborhq');
const hth = await channel(harbor, 'threads', 'harborhq');
const hli = await channel(harbor, 'linkedin', 'Derek K.');
const tig = await channel(side, 'instagram', 'tidewatercoffee');

await idea(harbor, 'Why Harbor is AGPL', 'approved', 'Founder story: the open-source decision and what stays in Cloud.');
await idea(harbor, 'What every social API actually gives you in 2026', 'drafting', 'Table of metrics per platform, with costs.');
await idea(harbor, 'My content week before vs. after', 'idea');
await idea(harbor, 'X pay-per-use: what tracking one brand costs', 'idea');
await idea(side, 'Behind the roast: batch #42', 'idea');

await post(harbor, hx, 'x', ['I run four businesses. Every Monday I used to open Notion and feel behind before writing a word.', 'So I\'m building Harbor in public. Thread 🧵'], {
  status: 'published', at: hoursAgo(80),
  curve: [[1, { views: 410, likes: 12, comments: 3, reposts: 1 }], [6, { views: 1890, likes: 41, comments: 9, reposts: 5 }], [24, { views: 3920, likes: 77, comments: 15, reposts: 9, saves: 6 }], [72, { views: 4410, likes: 83, comments: 17, reposts: 10, saves: 8 }]],
});
await post(harbor, hth, 'threads', ['Shipped: Harbor now publishes to X, LinkedIn, Instagram and Threads through each platform\'s own API.'], {
  status: 'published', at: hoursAgo(26),
  curve: [[1, { views: 120, likes: 6, comments: 1 }], [6, { views: 640, likes: 19, comments: 4, reposts: 2 }], [24, { views: 980, likes: 27, comments: 6, reposts: 3 }]],
});
await post(harbor, hli, 'linkedin', ['Why I\'m building a content strategist, not another scheduler.'], { status: 'published', at: hoursAgo(50) });
await post(harbor, hx, 'x', ['What every social API actually gives you in 2026 (with costs).'], { status: 'scheduled', at: hoursAhead(30) });
await post(side, tig, 'instagram', ['Batch #41 is roasting. Notes of cherry and cocoa.'], {
  status: 'published', at: hoursAgo(7),
  curve: [[1, { views: 300, reach: 260, likes: 31, comments: 2, saves: 4 }], [6, { views: 1210, reach: 980, likes: 88, comments: 7, saves: 15 }]],
});
await post(side, tig, 'instagram', ['Weekend pour-over guide'], { status: 'scheduled', at: hoursAhead(54) });

console.log('Seeded demo data.');
await db.close();
