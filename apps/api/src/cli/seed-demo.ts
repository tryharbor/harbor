import { createApp, createDeps } from '../app.ts';
import { openDb } from '../db/client.ts';

/**
 * Fill a throwaway database with sample brands, Brand Memory, competitors, sandbox channels, posts with growth
 * curves, ideas and drafts, so the UI can be seen with data. Everything goes through Harbor's own API in sandbox
 * mode with the simulated model: no network, no keys. Sandbox channel tokens are fake but stored encrypted like real
 * ones (HARBOR_SECRET_KEY, or the sandbox dev key when unset), so publishing from the demo works.
 *
 * Refuses to run unless DATABASE_URL names a demo database, so it can never touch real data.
 */
const url = process.env.DATABASE_URL ?? '';
if (!url.includes('demo')) {
  console.error('Refusing to seed: DATABASE_URL must point at a demo database (e.g. .pglite-demo).');
  process.exit(1);
}
const db = await openDb(url);
const DEMO_SLUGS = ['harbor-demo', 'tidewater-demo'];

const [existing] = await db.query<{ id: string }>("SELECT id FROM brands WHERE slug = 'harbor-demo'");
if (existing) {
  const [usable] = await db.query(
    'SELECT 1 FROM channels c JOIN secrets s ON s.ref = c.token_ref WHERE c.brand_id = $1 LIMIT 1',
    [existing.id],
  );
  // Demo data from before campaigns existed has no "Launch week" canvas: replace it.
  const [campaign] = await db.query("SELECT 1 FROM campaigns WHERE brand_id = $1 AND name = 'Launch week' LIMIT 1", [existing.id]);
  if (usable && campaign) {
    console.log('Demo data already present.');
    await db.close();
    process.exit(0);
  }
  console.log('Replacing demo data from an older Harbor version.');
  await db.query('DELETE FROM brands WHERE slug = ANY($1)', [DEMO_SLUGS]);
}

const deps = createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated' });
const app = createApp(db, {}, deps);

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? undefined : await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}
const advance = (hours: number) => call('POST', '/v1/sandbox/advance', { hours });
const hoursAhead = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
// Sandbox never downloads media, so a placeholder URL is enough.
const IMG = (n: number) => `https://sandbox.harbor.local/media/tidewater-batch-${n}.jpg`;

// ---- Brands with Brand Memory v2 ----

const harbor = await call('POST', '/v1/brands', {
  name: 'Harbor (demo)',
  slug: 'harbor-demo',
  memory: {
    voice: {
      summary:
        'Candid, builder-minded and direct. Short declarative sentences in the first person ("I"), specifics over adjectives, and a scene before a claim. Shares real numbers, including the bad ones.',
      values: [
        { name: 'Transparent', meaning: 'Shares what things cost and what went wrong, not only wins.' },
        { name: 'Specific', meaning: 'Real numbers and named tools instead of adjectives.' },
        { name: 'Anti-hype', meaning: 'Lets the work speak; no growth-hacker language.' },
      ],
      do: ['Open with a scene, not a claim', 'Use real numbers', 'Write as "I", one builder to another', 'End with a low-friction ask'],
      avoid: ['Hype words: leverage, seamless, unlock, transform.', 'Hedging ("might help").', 'Exclamation marks.'],
      bannedWords: ['leverage', 'seamless', 'unlock', 'game-changer'],
      excerpts: [
        { text: 'Every Monday I used to open Notion, stare at four content calendars, and feel behind before I wrote a word.', source: 'Example 1' },
        { text: 'Two make money, one breaks even, one is a hobby I pretend is a business.', source: 'Example 2' },
        { text: 'A post that gets 80% of its views in the first 6 hours is a different post from one that keeps growing for a week.', source: 'Example 3' },
      ],
      sources: [
        { kind: 'post', label: 'X thread: four businesses, one Monday' },
        { kind: 'post', label: 'X post: what I run' },
        { kind: 'url', label: 'Build log: snapshot poller', ref: 'https://github.com/harbor-content/harbor' },
      ],
    },
    audiences: [
      {
        name: 'Indie hackers with several products',
        description: 'Solo builders running two or more products who post about all of them.',
        painPoints: ['Context switching between brands', 'No idea which posts actually work', 'Writing feels like a second job'],
        goals: ['Post consistently for every product', 'Spend under an hour a day on content'],
      },
      {
        name: 'Small studio founders',
        description: 'Founders of 2–10 person studios shipping client and in-house products.',
        painPoints: ['Each brand needs its own voice', 'Scheduling tools show totals, not growth curves'],
        goals: ['A repeatable weekly content routine the team can share'],
      },
    ],
    products: [
      {
        name: 'Harbor',
        summary: 'The open-source content strategist for builders who run several brands.',
        url: 'https://github.com/harbor-content/harbor',
        cta: 'Star the repo',
        proofPoints: ['Tracks every post at 1h, 6h, 24h, 72h and 7d', 'Publishes to X, LinkedIn, Instagram and Threads with your own API keys'],
      },
      {
        name: 'Harbor Cloud',
        summary: 'Hosted Harbor: no servers, no developer apps to set up.',
        cta: 'Join the waitlist',
        proofPoints: ['Set up in under 5 minutes'],
      },
    ],
    knowledge: [
      {
        title: 'Why Harbor is AGPL',
        kind: 'note',
        body: 'Self-hosting stays free forever. Cloud pays for development. AGPL keeps hosted forks open.',
      },
      { title: 'Platform API costs (2026)', kind: 'link', url: 'https://github.com/harbor-content/harbor/tree/main/docs/research' },
    ],
    styleRules: {
      terms: [
        { use: 'post', insteadOf: 'content piece' },
        { use: 'builders', insteadOf: 'creators' },
      ],
      formatting: ['No hashtags', 'Sentence case', 'One idea per line on X'],
    },
    examplePosts: [
      { platform: 'x', text: 'Every Monday I used to open Notion, stare at four content calendars, and feel behind before I wrote a word.', note: 'Scene first, then the problem.' },
      { platform: 'x', text: 'I run four businesses. Two make money, one breaks even, one is a hobby I pretend is a business.' },
    ],
  },
});

const tidewater = await call('POST', '/v1/brands', {
  name: 'Tidewater Coffee (demo)',
  slug: 'tidewater-demo',
  memory: {
    voice: {
      summary: 'Warm, sensory and unhurried. Talks about one batch at a time, names the farm, and invites people to brew along.',
      values: [{ name: 'Craft', meaning: 'Every batch has a story and a person behind it.' }],
      do: ['Name the origin and the tasting notes', 'Invite people to brew along'],
      avoid: ['Discount-first messaging.', 'Hashtag walls.'],
      bannedWords: [],
    },
    audiences: [
      { name: 'Home brewers', description: 'Pour-over and AeroPress people who care about freshness.', painPoints: ['Stale supermarket beans'], goals: ['Café-quality coffee at home'] },
    ],
    products: [{ name: 'Tidewater subscription', summary: 'Small-batch coffee, roasted to order every two weeks.', cta: 'Start a subscription', proofPoints: ['Roasted within 48 hours of shipping'] }],
  },
});

await call('POST', `/v1/brands/${harbor.id}/competitors`, {
  name: 'Buffer', url: 'https://buffer.com', handles: [{ platform: 'x', handle: 'buffer' }, { platform: 'linkedin', handle: 'buffer' }],
  notes: 'Scheduler with analytics totals; no per-brand strategy.',
});
await call('POST', `/v1/brands/${harbor.id}/competitors`, {
  name: 'Typefully', url: 'https://typefully.com', handles: [{ platform: 'x', handle: 'typefully' }],
  notes: 'Great X/LinkedIn writing UX; single-voice focus.',
});

// ---- Sandbox channels ----

const ch = (brandId: string, platform: string, handle: string) => call('POST', '/v1/sandbox/channels', { brandId, platform, handle });
const hx = await ch(harbor.id, 'x', 'harborhq');
const hli = await ch(harbor.id, 'linkedin', 'Derek K');
const hth = await ch(harbor.id, 'threads', 'harborhq');
const tig = await ch(tidewater.id, 'instagram', 'tidewatercoffee');

// ---- Posts, published through the sandbox and aged with the time machine so each has a real growth curve ----

const publish = (channelId: string, parts: { text: string; media?: { kind: 'image'; url: string }[] }[], scheduledFor?: string) =>
  call('POST', '/v1/posts', { channelId, parts, scheduledFor });

await publish(hx.id, [
  { text: 'I run four businesses. Every Monday I used to open Notion and feel behind before writing a word.' },
  { text: "So I'm building Harbor in public: one place that knows each brand's voice and what worked last time." },
  { text: 'It checks every post at 1h, 6h, 24h, 72h and 7 days, because the final number hides the curve.' },
]);
await advance(30);
await publish(hli.id, [{ text: "Why I'm building a content strategist, not another scheduler.\n\nSchedulers tell you what went out. I want to know what to write next, for which brand, and why." }]);
await advance(24);
await publish(hth.id, [{ text: "Shipped: Harbor now publishes to X, LinkedIn, Instagram and Threads through each platform's own API." }]);
await advance(19);
await publish(tig.id, [{ text: 'Batch #41 is roasting. Notes of cherry and cocoa, from the Gómez farm in Huila.', media: [{ kind: 'image', url: IMG(41) }] }]);
await advance(7);

await publish(hx.id, [{ text: 'What every social API actually gives you in 2026 (with costs).' }], hoursAhead(30));
await publish(tig.id, [{ text: 'Weekend pour-over guide: 15 g, 250 g water, 3 minutes.', media: [{ kind: 'image', url: IMG(42) }] }], hoursAhead(54));

// ---- Ideas and drafts ----

const idea = (brandId: string, title: string, angle = '') => call('POST', '/v1/ideas', { brandId, title, angle });
const agpl = await idea(harbor.id, 'Why Harbor is AGPL', 'Founder story: the open-source decision and what stays in Cloud.');
const apis = await idea(harbor.id, 'What every social API actually gives you in 2026', 'Table of metrics per platform, with costs.');
await idea(harbor.id, 'My content week before vs. after');
await idea(tidewater.id, 'Behind the roast: batch #42');

await call('POST', '/v1/drafts/generate', { ideaId: agpl.id, platforms: ['x', 'linkedin'] }); // → Drafting
await call('PATCH', `/v1/ideas/${agpl.id}`, { status: 'approved' });
await call('POST', '/v1/drafts', { brandId: harbor.id, ideaId: apis.id, platform: 'x', parts: [{ text: 'Every social API, what it reports, and what it costs. A thread.' }] });

// Simulated ideas citing the signals derived from the posts above.
const generated = await call('POST', '/v1/ideas/generate', { brandId: harbor.id, count: 4 });
await call('POST', '/v1/ideas/generate', { brandId: tidewater.id, count: 2 });

// ---- Campaign canvas: "Launch week" ----

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const launch = await call('POST', '/v1/campaigns', {
  brandId: harbor.id,
  name: 'Launch week',
  goal: 'Get 200 waitlist signups from builders running 2+ brands',
  startsOn: day(-2),
  endsOn: day(5),
});
await call('PATCH', `/v1/campaigns/${launch.id}`, { status: 'active' });
const board = await call('GET', `/v1/campaigns/${launch.id}/canvas`);
const ideasFrame = board.items.find((i: any) => i.kind === 'frame' && i.data.title === 'Ideas');
const item = (body: Record<string, unknown>) => call('POST', `/v1/campaigns/${launch.id}/items`, body);
const edge = (source: string, target: string) => call('POST', `/v1/campaigns/${launch.id}/edges`, { source, target });

// Three existing ideas in the Ideas frame (2-column grid of 280×150 cards), and a note connected to the first.
const contentWeek = (await call('GET', `/v1/ideas?brandId=${harbor.id}&status=idea`)).data.find((i: any) => i.title === 'My content week before vs. after');
const ideaRefs = [contentWeek.id, generated.data[0].id, generated.data[1].id];
const ideaCards = [];
for (const [n, refId] of ideaRefs.entries()) {
  ideaCards.push(await item({ kind: 'idea', refId, parentId: ideasFrame.id, x: 20 + (n % 2) * 300, y: 48 + Math.floor(n / 2) * 170, width: 280, height: 150 }));
}
const hookNote = await item({ kind: 'note', parentId: ideasFrame.id, x: 320, y: 218, width: 280, height: 150, data: { text: 'Hook: open with a real number', color: 'yellow' } });
await edge(hookNote.id, ideaCards[0].id);

// Evidence: the two best posts in Published, two signals left of Ideas.
await call('POST', `/v1/campaigns/${launch.id}/agent`, { action: 'add_top_posts', count: 2 });
await call('POST', `/v1/campaigns/${launch.id}/agent`, { action: 'add_signals', count: 2 });

// Draft the first idea for X and LinkedIn: cards land in Drafts, linked from the idea, using the note as context.
await call('POST', `/v1/campaigns/${launch.id}/agent`, { action: 'draft', ideaItemId: ideaCards[0].id, platforms: ['x', 'linkedin'] });

// A free-standing frame for proof posts, with one note inside.
const proof = await item({ kind: 'frame', x: 0, y: 620, width: 900, height: 360, data: { title: 'Proof posts' } });
await item({ kind: 'note', parentId: proof.id, x: 20, y: 48, width: 320, height: 140, data: { text: 'Screenshot three real growth curves (1h → 7d) for launch day. Real numbers, including the flat one.' } });

console.log('Seeded demo data (sandbox channels, simulated model).');
await db.close();
