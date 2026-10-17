import { z } from 'zod';
import { HarborError, canTransitionIdea, citationSchema, ideaStatusSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import { campaignForBrand } from '../services/campaigns.ts';
import { SELECT_IDEAS, generateIdeas, insertIdea, loadIdeaRow, loadIdea, toIdea, type IdeaRow } from '../services/ideas.ts';

const ideaCreateSchema = z
  .object({
    brandId: z.string().min(1),
    title: z.string().trim().min(1).max(300),
    angle: z.string().max(4000).default(''),
    basis: z.array(citationSchema).default([]),
    campaignId: z.string().min(1).optional(),
  })
  .strict();

const ideaUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    angle: z.string().max(4000).optional(),
    status: ideaStatusSchema.optional(),
  })
  .strict();

const bulkDeleteSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }).strict();

const generateSchema = z
  .object({
    brandId: z.string().min(1),
    count: z.number().int().min(1).max(20).default(5),
  })
  .strict();

export function registerIdeas(app: App, deps: AppDeps) {
  const { db } = deps;
  const load = (id: string) => loadIdeaRow(db, id);

  /** Ideas across every brand (the hub), or one brand with ?brandId=. Optional ?status= and ?campaignId=. */
  app.get('/v1/ideas', async (c) => {
    const brandId = c.req.query('brandId') ?? null;
    const status = c.req.query('status') ?? null;
    const campaignId = c.req.query('campaignId') ?? null;
    const rows = await db.query<IdeaRow>(
      `${SELECT_IDEAS} WHERE ($1::text IS NULL OR i.brand_id = $1) AND ($2::text IS NULL OR i.status = $2)
         AND ($3::text IS NULL OR i.campaign_id = $3)
       ORDER BY i.updated_at DESC LIMIT 500`,
      [brandId, status, campaignId],
    );
    return c.json({ data: rows.map(toIdea) });
  });

  app.post('/v1/ideas', async (c) => {
    const input = await body(c, ideaCreateSchema);
    const [brand] = await db.query('SELECT id FROM brands WHERE id = $1', [input.brandId]);
    if (!brand) throw new HarborError('NOT_FOUND', `Brand ${input.brandId} not found.`);
    if (input.campaignId) await campaignForBrand(db, input.campaignId, input.brandId);
    const id = await insertIdea(db, { brandId: input.brandId, title: input.title, angle: input.angle, basis: input.basis, campaignId: input.campaignId });
    return c.json(await loadIdea(db, id), 201);
  });

  /** Generate ideas for a brand (see generateIdeas in services/ideas.ts); every idea cites at least one signal. */
  app.post('/v1/ideas/generate', async (c) => {
    const input = await body(c, generateSchema);
    const brand = await loadBrand(db, input.brandId);
    const { ids, run } = await generateIdeas(deps, brand, input.count);
    const ideas = [];
    for (const id of ids) ideas.push(await loadIdea(db, id));
    return c.json({ data: ideas, run }, 201);
  });

  /**
   * Edit an idea or move it along the pipeline. Ideas move forward one stage at a time (or back for rework);
   * Scheduled and Live are set by scheduling and publishing posts, not by hand.
   */
  app.patch('/v1/ideas/:id', async (c) => {
    const input = await body(c, ideaUpdateSchema);
    const current = await load(c.req.param('id'));
    if (input.status && input.status !== current.status) {
      if (input.status === 'scheduled' || input.status === 'live') {
        throw new HarborError('INVALID_REQUEST', 'Ideas become Scheduled or Live when one of their posts is scheduled or published.');
      }
      if (!canTransitionIdea(current.status, input.status)) {
        throw new HarborError('INVALID_REQUEST', `An idea can't move from ${current.status} to ${input.status}.`);
      }
    }
    await db.query(
      `UPDATE ideas SET title = COALESCE($2, title), angle = COALESCE($3, angle), status = COALESCE($4, status), updated_at = now() WHERE id = $1`,
      [current.id, input.title ?? null, input.angle ?? null, input.status ?? null],
    );
    return c.json(toIdea(await load(current.id)));
  });

  /**
   * Dismiss stale suggestions in one go. Only ideas still in the Ideas stage, with no posts and nothing waiting in
   * Approvals, are removed; anything else is skipped (and listed), so a clean-up never orphans work in progress.
   */
  app.post('/v1/ideas/bulk-delete', async (c) => {
    const input = await body(c, bulkDeleteSchema);
    const ids = [...new Set(input.ids)];
    const deleted = await db.query<{ id: string }>(
      `DELETE FROM ideas i
       WHERE i.id = ANY($1::text[]) AND i.status = 'idea'
         AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.idea_id = i.id)
         AND NOT EXISTS (SELECT 1 FROM approvals a JOIN drafts d ON d.id = a.draft_id WHERE d.idea_id = i.id AND a.status = 'pending')
       RETURNING i.id`,
      [ids],
    );
    const gone = new Set(deleted.map((r) => r.id));
    return c.json({ deleted: [...gone], skipped: ids.filter((id) => !gone.has(id)) });
  });

  app.delete('/v1/ideas/:id', async (c) => {
    const rows = await db.query('DELETE FROM ideas WHERE id = $1 RETURNING id', [c.req.param('id')]);
    if (rows.length === 0) throw new HarborError('NOT_FOUND', `Idea ${c.req.param('id')} not found.`);
    return c.body(null, 204);
  });
}
