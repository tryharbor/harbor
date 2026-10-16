import { z } from 'zod';
import { brandMemoryPatchSchema, brandMemorySchema } from './memory.ts';
import { normalizedMetricsSchema, platformSchema } from './metrics.ts';

/**
 * Harbor's domain model. Zod schemas are the source of truth; TS types are inferred from them.
 * Timestamps are ISO 8601 strings. Field names are camelCase here and in the API; the database uses snake_case.
 */

const id = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });
const json = z.record(z.unknown());

// ---- Workspace ----

export const workspaceSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  createdAt: timestamp,
});
export type Workspace = z.infer<typeof workspaceSchema>;

// ---- Brand + Brand Memory ----

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes');

export const brandSchema = z.object({
  id,
  workspaceId: id,
  name: z.string().min(1).max(200),
  slug,
  memory: brandMemorySchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Brand = z.infer<typeof brandSchema>;

export const brandCreateSchema = z
  .object({
    workspaceId: id.optional(),
    name: z.string().min(1).max(200),
    slug: slug.optional(),
    memory: brandMemorySchema.default({}),
  })
  .strict();
export type BrandCreate = z.input<typeof brandCreateSchema>;

export const brandUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: slug.optional(),
    /** Merged at the top level: `{ voice }` replaces only voice. */
    memory: brandMemoryPatchSchema.optional(),
  })
  .strict();
export type BrandUpdate = z.input<typeof brandUpdateSchema>;

// ---- Competitor ----

export const competitorSchema = z.object({
  id,
  brandId: id,
  name: z.string().min(1),
  url: z.string().url().optional(),
  handles: z.array(z.object({ platform: platformSchema, handle: z.string().min(1) })).default([]),
  notes: z.string().optional(),
  createdAt: timestamp,
});
export type Competitor = z.infer<typeof competitorSchema>;

// ---- Channel (a connected social account) ----

export const channelStatusSchema = z.enum(['connected', 'refresh_needed', 'disconnected']);
export type ChannelStatus = z.infer<typeof channelStatusSchema>;

export const channelAccountSchema = z.object({
  platformAccountId: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});
export type ChannelAccount = z.infer<typeof channelAccountSchema>;

export const channelSchema = z.object({
  id,
  brandId: id,
  platform: platformSchema,
  account: channelAccountSchema,
  /** Reference into the secret store (never the token itself). */
  tokenRef: z.string().min(1),
  scopes: z.array(z.string()),
  status: channelStatusSchema,
  tokenExpiresAt: timestamp.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Channel = z.infer<typeof channelSchema>;

// ---- Signal (an observed fact Harbor can cite) ----

export const signalKindSchema = z.enum(['post_performance', 'competitor_post', 'comment', 'trend', 'manual']);
export const signalSchema = z.object({
  id,
  brandId: id,
  kind: signalKindSchema,
  summary: z.string().min(1),
  source: z.object({
    snapshotId: id.optional(),
    postId: id.optional(),
    competitorId: id.optional(),
    url: z.string().url().optional(),
  }),
  data: json.default({}),
  observedAt: timestamp,
  createdAt: timestamp,
});
export type Signal = z.infer<typeof signalSchema>;

/** A citation: the signal an insight or idea is based on, and why. */
export const citationSchema = z.object({ signalId: id, note: z.string().optional() });
export type Citation = z.infer<typeof citationSchema>;

// ---- Insight ----

export const insightSchema = z.object({
  id,
  brandId: id,
  summary: z.string().min(1),
  detail: z.string().default(''),
  basis: z.array(citationSchema).min(1),
  confidence: z.number().min(0).max(1),
  agentRunId: id.optional(),
  createdAt: timestamp,
});
export type Insight = z.infer<typeof insightSchema>;

// ---- Idea (Idea → Drafting → Approved → Scheduled → Live) ----

export const IDEA_STATUSES = ['idea', 'drafting', 'approved', 'scheduled', 'live'] as const;
export const ideaStatusSchema = z.enum(IDEA_STATUSES);
export type IdeaStatus = z.infer<typeof ideaStatusSchema>;

/** Allowed moves. Ideas only move forward one step, or back to an earlier stage for rework. Live is terminal. */
export function canTransitionIdea(from: IdeaStatus, to: IdeaStatus): boolean {
  const a = IDEA_STATUSES.indexOf(from);
  const b = IDEA_STATUSES.indexOf(to);
  if (from === 'live') return false;
  return b === a + 1 || (b < a && to !== 'live');
}

export const ideaSchema = z.object({
  id,
  brandId: id,
  title: z.string().min(1),
  angle: z.string().default(''),
  status: ideaStatusSchema,
  /** The signals this idea is based on. Empty only for ideas the owner typed in by hand. */
  basis: z.array(citationSchema).default([]),
  insightIds: z.array(id).default([]),
  agentRunId: id.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Idea = z.infer<typeof ideaSchema>;

// ---- Draft ----

export const mediaRefSchema = z.object({
  kind: z.enum(['image', 'video']),
  /** Publicly reachable URL (Instagram/Threads require one). */
  url: z.string().url(),
  alt: z.string().optional(),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

/** One unit of a post; extra parts become thread replies / first comments where the platform supports it. */
export const postPartSchema = z.object({
  text: z.string(),
  media: z.array(mediaRefSchema).default([]),
});
export type PostPart = z.infer<typeof postPartSchema>;

export const draftSchema = z.object({
  id,
  brandId: id,
  ideaId: id.optional(),
  platform: platformSchema,
  channelId: id.optional(),
  parts: z.array(postPartSchema).min(1),
  version: z.number().int().positive(),
  author: z.enum(['agent', 'human']),
  agentRunId: id.optional(),
  createdAt: timestamp,
});
export type Draft = z.infer<typeof draftSchema>;

// ---- Post (a publish attempt and its result) ----

/**
 * `unknown`: the publish call was sent but we can't tell whether it landed (timeout, 5xx, crash). Such posts are
 * never retried automatically; a human checks the platform and resolves them.
 */
export const postStatusSchema = z.enum(['scheduled', 'publishing', 'pending', 'published', 'failed', 'unknown']);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const postSchema = z.object({
  id,
  brandId: id,
  channelId: id,
  draftId: id.optional(),
  ideaId: id.optional(),
  status: postStatusSchema,
  scheduledFor: timestamp.optional(),
  publishedAt: timestamp.optional(),
  platformPostId: z.string().optional(),
  url: z.string().url().optional(),
  /** Provider state carried between publish → checkStatus → finalize. */
  pendingData: json.optional(),
  error: z.object({ kind: z.string(), message: z.string() }).optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Post = z.infer<typeof postSchema>;

// ---- Snapshot (one point on a post's growth curve) ----

export const snapshotSchema = z.object({
  id,
  postId: id,
  takenAt: timestamp,
  /** Post age when the snapshot was taken; nominally one of SNAPSHOT_SCHEDULE_HOURS. */
  ageHours: z.number().nonnegative(),
  /** Exactly what the platform returned, kept so metrics can be re-normalized later. */
  raw: z.unknown(),
  metrics: normalizedMetricsSchema,
  /** Version of the provider adapter that produced `metrics` from `raw`. */
  adapterVersion: z.string().min(1),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

// ---- Outcome (how a post did against expectations) ----

export const outcomeSchema = z.object({
  id,
  postId: id,
  ideaId: id.optional(),
  verdict: z.enum(['outperformed', 'met', 'underperformed', 'inconclusive']),
  /** Typically the brand's median for this platform at the same post age. */
  baseline: normalizedMetricsSchema,
  actual: normalizedMetricsSchema,
  atAgeHours: z.number().nonnegative(),
  notes: z.string().default(''),
  evaluatedAt: timestamp,
});
export type Outcome = z.infer<typeof outcomeSchema>;

// ---- AgentRun (one model-driven job, for audit and cost tracking) ----

export const AGENT_RUN_KINDS = ['insights', 'ideas', 'draft', 'outcome', 'voice', 'rewrite'] as const;
export const agentRunKindSchema = z.enum(AGENT_RUN_KINDS);
export type AgentRunKind = z.infer<typeof agentRunKindSchema>;

export const agentRunSchema = z.object({
  id,
  workspaceId: id,
  brandId: id.optional(),
  kind: agentRunKindSchema,
  status: z.enum(['running', 'succeeded', 'failed']),
  model: z.string().optional(),
  input: json.default({}),
  output: json.optional(),
  error: z.string().optional(),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).optional(),
  startedAt: timestamp,
  finishedAt: timestamp.optional(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;
