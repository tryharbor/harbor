import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
let brandId: string;
let otherBrandId: string;
let x: { id: string };
let li: { id: string };
const send = sender(() => app);
const json = async (method: string, path: string, body?: unknown, status?: number) => {
  const res = await send(method, path, body);
  const out = res.status === 204 ? undefined : await res.json();
  if (status !== undefined) expect(res.status, JSON.stringify(out)).toBe(status);
  return out;
};

interface Item {
  id: string;
  kind: string;
  refId?: string;
  parentId?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  data: { title?: string; text?: string; color?: string };
  entity?: any;
}
const canvas = (id: string): Promise<{ campaign: any; items: Item[]; edges: any[] }> => json('GET', `/v1/campaigns/${id}/canvas`, undefined, 200);
const frame = (items: Item[], title: string) => items.find((i) => i.kind === 'frame' && i.data.title === title)!;

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  db = await openDb('memory://');
  app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' });
  brandId = (await json('POST', '/v1/brands', { name: 'Harbor', memory: RICH_MEMORY })).id;
  otherBrandId = (await json('POST', '/v1/brands', { name: 'Other' })).id;
  x = await json('POST', '/v1/sandbox/channels', { brandId, platform: 'x', handle: 'harborhq' }, 201);
  li = await json('POST', '/v1/sandbox/channels', { brandId, platform: 'linkedin', handle: 'Derek' }, 201);
  // Three published posts with growth curves (sandbox metrics are deterministic per post).
  for (const text of ['I run four businesses. Every Monday I felt behind.', 'Shipped the snapshot poller today.', 'Honest numbers from last month.']) {
    await json('POST', '/v1/posts', { channelId: x.id, parts: [{ text }] }, 201);
  }
  await json('POST', '/v1/sandbox/advance', { hours: 30 }, 200);
  // Derive signals from those posts and Brand Memory.
  await json('POST', '/v1/ideas/generate', { brandId, count: 1 }, 201);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});

describe('campaigns', () => {
  it('creates a campaign with the three default frames', async () => {
    const c = await json('POST', '/v1/campaigns', { brandId, name: 'Launch week', goal: '200 signups', startsOn: '2026-10-12', endsOn: '2026-10-19' }, 201);
    expect(c).toMatchObject({ id: expect.stringMatching(/^cpg_/), brandId, brandName: 'Harbor', name: 'Launch week', goal: '200 signups', status: 'planning', startsOn: '2026-10-12', endsOn: '2026-10-19', itemCount: 0 });
    const { campaign, items, edges } = await canvas(c.id);
    expect(campaign.id).toBe(c.id);
    expect(edges).toEqual([]);
    expect(items.map((i) => [i.kind, i.data.title, i.x, i.y, i.width, i.height])).toEqual([
      ['frame', 'Ideas', 0, 0, 640, 520],
      ['frame', 'Drafts', 720, 0, 900, 520],
      ['frame', 'Published', 1700, 0, 640, 520],
    ]);
    expect(items[0]!.id).toMatch(/^cvi_/);
  });

  it('lists newest first, filters by brand, patches and deletes', async () => {
    const a = await json('POST', '/v1/campaigns', { brandId, name: 'Older' }, 201);
    const b = await json('POST', '/v1/campaigns', { brandId: otherBrandId, name: 'Other brand' }, 201);
    const all = (await json('GET', '/v1/campaigns', undefined, 200)).data;
    expect(all[0].id).toBe(b.id);
    expect(all[1].id).toBe(a.id);
    const mine = (await json('GET', `/v1/campaigns?brandId=${brandId}`, undefined, 200)).data;
    expect(mine.every((c: { brandId: string }) => c.brandId === brandId)).toBe(true);

    const p = await json('PATCH', `/v1/campaigns/${a.id}`, { status: 'active', goal: 'New goal', startsOn: '2026-11-01' }, 200);
    expect(p).toMatchObject({ status: 'active', goal: 'New goal', startsOn: '2026-11-01', name: 'Older' });
    await json('PATCH', `/v1/campaigns/${a.id}`, { endsOn: '2026-10-01' }, 400);
    expect((await json('PATCH', `/v1/campaigns/${a.id}`, { startsOn: null }, 200)).startsOn).toBeUndefined();
    await json('PATCH', `/v1/campaigns/${a.id}`, { status: 'archived' }, 400);
    await json('POST', '/v1/campaigns', { brandId: 'brd_missing', name: 'x' }, 404);
    expect((await send('DELETE', `/v1/campaigns/${a.id}`)).status).toBe(204);
    expect((await send('GET', `/v1/campaigns/${a.id}`)).status).toBe(404);
    expect((await send('DELETE', `/v1/campaigns/${b.id}`)).status).toBe(204);
  });
});

describe('canvas items and edges', () => {
  let cid: string;
  let ideasFrame: Item;
  let ideaId: string;
  let postId: string;

  beforeAll(async () => {
    cid = (await json('POST', '/v1/campaigns', { brandId, name: 'Items' }, 201)).id;
    ideasFrame = frame((await canvas(cid)).items, 'Ideas');
    ideaId = (await json('POST', '/v1/ideas', { brandId, title: 'Batching by brand' }, 201)).id;
    postId = (await json('GET', `/v1/posts?brandId=${brandId}&status=published`, undefined, 200)).data[0].id;
  });

  it('adds ref cards with resolved entities in the list shapes; re-adding returns the existing card', async () => {
    const card = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'idea', refId: ideaId, parentId: ideasFrame.id, x: 20, y: 48 }, 201);
    expect(card).toMatchObject({ kind: 'idea', refId: ideaId, parentId: ideasFrame.id, x: 20, y: 48, data: {} });
    const listed = (await json('GET', `/v1/ideas?brandId=${brandId}`, undefined, 200)).data.find((i: { id: string }) => i.id === ideaId);
    expect(card.entity).toEqual(listed);
    expect(card.entity).toMatchObject({ brandName: 'Harbor', postCount: 0, basis: [], campaignId: cid });

    const again = await send('POST', `/v1/campaigns/${cid}/items`, { kind: 'idea', refId: ideaId, x: 999, y: 999 });
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(card.id);

    const post = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'post', refId: postId, x: 1720, y: 48 }, 201);
    const listedPost = (await json('GET', `/v1/posts?brandId=${brandId}`, undefined, 200)).data.find((p: { id: string }) => p.id === postId);
    expect(post.entity).toEqual(listedPost);
    expect(post.entity).toMatchObject({ channel: { platform: 'x' }, snapshotCount: expect.any(Number), url: expect.any(String), campaignId: cid });
    expect(post.entity.latest.metrics).toBeTruthy();

    const draft = await json('POST', '/v1/drafts', { brandId, ideaId, platform: 'x', parts: [{ text: 'Draft text' }] }, 201);
    const dcard = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'draft', refId: draft.id, x: 740, y: 48 }, 201);
    expect(dcard.entity).toMatchObject({ id: draft.id, parts: [{ text: 'Draft text' }], simulated: false });

    const [signal] = (await json('GET', `/v1/brands/${brandId}/signals`, undefined, 200)).data;
    const scard = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'signal', refId: signal.id, x: -320, y: 0 }, 201);
    expect(scard.entity).toEqual({ id: signal.id, kind: signal.kind, summary: signal.summary, observedAt: signal.observedAt });

    const { items, campaign } = await canvas(cid);
    expect(items.slice(0, 3).every((i) => i.kind === 'frame')).toBe(true);
    expect(items.find((i) => i.id === card.id)!.entity.id).toBe(ideaId);
    expect(campaign.itemCount).toBe(4);
  });

  it('validates ref cards, notes and frames', async () => {
    const otherIdea = (await json('POST', '/v1/ideas', { brandId: otherBrandId, title: 'Not ours' }, 201)).id;
    await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'idea', refId: otherIdea, x: 0, y: 0 }, 400);
    await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'idea', refId: 'ida_missing', x: 0, y: 0 }, 404);
    await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'post', x: 0, y: 0 }, 400);
    await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 0, y: 0 }, 400);
    await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'frame', x: 0, y: 0, data: { text: 'no title' } }, 400);
    await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 0, y: 0, data: { text: 'hi' }, refId: ideaId }, 400);
    const note = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 0, y: 0, data: { text: 'hi' } }, 201);
    // parentId must be a frame of this campaign.
    await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 0, y: 0, data: { text: 'x' }, parentId: note.id }, 400);
    const otherCampaign = await json('POST', '/v1/campaigns', { brandId, name: 'Elsewhere' }, 201);
    const foreignFrame = frame((await canvas(otherCampaign.id)).items, 'Ideas');
    await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 0, y: 0, data: { text: 'x' }, parentId: foreignFrame.id }, 400);
    const f = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'frame', x: 0, y: 900, data: { title: 'Extra' } }, 201);
    expect([f.width, f.height]).toEqual([640, 520]);
  });

  it('creates a new idea from an idea card with a title', async () => {
    const card = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'idea', x: 20, y: 218, parentId: ideasFrame.id, data: { title: 'Typed on the canvas', text: 'An angle', color: 'yellow' } }, 201);
    expect(card.refId).toMatch(/^ida_/);
    expect(card.data).toEqual({ color: 'yellow' });
    expect(card.entity).toMatchObject({ title: 'Typed on the canvas', angle: 'An angle', status: 'idea', brandId, campaignId: cid });
  });

  it('patches cards: geometry, parent and merged data', async () => {
    const note = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 10, y: 10, data: { text: 'Hook: open with a number', color: 'blue' } }, 201);
    const p = await json('PATCH', `/v1/canvas-items/${note.id}`, { x: 30, parentId: ideasFrame.id, data: { title: 'Hook', color: null } }, 200);
    expect(p).toMatchObject({ x: 30, y: 10, parentId: ideasFrame.id, data: { text: 'Hook: open with a number', title: 'Hook' } });
    expect(p.data.color).toBeUndefined();
    const un = await json('PATCH', `/v1/canvas-items/${note.id}`, { parentId: null, width: 300 }, 200);
    expect(un.parentId).toBeUndefined();
    expect(un.width).toBe(300);
    await json('PATCH', `/v1/canvas-items/${note.id}`, { parentId: note.id }, 400);
    await json('PATCH', `/v1/canvas-items/${ideasFrame.id}`, { parentId: ideasFrame.id }, 400);
    await json('PATCH', '/v1/canvas-items/cvi_missing', { x: 1 }, 404);
  });

  it('saves positions in a batch', async () => {
    const { items } = await canvas(cid);
    const notes = items.filter((i) => i.kind === 'note');
    const other = await json('POST', '/v1/campaigns', { brandId, name: 'Foreign' }, 201);
    const foreign = (await canvas(other.id)).items[0]!;
    expect((await send('PUT', `/v1/campaigns/${cid}/positions`, { items: [{ id: foreign.id, x: 0, y: 0 }] })).status).toBe(400);
    expect((await send('PUT', `/v1/campaigns/${cid}/positions`, { items: [{ id: notes[0]!.id, x: 0, y: 0, parentId: notes[1]!.id }] })).status).toBe(400);
    const res = await send('PUT', `/v1/campaigns/${cid}/positions`, {
      items: [
        { id: notes[0]!.id, x: 111, y: 222, parentId: ideasFrame.id, width: 250, height: 130 },
        { id: notes[1]!.id, x: -5.5, y: 7.25, parentId: null },
        { id: 'cvi_unknown', x: 1, y: 1 },
      ],
    });
    expect(res.status).toBe(204);
    const after = (await canvas(cid)).items;
    expect(after.find((i) => i.id === notes[0]!.id)).toMatchObject({ x: 111, y: 222, parentId: ideasFrame.id, width: 250, height: 130 });
    expect(after.find((i) => i.id === notes[1]!.id)).toMatchObject({ x: -5.5, y: 7.25 });
    expect(after.find((i) => i.id === notes[1]!.id)!.parentId).toBeUndefined();
  });

  it('connects cards; duplicates return the existing edge', async () => {
    const { items } = await canvas(cid);
    const [a, b] = items.filter((i) => i.kind !== 'frame');
    const e = await json('POST', `/v1/campaigns/${cid}/edges`, { source: a!.id, target: b!.id, label: 'informs' }, 201);
    expect(e).toEqual({ id: expect.stringMatching(/^cve_/), campaignId: cid, source: a!.id, target: b!.id, label: 'informs' });
    expect((await json('POST', `/v1/campaigns/${cid}/edges`, { source: a!.id, target: b!.id }, 200)).id).toBe(e.id);
    await json('POST', `/v1/campaigns/${cid}/edges`, { source: a!.id, target: a!.id }, 400);
    await json('POST', `/v1/campaigns/${cid}/edges`, { source: a!.id, target: 'cvi_missing' }, 404);
    expect((await canvas(cid)).edges).toHaveLength(1);
    expect((await send('DELETE', `/v1/canvas-edges/${e.id}`)).status).toBe(204);
    expect((await send('DELETE', `/v1/canvas-edges/${e.id}`)).status).toBe(404);
  });

  it('deletes a card only, and omits the entity when the referenced object is gone', async () => {
    const idea = await json('POST', '/v1/ideas', { brandId, title: 'Soon deleted' }, 201);
    const card = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'idea', refId: idea.id, x: 0, y: 0 }, 201);
    expect((await send('DELETE', `/v1/ideas/${idea.id}`)).status).toBe(204);
    const removed = (await canvas(cid)).items.find((i) => i.id === card.id)!;
    expect(removed.refId).toBe(idea.id);
    expect(removed).not.toHaveProperty('entity');

    const keep = await json('POST', '/v1/ideas', { brandId, title: 'Card goes, idea stays' }, 201);
    const k = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'idea', refId: keep.id, x: 0, y: 0 }, 201);
    expect((await send('DELETE', `/v1/canvas-items/${k.id}`)).status).toBe(204);
    expect((await send('GET', `/v1/ideas?brandId=${brandId}`)).status).toBe(200);
    expect((await json('GET', `/v1/ideas?campaignId=${cid}`)).data.some((i: { id: string }) => i.id === keep.id)).toBe(true);
    expect((await send('DELETE', `/v1/canvas-items/${k.id}`)).status).toBe(404);
  });

  it('deleting a frame un-parents its cards with absolute positions', async () => {
    const f = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'frame', x: 100, y: 1000, width: 400, height: 300, data: { title: 'Temp' } }, 201);
    const inner = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'frame', x: 10, y: 50, width: 200, height: 200, data: { title: 'Nested' }, parentId: f.id }, 201);
    const n1 = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 20, y: 48, parentId: f.id, data: { text: 'one' } }, 201);
    const n2 = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 5, y: 6, parentId: inner.id, data: { text: 'two' } }, 201);
    // Nested frames come after their parents.
    const order = (await canvas(cid)).items.map((i) => i.id);
    expect(order.indexOf(f.id)).toBeLessThan(order.indexOf(inner.id));
    expect(order.indexOf(inner.id)).toBeLessThan(order.indexOf(n1.id));

    expect((await send('DELETE', `/v1/canvas-items/${f.id}`)).status).toBe(204);
    const items = (await canvas(cid)).items;
    const a = items.find((i) => i.id === n1.id)!;
    expect([a.x, a.y, a.parentId]).toEqual([120, 1048, undefined]);
    const nested = items.find((i) => i.id === inner.id)!;
    expect([nested.x, nested.y, nested.parentId]).toEqual([110, 1050, undefined]);
    expect(items.find((i) => i.id === n2.id)).toMatchObject({ x: 5, y: 6, parentId: inner.id });
    expect(items.some((i) => i.id === f.id)).toBe(false);
  });
});

describe('campaign filters on ideas and posts', () => {
  it('filters by campaignId, accepts campaignId on create and infers it for posts from the idea', async () => {
    const c = await json('POST', '/v1/campaigns', { brandId, name: 'Filters' }, 201);
    const idea = await json('POST', '/v1/ideas', { brandId, title: 'In the campaign', campaignId: c.id }, 201);
    expect(idea.campaignId).toBe(c.id);
    await json('POST', '/v1/ideas', { brandId, title: 'Not in it' }, 201);
    await json('POST', '/v1/ideas', { brandId: otherBrandId, title: 'Wrong brand', campaignId: c.id }, 400);
    await json('POST', '/v1/ideas', { brandId, title: 'Missing', campaignId: 'cpg_missing' }, 404);
    expect((await json('GET', `/v1/ideas?campaignId=${c.id}`)).data.map((i: { id: string }) => i.id)).toEqual([idea.id]);

    const inferred = await json('POST', '/v1/posts', { channelId: li.id, parts: [{ text: 'From the idea' }], ideaId: idea.id, scheduledFor: new Date(Date.now() + 86_400_000).toISOString() }, 201);
    expect(inferred.campaignId).toBe(c.id);
    const explicit = await json('POST', '/v1/posts', { channelId: li.id, parts: [{ text: 'Explicit' }], campaignId: c.id, scheduledFor: new Date(Date.now() + 86_400_000).toISOString() }, 201);
    expect(explicit.campaignId).toBe(c.id);
    await json('POST', '/v1/posts', { channelId: li.id, parts: [{ text: 'Nope' }], campaignId: 'cpg_missing' }, 404);
    const posts = (await json('GET', `/v1/posts?campaignId=${c.id}`)).data.map((p: { id: string }) => p.id);
    expect(posts.sort()).toEqual([inferred.id, explicit.id].sort());

    // Deleting the campaign keeps its ideas and posts.
    expect((await send('DELETE', `/v1/campaigns/${c.id}`)).status).toBe(204);
    const kept = (await json('GET', `/v1/ideas?brandId=${brandId}`)).data.find((i: { id: string }) => i.id === idea.id);
    expect(kept.campaignId).toBeUndefined();
  });
});

describe('canvas agent', () => {
  let cid: string;
  let frames: { ideas: Item; drafts: Item; published: Item };

  beforeAll(async () => {
    cid = (await json('POST', '/v1/campaigns', { brandId, name: 'Agent' }, 201)).id;
    const { items } = await canvas(cid);
    frames = { ideas: frame(items, 'Ideas'), drafts: frame(items, 'Drafts'), published: frame(items, 'Published') };
  });

  it('suggest_ideas: generates ideas into a 2-column grid in the Ideas frame and grows it', async () => {
    const res = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'suggest_ideas', count: 3 }, 201);
    expect(res.run).toMatchObject({ id: expect.stringMatching(/^run_/), model: 'simulated-v1', simulated: true });
    expect(res.edges).toEqual([]);
    expect(res.items.map((i: Item) => [i.kind, i.parentId, i.x, i.y, i.width, i.height])).toEqual([
      ['idea', frames.ideas.id, 20, 48, 280, 150],
      ['idea', frames.ideas.id, 320, 48, 280, 150],
      ['idea', frames.ideas.id, 20, 218, 280, 150],
    ]);
    for (const i of res.items) expect(i.entity).toMatchObject({ status: 'idea', campaignId: cid, agentRunId: res.run.id, brandName: 'Harbor' });
    const runs = (await json('GET', `/v1/agent-runs?brandId=${brandId}`)).data;
    expect(runs[0]).toMatchObject({ id: res.run.id, kind: 'ideas', status: 'succeeded' });

    // Next batch starts below the existing cards; 3 more rows overflow 520 → the frame grows.
    const more = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'suggest_ideas', count: 5 }, 201);
    expect(more.items.map((i: Item) => [i.x, i.y])).toEqual([[20, 388], [320, 388], [20, 558], [320, 558], [20, 728]]);
    const grown = frame((await canvas(cid)).items, 'Ideas');
    expect(grown.height).toBe(728 + 150 + 20);
    expect(grown.width).toBe(640);
    expect((await json('GET', `/v1/ideas?campaignId=${cid}`)).data).toHaveLength(8);

    await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'suggest_ideas', count: 11 }, 400);
    await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'suggest_ideas', frameId: 'cvi_missing' }, 404);
  });

  it('suggest_ideas: into a given frame, or right of everything when there are no frames', async () => {
    const f = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'frame', x: 0, y: 2000, width: 640, height: 300, data: { title: 'Week 2' } }, 201);
    const res = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'suggest_ideas', count: 1, frameId: f.id }, 201);
    expect(res.items[0]).toMatchObject({ parentId: f.id, x: 20, y: 48 });

    const bare = (await json('POST', '/v1/campaigns', { brandId, name: 'Bare' }, 201)).id;
    for (const fr of (await canvas(bare)).items) await send('DELETE', `/v1/canvas-items/${fr.id}`);
    const note = await json('POST', `/v1/campaigns/${bare}/items`, { kind: 'note', x: 100, y: 50, width: 200, height: 100, data: { text: 'n' } }, 201);
    const free = await json('POST', `/v1/campaigns/${bare}/agent`, { action: 'suggest_ideas', count: 3 }, 201);
    expect(free.items.map((i: Item) => [i.parentId, i.x, i.y])).toEqual([[undefined, 380, 50], [undefined, 680, 50], [undefined, 380, 220]]);
    expect(note.id).toBeTruthy();
  });

  it('add_top_posts: best posts by views not already on the canvas, in the Published frame', async () => {
    const all = (await json('GET', `/v1/posts?brandId=${brandId}&status=published`)).data;
    const byViews = [...all].sort((a: any, b: any) => (b.latest?.metrics.views ?? -1) - (a.latest?.metrics.views ?? -1));
    const res = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'add_top_posts', count: 2 }, 201);
    expect(res.run).toBeUndefined();
    expect(res.items.map((i: Item) => i.refId)).toEqual(byViews.slice(0, 2).map((p: any) => p.id));
    expect(res.items.map((i: Item) => [i.parentId, i.x, i.y, i.width, i.height])).toEqual([
      [frames.published.id, 20, 48, 300, 170],
      [frames.published.id, 20, 238, 300, 170],
    ]);
    expect(res.items[0].entity).toMatchObject({ id: byViews[0].id, channel: { platform: 'x' } });
    const rest = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'add_top_posts' }, 201);
    expect(rest.items.map((i: Item) => i.refId)).toEqual(byViews.slice(2).map((p: any) => p.id));
    expect((await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'add_top_posts' }, 200)).items).toEqual([]);
  });

  it('add_signals: latest signals, stacked left of the Ideas frame with no parent', async () => {
    const res = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'add_signals', count: 2 }, 201);
    expect(res.items.map((i: Item) => [i.kind, i.parentId, i.x, i.y])).toEqual([
      ['signal', undefined, -320, 0],
      ['signal', undefined, -320, 140],
    ]);
    for (const i of res.items) expect(Object.keys(i.entity).sort()).toEqual(['id', 'kind', 'observedAt', 'summary']);
    const next = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'add_signals', count: 1 }, 201);
    expect(next.items[0]).toMatchObject({ x: -320, y: 280 });
    expect(new Set([...res.items, ...next.items].map((i: Item) => i.refId)).size).toBe(3);
  });

  it('draft: drafts the idea per platform into the Drafts frame, links them, and uses connected cards as context', async () => {
    const { items } = await canvas(cid);
    const ideaCard = items.find((i) => i.kind === 'idea' && i.parentId === frames.ideas.id)!;
    const posts = items.filter((i) => i.kind === 'post');
    const top = [...posts].sort((a, b) => (b.entity.latest?.metrics.views ?? -1) - (a.entity.latest?.metrics.views ?? -1));
    const note = await json('POST', `/v1/campaigns/${cid}/items`, { kind: 'note', x: 700, y: 600, data: { text: 'Hook: open with a real number' } }, 201);
    await json('POST', `/v1/campaigns/${cid}/edges`, { source: note.id, target: ideaCard.id }, 201);
    // Connect the weaker post first: the model should still quote the best one.
    await json('POST', `/v1/campaigns/${cid}/edges`, { source: ideaCard.id, target: top.at(-1)!.id }, 201);
    await json('POST', `/v1/campaigns/${cid}/edges`, { source: top[0]!.id, target: ideaCard.id }, 201);

    const res = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'draft', ideaItemId: ideaCard.id, platforms: ['x', 'linkedin'] }, 201);
    expect(res.run).toMatchObject({ model: 'simulated-v1', simulated: true });
    expect(res.items.map((i: Item) => [i.kind, i.parentId, i.x, i.y, i.width, i.height])).toEqual([
      ['draft', frames.drafts.id, 20, 48, 320, 220],
      ['draft', frames.drafts.id, 20, 288, 320, 220],
    ]);
    expect(res.items.map((i: Item) => i.entity.platform)).toEqual(['x', 'linkedin']);
    expect(frame((await canvas(cid)).items, 'Drafts').height).toBe(520); // two drafts fit: no growth
    for (const d of res.items) expect(d.entity).toMatchObject({ author: 'agent', agentRunId: res.run.id, model: 'simulated-v1', simulated: true, ideaId: ideaCard.refId });
    expect(res.edges.map((e: any) => [e.source, e.target])).toEqual(res.items.map((d: Item) => [ideaCard.id, d.id]));

    const linkedin = res.items[1].entity.parts[0].text as string;
    expect(linkedin).toContain('[Note: Hook: open with a real number.]');
    const topHook = (top[0]!.entity.parts[0].text as string).split(/(?<=[.!?])\s/)[0]!;
    expect(linkedin).toContain(`What worked last time: "${topHook}"`);
    if (top.length > 1) expect(linkedin).not.toContain(top.at(-1)!.entity.parts[0].text);
    const xText = res.items[0].entity.parts.map((p: { text: string }) => p.text).join(' ');
    expect(xText).toContain('[Note: Hook: open with a real number.]');

    expect((await json('GET', `/v1/ideas?campaignId=${cid}`)).data.find((i: { id: string }) => i.id === ideaCard.refId).status).toBe('drafting');
    const runs = (await json('GET', `/v1/agent-runs?brandId=${brandId}`)).data;
    expect(runs[0]).toMatchObject({ id: res.run.id, kind: 'draft', status: 'succeeded' });

    // A second idea drafts below the first; the Drafts frame grows to fit.
    const other = items.filter((i) => i.kind === 'idea')[1]!;
    const again = await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'draft', ideaItemId: other.id, platforms: ['x'] }, 201);
    expect(again.items[0]).toMatchObject({ x: 20, y: 528 });
    expect(frame((await canvas(cid)).items, 'Drafts').height).toBe(528 + 220 + 20);
    const plain = again.items[0].entity.parts.map((p: { text: string }) => p.text).join(' ');
    expect(plain).not.toContain('[Note:');

    await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'draft', ideaItemId: note.id, platforms: ['x'] }, 400);
    await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'draft', ideaItemId: ideaCard.id, platforms: [] }, 400);
    await json('POST', `/v1/campaigns/${cid}/agent`, { action: 'dance' }, 400);
  });

  it('draft: without a Drafts frame, places drafts to the right of the idea', async () => {
    const c = (await json('POST', '/v1/campaigns', { brandId, name: 'No drafts frame' }, 201)).id;
    const { items } = await canvas(c);
    await send('DELETE', `/v1/canvas-items/${frame(items, 'Drafts').id}`);
    const idea = await json('POST', `/v1/campaigns/${c}/items`, { kind: 'idea', x: 20, y: 48, parentId: frame(items, 'Ideas').id, data: { title: 'Free placement' } }, 201);
    const res = await json('POST', `/v1/campaigns/${c}/agent`, { action: 'draft', ideaItemId: idea.id, platforms: ['x', 'threads'] }, 201);
    expect(res.items.map((i: Item) => [i.parentId, i.x, i.y])).toEqual([[undefined, 380, 48], [undefined, 380, 288]]);
  });
});
