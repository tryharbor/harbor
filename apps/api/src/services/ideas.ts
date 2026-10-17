import { z } from 'zod';
import { HarborError, citationSchema, newId, type Brand, type Idea, type IdeaStatus } from '@harbor/core';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { withRun, type RunInfo, type RunOpts } from './runs.ts';
import { derivePerformanceSignals, ensureMemorySignals, latestSignals, publishedPostsWithMetrics } from './signals.ts';

export interface IdeaRow {
  id: string;
  brand_id: string;
  brand_name: string;
  title: string;
  angle: string;
  status: IdeaStatus;
  basis: unknown;
  insight_ids: unknown;
  agent_run_id: string | null;
  campaign_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  post_count: number;
}

export type IdeaOut = Idea & { brandName: string; postCount: number };

/** The shape GET /v1/ideas returns for each idea. */
export const toIdea = (r: IdeaRow): IdeaOut => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  title: r.title,
  angle: r.angle,
  status: r.status,
  basis: citationSchema.array().parse(r.basis ?? []),
  insightIds: z.array(z.string()).parse(r.insight_ids ?? []),
  agentRunId: r.agent_run_id ?? undefined,
  campaignId: r.campaign_id ?? undefined,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  postCount: Number(r.post_count),
});

export const SELECT_IDEAS = `
  SELECT i.*, b.name AS brand_name, (SELECT count(*) FROM posts WHERE idea_id = i.id) AS post_count
  FROM ideas i JOIN brands b ON b.id = i.brand_id`;

export async function loadIdeaRow(db: Db, id: string): Promise<IdeaRow> {
  const [row] = await db.query<IdeaRow>(`${SELECT_IDEAS} WHERE i.id = $1`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Idea ${id} not found.`);
  return row;
}

export const loadIdea = async (db: Db, id: string): Promise<IdeaOut> => toIdea(await loadIdeaRow(db, id));

export async function insertIdea(
  db: Db,
  i: { brandId: string; title: string; angle?: string; basis?: unknown[]; agentRunId?: string; campaignId?: string },
): Promise<string> {
  const id = newId('idea');
  await db.query('INSERT INTO ideas (id, brand_id, title, angle, basis, agent_run_id, campaign_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
    id, i.brandId, i.title, i.angle ?? '', JSON.stringify(i.basis ?? []), i.agentRunId ?? null, i.campaignId ?? null,
  ]);
  return id;
}

/**
 * Generate ideas for a brand. First refreshes the brand's signals (one post_performance signal per published post
 * with snapshots, plus manual signals from audience pain points), then asks the model; every idea cites at least
 * one of those signals. Recorded as an 'ideas' agent run. `guidance` (e.g. a digest's recommendations) goes to the
 * model as extra direction; `run` says where the run came from.
 */
export async function generateIdeas(
  deps: Pick<AppDeps, 'db' | 'model'>,
  brand: Brand,
  count: number,
  opts: { campaignId?: string; guidance?: string[]; run?: RunOpts } = {},
): Promise<{ ids: string[]; run: RunInfo }> {
  const { db, model } = deps;
  await derivePerformanceSignals(db, brand.id);
  await ensureMemorySignals(db, brand);
  const signals = await latestSignals(db, brand.id, 100);
  const recentPosts = (await publishedPostsWithMetrics(db, brand.id, 20)).map((p) => ({ text: p.text, platform: p.platform, metrics: p.metrics }));
  const known = new Set(signals.map((s) => s.id));
  // A person's ideas name the brands they build.
  const speaksFor = brand.speaksFor.length
    ? await db.query<{ id: string; name: string; memory: { products?: { summary?: string }[] } }>('SELECT id, name, memory FROM brands WHERE id = ANY($1::text[])', [brand.speaksFor])
        .then((rows) => rows.map((r) => ({ id: r.id, name: r.name, summary: r.memory?.products?.[0]?.summary || undefined })))
    : [];
  const guidance = opts.guidance?.filter((g) => g.trim()) ?? [];
  // What's already on the board (not yet live), so a new batch doesn't repeat it.
  const existingTitles = (await db.query<{ title: string }>(`SELECT title FROM ideas WHERE brand_id = $1 AND status <> 'live' ORDER BY created_at DESC LIMIT 300`, [brand.id])).map((r) => r.title);
  const input = {
    count, signals: signals.length, recentPosts: recentPosts.length,
    ...(opts.campaignId ? { campaignId: opts.campaignId } : {}), ...(guidance.length ? { guidance: guidance.length } : {}),
  };
  const { value: ids, run } = await withRun(db, brand, 'ideas', input, model.name, async (runId) => {
    const res = await model.generateIdeas({ brand, signals, recentPosts, count, existingTitles, ...(guidance.length ? { guidance } : {}), ...(speaksFor.length ? { speaksFor } : {}) });
    const ids: string[] = [];
    for (const idea of res.result) {
      let basis = idea.basis.filter((b) => known.has(b.signalId));
      if (basis.length === 0 && signals[0]) basis = [{ signalId: signals[0].id, note: signals[0].summary.slice(0, 200) }];
      ids.push(await insertIdea(db, { brandId: brand.id, title: idea.title.slice(0, 300), angle: idea.angle.slice(0, 4000), basis, agentRunId: runId, campaignId: opts.campaignId }));
    }
    return { value: ids, calls: [res], output: { ideaIds: ids } };
  }, opts.run);
  return { ids, run };
}
