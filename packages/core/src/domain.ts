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

/** Largest logo accepted as a data URI (decoded bytes). */
export const BRAND_LOGO_MAX_BYTES = 300 * 1024;
const LOGO_DATA_URI = /^data:image\/(png|jpeg|webp|svg\+xml|gif);base64,([A-Za-z0-9+/]+={0,2})$/;

/** A brand logo: an https URL, or a base64 `data:image/(png|jpeg|webp|svg+xml|gif)` URI of at most 300 KB. */
export const brandLogoUrlSchema = z.string().superRefine((v, ctx) => {
  if (v.startsWith('data:')) {
    const m = LOGO_DATA_URI.exec(v);
    if (!m) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a base64 data:image/(png|jpeg|webp|svg+xml|gif) URI' });
      return;
    }
    const b64 = m[2]!;
    const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
    if (bytes > BRAND_LOGO_MAX_BYTES) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `image must be at most ${BRAND_LOGO_MAX_BYTES / 1024} KB` });
    return;
  }
  let url: URL | undefined;
  try {
    url = new URL(v);
  } catch {
    url = undefined;
  }
  if (!url || url.protocol !== 'https:' || v.length > 2048) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be an https URL (up to 2048 characters) or an image data URI' });
  }
});

export const brandSchema = z.object({
  id,
  workspaceId: id,
  name: z.string().min(1).max(200),
  slug,
  logoUrl: brandLogoUrlSchema.optional(),
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
    logoUrl: brandLogoUrlSchema.optional(),
    memory: brandMemorySchema.default({}),
  })
  .strict();
export type BrandCreate = z.input<typeof brandCreateSchema>;

export const brandUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    slug: slug.optional(),
    /** null removes the logo. */
    logoUrl: brandLogoUrlSchema.nullable().optional(),
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
    /** Reply themes (kind 'comment'): the theme key, the reply kind and keyword, and the posts and replies in it. */
    theme: z.string().optional(),
    replyKind: z.string().optional(),
    keyword: z.string().optional(),
    postIds: z.array(id).optional(),
    replyIds: z.array(id).optional(),
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
  /** The campaign this idea belongs to, if any. */
  campaignId: id.optional(),
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

/** 'imported': brought in from the platform's history (import past posts), not published by Harbor. */
export const postOriginSchema = z.enum(['harbor', 'imported']);
export type PostOrigin = z.infer<typeof postOriginSchema>;

export const postSchema = z.object({
  id,
  brandId: id,
  channelId: id,
  draftId: id.optional(),
  ideaId: id.optional(),
  campaignId: id.optional(),
  status: postStatusSchema,
  origin: postOriginSchema.default('harbor'),
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

/**
 * 'agent' is a parent run (an agent with steps); the model runs it makes keep their own kind. 'preview' drafts the
 * same brief with and without Brand Memory.
 */
export const AGENT_RUN_KINDS = ['insights', 'ideas', 'draft', 'outcome', 'voice', 'rewrite', 'agent', 'preview'] as const;
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

// ---- Campaign + Canvas (an infinite board of cards for one brand) ----

export const CAMPAIGN_STATUSES = ['planning', 'active', 'done'] as const;
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

/** Calendar date, `YYYY-MM-DD`. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date like 2026-10-15');

export const campaignSchema = z.object({
  id,
  brandId: id,
  brandName: z.string(),
  name: z.string().min(1).max(200),
  goal: z.string().default(''),
  status: campaignStatusSchema,
  startsOn: isoDateSchema.optional(),
  endsOn: isoDateSchema.optional(),
  /** Cards on the canvas, frames excluded. */
  itemCount: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Campaign = z.infer<typeof campaignSchema>;

export const CANVAS_ITEM_KINDS = ['idea', 'draft', 'post', 'signal', 'note', 'frame'] as const;
export const canvasItemKindSchema = z.enum(CANVAS_ITEM_KINDS);
export type CanvasItemKind = z.infer<typeof canvasItemKindSchema>;

/** Kinds whose card shows an existing Harbor object (refId → that object's id). */
export const CANVAS_REF_KINDS = ['idea', 'draft', 'post', 'signal'] as const;
export type CanvasRefKind = (typeof CANVAS_REF_KINDS)[number];
export const isCanvasRefKind = (k: CanvasItemKind): k is CanvasRefKind => (CANVAS_REF_KINDS as readonly string[]).includes(k);

export const canvasItemDataSchema = z
  .object({
    title: z.string().max(300).optional(),
    text: z.string().max(10_000).optional(),
    color: z.string().max(40).optional(),
  })
  .strict();
export type CanvasItemData = z.infer<typeof canvasItemDataSchema>;

/**
 * One card on the canvas. Positions are relative to the parent frame when `parentId` is set (React Flow
 * semantics). `entity` is the referenced idea/draft/post/signal, absent when it was deleted.
 */
export const canvasItemSchema = z.object({
  id,
  campaignId: id,
  kind: canvasItemKindSchema,
  refId: id.optional(),
  parentId: id.optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  data: canvasItemDataSchema,
  entity: z.unknown().optional(),
});
export type CanvasItem = z.infer<typeof canvasItemSchema>;

export const canvasEdgeSchema = z.object({
  id,
  campaignId: id,
  source: id,
  target: id,
  label: z.string().optional(),
});
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
