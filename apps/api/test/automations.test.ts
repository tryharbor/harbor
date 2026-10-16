import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ContentModel } from '@harbor/ai';
import { createApp, createDeps, type App, type AppDeps } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { refreshOutcome } from '../src/services/outcomes.ts';
import { insertHistoricalPost } from '../src/services/sandbox-history.ts';
import { tick } from '../src/worker.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
let deps: AppDeps;
let brandId: string;
let x: { id: string };
const send = sender(() => app);
const json = async (method: string, path: string, body?: unknown, status?: number) => {
  const res = await send(method, path, body);
  const out = res.status === 204 ? undefined : await res.json();
  if (status !== undefined) expect(res.status, JSON.stringify(out)).toBe(status);
  return out;
};

const DAY = 86_400_000;
const runsOf = async (automationId: string) =>
  db.query<{ id: string; status: string; source: string; input: Record<string, unknown> }>(
    'SELECT id, status, source, input FROM agent_runs WHERE automation_id = $1 AND parent_run_id IS NULL ORDER BY started_at',
    [automationId],
  );
const makeDue = (id: string) => db.query("UPDATE automations SET next_run_at = now() - interval '1 minute' WHERE id = $1", [id]);

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  db = await openDb('memory://');
  deps = createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated' });
  app = createApp(db, {}, deps);
  brandId = (await json('POST', '/v1/brands', { name: 'Harbor', memory: RICH_MEMORY }, 201)).id;
  x = await json('POST', '/v1/sandbox/channels', { brandId, platform: 'x', handle: 'harborhq' }, 201);
  await json('POST', '/v1/sandbox/channels', { brandId, platform: 'linkedin', handle: 'Derek' }, 201);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});

describe('automations CRUD', () => {
  let id: string;

  it('creates a schedule automation with its next run', async () => {
    const a = await json('POST', '/v1/automations', { brandId, agentId: 'weekly_plan', trigger: { type: 'schedule', weekday: 1, hour: 8 }, inputs: { postsPerPlatform: 2 } }, 201);
    id = a.id;
    expect(a).toMatchObject({
      id: expect.stringMatching(/^aut_/), brandId, brandName: 'Harbor', agentId: 'weekly_plan', name: 'Weekly plan · Mondays 8:00', enabled: true, status: 'active',
      maxRunsPerDay: 3, runsToday: 0, consecutiveFailures: 0, inputs: { postsPerPlatform: 2 },
    });
    const next = new Date(a.nextRunAt);
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(8);
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY);
    expect((await json('GET', '/v1/agents', undefined, 200)).data[0].automations).toBe(1);
  });

  it('only accepts triggers the agent supports', async () => {
    expect((await json('POST', '/v1/automations', { brandId, agentId: 'voice_check', trigger: { type: 'schedule', weekday: 1, hour: 8 } }, 400)).error.message).toMatch(/only runs manually/);
    expect((await json('POST', '/v1/automations', { brandId, agentId: 'weekly_plan', trigger: { type: 'event', event: 'post_outperformed' } }, 400)).error.message).toMatch(/supports schedule/);
    await json('POST', '/v1/automations', { brandId, agentId: 'weekly_plan', trigger: { type: 'schedule', weekday: 7, hour: 8 } }, 400);
    await json('POST', '/v1/automations', { brandId, agentId: 'nope', trigger: { type: 'schedule', weekday: 1, hour: 8 } }, 404);
    await json('PATCH', `/v1/automations/${id}`, { trigger: { type: 'event', event: 'post_published' } }, 400);
  });

  it('lists, updates, pauses and deletes', async () => {
    expect((await json('GET', `/v1/automations?brandId=${brandId}`, undefined, 200)).data.map((a: any) => a.id)).toEqual([id]);
    const moved = await json('PATCH', `/v1/automations/${id}`, { name: 'Friday plan', trigger: { type: 'schedule', weekday: 5, hour: 16 }, maxRunsPerDay: 1 }, 200);
    expect(moved).toMatchObject({ name: 'Friday plan', trigger: { type: 'schedule', weekday: 5, hour: 16 }, maxRunsPerDay: 1 });
    expect(new Date(moved.nextRunAt).getDay()).toBe(5);
    expect((await json('PATCH', `/v1/automations/${id}`, { enabled: false }, 200)).status).toBe('paused');
    await json('DELETE', `/v1/automations/${id}`, undefined, 204);
    await json('GET', `/v1/automations/${id}`, undefined, 404);
    await json('DELETE', `/v1/automations/${id}`, undefined, 404);
  });

  it('runs one now with source automation', async () => {
    const a = await json('POST', '/v1/automations', { brandId, agentId: 'digest', trigger: { type: 'schedule', weekday: 3, hour: 7 } }, 201);
    const run = await json('POST', `/v1/automations/${a.id}/run`, undefined, 201);
    expect(run).toMatchObject({ agentId: 'digest', source: 'automation', automationId: a.id, status: 'succeeded', inputs: { brandId } });
    expect(run.children).toEqual([expect.objectContaining({ kind: 'insights', source: 'automation', automationId: a.id })]);
    expect(await json('GET', `/v1/automations/${a.id}`, undefined, 200)).toMatchObject({ lastRunId: run.id, lastRunStatus: 'succeeded', runsToday: 1 });
    await json('DELETE', `/v1/automations/${a.id}`, undefined, 204);
  });
});

describe('the worker', () => {
  it('runs a due schedule exactly once and moves it to the next week', async () => {
    const a = await json('POST', '/v1/automations', { brandId, agentId: 'digest', trigger: { type: 'schedule', weekday: 2, hour: 6 } }, 201);
    await makeDue(a.id);
    await tick(deps.workerDeps());
    await tick(deps.workerDeps());
    const runs = await runsOf(a.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'succeeded', source: 'automation' });
    const after = await json('GET', `/v1/automations/${a.id}`, undefined, 200);
    expect(after).toMatchObject({ lastRunId: runs[0]!.id, status: 'active' });
    expect(new Date(after.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(after.nextRunAt).getDay()).toBe(2);

    // Without the model (publishing-only deps), automations are left alone.
    await makeDue(a.id);
    await tick(deps.publishDeps());
    expect(await runsOf(a.id)).toHaveLength(1);
    await json('DELETE', `/v1/automations/${a.id}`, undefined, 204);
  });

  it('repurposes a post the first time it outperforms, once', async () => {
    const a = await json('POST', '/v1/automations', { brandId, agentId: 'repurpose_winner', trigger: { type: 'event', event: 'post_outperformed' } }, 201);
    expect(a.nextRunAt).toBeUndefined();
    // Three ordinary X posts and one that does 3x their views at every age.
    const views = (n: number) => (age: number) => ({ views: Math.round(n * Math.min(age, 168)), likes: 1 });
    for (let i = 0; i < 3; i++) {
      await insertHistoricalPost(db, { brandId, channelId: x.id, platform: 'x', parts: [{ text: `Ordinary post ${i}`, media: [] }], publishedAt: new Date(Date.now() - (10 + i) * DAY), metricsAt: views(100) });
    }
    const winner = await insertHistoricalPost(db, {
      brandId, channelId: x.id, platform: 'x', parts: [{ text: 'The hook that took off this week.', media: [] }], publishedAt: new Date(Date.now() - 2 * DAY), metricsAt: views(300),
    });
    expect((await refreshOutcome(db, winner))?.verdict).toBe('outperformed');
    await refreshOutcome(db, winner); // still outperformed: no second event
    const events = await db.query<{ type: string; ref_id: string }>("SELECT type, ref_id FROM agent_events WHERE type = 'post_outperformed'");
    expect(events).toEqual([{ type: 'post_outperformed', ref_id: winner }]);

    await tick(deps.workerDeps());
    await tick(deps.workerDeps());
    let runs = await runsOf(a.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'succeeded', source: 'automation', input: { postId: winner, platforms: ['linkedin'] } });
    const detail = await json('GET', `/v1/agent-runs/${runs[0]!.id}`, undefined, 200);
    expect(detail.approvals).toEqual([expect.objectContaining({ status: 'pending', source: 'automation', channel: expect.objectContaining({ platform: 'linkedin' }) })]);

    // Even if the event were seen again, the same post never triggers the same automation twice.
    await db.query('UPDATE agent_events SET processed_at = NULL');
    await tick(deps.workerDeps());
    runs = await runsOf(a.id);
    expect(runs).toHaveLength(1);
    await json('DELETE', `/v1/automations/${a.id}`, undefined, 204);
  });

  it('pauses itself after 3 consecutive failures', async () => {
    const fail = async () => {
      throw new Error('model is down');
    };
    const broken: ContentModel = { name: 'broken-v1', simulated: true, learnVoice: fail, generateIdeas: fail, draft: fail, rewrite: fail, digest: fail };
    const brokenDeps = createDeps(db, { publishMode: 'sandbox', model: broken });
    const a = await json('POST', '/v1/automations', { brandId, agentId: 'digest', trigger: { type: 'schedule', weekday: 4, hour: 9 }, maxRunsPerDay: 10 }, 201);
    for (let i = 1; i <= 3; i++) {
      await makeDue(a.id);
      await tick(brokenDeps.workerDeps());
      const cur = await json('GET', `/v1/automations/${a.id}`, undefined, 200);
      expect(cur.consecutiveFailures).toBe(i);
      expect(cur.lastRunStatus).toBe('failed');
      expect(cur.status).toBe(i < 3 ? 'active' : 'failing');
      expect(cur.enabled).toBe(i < 3);
    }
    await makeDue(a.id);
    await tick(brokenDeps.workerDeps());
    expect(await runsOf(a.id)).toHaveLength(3);
    const runs = await runsOf(a.id);
    expect(runs.every((r) => r.status === 'failed')).toBe(true);

    // Re-enabling clears the streak and schedules the next run.
    const back = await json('PATCH', `/v1/automations/${a.id}`, { enabled: true }, 200);
    expect(back).toMatchObject({ enabled: true, status: 'active', consecutiveFailures: 0 });
    expect(new Date(back.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('stops at maxRunsPerDay', async () => {
    const a = await json('POST', '/v1/automations', { brandId, agentId: 'digest', trigger: { type: 'schedule', weekday: 0, hour: 5 }, maxRunsPerDay: 1 }, 201);
    await makeDue(a.id);
    await tick(deps.workerDeps());
    await makeDue(a.id);
    await tick(deps.workerDeps());
    expect(await runsOf(a.id)).toHaveLength(1);
    expect((await json('GET', `/v1/automations/${a.id}`, undefined, 200)).runsToday).toBe(1);
  });
});
