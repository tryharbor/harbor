import type { Brand, BrandVoice, NormalizedMetrics, Platform, PostPart, Signal } from '@harbor/core';

/** Token counts for one model call (estimated for the simulated model). */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Every ContentModel call returns its result together with what it cost and which model produced it. */
export interface ModelResult<T> {
  result: T;
  usage: ModelUsage;
  /** e.g. "simulated-v1". Stored on agent_runs and shown in the UI. */
  model: string;
  /** True when no real model was involved; the UI shows a "Simulated" badge. */
  simulated: boolean;
}

export interface LearnVoiceInput {
  brandName: string;
  examples: string[];
  /** The brand's current voice; owner-curated rules and banned words are kept. */
  existing?: BrandVoice;
}

export interface RecentPost {
  text: string;
  platform: Platform;
  metrics?: NormalizedMetrics;
}

export interface GenerateIdeasInput {
  brand: Brand;
  signals: Signal[];
  recentPosts: RecentPost[];
  count: number;
  /** Extra direction for this batch (e.g. a digest's recommendations), most important first. */
  guidance?: string[];
}

export interface IdeaSuggestion {
  title: string;
  angle: string;
  /** The signals the idea is based on. */
  basis: { signalId: string; note: string }[];
}

/** Extra material the owner put next to an idea (e.g. cards connected to it on a campaign canvas). */
export interface DraftContextItem {
  kind: 'post' | 'signal' | 'note';
  /** Post: its first part. Signal: its summary. Note: the note's text. */
  text: string;
}

export interface DraftInput {
  brand: Brand;
  idea: { title: string; angle: string };
  platform: Platform;
  /** Max characters per part. */
  maxLength: number;
  /** Optional context, most relevant first: posts best-performing first, then notes, then signals. */
  context?: DraftContextItem[];
}

export const REWRITE_INSTRUCTIONS = ['shorter', 'punchier', 'more_specific', 'hook_variations'] as const;
export type RewriteInstruction = (typeof REWRITE_INSTRUCTIONS)[number];

export interface RewriteInput {
  brand: Brand;
  text: string;
  instruction: RewriteInstruction;
  platform: Platform;
}

/** The AI surface Harbor uses. Implementations: SimulatedModel (default, offline) and AnthropicModel (off for now). */
export interface ContentModel {
  readonly name: string;
  readonly simulated: boolean;
  learnVoice(input: LearnVoiceInput): Promise<ModelResult<BrandVoice>>;
  generateIdeas(input: GenerateIdeasInput): Promise<ModelResult<IdeaSuggestion[]>>;
  draft(input: DraftInput): Promise<ModelResult<PostPart[]>>;
  /** 3 variations for hook_variations, otherwise 1. */
  rewrite(input: RewriteInput): Promise<ModelResult<string[]>>;
  /** A brand's weekly digest: wins, misses, patterns and recommendations, each citing posts and signals. */
  digest(input: DigestInput): Promise<ModelResult<DigestResult>>;
}

// ---- Digest (weekly insights) ----

export type DigestVerdict = 'outperformed' | 'met' | 'underperformed' | 'inconclusive';

/** One published post as the digest sees it. Times are the server's local time. */
export interface DigestPost {
  id: string;
  platform: Platform;
  /** All parts' text; the first part is the hook. */
  parts: string[];
  hasMedia: boolean;
  publishedAt: string;
  /** 0 = Sunday. */
  weekday: number;
  hour: number;
  /** True for posts published inside the digest period (the rest is history, used for patterns). */
  inPeriod: boolean;
  url?: string;
  /** The post_performance signal that cites this post, when there is one. */
  signalId?: string;
  /** The post's outcome against the brand + platform median at the same age. */
  outcome?: {
    verdict: DigestVerdict;
    ratio: number;
    metric: 'views' | 'likes';
    atAgeHours: number;
    baseline: number;
    actual: number;
    comparablePosts: number;
  };
  /** Views at ~24h, when the platform reports views. */
  views24h?: number;
}

export interface DigestStats {
  posts: number;
  published: number;
  medianViews24h?: number;
  /** medianViews24h against the previous period of the same length, as a ratio. */
  change?: number;
}

export interface DigestInput {
  brandName: string;
  period: { from: string; to: string };
  stats: DigestStats;
  /** Published posts in the period plus history (e.g. the last 90 days), oldest first. */
  posts: DigestPost[];
  /** The best posting slots per platform (see GET /v1/brands/:id/best-times). */
  bestTimes: { platform: Platform; basis: 'history' | 'prior'; top: { weekday: number; hour: number; score: number }[] }[];
}

export interface DigestFinding {
  title: string;
  detail: string;
  /** Post ids the finding is about. */
  posts: string[];
  /** The post_performance signals behind it. */
  signalIds: string[];
  /** 0..1 */
  confidence: number;
}

export interface DigestResult {
  headline: string;
  wins: DigestFinding[];
  misses: DigestFinding[];
  patterns: DigestFinding[];
  recommendations: DigestFinding[];
}
