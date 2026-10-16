import { HarborError, newId, normalizedMetricsSchema, postPartSchema, type PostPart } from '@harbor/core';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { campaignForBrand } from './campaigns.ts';
import { getChannelRow } from './channels.ts';
import { insertDraft, loadDraft } from './drafts.ts';
import { OUTCOME_SELECT, postBaselineCurve, toOutcomeView, type OutcomeColumns } from './outcomes.ts';
import { publishPost, type PostRow } from './publisher.ts';

export interface PostListRow extends PostRow, OutcomeColumns {
  campaign_id: string | null;
  brand_name: string;
  platform: string;
  handle: string;
  parts: unknown;
  latest_metrics: unknown;
  latest_age_hours: number | null;
  snapshot_count: number;
}

/** The shape GET /v1/posts returns for each post. */
export const toPost = (r: PostListRow) => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  channelId: r.channel_id,
  channel: { platform: r.platform, handle: r.handle },
  ideaId: r.idea_id ?? undefined,
  campaignId: r.campaign_id ?? undefined,
  status: r.status,
  origin: r.origin ?? 'harbor',
  parts: postPartSchema.array().parse(r.parts ?? []),
  scheduledFor: r.scheduled_for ? iso(r.scheduled_for) : undefined,
  publishedAt: r.published_at ? iso(r.published_at) : undefined,
  platformPostId: r.platform_post_id ?? undefined,
  url: r.url ?? undefined,
  error: r.error ?? undefined,
  attempts: r.attempts,
  latest: r.latest_metrics
    ? { metrics: normalizedMetricsSchema.parse(r.latest_metrics), ageHours: Number(r.latest_age_hours) }
    : undefined,
  snapshotCount: Number(r.snapshot_count),
  /** How the post did against the brand's median for its platform at the same age (published posts with snapshots). */
  outcome: toOutcomeView(r),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});
export type PostOut = ReturnType<typeof toPost>;

export const SELECT_POSTS = `
  SELECT p.*, b.name AS brand_name, ch.platform, ch.handle, d.parts,
    s.metrics AS latest_metrics, s.age_hours AS latest_age_hours,
    (SELECT count(*) FROM snapshots WHERE post_id = p.id) AS snapshot_count,
    ${OUTCOME_SELECT}
  FROM posts p
  JOIN brands b ON b.id = p.brand_id
  JOIN channels ch ON ch.id = p.channel_id
  LEFT JOIN drafts d ON d.id = p.draft_id
  LEFT JOIN outcomes o ON o.post_id = p.id
  LEFT JOIN LATERAL (SELECT metrics, age_hours FROM snapshots WHERE post_id = p.id ORDER BY taken_at DESC LIMIT 1) s ON true`;

/** "Best" for a post: its latest views, or likes where the platform reports no views. */
export const POST_SCORE_SQL = `COALESCE((s.metrics->>'views')::float8, (s.metrics->>'likes')::float8)`;
export const postScore = (p: PostOut) => p.latest?.metrics.views ?? p.latest?.metrics.likes ?? -1;

export async function loadPost(db: Db, id: string): Promise<PostOut> {
  const [row] = await db.query<PostListRow>(`${SELECT_POSTS} WHERE p.id = $1`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Post ${id} not found.`);
  return toPost(row);
}

/** GET /v1/posts/:id: the post with its growth curve and the baseline curve it's compared with. */
export async function loadPostDetail(db: Db, id: string) {
  const post = await loadPost(db, id);
  const snapshots = await db.query<{ taken_at: string; age_hours: number; metrics: unknown; adapter_version: string }>(
    'SELECT taken_at, age_hours, metrics, adapter_version FROM snapshots WHERE post_id = $1 ORDER BY taken_at',
    [post.id],
  );
  return {
    ...post,
    snapshots: snapshots.map((s) => ({ takenAt: iso(s.taken_at), ageHours: Number(s.age_hours), metrics: s.metrics, adapterVersion: s.adapter_version })),
    // The brand + platform median of the post's primary metric at each schedule age (ages with ≥ 3 comparable posts).
    baselineCurve: await postBaselineCurve(db, post.id, post.outcome?.metric),
  };
}

export interface PostCreate {
  channelId: string;
  /** The post's text and media. Give either `parts` or `draftId`. */
  parts?: PostPart[];
  /** Publish an existing draft (its platform must match the channel's). */
  draftId?: string;
  /** Omit to publish now. */
  scheduledFor?: string;
  ideaId?: string;
  /** Defaults to the idea's campaign. */
  campaignId?: string;
}

/**
 * Write a post for one channel (POST /v1/posts, and approving an approval). Without scheduledFor it publishes
 * right away. Moves the idea to Scheduled.
 */
export async function createPost(deps: Pick<AppDeps, 'db' | 'registry' | 'publishDeps'>, input: PostCreate): Promise<PostOut> {
  const { db, registry } = deps;
  const channel = await getChannelRow(db, input.channelId);
  const provider = registry.get(channel.platform);
  if (!provider) throw new HarborError('INTERNAL_ERROR', `No provider for ${channel.platform}.`);
  const draft = input.draftId ? await loadDraft(db, input.draftId) : undefined;
  if (draft && draft.platform !== channel.platform) {
    throw new HarborError('INVALID_REQUEST', `Draft ${draft.id} is for ${draft.platform}, but this channel is ${channel.platform}.`);
  }
  if (draft && draft.brandId !== channel.brand_id) throw new HarborError('INVALID_REQUEST', `Draft ${draft.id} belongs to another brand.`);
  const parts = draft?.parts ?? input.parts;
  if (!parts?.length) throw new HarborError('INVALID_REQUEST', 'parts: Give either parts or draftId.');
  const ideaId = input.ideaId ?? draft?.ideaId;
  const check = provider.validate(parts);
  if (!check.ok) throw new HarborError('INVALID_REQUEST', check.issues.join(' '));
  if (channel.status !== 'connected') throw new HarborError('INVALID_REQUEST', `@${channel.handle} needs to be reconnected before posting.`);

  let campaignId = input.campaignId;
  if (campaignId) await campaignForBrand(db, campaignId, channel.brand_id);
  else if (ideaId) {
    const [idea] = await db.query<{ campaign_id: string | null }>('SELECT campaign_id FROM ideas WHERE id = $1 AND brand_id = $2', [ideaId, channel.brand_id]);
    campaignId = idea?.campaign_id ?? undefined;
  }

  const draftId =
    draft?.id ?? (await insertDraft(db, { brandId: channel.brand_id, ideaId, platform: channel.platform, channelId: channel.id, parts, author: 'human' }));
  const postId = newId('post');
  await db.query(
    `INSERT INTO posts (id, brand_id, channel_id, draft_id, idea_id, status, scheduled_for, campaign_id) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7)`,
    [postId, channel.brand_id, channel.id, draftId, ideaId ?? null, input.scheduledFor ?? new Date().toISOString(), campaignId ?? null],
  );
  if (ideaId) {
    await db.query("UPDATE ideas SET status = 'scheduled', updated_at = now() WHERE id = $1 AND status IN ('idea', 'drafting', 'approved')", [ideaId]);
  }
  if (!input.scheduledFor) await publishPost(deps.publishDeps(), postId);
  return loadPost(db, postId);
}
