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
}

export interface IdeaSuggestion {
  title: string;
  angle: string;
  /** The signals the idea is based on. */
  basis: { signalId: string; note: string }[];
}

export interface DraftInput {
  brand: Brand;
  idea: { title: string; angle: string };
  platform: Platform;
  /** Max characters per part. */
  maxLength: number;
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
}
