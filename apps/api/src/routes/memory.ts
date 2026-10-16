import { z } from 'zod';
import { platformSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body, check } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import { SAVE_AS, SAVE_SOURCES, previewMemory, saveToMemory } from '../services/memory.ts';
import { applyMemoryProposal, listMemoryProposals } from '../services/memory-proposals.ts';

const statusSchema = z.enum(['pending', 'applied', 'rejected']);

const applySchema = z.object({ accept: z.array(z.string().min(1)).max(50), reject: z.array(z.string().min(1)).max(50).optional() }).strict();

export const saveSchema = z
  .object({
    from: z.object({ kind: z.enum(SAVE_SOURCES), id: z.string().min(1) }).strict(),
    as: z.enum(SAVE_AS),
    /** Overrides the source's text. */
    text: z.string().trim().min(1).max(20_000).optional(),
    note: z.string().max(2000).optional(),
    title: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

const previewSchema = z
  .object({ ideaId: z.string().min(1).optional(), brief: z.string().trim().min(1).max(4000).optional(), platform: platformSchema })
  .strict()
  .refine((v) => !!v.ideaId || !!v.brief, { message: 'Give ideaId or brief.', path: ['ideaId'] });

/** Brand Memory that learns: memory proposals, Save to Brand Memory and Preview Brand Memory. */
export function registerMemory(app: App, deps: AppDeps) {
  const { db } = deps;

  /** ?status= ?brandId=. Pending first, newest first; counts cover every status. */
  app.get('/v1/memory-proposals', async (c) => {
    const raw = c.req.query('status');
    return c.json(await listMemoryProposals(db, { status: raw ? check(statusSchema, raw) : undefined, brandId: c.req.query('brandId') }));
  });

  /** Accepted changes merge into Brand Memory (with evidence); the rest are rejected. 409 once decided. */
  app.post('/v1/memory-proposals/:id/apply', async (c) => {
    const input = await body(c, applySchema);
    return c.json(await applyMemoryProposal(db, c.req.param('id'), input));
  });

  /** Save a post, reply, theme, signal or draft as a knowledge note, excerpt, example post, or do / avoid rule. */
  app.post('/v1/brands/:id/memory/save', async (c) => {
    const input = await body(c, saveSchema);
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await saveToMemory(db, brand, input));
  });

  /** The same brief drafted with and without Brand Memory, and the rules that fired. Saves no drafts. */
  app.post('/v1/brands/:id/memory/preview', async (c) => {
    const input = await body(c, previewSchema);
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await previewMemory(deps, brand, input));
  });
}
