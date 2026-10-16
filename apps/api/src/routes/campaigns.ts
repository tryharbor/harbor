import { z } from 'zod';
import {
  HarborError,
  campaignStatusSchema,
  canvasItemDataSchema,
  canvasItemKindSchema,
  isCanvasRefKind,
  isoDateSchema,
  newId,
  platformSchema,
  type CanvasItem,
  type CanvasItemData,
  type CanvasRefKind,
} from '@harbor/core';
import type { DraftContextItem } from '@harbor/ai';
import type { App, AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { body, isUniqueViolation } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import {
  CARD,
  DEFAULT_FRAMES,
  GAP,
  SELECT_CAMPAIGNS,
  absOf,
  checkParent,
  claimForCampaign,
  columnStart,
  findFrame,
  gridRightOfAll,
  insertItem,
  itemData,
  itemOut,
  listEdges,
  listItems,
  loadCampaignRow,
  loadItemRow,
  orderForCanvas,
  placeCards,
  sizeOf,
  toCampaign,
  toEdge,
  updateItemGeometry,
  upsertEdge,
  withEntities,
  type CampaignRow,
  type EdgeRow,
  type ItemRow,
} from '../services/campaigns.ts';
import { generateDrafts } from '../services/drafts.ts';
import { generateIdeas, insertIdea } from '../services/ideas.ts';
import { POST_SCORE_SQL, SELECT_POSTS, postScore, toPost, type PostListRow } from '../services/posts.ts';
import type { RunInfo } from '../services/runs.ts';
import { derivePerformanceSignals } from '../services/signals.ts';

const name = z.string().trim().min(1).max(200);
const goal = z.string().max(2000);
const coord = z.number().finite();
const dim = z.number().finite().positive();

const datesInOrder = (v: { startsOn?: string | null; endsOn?: string | null }) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn;
const DATES_MESSAGE = { message: 'endsOn must not be before startsOn.', path: ['endsOn'] };

const campaignCreateSchema = z
  .object({
    brandId: z.string().min(1),
    name,
    goal: goal.default(''),
    /** Not in the original contract; lets a campaign start out active. Defaults to 'planning'. */
    status: campaignStatusSchema.default('planning'),
    startsOn: isoDateSchema.optional(),
    endsOn: isoDateSchema.optional(),
  })
  .strict()
  .refine(datesInOrder, DATES_MESSAGE);

const campaignUpdateSchema = z
  .object({
    name: name.optional(),
    goal: goal.optional(),
    status: campaignStatusSchema.optional(),
    startsOn: isoDateSchema.nullable().optional(),
    endsOn: isoDateSchema.nullable().optional(),
  })
  .strict();

const itemCreateSchema = z
  .object({
    kind: canvasItemKindSchema,
    refId: z.string().min(1).optional(),
    parentId: z.string().min(1).nullable().optional(),
    x: coord,
    y: coord,
    width: dim.optional(),
    height: dim.optional(),
    data: canvasItemDataSchema.optional(),
  })
  .strict();

/** Data patches merge; a key set to null is removed. */
const dataPatchSchema = z
  .object({ title: z.string().max(300).nullable().optional(), text: z.string().max(10_000).nullable().optional(), color: z.string().max(40).nullable().optional() })
  .strict();

const itemPatchSchema = z
  .object({
    x: coord.optional(),
    y: coord.optional(),
    width: dim.nullable().optional(),
    height: dim.nullable().optional(),
    parentId: z.string().min(1).nullable().optional(),
    data: dataPatchSchema.optional(),
  })
  .strict();

const positionsSchema = z
  .object({
    items: z
      .array(
        z
          .object({ id: z.string().min(1), x: coord, y: coord, parentId: z.string().min(1).nullable().optional(), width: dim.optional(), height: dim.optional() })
          .strict(),
      )
      .max(5000),
  })
  .strict();

const edgeCreateSchema = z
  .object({ source: z.string().min(1), target: z.string().min(1), label: z.string().trim().max(200).optional() })
  .strict();

const agentSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suggest_ideas'), count: z.number().int().min(1).max(10).default(5), frameId: z.string().min(1).optional() }).strict(),
  z
    .object({
      action: z.literal('draft'),
      ideaItemId: z.string().min(1),
      platforms: z.array(platformSchema).min(1).max(4).transform((ps) => [...new Set(ps)]),
    })
    .strict(),
  z.object({ action: z.literal('add_top_posts'), count: z.number().int().min(1).max(20).default(4), frameId: z.string().min(1).optional() }).strict(),
  z.object({ action: z.literal('add_signals'), count: z.number().int().min(1).max(20).default(4) }).strict(),
]);

/** The brand an idea / draft / post / signal belongs to, or 404. */
async function refBrand(db: Db, kind: CanvasRefKind, refId: string): Promise<string> {
  const table = { idea: 'ideas', draft: 'drafts', post: 'posts', signal: 'signals' }[kind];
  const [row] = await db.query<{ brand_id: string }>(`SELECT brand_id FROM ${table} WHERE id = $1`, [refId]);
  if (!row) throw new HarborError('NOT_FOUND', `${kind[0]!.toUpperCase()}${kind.slice(1)} ${refId} not found.`);
  return row.brand_id;
}

interface AgentResult {
  items: CanvasItem[];
  edges: ReturnType<typeof toEdge>[];
  run?: RunInfo;
}

export function registerCampaigns(app: App, deps: AppDeps) {
  const { db } = deps;

  const campaignOut = async (id: string) => toCampaign(await loadCampaignRow(db, id));

  /** Items of a campaign keyed by id, for parent checks. */
  const itemMap = async (campaignId: string) => {
    const rows = await listItems(db, campaignId);
    return { rows, byId: new Map(rows.map((r) => [r.id, r])) };
  };

  const frameIn = (byId: Map<string, ItemRow>, frameId: string) => {
    const frame = byId.get(frameId);
    if (!frame) throw new HarborError('NOT_FOUND', `Frame ${frameId} is not on this canvas.`);
    if (frame.kind !== 'frame') throw new HarborError('INVALID_REQUEST', `frameId: ${frameId} is not a frame.`);
    return frame;
  };

  // ---- Campaigns ----

  /** Campaigns, newest first; optional ?brandId=. */
  app.get('/v1/campaigns', async (c) => {
    const brandId = c.req.query('brandId') ?? null;
    const rows = await db.query<CampaignRow>(`${SELECT_CAMPAIGNS} WHERE ($1::text IS NULL OR c.brand_id = $1) ORDER BY c.created_at DESC, c.id DESC`, [brandId]);
    return c.json({ data: rows.map(toCampaign) });
  });

  /** Create a campaign with its three default frames: Ideas, Drafts and Published. */
  app.post('/v1/campaigns', async (c) => {
    const input = await body(c, campaignCreateSchema);
    const brand = await loadBrand(db, input.brandId);
    const id = newId('campaign');
    await db.query(
      `INSERT INTO campaigns (id, workspace_id, brand_id, name, goal, status, starts_on, ends_on) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, brand.workspaceId, brand.id, input.name, input.goal, input.status, input.startsOn ?? null, input.endsOn ?? null],
    );
    for (const f of DEFAULT_FRAMES) {
      await insertItem(db, { campaignId: id, kind: 'frame', x: f.x, y: f.y, width: f.width, height: f.height, data: { title: f.title } });
    }
    return c.json(await campaignOut(id), 201);
  });

  app.get('/v1/campaigns/:id', async (c) => c.json(await campaignOut(c.req.param('id'))));

  app.patch('/v1/campaigns/:id', async (c) => {
    const input = await body(c, campaignUpdateSchema);
    const cur = await loadCampaignRow(db, c.req.param('id'));
    const next = {
      name: input.name ?? cur.name,
      goal: input.goal ?? cur.goal,
      status: input.status ?? cur.status,
      startsOn: input.startsOn === undefined ? cur.starts_on : input.startsOn,
      endsOn: input.endsOn === undefined ? cur.ends_on : input.endsOn,
    };
    if (!datesInOrder(next)) throw new HarborError('INVALID_REQUEST', `endsOn: ${DATES_MESSAGE.message}`);
    await db.query('UPDATE campaigns SET name = $2, goal = $3, status = $4, starts_on = $5, ends_on = $6, updated_at = now() WHERE id = $1', [
      cur.id, next.name, next.goal, next.status, next.startsOn, next.endsOn,
    ]);
    return c.json(await campaignOut(cur.id));
  });

  /** Deletes the campaign and its canvas. Its ideas and posts stay (their campaignId is cleared). */
  app.delete('/v1/campaigns/:id', async (c) => {
    const rows = await db.query('DELETE FROM campaigns WHERE id = $1 RETURNING id', [c.req.param('id')]);
    if (rows.length === 0) throw new HarborError('NOT_FOUND', `Campaign ${c.req.param('id')} not found.`);
    return c.body(null, 204);
  });

  // ---- Canvas ----

  /** The whole board: frames first (outer before nested) so React Flow parents precede their children. */
  app.get('/v1/campaigns/:id/canvas', async (c) => {
    const campaign = await campaignOut(c.req.param('id'));
    const items = await withEntities(db, orderForCanvas(await listItems(db, campaign.id)));
    const edges = (await listEdges(db, campaign.id)).map(toEdge);
    return c.json({ campaign, items, edges });
  });

  /**
   * Add a card. Ref kinds (idea, draft, post, signal) need a refId of the campaign's brand; adding one that is
   * already on the canvas returns the existing card (200). An idea card with no refId but data.title creates the
   * idea. Notes need data.text, frames data.title.
   */
  app.post('/v1/campaigns/:id/items', async (c) => {
    const input = await body(c, itemCreateSchema);
    const campaign = await loadCampaignRow(db, c.req.param('id'));
    const { rows, byId } = await itemMap(campaign.id);
    if (input.parentId) checkParent(byId, undefined, input.parentId);
    let refId = input.refId;
    let data: CanvasItemData = input.data ?? {};
    const kind = input.kind;

    if (isCanvasRefKind(kind)) {
      if (!refId) {
        const title = data.title?.trim();
        if (kind !== 'idea' || !title) throw new HarborError('INVALID_REQUEST', `refId: required for ${kind} cards${kind === 'idea' ? ' (or give data.title to create a new idea)' : ''}.`);
        refId = await insertIdea(db, { brandId: campaign.brand_id, title: title.slice(0, 300), angle: (data.text ?? '').slice(0, 4000), campaignId: campaign.id });
        data = data.color ? { color: data.color } : {};
      } else {
        const existing = rows.find((r) => r.kind === kind && r.ref_id === refId);
        if (existing) return c.json(await itemOut(db, existing), 200);
        const brandId = await refBrand(db, kind, refId);
        if (brandId !== campaign.brand_id) throw new HarborError('INVALID_REQUEST', `${kind} ${refId} belongs to another brand.`);
        await claimForCampaign(db, kind, refId, campaign.id);
      }
    } else {
      if (refId) throw new HarborError('INVALID_REQUEST', `refId: ${kind} cards don't reference anything.`);
      if (kind === 'note' && !data.text?.trim()) throw new HarborError('INVALID_REQUEST', 'data.text: a note needs text.');
      if (kind === 'frame' && !data.title?.trim()) throw new HarborError('INVALID_REQUEST', 'data.title: a frame needs a title.');
    }

    const size = kind === 'frame' ? CARD.frame : undefined;
    try {
      const row = await insertItem(db, {
        campaignId: campaign.id, kind, refId, parentId: input.parentId, x: input.x, y: input.y,
        width: input.width ?? size?.w, height: input.height ?? size?.h, data,
      });
      return c.json(await itemOut(db, row), 201);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const [existing] = await db.query<ItemRow>('SELECT * FROM canvas_items WHERE campaign_id = $1 AND kind = $2 AND ref_id = $3', [campaign.id, kind, refId]);
      return c.json(await itemOut(db, existing!), 200);
    }
  });

  /** Move, resize, re-parent or edit a card. `data` merges (null removes a key). */
  app.patch('/v1/canvas-items/:id', async (c) => {
    const input = await body(c, itemPatchSchema);
    const cur = await loadItemRow(db, c.req.param('id'));
    if (input.parentId) checkParent((await itemMap(cur.campaign_id)).byId, cur.id, input.parentId);
    const data: Record<string, unknown> = { ...itemData(cur) };
    for (const [k, v] of Object.entries(input.data ?? {})) {
      if (v === null) delete data[k];
      else if (v !== undefined) data[k] = v;
    }
    const pick = <T,>(v: T | undefined, fallback: T) => (v === undefined ? fallback : v);
    const [row] = await db.query<ItemRow>(
      `UPDATE canvas_items SET x = $2, y = $3, width = $4, height = $5, parent_id = $6, data = $7, updated_at = now() WHERE id = $1 RETURNING *`,
      [
        cur.id, pick(input.x, cur.x), pick(input.y, cur.y), pick(input.width, cur.width), pick(input.height, cur.height),
        pick(input.parentId, cur.parent_id), JSON.stringify(data),
      ],
    );
    return c.json(await itemOut(db, row!));
  });

  /** Save positions after a drag, in one call. Unknown ids are ignored; ids from another campaign are refused. */
  app.put('/v1/campaigns/:id/positions', async (c) => {
    const input = await body(c, positionsSchema);
    const campaign = await loadCampaignRow(db, c.req.param('id'));
    const { byId } = await itemMap(campaign.id);
    const foreign = input.items.filter((i) => !byId.has(i.id)).map((i) => i.id);
    if (foreign.length) {
      const [other] = await db.query<{ id: string }>('SELECT id FROM canvas_items WHERE id = ANY($1::text[]) LIMIT 1', [foreign]);
      if (other) throw new HarborError('INVALID_REQUEST', `Canvas item ${other.id} belongs to another campaign.`);
    }
    const changed: ItemRow[] = [];
    for (const i of input.items) {
      const cur = byId.get(i.id);
      if (!cur) continue;
      const next: ItemRow = {
        ...cur, x: i.x, y: i.y,
        width: i.width ?? cur.width, height: i.height ?? cur.height,
        parent_id: i.parentId === undefined ? cur.parent_id : i.parentId,
      };
      byId.set(i.id, next);
      changed.push(next);
    }
    for (const r of changed) if (r.parent_id) checkParent(byId, r.id, r.parent_id);
    for (const r of changed) await updateItemGeometry(db, r);
    return c.body(null, 204);
  });

  /**
   * Remove a card (never the idea/draft/post/signal behind it). Deleting a frame keeps its cards where they are on
   * screen: they move to the frame's own parent (usually none) with x/y converted (child + frame).
   */
  app.delete('/v1/canvas-items/:id', async (c) => {
    const cur = await loadItemRow(db, c.req.param('id'));
    if (cur.kind === 'frame') {
      const children = await db.query<ItemRow>('SELECT * FROM canvas_items WHERE parent_id = $1', [cur.id]);
      for (const ch of children) {
        await updateItemGeometry(db, { ...ch, x: Number(ch.x) + Number(cur.x), y: Number(ch.y) + Number(cur.y), parent_id: cur.parent_id });
      }
    }
    await db.query('DELETE FROM canvas_items WHERE id = $1', [cur.id]);
    return c.body(null, 204);
  });

  // ---- Edges ----

  app.post('/v1/campaigns/:id/edges', async (c) => {
    const input = await body(c, edgeCreateSchema);
    const campaign = await loadCampaignRow(db, c.req.param('id'));
    for (const end of [input.source, input.target]) {
      const item = await loadItemRow(db, end);
      if (item.campaign_id !== campaign.id) throw new HarborError('INVALID_REQUEST', `Canvas item ${end} belongs to another campaign.`);
    }
    if (input.source === input.target) throw new HarborError('INVALID_REQUEST', 'target: a card cannot connect to itself.');
    const { edge, created } = await upsertEdge(db, { campaignId: campaign.id, source: input.source, target: input.target, label: input.label || undefined });
    return c.json(toEdge(edge), created ? 201 : 200);
  });

  app.delete('/v1/canvas-edges/:id', async (c) => {
    const rows = await db.query('DELETE FROM canvas_edges WHERE id = $1 RETURNING id', [c.req.param('id')]);
    if (rows.length === 0) throw new HarborError('NOT_FOUND', `Canvas edge ${c.req.param('id')} not found.`);
    return c.body(null, 204);
  });

  // ---- Agent ----

  /**
   * Canvas agent actions. New cards come back already placed (and saved): suggest_ideas (model), draft (model,
   * with connected post/signal/note cards as context), add_top_posts, add_signals.
   */
  app.post('/v1/campaigns/:id/agent', async (c) => {
    const input = await body(c, agentSchema);
    const campaign = await loadCampaignRow(db, c.req.param('id'));
    const brand = await loadBrand(db, campaign.brand_id);
    const { rows, byId } = await itemMap(campaign.id);
    const onCanvas = (kind: CanvasRefKind) => rows.filter((r) => r.kind === kind && r.ref_id).map((r) => r.ref_id!);
    let result: { items: ItemRow[]; edges: EdgeRow[]; run?: RunInfo };

    switch (input.action) {
      case 'suggest_ideas': {
        const frame = input.frameId ? frameIn(byId, input.frameId) : findFrame(rows, 'Ideas');
        const { ids, run } = await generateIdeas(deps, brand, input.count, { campaignId: campaign.id, run: { source: 'canvas' } });
        const items = await placeCards(db, campaign.id, rows, 'idea', ids, CARD.idea, frame, { cols: 2, fallback: () => gridRightOfAll(rows, ids.length, CARD.idea, 2) });
        result = { items, edges: [], run };
        break;
      }

      case 'draft': {
        const ideaItem = byId.get(input.ideaItemId);
        if (!ideaItem) throw new HarborError('NOT_FOUND', `Canvas item ${input.ideaItemId} is not on this canvas.`);
        if (ideaItem.kind !== 'idea' || !ideaItem.ref_id) throw new HarborError('INVALID_REQUEST', `ideaItemId: ${input.ideaItemId} is not an idea card.`);
        const [idea] = await db.query<{ id: string; title: string; angle: string }>('SELECT id, title, angle FROM ideas WHERE id = $1', [ideaItem.ref_id]);
        if (!idea) throw new HarborError('NOT_FOUND', `The idea behind ${ideaItem.id} was deleted.`);

        // Context: post / signal / note cards connected to the idea card, in either direction.
        const edges = await listEdges(db, campaign.id);
        const linked = edges
          .filter((e) => e.source === ideaItem.id || e.target === ideaItem.id)
          .map((e) => byId.get(e.source === ideaItem.id ? e.target : e.source)!)
          .filter((r) => r && ['post', 'signal', 'note'].includes(r.kind));
        const items = await withEntities(db, linked);
        const posts = items
          .filter((i) => i.kind === 'post' && i.entity)
          .map((i) => i.entity as ReturnType<typeof toPost>)
          .sort((a, b) => postScore(b) - postScore(a));
        const context: DraftContextItem[] = [
          ...posts.map((p) => ({ kind: 'post' as const, text: p.parts[0]?.text ?? '' })),
          ...items.filter((i) => i.kind === 'note').map((i) => ({ kind: 'note' as const, text: i.data.text ?? '' })),
          ...items.filter((i) => i.kind === 'signal' && i.entity).map((i) => ({ kind: 'signal' as const, text: (i.entity as { summary: string }).summary })),
        ].filter((x) => x.text.trim());

        const { ids, run } = await generateDrafts(deps, brand, idea, input.platforms, context, { run: { source: 'canvas' } });
        const frame = findFrame(rows, 'Drafts');
        const ideaAbs = absOf(ideaItem, byId);
        const ideaSize = sizeOf(ideaItem);
        const placed = await placeCards(db, campaign.id, rows, 'draft', ids, CARD.draft, frame, {
          cols: 1,
          fallback: () => ids.map((_, i) => ({ x: ideaAbs.x + ideaSize.w + 80, y: ideaAbs.y + i * (CARD.draft.h + GAP) })),
        });
        const newEdges: EdgeRow[] = [];
        for (const d of placed) newEdges.push((await upsertEdge(db, { campaignId: campaign.id, source: ideaItem.id, target: d.id })).edge);
        result = { items: placed, edges: newEdges, run };
        break;
      }

      case 'add_top_posts': {
        const frame = input.frameId ? frameIn(byId, input.frameId) : findFrame(rows, 'Published');
        const top = await db.query<PostListRow>(
          `${SELECT_POSTS} WHERE p.brand_id = $1 AND p.status = 'published' AND NOT (p.id = ANY($2::text[]))
           ORDER BY ${POST_SCORE_SQL} DESC NULLS LAST, p.published_at DESC NULLS LAST, p.id LIMIT $3`,
          [brand.id, onCanvas('post'), input.count],
        );
        const ids = top.map((p) => p.id);
        const cols = frame ? undefined : 1;
        const items = await placeCards(db, campaign.id, rows, 'post', ids, CARD.post, frame, { cols, fallback: () => gridRightOfAll(rows, ids.length, CARD.post, 1) });
        result = { items, edges: [] };
        break;
      }

      case 'add_signals': {
        await derivePerformanceSignals(db, brand.id);
        const signals = await db.query<{ id: string }>(
          `SELECT id FROM signals WHERE brand_id = $1 AND NOT (id = ANY($2::text[])) ORDER BY observed_at DESC, id LIMIT $3`,
          [brand.id, onCanvas('signal'), input.count],
        );
        const ids = signals.map((s) => s.id);
        // A column to the left of the Ideas frame, below any cards already in it. No parent.
        const ideas = findFrame(rows, 'Ideas');
        const anchor = ideas
          ? absOf(ideas, byId)
          : rows.length
            ? { x: Math.min(...rows.map((r) => absOf(r, byId).x)), y: Math.min(...rows.map((r) => absOf(r, byId).y)) }
            : { x: 0, y: 0 };
        const x = anchor.x - 320;
        const y0 = columnStart(rows, x, CARD.signal.w, anchor.y);
        const items = await placeCards(db, campaign.id, rows, 'signal', ids, CARD.signal, undefined, {
          fallback: () => ids.map((_, i) => ({ x, y: y0 + i * (CARD.signal.h + GAP) })),
        });
        result = { items, edges: [] };
        break;
      }
    }

    const out: AgentResult = { items: await withEntities(db, result.items), edges: result.edges.map(toEdge), ...(result.run ? { run: result.run } : {}) };
    return c.json(out, out.items.length ? 201 : 200);
  });
}
