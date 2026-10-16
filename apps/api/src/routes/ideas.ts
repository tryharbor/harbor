import { z } from 'zod';
import { HarborError, canTransitionIdea, citationSchema, ideaStatusSchema, newId, type Idea, type IdeaStatus } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body, iso } from '../lib/http.ts';

interface IdeaRow {
  id: string;
  brand_id: string;
  brand_name: string;
  title: string;
  angle: string;
  status: IdeaStatus;
  basis: unknown;
  insight_ids: unknown;
  agent_run_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  post_count: number;
}

const toIdea = (r: IdeaRow): Idea & { brandName: string; postCount: number } => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  title: r.title,
  angle: r.angle,
  status: r.status,
  basis: citationSchema.array().parse(r.basis ?? []),
  insightIds: z.array(z.string()).parse(r.insight_ids ?? []),
  agentRunId: r.agent_run_id ?? undefined,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  postCount: Number(r.post_count),
});

const ideaCreateSchema = z
  .object({
    brandId: z.string().min(1),
    title: z.string().trim().min(1).max(300),
    angle: z.string().max(4000).default(''),
    basis: z.array(citationSchema).default([]),
  })
  .strict();

const ideaUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    angle: z.string().max(4000).optional(),
    status: ideaStatusSchema.optional(),
  })
  .strict();

const SELECT_IDEAS = `
  SELECT i.*, b.name AS brand_name, (SELECT count(*) FROM posts WHERE idea_id = i.id) AS post_count
  FROM ideas i JOIN brands b ON b.id = i.brand_id`;

export function registerIdeas(app: App, deps: AppDeps) {
  const { db } = deps;
  const load = async (id: string) => {
    const [row] = await db.query<IdeaRow>(`${SELECT_IDEAS} WHERE i.id = $1`, [id]);
    if (!row) throw new HarborError('NOT_FOUND', `Idea ${id} not found.`);
    return row;
  };

  /** Ideas across every brand (the hub), or one brand with ?brandId=. Optional ?status=. */
  app.get('/v1/ideas', async (c) => {
    const brandId = c.req.query('brandId') ?? null;
    const status = c.req.query('status') ?? null;
    const rows = await db.query<IdeaRow>(
      `${SELECT_IDEAS} WHERE ($1::text IS NULL OR i.brand_id = $1) AND ($2::text IS NULL OR i.status = $2)
       ORDER BY i.updated_at DESC LIMIT 500`,
      [brandId, status],
    );
    return c.json({ data: rows.map(toIdea) });
  });

  app.post('/v1/ideas', async (c) => {
    const input = await body(c, ideaCreateSchema);
    const [brand] = await db.query('SELECT id FROM brands WHERE id = $1', [input.brandId]);
    if (!brand) throw new HarborError('NOT_FOUND', `Brand ${input.brandId} not found.`);
    const id = newId('idea');
    await db.query('INSERT INTO ideas (id, brand_id, title, angle, basis) VALUES ($1, $2, $3, $4, $5)', [
      id, input.brandId, input.title, input.angle, JSON.stringify(input.basis),
    ]);
    return c.json(toIdea(await load(id)), 201);
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

  app.delete('/v1/ideas/:id', async (c) => {
    const rows = await db.query('DELETE FROM ideas WHERE id = $1 RETURNING id', [c.req.param('id')]);
    if (rows.length === 0) throw new HarborError('NOT_FOUND', `Idea ${c.req.param('id')} not found.`);
    return c.body(null, 204);
  });
}
