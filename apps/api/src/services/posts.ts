import { HarborError, normalizedMetricsSchema, postPartSchema } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import type { PostRow } from './publisher.ts';

export interface PostListRow extends PostRow {
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
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});
export type PostOut = ReturnType<typeof toPost>;

export const SELECT_POSTS = `
  SELECT p.*, b.name AS brand_name, ch.platform, ch.handle, d.parts,
    s.metrics AS latest_metrics, s.age_hours AS latest_age_hours,
    (SELECT count(*) FROM snapshots WHERE post_id = p.id) AS snapshot_count
  FROM posts p
  JOIN brands b ON b.id = p.brand_id
  JOIN channels ch ON ch.id = p.channel_id
  LEFT JOIN drafts d ON d.id = p.draft_id
  LEFT JOIN LATERAL (SELECT metrics, age_hours FROM snapshots WHERE post_id = p.id ORDER BY taken_at DESC LIMIT 1) s ON true`;

/** "Best" for a post: its latest views, or likes where the platform reports no views. */
export const POST_SCORE_SQL = `COALESCE((s.metrics->>'views')::float8, (s.metrics->>'likes')::float8)`;
export const postScore = (p: PostOut) => p.latest?.metrics.views ?? p.latest?.metrics.likes ?? -1;

export async function loadPost(db: Db, id: string): Promise<PostOut> {
  const [row] = await db.query<PostListRow>(`${SELECT_POSTS} WHERE p.id = $1`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Post ${id} not found.`);
  return toPost(row);
}
