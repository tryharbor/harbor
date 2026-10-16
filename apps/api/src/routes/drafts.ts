import { z } from 'zod';
import { HarborError, platformSchema, postPartInputSchema } from '@harbor/core';
import { REWRITE_INSTRUCTIONS } from '@harbor/ai';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import { DEFAULT_MAX, SELECT_DRAFTS, generateDrafts, insertDraft, loadDraft, toDraft, type DraftRow } from '../services/drafts.ts';
import { resolveParts } from '../services/media.ts';
import { withRun } from '../services/runs.ts';

const createSchema = z
  .object({
    brandId: z.string().min(1),
    ideaId: z.string().min(1).optional(),
    platform: platformSchema,
    /** Media can be library assets, `{ assetId, variant? }`; the variant defaults to the platform's preferred crop. */
    parts: z.array(postPartInputSchema).min(1).max(25),
    author: z.literal('human').default('human'),
  })
  .strict();

const generateSchema = z
  .object({
    ideaId: z.string().min(1),
    platforms: z.array(platformSchema).min(1).max(4).transform((ps) => [...new Set(ps)]),
  })
  .strict();

const rewriteSchema = z.object({ instruction: z.enum(REWRITE_INSTRUCTIONS) }).strict();

/**
 * Keep a rewritten part within the platform's limit: drop whole sentences from the end first, and only cut
 * mid-sentence (with an ellipsis) when a single sentence is too long.
 */
export function fitToLimit(text: string, max: number): string {
  const len = (t: string) => [...t].length;
  if (len(text) <= max) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  while (sentences.length > 1 && len(sentences.join(' ')) > max) sentences.pop();
  const kept = sentences.join(' ');
  return len(kept) <= max ? kept : `${[...kept].slice(0, max - 1).join('').trimEnd()}…`;
}

export function registerDrafts(app: App, deps: AppDeps) {
  const { db, model } = deps;

  const loadIdea = async (id: string) => {
    const [idea] = await db.query<{ id: string; brand_id: string; title: string; angle: string }>('SELECT id, brand_id, title, angle FROM ideas WHERE id = $1', [id]);
    if (!idea) throw new HarborError('NOT_FOUND', `Idea ${id} not found.`);
    return idea;
  };

  /**
   * Drafts for an idea or a brand. By default only the latest version per (idea, platform); `?all=1` returns
   * every version (newest first within each idea and platform).
   */
  app.get('/v1/drafts', async (c) => {
    const ideaId = c.req.query('ideaId') ?? null;
    const brandId = c.req.query('brandId') ?? null;
    const all = ['1', 'true'].includes(c.req.query('all') ?? '');
    const where = `WHERE ($1::text IS NULL OR d.idea_id = $1) AND ($2::text IS NULL OR d.brand_id = $2)`;
    const rows = all
      ? await db.query<DraftRow>(`${SELECT_DRAFTS} ${where} ORDER BY d.idea_id NULLS LAST, d.platform, d.version DESC, d.created_at DESC LIMIT 500`, [ideaId, brandId])
      : await db.query<DraftRow>(
          `SELECT * FROM (
             SELECT DISTINCT ON (COALESCE(d.idea_id, d.id), d.platform) d.*, r.model
             FROM drafts d LEFT JOIN agent_runs r ON r.id = d.agent_run_id ${where}
             ORDER BY COALESCE(d.idea_id, d.id), d.platform, d.version DESC, d.created_at DESC
           ) latest ORDER BY created_at DESC LIMIT 200`,
          [ideaId, brandId],
        );
    return c.json({ data: rows.map(toDraft) });
  });

  /** Save a human edit as a new version (previous max version for this idea and platform + 1). */
  app.post('/v1/drafts', async (c) => {
    const input = await body(c, createSchema);
    const brand = await loadBrand(db, input.brandId);
    if (input.ideaId) {
      const idea = await loadIdea(input.ideaId);
      if (idea.brand_id !== brand.id) throw new HarborError('INVALID_REQUEST', `Idea ${idea.id} belongs to another brand.`);
    }
    const parts = await resolveParts(db, brand.id, input.platform, input.parts);
    const id = await insertDraft(db, { brandId: brand.id, ideaId: input.ideaId, platform: input.platform, parts, author: input.author });
    return c.json(await loadDraft(db, id), 201);
  });

  /** Write one agent draft per platform for an idea, each a new version. */
  app.post('/v1/drafts/generate', async (c) => {
    const input = await body(c, generateSchema);
    const idea = await loadIdea(input.ideaId);
    const brand = await loadBrand(db, idea.brand_id);
    const { ids, run } = await generateDrafts(deps, brand, idea, input.platforms);
    const drafts = [];
    for (const id of ids) drafts.push(await loadDraft(db, id));
    return c.json({ data: drafts, run }, 201);
  });

  app.get('/v1/drafts/:id', async (c) => c.json(await loadDraft(db, c.req.param('id'))));

  /**
   * Propose rewrites of a draft. Nothing is saved. Each variation is a complete draft body with thread parts
   * separated by a line containing only `---`, so the editor can use it as-is:
   * hook variations rewrite only the first part (the opener) and keep the rest of the thread; the other
   * instructions rewrite every part.
   */
  app.post('/v1/drafts/:id/rewrite', async (c) => {
    const input = await body(c, rewriteSchema);
    const draft = await loadDraft(db, c.req.param('id'));
    const brand = await loadBrand(db, draft.brandId);
    const parts = draft.parts.map((p) => p.text);
    const max = deps.registry.get(draft.platform)?.maxLength() ?? DEFAULT_MAX[draft.platform];
    const join = (xs: string[]) => xs.map((x) => fitToLimit(x, max)).join('\n---\n');
    const { value: variations, run } = await withRun(db, brand, 'rewrite', { draftId: draft.id, instruction: input.instruction }, model.name, async () => {
      if (input.instruction === 'hook_variations') {
        const res = await model.rewrite({ brand, text: parts[0] ?? '', instruction: input.instruction, platform: draft.platform });
        const value = res.result.map((v) => join([v, ...parts.slice(1)]));
        return { value, calls: [res], output: { variations: value } };
      }
      const calls = [];
      const rewritten: string[] = [];
      for (const text of parts) {
        const res = await model.rewrite({ brand, text, instruction: input.instruction, platform: draft.platform });
        calls.push(res);
        rewritten.push(res.result[0] ?? text);
      }
      const value = [join(rewritten)];
      return { value, calls, output: { variations: value } };
    }, { source: 'studio' });
    return c.json({ variations, run });
  });
}
