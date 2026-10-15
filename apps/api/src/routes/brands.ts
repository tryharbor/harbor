import type { App } from '../app.ts';
import {
  DEFAULT_WORKSPACE_ID,
  HarborError,
  brandCreateSchema,
  brandMemorySchema,
  brandUpdateSchema,
  newId,
  type Brand,
} from '@harbor/core';
import type { Db } from '../db/client.ts';
import { body, iso, isUniqueViolation } from '../lib/http.ts';

interface BrandRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  memory: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

const toBrand = (r: BrandRow): Brand => ({
  id: r.id,
  workspaceId: r.workspace_id,
  name: r.name,
  slug: r.slug,
  memory: brandMemorySchema.parse(r.memory ?? {}),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'brand';

const slugTaken = (slug: string) => new HarborError('CONFLICT', `A brand with slug "${slug}" already exists in this workspace.`);

export function registerBrands(app: App, db: Db) {
  app.get('/v1/brands', async (c) => {
    const workspaceId = c.req.query('workspaceId') ?? DEFAULT_WORKSPACE_ID;
    const rows = await db.query<BrandRow>('SELECT * FROM brands WHERE workspace_id = $1 ORDER BY created_at, id', [workspaceId]);
    return c.json({ data: rows.map(toBrand) });
  });

  app.post('/v1/brands', async (c) => {
    const input = await body(c, brandCreateSchema);
    const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const [ws] = await db.query('SELECT id FROM workspaces WHERE id = $1', [workspaceId]);
    if (!ws) throw new HarborError('NOT_FOUND', `Workspace ${workspaceId} not found.`);
    const slug = input.slug ?? slugify(input.name);
    try {
      const [row] = await db.query<BrandRow>(
        'INSERT INTO brands (id, workspace_id, name, slug, memory) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [newId('brand'), workspaceId, input.name, slug, JSON.stringify(input.memory)],
      );
      return c.json(toBrand(row!), 201);
    } catch (err) {
      if (isUniqueViolation(err)) throw slugTaken(slug);
      throw err;
    }
  });

  app.get('/v1/brands/:id', async (c) => {
    const [row] = await db.query<BrandRow>('SELECT * FROM brands WHERE id = $1', [c.req.param('id')]);
    if (!row) throw new HarborError('NOT_FOUND', `Brand ${c.req.param('id')} not found.`);
    return c.json(toBrand(row));
  });

  // PATCH replaces whole top-level fields; `memory`, when given, is the full new Brand Memory document.
  app.patch('/v1/brands/:id', async (c) => {
    const input = await body(c, brandUpdateSchema);
    const id = c.req.param('id');
    try {
      const [row] = await db.query<BrandRow>(
        `UPDATE brands SET
           name = COALESCE($2, name),
           slug = COALESCE($3, slug),
           memory = COALESCE($4::jsonb, memory),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, input.name ?? null, input.slug ?? null, input.memory ? JSON.stringify(input.memory) : null],
      );
      if (!row) throw new HarborError('NOT_FOUND', `Brand ${id} not found.`);
      return c.json(toBrand(row));
    } catch (err) {
      if (isUniqueViolation(err)) throw slugTaken(input.slug ?? '');
      throw err;
    }
  });

  app.delete('/v1/brands/:id', async (c) => {
    const rows = await db.query('DELETE FROM brands WHERE id = $1 RETURNING id', [c.req.param('id')]);
    if (rows.length === 0) throw new HarborError('NOT_FOUND', `Brand ${c.req.param('id')} not found.`);
    return c.body(null, 204);
  });
}
