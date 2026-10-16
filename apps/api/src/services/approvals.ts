import { HarborError, newId, type MediaRefInput, type Platform, type PostPartInput } from '@harbor/core';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { loadBrand } from './brands.ts';
import { SELECT_DRAFTS, insertDraft, loadDraft, toDraft, type DraftOut, type DraftRow } from './drafts.ts';
import { resolveParts } from './media.ts';
import { createPost, type PostOut } from './posts.ts';
import type { RunSource } from './runs.ts';
import { openSlots, slotLabel } from './slots.ts';
import { checkDraft, type Check } from './voice-check.ts';

/**
 * Approvals: agents never publish. Anything an agent wants posted becomes a pending approval with a proposed slot;
 * a person approves it (which schedules a post), edits it, or rejects it.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface ApprovalRow {
  id: string;
  brand_id: string;
  brand_name: string;
  run_id: string | null;
  agent_id: string | null;
  draft_id: string;
  channel_id: string;
  platform: Platform;
  handle: string;
  display_name: string | null;
  channel_status: string;
  idea_id: string | null;
  idea_title: string | null;
  proposed_for: Date | string;
  slot_score: number | null;
  reason: string;
  checks: Check[] | null;
  status: ApprovalStatus;
  decided_at: Date | string | null;
  decided_note: string | null;
  post_id: string | null;
  source: string;
  created_at: Date | string;
}

const SELECT_APPROVALS = `
  SELECT a.*, b.name AS brand_name, ch.handle, ch.display_name, ch.status AS channel_status, d.idea_id, i.title AS idea_title
  FROM approvals a
  JOIN brands b ON b.id = a.brand_id
  JOIN channels ch ON ch.id = a.channel_id
  JOIN drafts d ON d.id = a.draft_id
  LEFT JOIN ideas i ON i.id = d.idea_id`;

const toApproval = (r: ApprovalRow, draft: DraftOut) => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  runId: r.run_id ?? undefined,
  agentId: r.agent_id ?? undefined,
  source: r.source,
  status: r.status,
  draft,
  ideaId: r.idea_id ?? undefined,
  ideaTitle: r.idea_title ?? undefined,
  channel: { id: r.channel_id, platform: r.platform, handle: r.handle, displayName: r.display_name ?? undefined, status: r.channel_status },
  proposedFor: iso(r.proposed_for),
  slotScore: r.slot_score === null ? undefined : Number(r.slot_score),
  reason: r.reason,
  checks: r.checks ?? [],
  createdAt: iso(r.created_at),
  decidedAt: r.decided_at ? iso(r.decided_at) : undefined,
  decidedNote: r.decided_note ?? undefined,
  postId: r.post_id ?? undefined,
});
export type Approval = ReturnType<typeof toApproval>;

async function withDrafts(db: Db, rows: ApprovalRow[]): Promise<Approval[]> {
  if (!rows.length) return [];
  const drafts = await db.query<DraftRow>(`${SELECT_DRAFTS} WHERE d.id = ANY($1::text[])`, [[...new Set(rows.map((r) => r.draft_id))]]);
  const byId = new Map(drafts.map((d) => [d.id, toDraft(d)]));
  return rows.map((r) => toApproval(r, byId.get(r.draft_id)!));
}

export async function loadApproval(db: Db, id: string): Promise<Approval> {
  const [row] = await db.query<ApprovalRow>(`${SELECT_APPROVALS} WHERE a.id = $1`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Approval ${id} not found.`);
  return (await withDrafts(db, [row]))[0]!;
}

/** Pending first (soonest slot first), then decided ones (latest decision first). Counts ignore the status filter. */
export async function listApprovals(
  db: Db,
  f: { status?: string; brandId?: string; runId?: string; limit?: number } = {},
): Promise<{ data: Approval[]; counts: Record<ApprovalStatus, number> }> {
  const where = `($1::text IS NULL OR a.brand_id = $1) AND ($2::text IS NULL OR a.run_id = $2)`;
  const rows = await db.query<ApprovalRow>(
    `${SELECT_APPROVALS} WHERE ${where} AND ($3::text IS NULL OR a.status = $3)
     ORDER BY (a.status = 'pending') DESC, CASE WHEN a.status = 'pending' THEN a.proposed_for END ASC, a.decided_at DESC NULLS LAST, a.created_at DESC, a.id
     LIMIT $4`,
    [f.brandId ?? null, f.runId ?? null, f.status ?? null, Math.min(f.limit ?? 500, 500)],
  );
  const counted = await db.query<{ status: ApprovalStatus; n: number }>(
    `SELECT a.status, count(*)::int AS n FROM approvals a WHERE ${where} GROUP BY a.status`,
    [f.brandId ?? null, f.runId ?? null],
  );
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const c of counted) counts[c.status] = Number(c.n);
  return { data: await withDrafts(db, rows), counts };
}

export interface NewApproval {
  workspaceId: string;
  brandId: string;
  runId?: string;
  agentId?: string;
  draftId: string;
  channelId: string;
  platform: Platform;
  proposedFor: Date;
  slotScore?: number;
  reason: string;
  checks: Check[];
  source: RunSource;
}

export async function insertApproval(db: Db, a: NewApproval): Promise<string> {
  const id = newId('approval');
  await db.query(
    `INSERT INTO approvals (id, workspace_id, brand_id, run_id, agent_id, draft_id, channel_id, platform, proposed_for, slot_score, reason, checks, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id, a.workspaceId, a.brandId, a.runId ?? null, a.agentId ?? null, a.draftId, a.channelId, a.platform, a.proposedFor.toISOString(),
      a.slotScore ?? null, a.reason, JSON.stringify(a.checks), a.source,
    ],
  );
  return id;
}

/** The connected channel a draft would go out on: its own channel, else the brand's first one for that platform. */
export async function channelForDraft(db: Db, draft: Pick<DraftOut, 'id' | 'brandId' | 'platform' | 'channelId'>) {
  const [row] = await db.query<{ id: string; platform: Platform; handle: string }>(
    `SELECT id, platform, handle FROM channels WHERE brand_id = $1 AND platform = $2 AND status = 'connected'
     ORDER BY (id = $3) DESC, created_at, id LIMIT 1`,
    [draft.brandId, draft.platform, draft.channelId ?? null],
  );
  if (!row) throw new HarborError('INVALID_REQUEST', `Draft ${draft.id} is for ${draft.platform}, but the brand has no connected ${draft.platform} channel.`);
  return row;
}

/**
 * Propose a draft for posting (MCP propose_post): a pending approval on the brand's channel for the draft's
 * platform, at `proposedFor` or the next free best-time slot, with the voice check attached.
 */
export async function proposeDraft(
  deps: Pick<AppDeps, 'db' | 'registry'>,
  input: { draftId: string; proposedFor?: string; reason?: string; source: RunSource },
): Promise<Approval> {
  const { db } = deps;
  const draft = await loadDraft(db, input.draftId);
  const brand = await loadBrand(db, draft.brandId);
  const channel = await channelForDraft(db, draft);
  let at: Date;
  let score: number | undefined;
  let reason = input.reason?.trim();
  if (input.proposedFor) {
    at = new Date(input.proposedFor);
    if (Number.isNaN(at.getTime())) throw new HarborError('INVALID_REQUEST', 'proposedFor: must be an ISO date-time.');
    if (at.getTime() <= Date.now()) throw new HarborError('INVALID_REQUEST', 'proposedFor: must be in the future.');
  } else {
    const [slot] = await openSlots(db, brand.id, channel, 1);
    if (!slot) throw new HarborError('INVALID_REQUEST', `No free slot on @${channel.handle} in the next 7 days. Give proposedFor.`);
    at = slot.at;
    score = slot.score;
    reason ||= `${slotLabel(slot)} is the next free best-time slot on @${channel.handle}.`;
  }
  const id = await insertApproval(db, {
    workspaceId: brand.workspaceId, brandId: brand.id, draftId: draft.id, channelId: channel.id, platform: draft.platform,
    proposedFor: at, slotScore: score, reason: reason || 'Proposed by an agent.', checks: await checkDraft(deps, brand, draft), source: input.source,
  });
  return loadApproval(db, id);
}

const notPending = (a: { id: string; status: string }) => new HarborError('CONFLICT', `Approval ${a.id} is already ${a.status}.`);

/** The 400 for approving an Instagram post that has nothing to show. */
const INSTAGRAM_NEEDS_MEDIA = 'Instagram needs an image or video. Attach one first.';

/**
 * Approve: schedule the draft (or, with `parts` or `media`, a new human version of it) on the approval's channel at
 * its proposed time or `scheduledFor`. `media` replaces the first part's media. The time must be in the future.
 * Goes through the same path as POST /v1/posts.
 */
export async function approve(
  deps: Pick<AppDeps, 'db' | 'registry' | 'publishDeps'>,
  id: string,
  input: { scheduledFor?: string; parts?: PostPartInput[]; media?: MediaRefInput[] } = {},
): Promise<{ approval: Approval; post: PostOut }> {
  const { db } = deps;
  const current = await loadApproval(db, id);
  if (current.status !== 'pending') throw notPending(current);
  const d = current.draft;
  let edited: PostPartInput[] | undefined = input.parts;
  if (input.media) edited = (edited ?? d.parts).map((p, i) => (i === 0 ? { ...p, media: input.media! } : p));
  const parts = edited ? await resolveParts(db, d.brandId, d.platform, edited) : undefined;
  if (current.channel.platform === 'instagram' && !(parts ?? d.parts)[0]?.media.length) throw new HarborError('INVALID_REQUEST', INSTAGRAM_NEEDS_MEDIA);
  const at = input.scheduledFor ?? current.proposedFor;
  if (new Date(at).getTime() <= Date.now()) {
    throw new HarborError(
      'INVALID_REQUEST',
      input.scheduledFor ? 'scheduledFor: must be in the future.' : `The proposed time (${current.proposedFor}) has passed. Approve with a new scheduledFor.`,
    );
  }
  // Claim it first, so two approvals of the same row can't both schedule a post.
  const [claimed] = await db.query(`UPDATE approvals SET status = 'approved', decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`, [id]);
  if (!claimed) throw notPending(await loadApproval(db, id));
  try {
    let draftId = d.id;
    if (parts) draftId = await insertDraft(db, { brandId: d.brandId, ideaId: d.ideaId, platform: d.platform, channelId: current.channel.id, parts, author: 'human' });
    const post = await createPost(deps, { channelId: current.channel.id, draftId, scheduledFor: new Date(at).toISOString(), ideaId: current.ideaId });
    await db.query('UPDATE approvals SET post_id = $2, draft_id = $3 WHERE id = $1', [id, post.id, draftId]);
    return { approval: await loadApproval(db, id), post };
  } catch (err) {
    await db.query(`UPDATE approvals SET status = 'pending', decided_at = NULL WHERE id = $1`, [id]);
    throw err;
  }
}

export async function reject(db: Db, id: string, note?: string): Promise<Approval> {
  const rows = await db.query(`UPDATE approvals SET status = 'rejected', decided_at = now(), decided_note = $2 WHERE id = $1 AND status = 'pending' RETURNING id`, [
    id, note?.trim() || null,
  ]);
  if (!rows.length) throw notPending(await loadApproval(db, id));
  return loadApproval(db, id);
}
