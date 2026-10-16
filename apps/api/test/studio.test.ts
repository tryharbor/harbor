import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { RICH_MEMORY, SAMPLE_WRITING, sender } from './helpers.ts';

let db: Db;
let app: App;
let brandId: string;
const send = sender(() => app);

beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' });
  brandId = (await (await send('POST', '/v1/brands', { name: 'Harbor', memory: RICH_MEMORY })).json()).id;
});
afterAll(() => db.close());

describe('voice learning', () => {
  it('needs at least 200 characters', async () => {
    const res = await send('POST', `/v1/brands/${brandId}/voice/learn`, { examples: ['Too short.'] });
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe('INVALID_REQUEST');
    expect(error.message).toMatch(/200 characters/);
  });

  it('proposes a voice without saving it and records the run', async () => {
    const res = await send('POST', `/v1/brands/${brandId}/voice/learn`, { examples: SAMPLE_WRITING });
    expect(res.status).toBe(200);
    const { voice, run } = await res.json();
    expect(voice.learnedBy).toBe('simulated-v1');
    expect(voice.excerpts.length).toBeGreaterThanOrEqual(3);
    for (const e of voice.excerpts) expect(SAMPLE_WRITING.some((w) => w.includes(e.text))).toBe(true);
    expect(voice.sources).toHaveLength(SAMPLE_WRITING.length);
    expect(run).toMatchObject({ id: expect.stringMatching(/^run_/), model: 'simulated-v1', simulated: true });
    expect(run.usage.inputTokens).toBeGreaterThan(0);
    const brand = await (await send('GET', `/v1/brands/${brandId}`)).json();
    expect(brand.memory.voice.summary).toBe('First person ("I"), plain, specific.');
    const runs = (await (await send('GET', `/v1/agent-runs?brandId=${brandId}`)).json()).data;
    expect(runs[0]).toMatchObject({ id: run.id, kind: 'voice', status: 'succeeded', model: 'simulated-v1', usage: run.usage });
    expect(runs[0].finishedAt).toBeTruthy();
  });

  it('learns from saved example posts', async () => {
    await send('PATCH', `/v1/brands/${brandId}`, { memory: { examplePosts: SAMPLE_WRITING.map((text) => ({ platform: 'x', text })) } });
    const res = await send('POST', `/v1/brands/${brandId}/voice/learn`, { fromExamplePosts: true });
    expect(res.status).toBe(200);
    const { voice } = await res.json();
    expect(voice.sources.every((s: { kind: string; ref: string }) => s.kind === 'post' && s.ref)).toBe(true);
  });
});

describe('ideas', () => {
  it('generates ideas citing signals, even before any posts exist', async () => {
    const res = await send('POST', '/v1/ideas/generate', { brandId, count: 4 });
    expect(res.status).toBe(201);
    const { data, run } = await res.json();
    expect(data).toHaveLength(4);
    expect(run.model).toBe('simulated-v1');
    const signals = (await (await send('GET', `/v1/brands/${brandId}/signals`)).json()).data;
    expect(signals.some((s: { kind: string; summary: string }) => s.kind === 'manual' && s.summary.startsWith('Audience pain point: Context switching'))).toBe(true);
    const ids = new Set(signals.map((s: { id: string }) => s.id));
    for (const idea of data) {
      expect(idea).toMatchObject({ status: 'idea', brandId, agentRunId: run.id });
      expect(idea.basis.length).toBeGreaterThanOrEqual(1);
      for (const b of idea.basis) expect(ids.has(b.signalId)).toBe(true);
    }
    // Re-running doesn't duplicate the memory signals.
    await send('POST', '/v1/ideas/generate', { brandId, count: 1 });
    const again = (await (await send('GET', `/v1/brands/${brandId}/signals`)).json()).data;
    expect(again).toHaveLength(signals.length);
  });
});

describe('drafts (Studio)', () => {
  let ideaId: string;
  beforeAll(async () => {
    ideaId = (await (await send('POST', '/v1/ideas', { brandId, title: 'How I handle context switching', angle: 'I batch by brand. It cut my planning from 90 minutes to 20.' })).json()).id;
  });

  it('versions human drafts per idea and platform', async () => {
    const v1 = await (await send('POST', '/v1/drafts', { brandId, ideaId, platform: 'x', parts: [{ text: 'First take' }] })).json();
    const v2 = await (await send('POST', '/v1/drafts', { brandId, ideaId, platform: 'x', parts: [{ text: 'Second take' }] })).json();
    const li = await (await send('POST', '/v1/drafts', { brandId, ideaId, platform: 'linkedin', parts: [{ text: 'LinkedIn take' }] })).json();
    expect([v1.version, v2.version, li.version]).toEqual([1, 2, 1]);
    expect(v2).toMatchObject({ author: 'human', platform: 'x', ideaId, simulated: false });
    const latest = (await (await send('GET', `/v1/drafts?ideaId=${ideaId}`)).json()).data;
    expect(latest.map((d: { id: string }) => d.id).sort()).toEqual([v2.id, li.id].sort());
    const all = (await (await send('GET', `/v1/drafts?ideaId=${ideaId}&all=1`)).json()).data;
    expect(all).toHaveLength(3);
    expect((await (await send('GET', `/v1/drafts/${v1.id}`)).json()).parts[0].text).toBe('First take');
    expect((await (await send('GET', `/v1/ideas?brandId=${brandId}`)).json()).data.find((i: { id: string }) => i.id === ideaId).status).toBe('drafting');
    expect((await send('POST', '/v1/drafts', { brandId, ideaId, platform: 'x', parts: [{ text: 'x' }], author: 'agent' })).status).toBe(400);
  });

  it('generates one agent draft per platform within each limit', async () => {
    const res = await send('POST', '/v1/drafts/generate', { ideaId, platforms: ['x', 'linkedin', 'threads'] });
    expect(res.status).toBe(201);
    const { data, run } = await res.json();
    expect(data.map((d: { platform: string }) => d.platform)).toEqual(['x', 'linkedin', 'threads']);
    const limits: Record<string, number> = { x: 280, linkedin: 3000, threads: 500 };
    for (const d of data) {
      expect(d).toMatchObject({ author: 'agent', agentRunId: run.id, model: 'simulated-v1', simulated: true });
      for (const p of d.parts) expect([...p.text].length).toBeLessThanOrEqual(limits[d.platform]!);
    }
    expect(data.find((d: { platform: string }) => d.platform === 'x').version).toBe(3);
    const runs = (await (await send('GET', `/v1/agent-runs?brandId=${brandId}`)).json()).data;
    expect(runs[0]).toMatchObject({ id: run.id, kind: 'draft', status: 'succeeded' });
  });

  it('rewrites a draft without saving', async () => {
    const [draft] = (await (await send('GET', `/v1/drafts?ideaId=${ideaId}`)).json()).data;
    const before = (await (await send('GET', `/v1/drafts?ideaId=${ideaId}&all=1`)).json()).data.length;
    const hooks = await (await send('POST', `/v1/drafts/${draft.id}/rewrite`, { instruction: 'hook_variations' })).json();
    expect(hooks.variations).toHaveLength(3);
    expect(hooks.run.model).toBe('simulated-v1');
    const shorter = await (await send('POST', `/v1/drafts/${draft.id}/rewrite`, { instruction: 'shorter' })).json();
    expect(shorter.variations).toHaveLength(1);
    expect((await send('POST', `/v1/drafts/${draft.id}/rewrite`, { instruction: 'longer' })).status).toBe(400);
    expect((await (await send('GET', `/v1/drafts?ideaId=${ideaId}&all=1`)).json()).data).toHaveLength(before);
    const kinds = (await (await send('GET', `/v1/agent-runs?brandId=${brandId}`)).json()).data.map((r: { kind: string }) => r.kind);
    expect(kinds.slice(0, 2)).toEqual(['rewrite', 'rewrite']);
  });

  it('records a failed run when the real model is off', async () => {
    const off = createApp(db, { publishMode: 'sandbox', modelMode: 'anthropic' });
    const res = await off.request('/v1/drafts/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ideaId, platforms: ['x'] }) });
    expect(res.status).toBe(501);
    expect((await res.json()).error.message).toMatch(/Real model is off/);
    const [run] = (await (await send('GET', `/v1/agent-runs?brandId=${brandId}`)).json()).data;
    expect(run).toMatchObject({ kind: 'draft', status: 'failed', model: 'anthropic' });
    expect(run.error).toMatch(/Real model is off/);
  });
});

describe('competitors', () => {
  it('creates, lists, updates and deletes', async () => {
    const res = await send('POST', `/v1/brands/${brandId}/competitors`, { name: 'Buffer', url: 'https://buffer.com', handles: [{ platform: 'x', handle: '@buffer' }] });
    expect(res.status).toBe(201);
    const comp = await res.json();
    expect(comp).toMatchObject({ brandId, name: 'Buffer', handles: [{ platform: 'x', handle: 'buffer' }] });
    expect((await (await send('GET', `/v1/brands/${brandId}/competitors`)).json()).data).toHaveLength(1);
    const upd = await (await send('PATCH', `/v1/competitors/${comp.id}`, { notes: 'Scheduler, not a strategist', url: null })).json();
    expect(upd).toMatchObject({ name: 'Buffer', notes: 'Scheduler, not a strategist' });
    expect(upd.url).toBeUndefined();
    expect((await send('DELETE', `/v1/competitors/${comp.id}`)).status).toBe(204);
    expect((await send('DELETE', `/v1/competitors/${comp.id}`)).status).toBe(404);
  });
});
