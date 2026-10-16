import { HarborError, brandMemorySchema, newId, shortId, type BrandMemory, type Evidence, type EvidenceKind, type Platform } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { loadBrand } from './brands.ts';
import type { EvidencePost } from './voice-learning.ts';

/**
 * Memory proposals: Brand Memory changes an agent (the voice refresh) wants, each with its evidence. Like posts,
 * nothing changes until a person applies them (decision 0003): accepted changes merge into Brand Memory and the
 * rest are rejected.
 */

export const MEMORY_TARGETS = ['voice.do', 'voice.avoid', 'voice.excerpts', 'voice.bannedWords', 'knowledge', 'examplePosts'] as const;
export type MemoryTarget = (typeof MEMORY_TARGETS)[number];

export interface MemoryChange {
  /** Short id within the proposal. */
  id: string;
  op: 'add' | 'remove';
  target: MemoryTarget;
  text: string;
  why: string;
  lift?: number;
  evidence: { posts: EvidencePost[]; signals: string[] };
  status: 'pending' | 'accepted' | 'rejected';
}

export type ProposalStatus = 'pending' | 'applied' | 'rejected';

interface ProposalRow {
  id: string;
  brand_id: string;
  brand_name: string;
  run_id: string | null;
  agent_id: string | null;
  status: ProposalStatus;
  changes: MemoryChange[] | null;
  created_at: Date | string;
  decided_at: Date | string | null;
}

const toProposal = (r: ProposalRow) => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  runId: r.run_id ?? undefined,
  agentId: r.agent_id ?? undefined,
  status: r.status,
  changes: r.changes ?? [],
  createdAt: iso(r.created_at),
  decidedAt: r.decided_at ? iso(r.decided_at) : undefined,
});
export type MemoryProposal = ReturnType<typeof toProposal>;

const SELECT_PROPOSALS = `SELECT m.*, b.name AS brand_name FROM memory_proposals m JOIN brands b ON b.id = m.brand_id`;

export async function loadMemoryProposal(db: Db, id: string): Promise<MemoryProposal> {
  const [row] = await db.query<ProposalRow>(`${SELECT_PROPOSALS} WHERE m.id = $1`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Memory proposal ${id} not found.`);
  return toProposal(row);
}

/** Pending first, newest first. Counts ignore the status filter. */
export async function listMemoryProposals(db: Db, f: { status?: ProposalStatus; brandId?: string } = {}) {
  const rows = await db.query<ProposalRow>(
    `${SELECT_PROPOSALS} WHERE ($1::text IS NULL OR m.brand_id = $1) AND ($2::text IS NULL OR m.status = $2)
     ORDER BY (m.status = 'pending') DESC, m.created_at DESC, m.id LIMIT 200`,
    [f.brandId ?? null, f.status ?? null],
  );
  const counted = await db.query<{ status: ProposalStatus; n: number }>(
    'SELECT status, count(*)::int AS n FROM memory_proposals WHERE ($1::text IS NULL OR brand_id = $1) GROUP BY status',
    [f.brandId ?? null],
  );
  const counts: Record<ProposalStatus, number> = { pending: 0, applied: 0, rejected: 0 };
  for (const c of counted) counts[c.status] = Number(c.n);
  return { data: rows.map(toProposal), counts };
}

export async function insertMemoryProposal(
  db: Db,
  p: { workspaceId: string; brandId: string; runId?: string; agentId?: string; changes: Omit<MemoryChange, 'id' | 'status'>[] },
): Promise<string> {
  const id = newId('memoryProposal');
  const changes: MemoryChange[] = p.changes.map((c, i) => ({ ...c, id: `c${i + 1}`, status: 'pending' }));
  await db.query('INSERT INTO memory_proposals (id, workspace_id, brand_id, run_id, agent_id, changes) VALUES ($1, $2, $3, $4, $5, $6)', [
    id, p.workspaceId, p.brandId, p.runId ?? null, p.agentId ?? null, JSON.stringify(changes),
  ]);
  return id;
}

// ---- Merging changes into Brand Memory ----

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const VOICE_LISTS = { 'voice.do': 'do', 'voice.avoid': 'avoid', 'voice.bannedWords': 'bannedWords' } as const;
const EVIDENCE_KIND: Partial<Record<MemoryTarget, EvidenceKind>> = { 'voice.do': 'do', 'voice.avoid': 'avoid', 'voice.bannedWords': 'banned', 'voice.excerpts': 'excerpt' };

/** Whether `text` is already in the target (case-insensitive). */
export function inTarget(memory: BrandMemory, target: MemoryTarget, text: string): boolean {
  switch (target) {
    case 'voice.do':
    case 'voice.avoid':
    case 'voice.bannedWords':
      return memory.voice[VOICE_LISTS[target]].some((r) => same(r, text));
    case 'voice.excerpts':
      return memory.voice.excerpts.some((e) => same(e.text, text));
    case 'knowledge':
      return memory.knowledge.some((k) => same(k.title, text) || (k.body ?? '').trim().toLowerCase().startsWith(text.trim().toLowerCase()));
    case 'examplePosts':
      return memory.examplePosts.some((e) => same(e.text, text));
  }
}

/** Add evidence for a rule, replacing what an earlier save of the same rule wrote. */
export function withEvidence(memory: BrandMemory, e: Evidence): BrandMemory {
  const rest = memory.voice.evidence.filter((x) => !(x.kind === e.kind && x.rule === e.rule));
  return { ...memory, voice: { ...memory.voice, evidence: [...rest, e] } };
}

export interface ChangeInput {
  op: 'add' | 'remove';
  target: MemoryTarget;
  text: string;
  /** Knowledge note title (defaults to the first 80 characters). */
  title?: string;
  /** Knowledge body (defaults to the text). */
  body?: string;
  platform?: Platform;
  url?: string;
  /** Example post note. */
  note?: string;
  /** Excerpt source label. */
  excerptSource?: string;
  /** Written for voice rules and excerpts. */
  evidence?: Omit<Evidence, 'rule' | 'kind'>;
}

/** Apply one change to Brand Memory (not saved). An add that's already there only refreshes its evidence. */
export function applyChange(memory: BrandMemory, c: ChangeInput): BrandMemory {
  const text = c.text.trim();
  let m = memory;
  const v = m.voice;
  if (c.op === 'remove') {
    switch (c.target) {
      case 'voice.do':
      case 'voice.avoid':
      case 'voice.bannedWords': {
        const key = VOICE_LISTS[c.target];
        return { ...m, voice: { ...v, [key]: v[key].filter((r) => !same(r, text)) } };
      }
      case 'voice.excerpts':
        return { ...m, voice: { ...v, excerpts: v.excerpts.filter((e) => !same(e.text, text)) } };
      case 'knowledge':
        return { ...m, knowledge: m.knowledge.filter((k) => !same(k.title, text) && !same(k.body ?? '', text)) };
      case 'examplePosts':
        return { ...m, examplePosts: m.examplePosts.filter((e) => !same(e.text, text)) };
    }
  }
  let rule = text;
  switch (c.target) {
    case 'voice.do':
    case 'voice.avoid':
    case 'voice.bannedWords': {
      const key = VOICE_LISTS[c.target];
      const existing = v[key].find((r) => same(r, text));
      if (existing) rule = existing;
      else m = { ...m, voice: { ...v, [key]: [...v[key], text] } };
      break;
    }
    case 'voice.excerpts': {
      const existing = v.excerpts.find((e) => same(e.text, text));
      if (existing) rule = existing.text;
      else m = { ...m, voice: { ...v, excerpts: [...v.excerpts, { text, ...(c.excerptSource ? { source: c.excerptSource } : {}) }] } };
      break;
    }
    case 'knowledge':
      if (!inTarget(m, 'knowledge', text)) {
        const title = (c.title?.trim() || text.replace(/\s+/g, ' ')).slice(0, 80);
        m = { ...m, knowledge: [...m.knowledge, { id: shortId(), title, kind: 'note', body: (c.body ?? text).slice(0, 20_000) }] };
      }
      break;
    case 'examplePosts':
      if (!inTarget(m, 'examplePosts', text)) {
        m = { ...m, examplePosts: [...m.examplePosts, { id: shortId(), text, ...(c.platform ? { platform: c.platform } : {}), ...(c.url ? { url: c.url } : {}), ...(c.note ? { note: c.note } : {}) }] };
      }
      break;
  }
  const kind = EVIDENCE_KIND[c.target];
  if (kind && c.evidence) m = withEvidence(m, { ...c.evidence, rule, kind });
  return m;
}

/** Validate (and prune evidence for removed rules), then store. Returns what was stored. */
export async function saveMemory(db: Db, brandId: string, memory: BrandMemory): Promise<BrandMemory> {
  const parsed = brandMemorySchema.parse(memory);
  await db.query('UPDATE brands SET memory = $2, updated_at = now() WHERE id = $1', [brandId, JSON.stringify(parsed)]);
  return parsed;
}

/**
 * Apply a proposal: accepted changes merge into Brand Memory with evidence (source 'refresh'), everything else is
 * rejected. The proposal becomes 'applied', or 'rejected' when nothing was accepted. Only pending proposals.
 */
export async function applyMemoryProposal(db: Db, id: string, input: { accept: string[]; reject?: string[] }): Promise<{ proposal: MemoryProposal; memory: BrandMemory }> {
  const current = await loadMemoryProposal(db, id);
  if (current.status !== 'pending') throw new HarborError('CONFLICT', `Memory proposal ${id} is already ${current.status}.`);
  const known = new Set(current.changes.map((c) => c.id));
  const unknown = [...input.accept, ...(input.reject ?? [])].filter((x) => !known.has(x));
  if (unknown.length) throw new HarborError('INVALID_REQUEST', `Unknown change ids: ${unknown.join(', ')}. This proposal has ${[...known].join(', ')}.`);
  const both = input.accept.filter((x) => input.reject?.includes(x));
  if (both.length) throw new HarborError('INVALID_REQUEST', `A change can't be both accepted and rejected: ${both.join(', ')}.`);

  const brand = await loadBrand(db, current.brandId);
  const accepted = new Set(input.accept);
  const at = new Date().toISOString();
  let memory = brand.memory;
  for (const c of current.changes.filter((x) => accepted.has(x.id))) {
    memory = applyChange(memory, {
      op: c.op, target: c.target, text: c.text, note: c.why, platform: c.evidence.posts[0]?.platform, excerptSource: 'Voice refresh',
      evidence: { posts: c.evidence.posts.map((p) => p.id), signals: c.evidence.signals, note: c.why, source: 'refresh', at },
    });
  }
  const changes = current.changes.map((c): MemoryChange => ({ ...c, status: accepted.has(c.id) ? 'accepted' : 'rejected' }));
  const status: ProposalStatus = accepted.size ? 'applied' : 'rejected';
  const [claimed] = await db.query(
    `UPDATE memory_proposals SET status = $2, changes = $3, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, status, JSON.stringify(changes)],
  );
  if (!claimed) throw new HarborError('CONFLICT', `Memory proposal ${id} was decided in the meantime.`);
  const saved = accepted.size ? await saveMemory(db, brand.id, memory) : brand.memory;
  return { proposal: await loadMemoryProposal(db, id), memory: saved };
}
