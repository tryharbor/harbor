import { z } from 'zod';
import { HarborError, postPartInputSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { SELECT_POSTS, createPost, loadPost as loadPostOut, loadPostDetail, toPost, type PostListRow } from '../services/posts.ts';

const postCreateSchema = z
  .object({
    channelId: z.string().min(1),
    /** The post's text and media (library assets as `{ assetId, variant? }`). Give either `parts` or `draftId`. */
    parts: z.array(postPartInputSchema).min(1).max(25).optional(),
    /** Publish an existing draft (its platform must match the channel's). */
    draftId: z.string().min(1).optional(),
    /** Omit to publish now. */
    scheduledFor: z.string().datetime({ offset: true }).optional(),
    ideaId: z.string().min(1).optional(),
    /** Defaults to the idea's campaign. */
    campaignId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => (v.parts ? !v.draftId : !!v.draftId), { message: 'Give either parts or draftId.', path: ['parts'] });

const rescheduleSchema = z.object({ scheduledFor: z.string().datetime({ offset: true }) }).strict();

const resolveSchema = z
  .object({
    /** What the owner saw on the platform. */
    outcome: z.enum(['published', 'not_published']),
    url: z.string().url().optional(),
  })
  .strict();

export function registerPosts(app: App, deps: AppDeps) {
  const { db } = deps;
  const loadPost = (id: string) => loadPostOut(db, id);

  /** Posts across every brand (Home, calendar). Filters: ?brandId= ?status= ?campaignId= ?from= ?to= (ISO, by scheduled/published time). */
  app.get('/v1/posts', async (c) => {
    const q = (k: string) => c.req.query(k) ?? null;
    const limit = Math.min(Number(q('limit') ?? 200) || 200, 500);
    const rows = await db.query<PostListRow>(
      `${SELECT_POSTS}
       WHERE ($1::text IS NULL OR p.brand_id = $1) AND ($2::text IS NULL OR p.status = $2)
         AND ($3::timestamptz IS NULL OR COALESCE(p.published_at, p.scheduled_for, p.created_at) >= $3)
         AND ($4::timestamptz IS NULL OR COALESCE(p.published_at, p.scheduled_for, p.created_at) < $4)
         AND ($6::text IS NULL OR p.campaign_id = $6)
       ORDER BY COALESCE(p.published_at, p.scheduled_for, p.created_at) DESC LIMIT $5`,
      [q('brandId'), q('status'), q('from'), q('to'), limit, q('campaignId')],
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

  app.get('/v1/posts/:id', async (c) => c.json(await loadPostDetail(db, c.req.param('id'))));

  /**
   * Move a post to another time (calendar drag-and-drop). Only scheduled posts, or failed ones, which go back to
   * scheduled with their error and attempt count cleared.
   */
  app.patch('/v1/posts/:id', async (c) => {
    const input = await body(c, rescheduleSchema);
    const id = c.req.param('id');
    const rows = await db.query(
      `UPDATE posts SET scheduled_for = $2, updated_at = now(),
         error = CASE WHEN status = 'failed' THEN NULL ELSE error END,
         attempts = CASE WHEN status = 'failed' THEN 0 ELSE attempts END,
         status = 'scheduled'
       WHERE id = $1 AND status IN ('scheduled', 'failed') RETURNING id`,
      [id, input.scheduledFor],
    );
    if (rows.length === 0) {
      await loadPost(id); // 404 when it doesn't exist
      throw new HarborError('CONFLICT', 'Only scheduled or failed posts can be rescheduled.');
    }
    return c.json(await loadPost(id));
  });

  /** Write a post for one channel. Without scheduledFor it publishes right away and returns the outcome. */
  app.post('/v1/posts', async (c) => {
    const input = await body(c, postCreateSchema);
    return c.json(await createPost(deps, input), 201);
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
