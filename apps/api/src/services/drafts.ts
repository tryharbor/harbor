import { HarborError, newId, postPartSchema, type Draft, type Platform, type PostPart } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';

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
