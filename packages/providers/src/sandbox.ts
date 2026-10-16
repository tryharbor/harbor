import { randomBytes } from 'node:crypto';
import {
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
  type Platform,
  type PlatformProvider,
  type PostMetrics,
  type PostPart,
  type ProviderContext,
  type PublishRequest,
  type PublishResult,
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
 * engagement ratios. The random part depends only on the platform post id.
 */
export function sandboxCurve(platformPostId: string, platform?: Platform, traits?: SandboxTraits): SandboxCurve {
  const r = seeded(platformPostId);
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
