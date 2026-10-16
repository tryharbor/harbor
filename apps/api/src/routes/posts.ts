import { z } from 'zod';
import { HarborError, newId, normalizedMetricsSchema, postPartSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body, iso } from '../lib/http.ts';
import { getChannelRow } from '../services/channels.ts';
import { insertDraft, loadDraft } from '../services/drafts.ts';
import { publishPost, type PostRow } from '../services/publisher.ts';

const postCreateSchema = z
  .object({
    channelId: z.string().min(1),
    /** The post's text and media. Give either `parts` or `draftId`. */
    parts: z.array(postPartSchema).min(1).max(25).optional(),
    /** Publish an existing draft (its platform must match the channel's). */
    draftId: z.string().min(1).optional(),
    /** Omit to publish now. */
    scheduledFor: z.string().datetime({ offset: true }).optional(),
    ideaId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => (v.parts ? !v.draftId : !!v.draftId), { message: 'Give either parts or draftId.', path: ['parts'] });

const resolveSchema = z
  .object({
    /** What the owner saw on the platform. */
    outcome: z.enum(['published', 'not_published']),
    url: z.string().url().optional(),
  })
  .strict();

interface PostListRow extends PostRow {
  brand_name: string;
  platform: string;
  handle: string;
  parts: unknown;
  latest_metrics: unknown;
  latest_age_hours: number | null;
  snapshot_count: number;
}

const toPost = (r: PostListRow) => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  channelId: r.channel_id,
  channel: { platform: r.platform, handle: r.handle },
  ideaId: r.idea_id ?? undefined,
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

const SELECT_POSTS = `
  SELECT p.*, b.name AS brand_name, ch.platform, ch.handle, d.parts,
    s.metrics AS latest_metrics, s.age_hours AS latest_age_hours,
    (SELECT count(*) FROM snapshots WHERE post_id = p.id) AS snapshot_count
  FROM posts p
  JOIN brands b ON b.id = p.brand_id
  JOIN channels ch ON ch.id = p.channel_id
  LEFT JOIN drafts d ON d.id = p.draft_id
  LEFT JOIN LATERAL (SELECT metrics, age_hours FROM snapshots WHERE post_id = p.id ORDER BY taken_at DESC LIMIT 1) s ON true`;

export function registerPosts(app: App, deps: AppDeps) {
  const { db, registry } = deps;
  const loadPost = async (id: string) => {
    const [row] = await db.query<PostListRow>(`${SELECT_POSTS} WHERE p.id = $1`, [id]);
    if (!row) throw new HarborError('NOT_FOUND', `Post ${id} not found.`);
    return toPost(row);
  };

  /** Posts across every brand (Home, calendar). Filters: ?brandId= ?status= ?from= ?to= (ISO, by scheduled/published time). */
  app.get('/v1/posts', async (c) => {
    const q = (k: string) => c.req.query(k) ?? null;
    const limit = Math.min(Number(q('limit') ?? 200) || 200, 500);
    const rows = await db.query<PostListRow>(
      `${SELECT_POSTS}
       WHERE ($1::text IS NULL OR p.brand_id = $1) AND ($2::text IS NULL OR p.status = $2)
         AND ($3::timestamptz IS NULL OR COALESCE(p.published_at, p.scheduled_for, p.created_at) >= $3)
         AND ($4::timestamptz IS NULL OR COALESCE(p.published_at, p.scheduled_for, p.created_at) < $4)
       ORDER BY COALESCE(p.published_at, p.scheduled_for, p.created_at) DESC LIMIT $5`,
      [q('brandId'), q('status'), q('from'), q('to'), limit],
    );
    return c.json({ data: rows.map(toPost) });
  });

  app.get('/v1/brands/:brandId/posts', async (c) => {
    const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200);
    const rows = await db.query<PostListRow>(
      `${SELECT_POSTS} WHERE p.brand_id = $1 ORDER BY COALESCE(p.published_at, p.scheduled_for, p.created_at) DESC LIMIT $2`,
      [c.req.param('brandId'), limit],
    );
    return c.json({ data: rows.map(toPost) });
  });

  app.get('/v1/posts/:id', async (c) => {
    const post = await loadPost(c.req.param('id'));
    const snapshots = await db.query<{ taken_at: string; age_hours: number; metrics: unknown; adapter_version: string }>(
      'SELECT taken_at, age_hours, metrics, adapter_version FROM snapshots WHERE post_id = $1 ORDER BY taken_at',
      [post.id],
    );
    return c.json({
      ...post,
      snapshots: snapshots.map((s) => ({ takenAt: iso(s.taken_at), ageHours: Number(s.age_hours), metrics: s.metrics, adapterVersion: s.adapter_version })),
    });
  });

  /** Write a post for one channel. Without scheduledFor it publishes right away and returns the outcome. */
  app.post('/v1/posts', async (c) => {
    const input = await body(c, postCreateSchema);
    const channel = await getChannelRow(db, input.channelId);
    const provider = registry.get(channel.platform);
    if (!provider) throw new HarborError('INTERNAL_ERROR', `No provider for ${channel.platform}.`);
    const draft = input.draftId ? await loadDraft(db, input.draftId) : undefined;
    if (draft && draft.platform !== channel.platform) {
      throw new HarborError('INVALID_REQUEST', `Draft ${draft.id} is for ${draft.platform}, but this channel is ${channel.platform}.`);
    }
    if (draft && draft.brandId !== channel.brand_id) throw new HarborError('INVALID_REQUEST', `Draft ${draft.id} belongs to another brand.`);
    const parts = draft?.parts ?? input.parts!;
    const ideaId = input.ideaId ?? draft?.ideaId;
    const check = provider.validate(parts);
    if (!check.ok) throw new HarborError('INVALID_REQUEST', check.issues.join(' '));
    if (channel.status !== 'connected') throw new HarborError('INVALID_REQUEST', `@${channel.handle} needs to be reconnected before posting.`);

    const draftId =
      draft?.id ?? (await insertDraft(db, { brandId: channel.brand_id, ideaId, platform: channel.platform, channelId: channel.id, parts, author: 'human' }));
    const postId = newId('post');
    await db.query(
      `INSERT INTO posts (id, brand_id, channel_id, draft_id, idea_id, status, scheduled_for) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6)`,
      [postId, channel.brand_id, channel.id, draftId, ideaId ?? null, input.scheduledFor ?? new Date().toISOString()],
    );
    if (ideaId) {
      await db.query("UPDATE ideas SET status = 'scheduled', updated_at = now() WHERE id = $1 AND status IN ('idea', 'drafting', 'approved')", [ideaId]);
    }
    if (!input.scheduledFor) await publishPost(deps.publishDeps(), postId);
    return c.json(await loadPost(postId), 201);
  });

  /** Cancel a post that hasn't gone out. */
  app.delete('/v1/posts/:id', async (c) => {
    const rows = await db.query("DELETE FROM posts WHERE id = $1 AND status IN ('scheduled', 'failed') RETURNING id", [c.req.param('id')]);
    if (rows.length === 0) throw new HarborError('CONFLICT', 'Only scheduled or failed posts can be removed.');
    return c.body(null, 204);
  });

  /** For a post in 'unknown': the owner checked the platform and tells Harbor what happened. */
  app.post('/v1/posts/:id/resolve', async (c) => {
    const input = await body(c, resolveSchema);
    const id = c.req.param('id');
    const rows =
      input.outcome === 'published'
        ? await db.query(
            `UPDATE posts SET status = 'published', published_at = COALESCE(published_at, now()), url = COALESCE($2, url), updated_at = now()
             WHERE id = $1 AND status = 'unknown' RETURNING id`,
            [id, input.url ?? null],
          )
        : await db.query(
            `UPDATE posts SET status = 'scheduled', scheduled_for = now(), error = NULL, updated_at = now()
             WHERE id = $1 AND status = 'unknown' RETURNING id`,
            [id],
          );
    if (rows.length === 0) throw new HarborError('CONFLICT', 'Only posts with an unknown outcome can be resolved.');
    return c.json(await loadPost(id));
  });
}
