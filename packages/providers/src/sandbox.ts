import { randomBytes } from 'node:crypto';
import {
  BadRequest,
  HarborError,
  PLATFORM_METRICS,
  PLATFORMS,
  PublishOutcomeUnknown,
  RateLimited,
  availableMetrics,
  type AuthUrl,
  type CommentRequest,
  type JsonObject,
  type MetricAvailabilityMap,
  type NormalizedMetrics,
  type PastPost,
  type Platform,
  type PlatformProvider,
  type PostMetrics,
  type PostPart,
  type ProviderContext,
  type PublishRequest,
  type PublishResult,
  type Reply,
  type StatusCheck,
  type TokenSet,
  type ValidationResult,
} from '@harbor/core';
import { InstagramProvider } from './instagram.ts';
import { LinkedInProvider } from './linkedin.ts';
import type { ProviderRegistry } from './registry.ts';
import { ThreadsProvider } from './threads.ts';
import { XProvider } from './x.ts';

/**
 * A stand-in for a real platform that never touches the network. It keeps the real platform's name, length and
 * media rules (by delegating validation to the real adapter, which is safe: validation is local) and metric
 * availability, so everything Harbor does with it behaves like live mode, minus the post actually going out.
 *
 * Triggers for testing failure UIs: a first part containing `#fail-unknown` throws PublishOutcomeUnknown, and
 * `#fail-rate` throws RateLimited(60).
 *
 * Platform post ids look like `sbx_<base36 ms>_<rand>`; the timestamp is the publish time, used for metrics when
 * the caller doesn't pass `settings.publishedAt`.
 *
 * Replies and past posts are deterministic too (sandboxReplies, sandboxHistory). They exist on X, Instagram and
 * Threads, where the real API lets Harbor read them; the sandbox reads X freely because it costs nothing.
 */
export const SANDBOX_ADAPTER_VERSION = 'sandbox-1';
export const SANDBOX_URL_BASE = 'https://sandbox.harbor.local';

const realFor = (platform: Platform): PlatformProvider => {
  switch (platform) {
    case 'x':
      return new XProvider();
    case 'linkedin':
      return new LinkedInProvider();
    case 'instagram':
      return new InstagramProvider();
    case 'threads':
      return new ThreadsProvider();
  }
};

/** Instagram and Threads publish through media containers: publish() returns `pending`, then finalize(). */
const ASYNC_PLATFORMS: readonly Platform[] = ['instagram', 'threads'];
/** Where the real platform lets Harbor read replies and the account's past posts (not LinkedIn). */
const REPLY_PLATFORMS: readonly Platform[] = ['x', 'instagram', 'threads'];

export function newSandboxPostId(now = Date.now()): string {
  return `sbx_${now.toString(36)}_${randomBytes(4).toString('hex')}`;
}

/** The publish time encoded in a sandbox post id, or undefined for other ids. */
export function sandboxPostTime(platformPostId: string): number | undefined {
  const m = /^sbx_([0-9a-z]+)_/.exec(platformPostId);
  if (!m) return undefined;
  const ms = parseInt(m[1]!, 36);
  return Number.isFinite(ms) ? ms : undefined;
}

export interface SandboxProviderOptions {
  now?: () => number;
}

export class SandboxProvider implements PlatformProvider {
  readonly identifier: Platform;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly metrics: MetricAvailabilityMap;
  readonly adapterVersion = SANDBOX_ADAPTER_VERSION;
  readonly maxConcurrentJobs = 4;
  /** Present only where the real platform supports replies (X, LinkedIn, Threads). */
  readonly comment?: (ctx: ProviderContext, req: CommentRequest) => Promise<{ platformPostId: string; url?: string }>;
  /** Present only where the real platform reports metrics (not LinkedIn). */
  readonly fetchPostMetrics?: (ctx: ProviderContext, platformPostId: string) => Promise<PostMetrics>;
  readonly reportsReplies: boolean;
  /** Present only where the real platform reports replies (not LinkedIn). */
  readonly fetchReplies?: (ctx: ProviderContext, platformPostId: string, opts: { limit?: number }) => Promise<Reply[]>;
  /** Present only where the real platform lists past posts (not LinkedIn). */
  readonly listRecentPosts?: (ctx: ProviderContext, opts: { limit: number }) => Promise<PastPost[]>;
  /** Present only where the real provider manages replies (Instagram). */
  readonly respondToReply?: (ctx: ProviderContext, platformReplyId: string, text: string) => Promise<{ platformReplyId: string }>;
  readonly setReplyHidden?: (ctx: ProviderContext, platformReplyId: string, hidden: boolean) => Promise<void>;
  readonly deleteReply?: (ctx: ProviderContext, platformReplyId: string) => Promise<void>;

  private readonly real: PlatformProvider;
  private readonly now: () => number;

  constructor(platform: Platform, opts: SandboxProviderOptions = {}) {
    this.identifier = platform;
    this.real = realFor(platform);
    this.name = this.real.name;
    this.scopes = this.real.scopes;
    this.metrics = PLATFORM_METRICS[platform];
    this.now = opts.now ?? Date.now;
    if (typeof this.real.comment === 'function') {
      this.comment = async (_ctx, req) => {
        if (!req.replyToPlatformPostId) throw new Error('Nothing to reply to.');
        const id = newSandboxPostId(this.now());
        return { platformPostId: id, url: this.postUrl(id) };
      };
    }
    if (availableMetrics(platform).length > 0) {
      this.fetchPostMetrics = async (ctx, platformPostId) => {
        const publishedAt = parsePublishedAt(ctx.settings?.publishedAt) ?? sandboxPostTime(platformPostId) ?? this.now();
        const ageHours = Math.max(0, (this.now() - publishedAt) / 3_600_000);
        // Traits are known when Harbor passes the post's parts (it always does); without them the curve is trait-neutral.
        const parts = parseParts(ctx.settings?.parts);
        const traits = parts ? sandboxTraits(parts, publishedAt) : undefined;
        const { metrics, curve } = sandboxMetricsAt(platform, platformPostId, ageHours, traits);
        return { raw: { sandbox: true, platformPostId, ageHours, curve, metrics }, metrics, adapterVersion: this.adapterVersion };
      };
    }
    this.reportsReplies = REPLY_PLATFORMS.includes(platform);
    if (this.reportsReplies) {
      this.fetchReplies = async (ctx, platformPostId, opts) => {
        const publishedAt = parsePublishedAt(ctx.settings?.publishedAt) ?? sandboxPostTime(platformPostId) ?? this.now();
        return sandboxReplies(platform, platformPostId, parseParts(ctx.settings?.parts) ?? [], publishedAt, this.now(), opts.limit);
      };
      this.listRecentPosts = async (ctx, opts) => {
        const examples = Array.isArray(ctx.settings?.examples) ? ctx.settings.examples.filter((e): e is string => typeof e === 'string' && !!e.trim()) : [];
        return sandboxHistory(platform, ctx.account.platformAccountId, this.now(), opts.limit, examples);
      };
    }
    if (typeof this.real.respondToReply === 'function') {
      this.respondToReply = async (_ctx, _id, text) => {
        if (text.includes('#fail-reply')) throw new BadRequest(platform, `Sandbox ${this.name}: simulated rejection (#fail-reply).`);
        return { platformReplyId: `sbxr_${randomBytes(4).toString('hex')}` };
      };
    }
    if (typeof this.real.setReplyHidden === 'function') this.setReplyHidden = async () => {};
    if (typeof this.real.deleteReply === 'function') this.deleteReply = async () => {};
  }

  maxLength(settings?: JsonObject): number {
    return this.real.maxLength(settings);
  }

  validate(parts: PostPart[], settings?: JsonObject): ValidationResult {
    return this.real.validate(parts, settings);
  }

  private postUrl(id: string): string {
    return `${SANDBOX_URL_BASE}/${this.identifier}/${id}`;
  }

  async generateAuthUrl(): Promise<AuthUrl> {
    throw new HarborError('INVALID_REQUEST', 'Sandbox mode has no OAuth. Create a sandbox channel with POST /v1/sandbox/channels.');
  }

  async authenticate(): Promise<TokenSet> {
    throw new HarborError('INVALID_REQUEST', 'Sandbox mode has no OAuth. Create a sandbox channel with POST /v1/sandbox/channels.');
  }

  async refreshToken(refreshToken: string): Promise<TokenSet> {
    return {
      accessToken: `sbx_access_${randomBytes(8).toString('hex')}`,
      refreshToken,
      scopes: [...this.scopes],
      account: { platformAccountId: 'sandbox', handle: 'sandbox' },
    };
  }

  async publish(_ctx: ProviderContext, req: PublishRequest): Promise<PublishResult> {
    const text = req.parts[0]?.text ?? '';
    if (text.includes('#fail-unknown')) {
      throw new PublishOutcomeUnknown(this.identifier, `Sandbox ${this.name}: simulated timeout (#fail-unknown); the post may or may not have been published.`);
    }
    if (text.includes('#fail-rate')) throw new RateLimited(this.identifier, `Sandbox ${this.name}: simulated rate limit (#fail-rate).`, 60);
    const id = newSandboxPostId(this.now());
    if (ASYNC_PLATFORMS.includes(this.identifier)) {
      return { status: 'pending', pendingData: { sandbox: true, containerId: `sbxc_${randomBytes(4).toString('hex')}`, platformPostId: id } };
    }
    return { status: 'published', platformPostId: id, url: this.postUrl(id) };
  }

  async checkStatus(_ctx: ProviderContext, pendingData: JsonObject): Promise<StatusCheck> {
    if (!ASYNC_PLATFORMS.includes(this.identifier)) throw new Error(`${this.name} publishes synchronously; there is no pending status to check.`);
    return { status: 'ready', pendingData };
  }

  async finalize(_ctx: ProviderContext, pendingData: JsonObject): Promise<Extract<PublishResult, { status: 'published' }>> {
    const id = typeof pendingData.platformPostId === 'string' ? pendingData.platformPostId : newSandboxPostId(this.now());
    return { status: 'published', platformPostId: id, url: this.postUrl(id) };
  }
}

function parsePublishedAt(v: unknown): number | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
}

function parseParts(v: unknown): PostPart[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({ text: typeof p.text === 'string' ? p.text : '', media: Array.isArray(p.media) ? (p.media as PostPart['media']) : [] }));
}

// ---- Synthetic growth curve ----

/** What the sandbox looks at in a post, so the synthetic metrics carry patterns Harbor's insights can find. */
export interface SandboxTraits {
  /** More than one part (thread replies). */
  thread: boolean;
  /** Any part has an image or video. */
  media: boolean;
  /** The first part opens with a number ("3 things…", "$1,240…"). */
  numberHook: boolean;
  /** Local publish hour (server clock), 0–23. */
  hour: number;
}

/** Opens with a digit, ignoring leading punctuation and currency signs. */
export const opensWithNumber = (text: string) => /^[^\p{L}\p{N}]*\p{N}/u.test(text.trim());

export function sandboxTraits(parts: PostPart[], publishedAt: number | string | Date): SandboxTraits {
  return {
    thread: parts.length > 1,
    media: parts.some((p) => (p.media ?? []).length > 0),
    numberHook: opensWithNumber(parts[0]?.text ?? ''),
    hour: new Date(publishedAt).getHours(),
  };
}

/** Local hour each platform's audience is most active, for the sandbox's publish-hour effect. */
export const SANDBOX_PEAK_HOUR: Record<Platform, number> = { x: 9, linkedin: 8, instagram: 19, threads: 12 };

const hourDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
};

/**
 * The deterministic part of a sandbox post's reach: threads +40% on X, media +30% on Instagram and Threads, a
 * number in the opening +25%, and a publish-hour factor from 0.8× (far from the platform's peak) to 1.25× (at it).
 */
export function sandboxTraitMultiplier(platform: Platform, traits: SandboxTraits): { multiplier: number; factors: Record<string, number> } {
  const factors: Record<string, number> = {};
  if (traits.thread && platform === 'x') factors.thread = 1.4;
  if (traits.media && (platform === 'instagram' || platform === 'threads')) factors.media = 1.3;
  if (traits.numberHook) factors.numberHook = 1.25;
  const d = hourDistance(traits.hour, SANDBOX_PEAK_HOUR[platform]);
  factors.hour = Math.round((0.8 + 0.45 * Math.exp(-(d * d) / (2 * 2.5 * 2.5))) * 1000) / 1000;
  const multiplier = Object.values(factors).reduce((a, b) => a * b, 1);
  return { multiplier: Math.round(multiplier * 1000) / 1000, factors };
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SandboxCurve {
  /** Views the post saturates at (base × trait multiplier). */
  peak: number;
  /** The per-post random part of the peak. */
  basePeak: number;
  /** Trait effects applied to basePeak (1 when the traits aren't known). */
  multiplier: number;
  factors?: Record<string, number>;
  /** Hours to reach ~63% of peak. */
  tauHours: number;
  rates: Record<string, number>;
}

/**
 * The per-post curve parameters: a random base peak of 1,500–4,500 views (log-uniform; narrow enough that trait
 * effects show up in a few dozen posts), times the trait multiplier when the post's traits are known; τ 4–16h;
 * engagement ratios. The random part depends only on the id's random suffix (`sbx_<time>_<suffix>`), so history
 * seeded under a fixed key looks the same whichever day it is seeded.
 */
export function sandboxCurve(platformPostId: string, platform?: Platform, traits?: SandboxTraits): SandboxCurve {
  const r = seeded(/^sbx_[0-9a-z]+_(.+)$/.exec(platformPostId)?.[1] ?? platformPostId);
  const basePeak = Math.round(1500 * Math.pow(3, r()));
  const tauHours = 4 + r() * 12;
  const likeRate = 0.01 + r() * 0.05;
  const effect = platform && traits ? sandboxTraitMultiplier(platform, traits) : undefined;
  return {
    peak: Math.round(basePeak * (effect?.multiplier ?? 1)),
    basePeak,
    multiplier: effect?.multiplier ?? 1,
    ...(effect ? { factors: effect.factors } : {}),
    tauHours: Math.round(tauHours * 100) / 100,
    rates: {
      reach: 0.6 + r() * 0.3,
      likes: likeRate,
      comments: likeRate * (0.05 + r() * 0.15),
      reposts: likeRate * (0.05 + r() * 0.2),
      shares: likeRate * (0.03 + r() * 0.12),
      saves: likeRate * (0.05 + r() * 0.25),
      profileVisits: 0.004 + r() * 0.012,
      linkClicks: 0.002 + r() * 0.008,
      followsGained: 0.0005 + r() * 0.002,
    },
  };
}

/**
 * Metrics for a sandbox post at a given age: views = peak · (1 − e^(−age/τ)); every other count is a fixed ratio of
 * views, so each metric only ever grows. Only metrics the platform reports are filled.
 */
export function sandboxMetricsAt(
  platform: Platform,
  platformPostId: string,
  ageHours: number,
  traits?: SandboxTraits,
): { metrics: NormalizedMetrics; curve: SandboxCurve } {
  const curve = sandboxCurve(platformPostId, platform, traits);
  const views = curve.peak * (1 - Math.exp(-Math.max(0, ageHours) / curve.tauHours));
  const all: Record<string, number> = { views: Math.floor(views) };
  for (const [k, rate] of Object.entries(curve.rates)) all[k] = Math.floor(views * rate);
  const metrics: NormalizedMetrics = {};
  for (const key of availableMetrics(platform)) {
    const v = all[key];
    if (v !== undefined) (metrics as Record<string, number>)[key] = v;
  }
  return { metrics, curve };
}

/** One SandboxProvider per platform. */
export function createSandboxRegistry(opts: SandboxProviderOptions = {}): ProviderRegistry {
  return new Map(PLATFORMS.map((p) => [p, new SandboxProvider(p, opts)]));
}

// ---- Synthetic replies and history ----

const SANDBOX_STOPWORDS = new Set(
  `about above after again also always because been before being below between both could does doing down during each even every
  from further have having here into just like make made more most much need only other over really same should since some still
  such than that their them then there these they thing things this those through under until very want were what when where which
  while will with would your yours today week weeks time first last next post posts used using here's that's what's it's i'm
  don't doesn't won't can't didn't love great please wish thanks`.split(/\s+/),
);

/** Words from a post that replies can echo: 4+ letters, not a stopword or part of a link, in order of appearance. */
export function sandboxKeywords(text: string, max = 6): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').matchAll(/[\p{L}][\p{L}'’-]*/gu)) {
    const w = m[0].replace(/['’]s$/, '');
    if (w.length < 4 || SANDBOX_STOPWORDS.has(w) || out.includes(w)) continue;
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/** Templates per reply kind; `{k}` is a word from the post. Each one reads as its kind to Harbor's classifier. */
const REPLY_TEMPLATES = {
  question: ['How do you decide what counts as {k}?', 'What does {k} look like after a month?', 'Does this work for {k} on a small account?', 'Curious: how long did the {k} part take you?'],
  objection: ['Not sure {k} matters that much for small accounts.', 'Feels too expensive to spend on {k} when you are starting out.', "This doesn't match my experience with {k}.", 'Fair point, but {k} is where most people get stuck.'],
  praise: ['Love the {k} angle.', 'This is so useful. Saving the {k} bit.', 'Great breakdown of {k} 🔥', 'The {k} part is so good 👏'],
  request: ['Please share a template for {k}.', 'Would love a deeper post on {k}.', 'Can you share your {k} numbers next week?', 'Wish there was a checklist for {k}.'],
} as const;
const REPLY_KINDS = ['question', 'question', 'question', 'praise', 'praise', 'praise', 'request', 'request', 'objection', 'objection'] as const;
const REPLY_HANDLES = ['mara_builds', 'devon.ships', 'priya_makes', 'tomasz', 'ana.codes', 'leo_indie', 'sam_brews', 'kit.writes', 'noor_dev', 'jules', 'ravi_k', 'bea.studio'];

/**
 * A sandbox post's replies at `now`: about as many as its comment count (capped at 25 and at `limit`), mixing
 * questions, objections, praise and requests that echo the post's words. Reply i is the same on every call; more
 * appear as the post ages. Ids are `<platformPostId>_r<i>`.
 */
export function sandboxReplies(platform: Platform, platformPostId: string, parts: PostPart[], publishedAt: number, now: number, limit = 25): Reply[] {
  const ageHours = Math.max(0, (now - publishedAt) / 3_600_000);
  const traits = parts.length ? sandboxTraits(parts, publishedAt) : undefined;
  const { metrics } = sandboxMetricsAt(platform, platformPostId, ageHours, traits);
  const count = Math.min(25, Math.max(0, Math.floor(limit)), metrics.comments ?? Math.floor((metrics.views ?? metrics.likes ?? 0) * 0.002));
  // Echo the opening part's longest words: they say what the post is about.
  const keywords = sandboxKeywords(parts[0]?.text ?? '', 12).sort((a, b) => b.length - a.length);
  const pool = keywords.length ? keywords.slice(0, 2) : ['this'];
  const out: Reply[] = [];
  for (let i = 0; i < count; i++) {
    const r = seeded(`${platformPostId}:reply:${i}`);
    const kind = REPLY_KINDS[Math.floor(r() * REPLY_KINDS.length)]!;
    const templates = REPLY_TEMPLATES[kind];
    const text = templates[Math.floor(r() * templates.length)]!.replace('{k}', pool[Math.floor(r() * pool.length)]!);
    const handle = REPLY_HANDLES[Math.floor(r() * REPLY_HANDLES.length)]!;
    const afterHours = Math.min(ageHours, 0.1 + i * 1.5 + r());
    out.push({
      platformReplyId: `${platformPostId}_r${i}`,
      author: { handle, displayName: handle.replace(/[._].*$/, '').replace(/^./, (c) => c.toUpperCase()) },
      text,
      createdAt: new Date(publishedAt + afterHours * 3_600_000).toISOString(),
      likes: Math.floor(r() * 12),
    });
  }
  return out.reverse();
}

const HISTORY_TOPICS = ['the launch', 'pricing', 'onboarding', 'the roadmap', 'our first customers', 'the weekly routine'];
const HISTORY_TEMPLATES = [
  (t: string) => `I spent the week on ${t}. Here is what changed.`,
  (t: string, n: number) => `${n} things I learned about ${t}:\n- Start smaller than you think\n- Write it down the same day\n- Ask one person, not everyone`,
  (t: string) => `What would you change about ${t}?`,
  (t: string) => `Behind the scenes: ${t}, this week.`,
  (t: string) => `New write-up on ${t}: https://sandbox.harbor.local/notes/${t.replace(/\W+/g, '-')}`,
  (t: string) => `${upper(t)}, one week in. #buildinpublic`,
  (t: string) => `Small win today: ${t} 🎉`,
  (t: string, n: number) => `${n}% of the work on ${t} was waiting. The rest took an afternoon.`,
  (t: string) =>
    `A longer note on ${t}. When we started, nobody had a plan for it, and every week it got pushed to the next one. ` +
    `What finally worked was boring: one owner, one checklist, and a fixed slot on Tuesday mornings. It is not glamorous, ` +
    `but the results show up in the numbers, and the team stopped arguing about it. If you are stuck on the same thing, start there.`,
];
const upper = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const hash8 = (s: string) => Math.floor(seeded(s)() * 0xffffffff).toString(16).padStart(8, '0');

/**
 * A sandbox account's past posts over the last 60 days, newest first: 20–40 of them (fixed per account), on days
 * picked by a permutation of the day number, so the same post keeps the same id from one scan to the next. Texts mix
 * the brand's own examples (when given) with templates that vary the opening, length, lists, links, hashtags and
 * emoji. Metrics are the sandbox curve at each post's true age.
 */
export function sandboxHistory(platform: Platform, account: string, now: number, limit: number, examples: string[] = []): PastPost[] {
  const DAY = 86_400_000;
  const seedOf = seeded(`${account}:${platform}:history`);
  const count = 20 + Math.floor(seedOf() * 21);
  const steps = [7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 49, 53];
  const a = steps[Math.floor(seedOf() * steps.length)]!;
  const b = Math.floor(seedOf() * 60);
  const topics = [...new Set(examples.flatMap((e) => sandboxKeywords(e, 3)))].slice(0, 6);
  const pool = topics.length >= 3 ? topics : HISTORY_TOPICS;
  const today = Math.floor(now / DAY);
  const out: PastPost[] = [];
  for (let day = today; day > today - 60 && out.length < limit; day--) {
    if ((((day * a + b) % 60) + 60) % 60 >= count) continue;
    const r = seeded(`${account}:${platform}:${day}`);
    const t = day * DAY + Math.floor((7 + r() * 14) * 3_600_000);
    if (t > now - 3_600_000) continue;
    const pick = Math.floor(r() * 1000);
    const text = examples.length && pick % 3 === 0 ? examples[pick % examples.length]!.trim() : HISTORY_TEMPLATES[pick % HISTORY_TEMPLATES.length]!(pool[pick % pool.length]!, 2 + (pick % 9));
    const platformPostId = `sbx_${t.toString(36)}_${hash8(`${account}:${day}`)}`;
    const parts: PostPart[] = [{ text, media: [] }];
    const { metrics } = sandboxMetricsAt(platform, platformPostId, (now - t) / 3_600_000, sandboxTraits(parts, t));
    out.push({ platformPostId, text, publishedAt: new Date(t).toISOString(), url: `${SANDBOX_URL_BASE}/${platform}/${platformPostId}`, metrics });
  }
  return out;
}
