import {
  HarborError,
  canvasItemDataSchema,
  newId,
  type Campaign,
  type CampaignStatus,
  type CanvasEdge,
  type CanvasItem,
  type CanvasItemData,
  type CanvasItemKind,
  type CanvasRefKind,
} from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { SELECT_DRAFTS, toDraft, type DraftRow } from './drafts.ts';
import { SELECT_IDEAS, toIdea, type IdeaRow } from './ideas.ts';
import { SELECT_POSTS, toPost, type PostListRow } from './posts.ts';

// ---- Campaigns ----

export interface CampaignRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  brand_name: string;
  name: string;
  goal: string;
  status: CampaignStatus;
  starts_on: string | null;
  ends_on: string | null;
  item_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Dates come back as text so neither driver turns them into midnight-UTC Date objects. */
export const SELECT_CAMPAIGNS = `
  SELECT c.id, c.workspace_id, c.brand_id, b.name AS brand_name, c.name, c.goal, c.status,
    to_char(c.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(c.ends_on, 'YYYY-MM-DD') AS ends_on,
    (SELECT count(*) FROM canvas_items WHERE campaign_id = c.id AND kind <> 'frame') AS item_count,
    c.created_at, c.updated_at
  FROM campaigns c JOIN brands b ON b.id = c.brand_id`;

export const toCampaign = (r: CampaignRow): Campaign => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  name: r.name,
  goal: r.goal,
  status: r.status,
  startsOn: r.starts_on ?? undefined,
  endsOn: r.ends_on ?? undefined,
  itemCount: Number(r.item_count),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function loadCampaignRow(db: Db, id: string): Promise<CampaignRow> {
  const [row] = await db.query<CampaignRow>(`${SELECT_CAMPAIGNS} WHERE c.id = $1`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Campaign ${id} not found.`);
  return row;
}

/** For bodies that name a campaign: it must exist (404) and belong to the same brand (400). */
export async function campaignForBrand(db: Db, campaignId: string, brandId: string): Promise<CampaignRow> {
  const row = await loadCampaignRow(db, campaignId);
  if (row.brand_id !== brandId) throw new HarborError('INVALID_REQUEST', `Campaign ${campaignId} belongs to another brand.`);
  return row;
}

// ---- Canvas items ----

export interface ItemRow {
  id: string;
  campaign_id: string;
  kind: CanvasItemKind;
  ref_id: string | null;
  parent_id: string | null;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  data: unknown;
  created_at: Date | string;
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? undefined : Number(v));

export const itemData = (r: Pick<ItemRow, 'data'>): CanvasItemData => canvasItemDataSchema.strip().catch({}).parse(r.data ?? {});

export const toItem = (r: ItemRow, entity?: unknown): CanvasItem => ({
  id: r.id,
  campaignId: r.campaign_id,
  kind: r.kind,
  refId: r.ref_id ?? undefined,
  parentId: r.parent_id ?? undefined,
  x: Number(r.x),
  y: Number(r.y),
  width: num(r.width),
  height: num(r.height),
  data: itemData(r),
  ...(entity === undefined ? {} : { entity }),
});

export async function listItems(db: Db, campaignId: string): Promise<ItemRow[]> {
  return db.query<ItemRow>('SELECT * FROM canvas_items WHERE campaign_id = $1 ORDER BY seq', [campaignId]);
}

export async function loadItemRow(db: Db, id: string): Promise<ItemRow> {
  const [row] = await db.query<ItemRow>('SELECT * FROM canvas_items WHERE id = $1', [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Canvas item ${id} not found.`);
  return row;
}

export interface NewItem {
  campaignId: string;
  kind: CanvasItemKind;
  refId?: string | null;
  parentId?: string | null;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  data?: CanvasItemData;
}

export async function insertItem(db: Db, i: NewItem): Promise<ItemRow> {
  const [row] = await db.query<ItemRow>(
    `INSERT INTO canvas_items (id, campaign_id, kind, ref_id, parent_id, x, y, width, height, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [newId('canvasItem'), i.campaignId, i.kind, i.refId ?? null, i.parentId ?? null, i.x, i.y, i.width ?? null, i.height ?? null, JSON.stringify(i.data ?? {})],
  );
  return row!;
}

/** Ideas and posts put on a campaign's canvas join that campaign, unless they already belong to one. */
export async function claimForCampaign(db: Db, kind: CanvasRefKind, refId: string, campaignId: string): Promise<void> {
  if (kind === 'idea') await db.query('UPDATE ideas SET campaign_id = $2 WHERE id = $1 AND campaign_id IS NULL', [refId, campaignId]);
  if (kind === 'post') await db.query('UPDATE posts SET campaign_id = $2 WHERE id = $1 AND campaign_id IS NULL', [refId, campaignId]);
}

export async function updateItemGeometry(db: Db, r: Pick<ItemRow, 'id' | 'x' | 'y' | 'width' | 'height' | 'parent_id'>): Promise<void> {
  await db.query('UPDATE canvas_items SET x = $2, y = $3, width = $4, height = $5, parent_id = $6, updated_at = now() WHERE id = $1', [
    r.id, r.x, r.y, r.width, r.height, r.parent_id,
  ]);
}

/** The signal fields a canvas card shows. */
export interface SignalEntity {
  id: string;
  kind: string;
  summary: string;
  observedAt: string;
}

const entityKey = (kind: string, refId: string) => `${kind}:${refId}`;

/**
 * Look up the idea/draft/post/signal behind each ref card, in the same shape the list endpoints return.
 * Deleted entities are simply missing from the map.
 */
export async function resolveEntities(db: Db, rows: Pick<ItemRow, 'kind' | 'ref_id'>[]): Promise<Map<string, unknown>> {
  const ids = (kind: CanvasRefKind) => [...new Set(rows.filter((r) => r.kind === kind && r.ref_id).map((r) => r.ref_id!))];
  const out = new Map<string, unknown>();
  const ideas = ids('idea');
  if (ideas.length) for (const r of await db.query<IdeaRow>(`${SELECT_IDEAS} WHERE i.id = ANY($1::text[])`, [ideas])) out.set(entityKey('idea', r.id), toIdea(r));
  const drafts = ids('draft');
  if (drafts.length) for (const r of await db.query<DraftRow>(`${SELECT_DRAFTS} WHERE d.id = ANY($1::text[])`, [drafts])) out.set(entityKey('draft', r.id), toDraft(r));
  const posts = ids('post');
  if (posts.length) for (const r of await db.query<PostListRow>(`${SELECT_POSTS} WHERE p.id = ANY($1::text[])`, [posts])) out.set(entityKey('post', r.id), toPost(r));
  const signals = ids('signal');
  if (signals.length) {
    const rs = await db.query<{ id: string; kind: string; summary: string; observed_at: Date | string }>(
      'SELECT id, kind, summary, observed_at FROM signals WHERE id = ANY($1::text[])',
      [signals],
    );
    for (const r of rs) out.set(entityKey('signal', r.id), { id: r.id, kind: r.kind, summary: r.summary, observedAt: iso(r.observed_at) } satisfies SignalEntity);
  }
  return out;
}

export async function withEntities(db: Db, rows: ItemRow[]): Promise<CanvasItem[]> {
  const entities = await resolveEntities(db, rows);
  return rows.map((r) => toItem(r, r.ref_id ? entities.get(entityKey(r.kind, r.ref_id)) : undefined));
}

export const itemOut = async (db: Db, row: ItemRow): Promise<CanvasItem> => (await withEntities(db, [row]))[0]!;

/** Frames first (outer frames before nested ones) so React Flow parents precede their children. */
export function orderForCanvas(rows: ItemRow[]): ItemRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depth = (r: ItemRow) => {
    let d = 0;
    for (let p = r.parent_id; p && byId.has(p) && d < rows.length; p = byId.get(p)!.parent_id) d++;
    return d;
  };
  const frames = rows.filter((r) => r.kind === 'frame').map((r) => ({ r, d: depth(r) }));
  frames.sort((a, b) => a.d - b.d);
  return [...frames.map((f) => f.r), ...rows.filter((r) => r.kind !== 'frame')];
}

/** A parent must be a frame of the same campaign, and an item can't end up inside itself. */
export function checkParent(byId: Map<string, Pick<ItemRow, 'id' | 'kind' | 'parent_id'>>, itemId: string | undefined, parentId: string): void {
  const parent = byId.get(parentId);
  if (!parent) throw new HarborError('INVALID_REQUEST', `parentId: ${parentId} is not an item of this campaign.`);
  if (parent.kind !== 'frame') throw new HarborError('INVALID_REQUEST', `parentId: ${parentId} is not a frame.`);
  const seen = new Set<string>();
  for (let p: string | null = parentId; p; p = byId.get(p)?.parent_id ?? null) {
    if (p === itemId || seen.has(p)) throw new HarborError('INVALID_REQUEST', 'parentId: a frame cannot be placed inside itself.');
    seen.add(p);
  }
}

// ---- Canvas edges ----

export interface EdgeRow {
  id: string;
  campaign_id: string;
  source: string;
  target: string;
  label: string | null;
}

export const toEdge = (r: EdgeRow): CanvasEdge => ({
  id: r.id,
  campaignId: r.campaign_id,
  source: r.source,
  target: r.target,
  ...(r.label ? { label: r.label } : {}),
});

export async function listEdges(db: Db, campaignId: string): Promise<EdgeRow[]> {
  return db.query<EdgeRow>('SELECT * FROM canvas_edges WHERE campaign_id = $1 ORDER BY seq', [campaignId]);
}

/** Insert an edge, or return the existing one for the same (source, target). */
export async function upsertEdge(db: Db, e: { campaignId: string; source: string; target: string; label?: string }): Promise<{ edge: EdgeRow; created: boolean }> {
  const [created] = await db.query<EdgeRow>(
    `INSERT INTO canvas_edges (id, campaign_id, source, target, label) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source, target) DO NOTHING RETURNING *`,
    [newId('canvasEdge'), e.campaignId, e.source, e.target, e.label ?? null],
  );
  if (created) return { edge: created, created: true };
  const [existing] = await db.query<EdgeRow>('SELECT * FROM canvas_edges WHERE source = $1 AND target = $2', [e.source, e.target]);
  return { edge: existing!, created: false };
}

// ---- Layout ----

export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

/** Card sizes the agent uses, and the sizes assumed for cards saved without one. */
export const CARD: Record<CanvasItemKind, Size> = {
  idea: { w: 280, h: 150 },
  draft: { w: 320, h: 220 },
  post: { w: 300, h: 170 },
  signal: { w: 280, h: 120 },
  note: { w: 240, h: 140 },
  frame: { w: 640, h: 520 },
};
export const GAP = 20;
/** Space for a frame's title bar. */
export const FRAME_HEADER = 48;

/** The frames every new campaign starts with. */
export const DEFAULT_FRAMES = [
  { title: 'Ideas', x: 0, y: 0, width: 640, height: 520 },
  { title: 'Drafts', x: 720, y: 0, width: 900, height: 520 },
  { title: 'Published', x: 1700, y: 0, width: 640, height: 520 },
] as const;

export const sizeOf = (r: Pick<ItemRow, 'kind' | 'width' | 'height'>): Size => ({
  w: num(r.width) ?? CARD[r.kind].w,
  h: num(r.height) ?? CARD[r.kind].h,
});

/** Canvas (absolute) position: positions are relative to the parent frame. */
export function absOf(r: ItemRow, byId: Map<string, ItemRow>): Point {
  let x = Number(r.x);
  let y = Number(r.y);
  const seen = new Set([r.id]);
  for (let p = r.parent_id ? byId.get(r.parent_id) : undefined; p && !seen.has(p.id); p = p.parent_id ? byId.get(p.parent_id) : undefined) {
    seen.add(p.id);
    x += Number(p.x);
    y += Number(p.y);
  }
  return { x, y };
}

/** The oldest frame with this title (case-insensitive). */
export const findFrame = (rows: ItemRow[], title: string): ItemRow | undefined =>
  rows.find((r) => r.kind === 'frame' && (itemData(r).title ?? '').trim().toLowerCase() === title.toLowerCase());

/**
 * Grid positions (relative to the frame) for `n` new cards inside a frame, below the cards already in it. Returns
 * the frame size it needs when the cards don't fit.
 */
export function gridInFrame(frame: ItemRow, rows: ItemRow[], n: number, card: Size, cols?: number): { positions: Point[]; grow?: Size } {
  const fs = sizeOf(frame);
  const children = rows.filter((r) => r.parent_id === frame.id);
  const startY = Math.max(FRAME_HEADER, ...children.map((c) => Number(c.y) + sizeOf(c).h + GAP));
  const c = Math.max(1, cols ?? Math.floor((fs.w - GAP) / (card.w + GAP)));
  const positions = Array.from({ length: n }, (_, i) => ({ x: GAP + (i % c) * (card.w + GAP), y: startY + Math.floor(i / c) * (card.h + GAP) }));
  // Grow only when cards would stick out, then leave one gap of padding below/right of them.
  const bottom = startY + Math.ceil(n / c) * (card.h + GAP) - GAP;
  const right = GAP + Math.min(n, c) * (card.w + GAP) - GAP;
  const overflows = bottom > fs.h || right > fs.w;
  return { positions, grow: overflows ? { w: Math.max(fs.w, right > fs.w ? right + GAP : fs.w), h: Math.max(fs.h, bottom > fs.h ? bottom + GAP : fs.h) } : undefined };
}

/** Grid positions (absolute) for `n` cards to the right of everything on the canvas. */
export function gridRightOfAll(rows: ItemRow[], n: number, card: Size, cols: number): Point[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const boxes = rows.map((r) => ({ ...absOf(r, byId), ...sizeOf(r) }));
  const x0 = boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) + 80 : 0;
  const y0 = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (card.w + GAP), y: y0 + Math.floor(i / cols) * (card.h + GAP) }));
}

/** A free column at `x` (absolute, top-level cards only): the first y below whatever already sits in it, from `top`. */
export function columnStart(rows: ItemRow[], x: number, w: number, top: number): number {
  const inColumn = rows.filter((r) => !r.parent_id && Number(r.x) < x + w && Number(r.x) + sizeOf(r).w > x);
  return Math.max(top, ...inColumn.map((r) => Number(r.y) + sizeOf(r).h + GAP));
}

/**
 * Place `refs.length` new cards: in a grid inside `frame` (growing it when they don't fit), or with `fallback`
 * positions (absolute, no parent) when there is no frame.
 */
export async function placeCards(
  db: Db,
  campaignId: string,
  rows: ItemRow[],
  kind: CanvasRefKind,
  refs: string[],
  card: Size,
  frame: ItemRow | undefined,
  opts: { cols?: number; fallback: () => Point[] },
): Promise<ItemRow[]> {
  if (refs.length === 0) return [];
  let positions: Point[];
  let parentId: string | null = null;
  if (frame) {
    const grid = gridInFrame(frame, rows, refs.length, card, opts.cols);
    positions = grid.positions;
    parentId = frame.id;
    if (grid.grow) await updateItemGeometry(db, { ...frame, width: grid.grow.w, height: grid.grow.h });
  } else positions = opts.fallback();
  const out: ItemRow[] = [];
  for (const [i, refId] of refs.entries()) {
    await claimForCampaign(db, kind, refId, campaignId);
    out.push(await insertItem(db, { campaignId, kind, refId, parentId, x: positions[i]!.x, y: positions[i]!.y, width: card.w, height: card.h }));
  }
  return out;
}
