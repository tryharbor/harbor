import type { MediaVariant, Platform, PostPart } from '@harbor/core';
import { createApp, createDeps } from '../app.ts';
import { openDb } from '../db/client.ts';
import { LocalDiskStore } from '../lib/media-store.ts';
import { loadAutomationRow, runAutomation } from '../services/automations.ts';
import { refreshPostReplies, regroupBrandThemes } from '../services/replies.ts';
import { insertHistoricalPost } from '../services/sandbox-history.ts';
import { demoImages } from './demo-media.ts';

/**
 * Fill a throwaway database with sample brands, Brand Memory, competitors, sandbox channels, posts with growth
 * curves and replies, a media library per brand, ideas and drafts, campaigns, digests, agent runs, automations,
 * approvals and a voice refresh waiting for approval, so the UI can be seen with data. Everything goes through Harbor's own API in sandbox
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
  // Demo data from before the insight engine has no post history or digest.
  const [digest] = await db.query('SELECT 1 FROM digests WHERE brand_id = $1 LIMIT 1', [existing.id]).catch(() => []);
  // Demo data from before agents has no automations or approvals.
  const [automation] = await db.query('SELECT 1 FROM automations WHERE brand_id = $1 LIMIT 1', [existing.id]).catch(() => []);
  // Demo data from before Brand Memory learned has no replies or memory proposal.
  const [proposal] = await db.query('SELECT 1 FROM memory_proposals WHERE brand_id = $1 LIMIT 1', [existing.id]).catch(() => []);
  const [reply] = await db.query('SELECT 1 FROM post_replies WHERE brand_id = $1 LIMIT 1', [existing.id]).catch(() => []);
  // Demo data from before the media library has no images (or its files were deleted from HARBOR_MEDIA_DIR).
  const [media] = await db.query<{ storage_key: string }>('SELECT storage_key FROM media_assets WHERE brand_id = $1 LIMIT 1', [existing.id]).catch(() => []);
  const mediaFile = media ? await new LocalDiskStore().get(media.storage_key) : undefined;
  await mediaFile?.stream.cancel();
  if (usable && campaign && digest && automation && proposal && reply && mediaFile) {
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
      do: ['Open with a scene, not a claim', 'Use real numbers', 'Write as "I", one builder to another', 'Put the link in the first part, so people can find the repo', 'End with a low-friction ask'],
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
const tth = await ch(tidewater.id, 'threads', 'tidewatercoffee');

// ---- Media library: brand-colored demo images (SVG rendered with sharp), tagged, with off-center focal points ----

interface Asset { id: string; alt?: string; tags: string[]; variants: Record<MediaVariant, string> }

async function uploadImages(brandId: string, which: 'harbor' | 'tidewater'): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const img of await demoImages(which)) {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(img.bytes)], img.name, { type: img.type }));
    form.set('alt', img.alt);
    form.set('tags', img.tags.join(','));
    const res = await app.request(`/v1/brands/${brandId}/media`, { method: 'POST', body: form });
    const asset = await res.json();
    if (!res.ok) throw new Error(`upload ${img.name} → ${res.status}: ${JSON.stringify(asset)}`);
    out.push(await call('PATCH', `/v1/media/${asset.id}`, { focal: img.focal }));
  }
  return out;
}
const harborImages = await uploadImages(harbor.id, 'harbor');
const tidewaterImages = await uploadImages(tidewater.id, 'tidewater');
console.log(`Media library: ${harborImages.length} Harbor images, ${tidewaterImages.length} Tidewater images.`);

/** A stored media ref to a library image (historical posts skip the API, so they carry the resolved URL). */
const imageRef = (a: Asset, variant: MediaVariant) => ({ kind: 'image' as const, url: a.variants[variant], ...(a.alt ? { alt: a.alt } : {}), assetId: a.id, variant });
const tagged = (images: Asset[], tag: string) => images.filter((a) => a.tags.includes(tag));

// ---- Posts, published through the sandbox and aged with the time machine so each has a real growth curve ----

const publish = (channelId: string, parts: { text: string; media?: { assetId: string; variant?: MediaVariant }[] }[], scheduledFor?: string) =>
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
await publish(tig.id, [{ text: 'Batch #41 is roasting. Notes of cherry and cocoa, from the Gómez farm in Huila.', media: [{ assetId: tagged(tidewaterImages, 'roast')[0]!.id }] }]);
await advance(7);

await publish(hx.id, [{ text: 'What every social API actually gives you in 2026 (with costs).' }], hoursAhead(30));
// A carousel: the guide, then the beans.
const guide = [tagged(tidewaterImages, 'brew-guide')[0]!, tagged(tidewaterImages, 'roast')[1]!];
await publish(tig.id, [{ text: 'Weekend pour-over guide: 15 g, 250 g water, 3 minutes.', media: guide.map((a) => ({ assetId: a.id })) }], hoursAhead(54));

// ---- Six weeks of history: published sandbox posts with full growth curves ----
//
// Inserted straight into the past (the time machine would shift every post together). Traits vary on purpose:
// threads vs single posts, media, number openings and publish hours, so the sandbox's trait effects leave
// patterns for outcomes, best times, the digest and the voice refresh to find. Each post's key fixes the random part
// of its curve (the sandbox seeds it from the id's suffix), so the history looks the same on every seed run.

const HARBOR_NUMBER_HOOKS = [
  '3 things I learned shipping a scheduler nobody asked for.',
  '41% of my posts got 80% of their views in the first 6 hours.',
  '$0 in ads, 212 waitlist signups. Here is the breakdown.',
  '12 months, 4 products, 1 content calendar that finally works.',
  '5 metrics every social API gives you for free (and 2 it hides).',
  '2 hours a week. That is what content costs me now, down from 9.',
  '7 days of growth curves taught me more than a year of totals.',
  '90 posts later: the hook matters more than the platform.',
];
const HARBOR_OTHER_HOOKS = [
  'Why do schedulers show totals instead of growth curves?',
  'Content tools assume one brand. Builders run five.',
  'Four brands, one person, one hour a day for content.',
  'The final number lies. The curve tells you what happened.',
  'Building in public is easier when the dashboard tells the truth.',
  'Open source, AGPL, self-hosted. Here is why that is the business model.',
  'Posting the same thing everywhere stopped working. The numbers said so.',
  'Three content calendars got deleted last week. Here is what replaced them.',
  'Every brand gets its own voice, its own calendar and its own numbers.',
  'A slow burner is not a flop. Give it the full week.',
];
const HARBOR_LINK_HOOKS = [
  'Shipping log: the snapshot poller now retries failed reads. https://github.com/harbor-content/harbor',
  'New in Harbor: it learns a brand voice from ten old posts. https://github.com/harbor-content/harbor/releases',
  "This week's build log is up: https://github.com/harbor-content/harbor/discussions",
  'Self-hosting docs are live: https://github.com/harbor-content/harbor#self-hosting',
  'Why Harbor is AGPL, in full: https://github.com/harbor-content/harbor/blob/main/LICENSE',
];
const HARBOR_REPLIES = [
  'The short version: one place that knows each brand, what worked last time, and what is due this week.',
  'Every post is checked at 1h, 6h, 24h, 72h and 7 days, so a slow burner is not mistaken for a flop.',
  'If you run more than one product, I would love to hear how you plan content today.',
];
const TIDEWATER_NUMBER_HOOKS = [
  '48 hours from roaster to your door. Batch #36 ships Friday.',
  '15 g, 250 g water, 3 minutes: the only pour-over ratio you need.',
  '3 farms, 1 blend: meet the Harbor Fog house coffee.',
  '92°C, not boiling. Your light roasts will thank you.',
];
const TIDEWATER_OTHER_HOOKS = [
  'Batch #37 smells like blueberries and dark chocolate. Huila, Colombia.',
  'Morning light on the roaster. Small batches only.',
  'How fresh is fresh? We roast to order every two weeks.',
  'Meet Ana from the Gómez farm, who picks our cherries by hand.',
  'Sunday brew-along: grab your AeroPress and join us at 10.',
  'Cupping notes from this week: cherry, cocoa, a little honey.',
];
const TIDEWATER_HOURS = [19, 8, 12, 20, 18, 10, 21, 13];

interface Planned { brandId: string; channelId: string; platform: Platform; parts: PostPart[]; daysAgo: number; hour: number; key: string }

/** Local hour each platform's audience is most active in the sandbox (SANDBOX_PEAK_HOUR). */
const PEAK: Record<Platform, number> = { x: 9, linkedin: 8, instagram: 19, threads: 12 };

/**
 * Harbor's history comes in three kinds, so the voice refresh has something to learn: number openings posted at the
 * platform's peak hour (they win), links in the first part posted late in the evening (they lose, against the voice's
 * own "put the link in the first part" rule), and plain statements in between. Threads replies only on Threads.
 */
function harborPlan(): Planned[] {
  const cycle = [hx, hx, hth, hx, hli, hth, hx, hx, hth, hli];
  const out: Planned[] = [];
  for (let i = 0; i < 30; i++) {
    const channel = cycle[i % cycle.length];
    const platform = channel.platform as Platform;
    const kind = i % 3;
    const n = Math.floor(i / 3);
    const hook = kind === 1 ? HARBOR_NUMBER_HOOKS[n % HARBOR_NUMBER_HOOKS.length]! : kind === 2 ? HARBOR_LINK_HOOKS[n % HARBOR_LINK_HOOKS.length]! : HARBOR_OTHER_HOOKS[n % HARBOR_OTHER_HOOKS.length]!;
    const thread = platform === 'threads' && (i % 5 === 0 || i % 5 === 2);
    // Images on about half the Threads posts and a few X posts, so the voice refresh can weigh has_image.
    const media = (platform === 'threads' && i % 4 < 2) || (platform === 'x' && i % 6 === 3);
    const image = harborImages[i % harborImages.length]!;
    const parts: PostPart[] = [{ text: hook, media: media ? [imageRef(image, platform === 'x' ? 'wide' : 'portrait')] : [] }];
    if (thread) for (let r = 0; r < 1 + (i % 3); r++) parts.push({ text: HARBOR_REPLIES[(i + r) % HARBOR_REPLIES.length]!, media: [] });
    const hour = (PEAK[platform] + (kind === 1 ? 0 : kind === 2 ? 10 : 2)) % 24;
    out.push({ brandId: harbor.id, channelId: channel.id, platform, parts, daysAgo: 41 - Math.floor((i * 41) / 30), hour, key: `harbor-${i}` });
  }
  return out;
}

function tidewaterPlan(): Planned[] {
  const out: Planned[] = [];
  for (let i = 0; i < 12; i++) {
    const channel = i % 3 === 2 ? tth : tig;
    const platform = channel.platform as Platform;
    const numberHook = i % 3 === 0;
    const hook = numberHook ? TIDEWATER_NUMBER_HOOKS[i % TIDEWATER_NUMBER_HOOKS.length]! : TIDEWATER_OTHER_HOOKS[i % TIDEWATER_OTHER_HOOKS.length]!;
    // Instagram always needs media (every few posts a carousel); on Threads about half the posts have a photo.
    const media = platform === 'instagram' || i % 2 === 0;
    const image = tidewaterImages[i % tidewaterImages.length]!;
    const extra = platform === 'instagram' && i % 4 === 1 ? [imageRef(tidewaterImages[(i + 3) % tidewaterImages.length]!, 'portrait')] : [];
    const parts: PostPart[] = [{ text: hook, media: media ? [imageRef(image, 'portrait'), ...extra] : [] }];
    out.push({ brandId: tidewater.id, channelId: channel.id, platform, parts, daysAgo: 41 - Math.floor((i * 41) / 12), hour: TIDEWATER_HOURS[(i * 5) % TIDEWATER_HOURS.length]!, key: `tidewater-${i}` });
  }
  return out;
}

for (const p of [...harborPlan(), ...tidewaterPlan()]) {
  const at = new Date();
  at.setDate(at.getDate() - p.daysAgo);
  at.setHours(p.hour, (p.key.length * 7) % 60, 0, 0);
  if (at.getTime() > Date.now() - 3_600_000) at.setDate(at.getDate() - 1);
  await insertHistoricalPost(db, { brandId: p.brandId, channelId: p.channelId, platform: p.platform, parts: p.parts, publishedAt: at, key: p.key });
}

// ---- Replies: every published post's sandbox replies, grouped into themes (comment signals the ideas can cite) ----

for (const b of [harbor, tidewater]) {
  const posts = await db.query<{ id: string }>("SELECT id FROM posts WHERE brand_id = $1 AND status = 'published' ORDER BY published_at", [b.id]);
  let added = 0;
  for (const { id } of posts) added += (await refreshPostReplies(deps.publishDeps(), id, { regroup: false })).added;
  const themes = await regroupBrandThemes(db, b.id);
  console.log(`${b.name}: ${added} replies in ${themes} themes.`);
}

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

// ---- Insights: verdicts for every post, then a weekly digest per brand ----

for (const b of [harbor, tidewater]) {
  await call('POST', `/v1/brands/${b.id}/outcomes`);
  const digest = await call('POST', `/v1/brands/${b.id}/digest`, { days: 7 });
  console.log(`${b.name}: ${digest.headline}`);
}

// ---- Agents: two automations, a weekly plan waiting for approval, and a winner repurposed two days ago ----

// Harbor plans its week every Monday at 8:00. This week's plan already ran: its posts wait in the approval queue.
const weekly = await call('POST', '/v1/automations', {
  brandId: harbor.id, agentId: 'weekly_plan', name: 'Monday plan', trigger: { type: 'schedule', weekday: 1, hour: 8 }, inputs: { postsPerPlatform: 2 },
});
const plan = await call('POST', `/v1/automations/${weekly.id}/run`);
console.log(`Harbor (demo) weekly plan: ${plan.summary}`);

// Tidewater repurposes any post that outperforms. It already ran once, on its best Instagram post (so the drafts go
// to Threads, which needs no photo).
const repurpose = await call('POST', '/v1/automations', {
  brandId: tidewater.id, agentId: 'repurpose_winner', name: 'Repurpose winners', trigger: { type: 'event', event: 'post_outperformed' },
});
const [winner] = await db.query<{ id: string }>(
  `SELECT p.id FROM posts p JOIN channels ch ON ch.id = p.channel_id LEFT JOIN outcomes o ON o.post_id = p.id
   WHERE p.brand_id = $1 AND p.status = 'published' AND ch.platform = 'instagram'
   ORDER BY (o.verdict = 'outperformed') DESC NULLS LAST, o.ratio DESC NULLS LAST, p.published_at DESC LIMIT 1`,
  [tidewater.id],
);
const repurposeRunId = await runAutomation(deps, await loadAutomationRow(db, repurpose.id), { postId: winner!.id });
// The worker never repurposes the same post twice for this automation.
await db.query('INSERT INTO automation_refs (automation_id, ref_id, run_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [repurpose.id, winner!.id, repurposeRunId]);
const repurposed = await call('GET', `/v1/agent-runs/${repurposeRunId}`);
console.log(`Tidewater Coffee (demo) repurpose: ${repurposed.summary}`);

// Decisions, so the history isn't empty: the repurposed post was approved, one planned post was sent back.
for (const a of repurposed.approvals) await call('POST', `/v1/approvals/${a.id}/approve`, {});
const planned = plan.approvals.filter((a: any) => a.channel.platform === 'linkedin');
if (planned[0]) await call('POST', `/v1/approvals/${planned[0].id}/reject`, { note: 'Too close to the launch thread. Save this angle for next week.' });

/** Move a run (with its children, steps and approvals) `hours` into the past. */
async function backdate(runId: string, hours: number) {
  const shift = (v: unknown) => (typeof v === 'string' ? new Date(new Date(v).getTime() - hours * 3_600_000).toISOString() : v);
  const [run] = await db.query<{ steps: Record<string, unknown>[] }>('SELECT steps FROM agent_runs WHERE id = $1', [runId]);
  const steps = (run?.steps ?? []).map((st) => ({ ...st, startedAt: shift(st.startedAt), finishedAt: shift(st.finishedAt) }));
  await db.query('UPDATE agent_runs SET steps = $2 WHERE id = $1', [runId, JSON.stringify(steps)]);
  await db.query(
    `UPDATE agent_runs SET started_at = started_at - make_interval(hours => $2), finished_at = finished_at - make_interval(hours => $2)
     WHERE id = $1 OR parent_run_id = $1`,
    [runId, hours],
  );
  await db.query(
    `UPDATE approvals SET created_at = created_at - make_interval(hours => $2), decided_at = decided_at - make_interval(hours => $2 - 2) WHERE run_id = $1`,
    [runId, hours],
  );
  await db.query('UPDATE automations SET last_run_at = last_run_at - make_interval(hours => $2) WHERE last_run_id = $1', [runId, hours]);
}
await backdate(repurposeRunId, 48);

// ---- Brand Memory that learns: a voice refresh for Harbor, waiting for approval ----

const refresh = await call('POST', '/v1/agents/voice_refresh/runs', { inputs: { brandId: harbor.id } });
console.log(`Harbor (demo) voice refresh: ${refresh.summary}`);

console.log('Seeded demo data (sandbox channels, simulated model).');
await db.close();
