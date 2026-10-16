import { HarborError, newId, postPartSchema, type Brand, type Draft, type Platform, type PostPart } from '@harbor/core';
import type { DraftContextItem, ModelResult } from '@harbor/ai';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { withRun, type RunInfo, type RunOpts } from './runs.ts';

export interface DraftRow {
  id: string;
  brand_id: string;
  idea_id: string | null;
  platform: Platform;
  channel_id: string | null;
  parts: unknown;
  version: number;
  author: 'agent' | 'human';
  agent_run_id: string | null;
  created_at: Date | string;
  model: string | null;
}

export type DraftOut = Draft & { model?: string; simulated: boolean };

export const toDraft = (r: DraftRow): DraftOut => ({
  id: r.id,
  brandId: r.brand_id,
  ideaId: r.idea_id ?? undefined,
  platform: r.platform,
  channelId: r.channel_id ?? undefined,
  parts: postPartSchema.array().parse(r.parts ?? []),
  version: Number(r.version),
  author: r.author,
  agentRunId: r.agent_run_id ?? undefined,
  createdAt: iso(r.created_at),
  model: r.model ?? undefined,
  simulated: r.model === 'simulated-v1',
});

export const SELECT_DRAFTS = `SELECT d.*, r.model FROM drafts d LEFT JOIN agent_runs r ON r.id = d.agent_run_id`;

export async function loadDraft(db: Db, id: string): Promise<DraftOut> {
  const [row] = await db.query<DraftRow>(`${SELECT_DRAFTS} WHERE d.id = $1`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Draft ${id} not found.`);
  return toDraft(row);
}

/** Drafts are versioned per (idea, platform); a draft without an idea stands alone at version 1. */
export async function nextVersion(db: Db, ideaId: string | undefined, platform: Platform): Promise<number> {
  if (!ideaId) return 1;
  const [row] = await db.query<{ v: number | null }>('SELECT max(version) AS v FROM drafts WHERE idea_id = $1 AND platform = $2', [ideaId, platform]);
  return Number(row?.v ?? 0) + 1;
}

export async function insertDraft(
  db: Db,
  d: { brandId: string; ideaId?: string; platform: Platform; channelId?: string; parts: PostPart[]; author: 'agent' | 'human'; agentRunId?: string },
): Promise<string> {
  const id = newId('draft');
  const version = await nextVersion(db, d.ideaId, d.platform);
  await db.query(
    `INSERT INTO drafts (id, brand_id, idea_id, platform, channel_id, parts, version, author, agent_run_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, d.brandId, d.ideaId ?? null, d.platform, d.channelId ?? null, JSON.stringify(d.parts), version, d.author, d.agentRunId ?? null],
  );
  // Working on an idea moves it from Idea to Drafting.
  if (d.ideaId) await db.query("UPDATE ideas SET status = 'drafting', updated_at = now() WHERE id = $1 AND status = 'idea'", [d.ideaId]);
  return id;
}

/** Fallback when a platform has no provider registered (shouldn't happen in practice). */
export const DEFAULT_MAX: Record<Platform, number> = { x: 280, linkedin: 3000, instagram: 2200, threads: 500 };

/**
 * Write one agent draft per platform for an idea, each a new version, recorded as one 'draft' agent run.
 * `context` (e.g. cards connected to the idea on a canvas) is passed to the model as extra material; `opts.run` says
 * where the run came from.
 */
export async function generateDrafts(
  deps: Pick<AppDeps, 'db' | 'model' | 'registry'>,
  brand: Brand,
  idea: { id: string; title: string; angle: string },
  platforms: Platform[],
  context: DraftContextItem[] = [],
  opts: { run?: RunOpts } = {},
): Promise<{ ids: string[]; run: RunInfo }> {
  const { db, model } = deps;
  const input = { ideaId: idea.id, platforms, ...(context.length ? { context: context.map((c) => c.kind) } : {}) };
  const { value: ids, run } = await withRun(db, brand, 'draft', input, model.name, async (runId) => {
    const calls: ModelResult<unknown>[] = [];
    const ids: string[] = [];
    for (const platform of platforms) {
      const maxLength = deps.registry.get(platform)?.maxLength() ?? DEFAULT_MAX[platform];
      const res = await model.draft({ brand, idea: { title: idea.title, angle: idea.angle }, platform, maxLength, ...(context.length ? { context } : {}) });
      calls.push(res);
      ids.push(await insertDraft(db, { brandId: brand.id, ideaId: idea.id, platform, parts: res.result, author: 'agent', agentRunId: runId }));
    }
    return { value: ids, calls, output: { draftIds: ids } };
  }, opts.run);
  return { ids, run };
}
