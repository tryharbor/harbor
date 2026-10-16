import { z } from 'zod';
import type { App, AppDeps } from '../app.ts';
import { DEFAULT_WORKSPACE_ID, HarborError, brandCreateSchema, brandMemorySchema, brandUpdateSchema, newId } from '@harbor/core';
import { body, isUniqueViolation } from '../lib/http.ts';
import { loadBrand, prepareBrandBody, toBrand, type BrandRow } from '../services/brands.ts';
import { withRun } from '../services/runs.ts';
import { latestSignals } from '../services/signals.ts';

const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'brand';

const slugTaken = (slug: string) => new HarborError('CONFLICT', `A brand with slug "${slug}" already exists in this workspace.`);

/** Voice learning needs this much writing to say anything useful. */
export const VOICE_MIN_CHARS = 1000;

const learnSchema = z
  .object({
    examples: z.array(z.string()).max(100).optional(),
    /** Also learn from the brand's saved example posts. Defaults to true when `examples` is omitted. */
    fromExamplePosts: z.boolean().optional(),
  })
  .strict();

export function registerBrands(app: App, deps: AppDeps) {
  const { db } = deps;

  app.get('/v1/brands', async (c) => {
    const workspaceId = c.req.query('workspaceId') ?? DEFAULT_WORKSPACE_ID;
    const rows = await db.query<BrandRow>('SELECT * FROM brands WHERE workspace_id = $1 ORDER BY created_at, id', [workspaceId]);
    return c.json({ data: rows.map(toBrand) });
  });

  app.post('/v1/brands', async (c) => {
    const input = await body(c, brandCreateSchema, prepareBrandBody);
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

  app.get('/v1/brands/:id', async (c) => c.json(await loadBrand(db, c.req.param('id'))));

  /**
   * Update name/slug, and merge `memory` at the top level: each memory key given (voice, audiences, products,
   * knowledge, styleRules, examplePosts) replaces that key; the others are kept.
   */
  app.patch('/v1/brands/:id', async (c) => {
    const input = await body(c, brandUpdateSchema, prepareBrandBody);
    const id = c.req.param('id');
    const current = await loadBrand(db, id);
    const memory = input.memory ? brandMemorySchema.parse({ ...current.memory, ...input.memory }) : undefined;
    try {
      const [row] = await db.query<BrandRow>(
        `UPDATE brands SET
           name = COALESCE($2, name),
           slug = COALESCE($3, slug),
           memory = COALESCE($4::jsonb, memory),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, input.name ?? null, input.slug ?? null, memory ? JSON.stringify(memory) : null],
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

  /**
   * Learn the brand's voice from writing samples. Returns a proposal; nothing is saved (the UI saves it with
   * PATCH /v1/brands/:id { memory: { voice } }).
   */
  app.post('/v1/brands/:id/voice/learn', async (c) => {
    const input = await body(c, learnSchema);
    const brand = await loadBrand(db, c.req.param('id'));
    const given = (input.examples ?? []).map((e) => e.trim()).filter(Boolean);
    const usePosts = input.fromExamplePosts ?? input.examples === undefined;
    const posts = usePosts ? brand.memory.examplePosts : [];
    const examples = [...given, ...posts.map((p) => p.text.trim())].filter(Boolean);
    const chars = examples.reduce((n, e) => n + e.length, 0);
    if (chars < VOICE_MIN_CHARS) {
      throw new HarborError(
        'INVALID_REQUEST',
        `Voice learning needs at least ${VOICE_MIN_CHARS.toLocaleString('en-US')} characters of writing; got ${chars.toLocaleString('en-US')}. Paste more examples or add example posts.`,
      );
    }
    const { value: voice, run } = await withRun(db, brand, 'voice', { examples: examples.length, chars, fromExamplePosts: usePosts }, deps.model.name, async () => {
      const res = await deps.model.learnVoice({ brandName: brand.name, examples, existing: brand.memory.voice });
      // Sources for saved example posts point at the post, not at a pasted example.
      const sources = res.result.sources.map((s, i) => {
        const post = i >= given.length ? posts[i - given.length] : undefined;
        return post ? { kind: 'post' as const, label: s.label.replace(/^Example \d+/, 'Example post'), ref: post.url ?? post.id } : s;
      });
      const value = { ...res.result, sources };
      return { value, calls: [res], output: { voice: value } };
    });
    return c.json({ voice, run });
  });

  /** Latest 100 signals (performance, competitor, manual …) for a brand, newest first. */
  app.get('/v1/brands/:id/signals', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json({ data: await latestSignals(db, brand.id, 100) });
  });
}
