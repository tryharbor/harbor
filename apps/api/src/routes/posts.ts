import { z } from 'zod';
import { HarborError, newId, postPartSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body, iso } from '../lib/http.ts';
import { campaignForBrand } from '../services/campaigns.ts';
import { getChannelRow } from '../services/channels.ts';
import { insertDraft, loadDraft } from '../services/drafts.ts';
import { SELECT_POSTS, loadPost as loadPostOut, toPost, type PostListRow } from '../services/posts.ts';
import { publishPost } from '../services/publisher.ts';

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
    /** Defaults to the idea's campaign. */
    campaignId: z.string().min(1).optional(),
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

export function registerPosts(app: App, deps: AppDeps) {
  const { db, registry } = deps;
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
