import { z } from 'zod';
import { HarborError, newId, platformSchema, type Competitor } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body, iso } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';

interface CompetitorRow {
  id: string;
  brand_id: string;
  name: string;
  url: string | null;
  handles: unknown;
  notes: string | null;
  created_at: Date | string;
}

const handleSchema = z.object({ platform: platformSchema, handle: z.string().trim().min(1).max(100).transform((h) => h.replace(/^@/, '')) });

const toCompetitor = (r: CompetitorRow): Competitor => ({
  id: r.id,
  brandId: r.brand_id,
  name: r.name,
  url: r.url ?? undefined,
  handles: z.array(handleSchema).catch([]).parse(r.handles ?? []),
  notes: r.notes ?? undefined,
  createdAt: iso(r.created_at),
});

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    url: z.string().url().optional(),
    handles: z.array(handleSchema).max(20).default([]),
    notes: z.string().max(4000).optional(),
  })
  .strict();

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    url: z.string().url().nullable().optional(),
    handles: z.array(handleSchema).max(20).optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .strict();

export function registerCompetitors(app: App, deps: AppDeps) {
  const { db } = deps;
  const load = async (id: string) => {
    const [row] = await db.query<CompetitorRow>('SELECT * FROM competitors WHERE id = $1', [id]);
    if (!row) throw new HarborError('NOT_FOUND', `Competitor ${id} not found.`);
    return row;
  };

  app.get('/v1/brands/:id/competitors', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const rows = await db.query<CompetitorRow>('SELECT * FROM competitors WHERE brand_id = $1 ORDER BY created_at, id', [brand.id]);
    return c.json({ data: rows.map(toCompetitor) });
  });

  app.post('/v1/brands/:id/competitors', async (c) => {
    const input = await body(c, createSchema);
    const brand = await loadBrand(db, c.req.param('id'));
    const [row] = await db.query<CompetitorRow>(
      'INSERT INTO competitors (id, brand_id, name, url, handles, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [newId('competitor'), brand.id, input.name, input.url ?? null, JSON.stringify(input.handles), input.notes ?? null],
    );
    return c.json(toCompetitor(row!), 201);
  });

  /** Partial update; `url: null` / `notes: null` clear them. */
  app.patch('/v1/competitors/:id', async (c) => {
    const input = await body(c, updateSchema);
    const cur = await load(c.req.param('id'));
    const pick = <T>(v: T | null | undefined, old: T | null) => (v === undefined ? old : v);
    const [row] = await db.query<CompetitorRow>(
      'UPDATE competitors SET name = $2, url = $3, handles = $4, notes = $5 WHERE id = $1 RETURNING *',
      [cur.id, input.name ?? cur.name, pick(input.url, cur.url), JSON.stringify(input.handles ?? cur.handles ?? []), pick(input.notes, cur.notes)],
    );
    return c.json(toCompetitor(row!));
  });

  app.delete('/v1/competitors/:id', async (c) => {
    const rows = await db.query('DELETE FROM competitors WHERE id = $1 RETURNING id', [c.req.param('id')]);
    if (rows.length === 0) throw new HarborError('NOT_FOUND', `Competitor ${c.req.param('id')} not found.`);
    return c.body(null, 204);
  });
}
