import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SimulatedModel } from '@harbor/ai';
import { createApp, createDeps, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
let brandId: string;
let x: { id: string };
let li: { id: string };
const send = sender(() => app);
const json = async (method: string, path: string, body?: unknown, status?: number) => {
  const res = await send(method, path, body);
  const out = res.status === 204 ? undefined : await res.json();
  if (status !== undefined) expect(res.status, JSON.stringify(out)).toBe(status);
  return out;
};

const HOUR = 3_600_000;
const MEMORY = {
  ...RICH_MEMORY,
  voice: { ...RICH_MEMORY.voice, bannedWords: ['leverage'], avoid: ['Hype words: seamless, unlock.'] },
  styleRules: { terms: [{ use: 'post', insteadOf: 'content piece' }], formatting: ['No hashtags'] },
};

/** Tomorrow at 9:00 local: the top X prior slot, so the plan has to route around a post already there. */
const tomorrowAt = (hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
};
let scheduledAt: Date;

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  db = await openDb('memory://');
  app = createApp(db, {}, createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated' }));
  brandId = (await json('POST', '/v1/brands', { name: 'Harbor', memory: MEMORY }, 201)).id;
  x = await json('POST', '/v1/sandbox/channels', { brandId, platform: 'x', handle: 'harborhq' }, 201);
  li = await json('POST', '/v1/sandbox/channels', { brandId, platform: 'linkedin', handle: 'Derek' }, 201);
  scheduledAt = tomorrowAt(9);
  await json('POST', '/v1/posts', { channelId: x.id, parts: [{ text: 'Already on the calendar for tomorrow morning.' }], scheduledFor: scheduledAt.toISOString() }, 201);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});

const at = (iso: string) => new Date(iso).getTime();
const sameLocalDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

describe('agent library', () => {
  it('lists the built-in agents with inputs, steps and triggers', async () => {
    const { data } = await json('GET', '/v1/agents', undefined, 200);
    expect(data.map((a: any) => a.id)).toEqual(['weekly_plan', 'repurpose_winner', 'voice_check', 'digest', 'voice_refresh']);
    const plan = data[0];
    expect(plan).toMatchObject({ name: 'Weekly plan', category: 'plan', produces: ['digest', 'ideas', 'drafts', 'approvals'], triggers: ['manual', 'schedule'], automations: 0 });
    expect(plan.steps.map((s: any) => s.key)).toEqual(['digest', 'slots', 'ideas', 'drafts', 'checks', 'approvals']);
    expect(plan.inputs.find((i: any) => i.key === 'postsPerPlatform')).toMatchObject({ type: 'number', default: 3, min: 1, max: 7, required: false });
    expect(plan.lastRun).toBeUndefined();
    expect((await json('GET', '/v1/agents/voice_check', undefined, 200)).triggers).toEqual(['manual']);
    expect((await json('GET', '/v1/agents/nope', undefined, 404)).error.code).toBe('NOT_FOUND');
  });

  it('rejects bad inputs with 400 before starting a run', async () => {
    expect((await json('POST', '/v1/agents/weekly_plan/runs', { inputs: {} }, 400)).error.message).toMatch(/brandId/);
    expect((await json('POST', '/v1/agents/weekly_plan/runs', { inputs: { brandId, postsPerPlatform: 9 } }, 400)).error.message).toMatch(/postsPerPlatform/);
    expect((await json('POST', '/v1/agents/weekly_plan/runs', { inputs: { brandId, platforms: ['threads'] } }, 400)).error.message).toMatch(/no connected Threads channel/);
    const bare = (await json('POST', '/v1/brands', { name: 'No channels' }, 201)).id;
    expect((await json('POST', '/v1/agents/weekly_plan/runs', { inputs: { brandId: bare } }, 400)).error.message).toMatch(/no connected channel/);
    await json('POST', '/v1/agents/nope/runs', { inputs: {} }, 404);
    const runs = (await json('GET', '/v1/agent-runs?agentId=weekly_plan', undefined, 200)).data;
    expect(runs).toEqual([]);
  });
});

describe('weekly plan', () => {
  let run: any;

  it('reads last week, drafts every idea and queues approvals on open future slots', async () => {
    run = await json('POST', '/v1/agents/weekly_plan/runs', { inputs: { brandId, postsPerPlatform: 2 } }, 201);
    expect(run).toMatchObject({ kind: 'agent', agentId: 'weekly_plan', brandId, brandName: 'Harbor', status: 'succeeded', source: 'ui', simulated: true, stepCount: 6, approvalCount: 4 });
    expect(run.inputs).toEqual({ brandId, postsPerPlatform: 2, platforms: ['x', 'linkedin'] });
    expect(run.steps.map((s: any) => [s.key, s.status])).toEqual([
      ['digest', 'succeeded'], ['slots', 'succeeded'], ['ideas', 'succeeded'], ['drafts', 'succeeded'], ['checks', 'succeeded'], ['approvals', 'succeeded'],
    ]);
    expect(run.summary).toMatch(/4 posts across X, LinkedIn; 4 waiting for approval/);

    // Model runs are children; the parent's usage is their sum.
    expect(run.children.map((c: any) => c.kind)).toEqual(['insights', 'ideas', 'draft', 'draft']);
    for (const c of run.children) expect(c).toMatchObject({ parentRunId: run.id, source: 'ui', agentId: 'weekly_plan', status: 'succeeded' });
    const sum = (k: 'inputTokens' | 'outputTokens') => run.children.reduce((a: number, c: any) => a + c.usage[k], 0);
    expect(run.usage).toEqual({ inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens') });

    const ideaStep = run.steps.find((s: any) => s.key === 'ideas');
    expect(ideaStep.refs.filter((r: any) => r.kind === 'idea')).toHaveLength(2);
    expect(run.output).toMatchObject({ ideaIds: expect.any(Array), draftIds: expect.any(Array), approvalIds: expect.any(Array) });

    expect(run.approvals).toHaveLength(4);
    const now = Date.now();
    for (const a of run.approvals) {
      expect(a).toMatchObject({ status: 'pending', runId: run.id, agentId: 'weekly_plan', source: 'ui', brandName: 'Harbor' });
      expect(at(a.proposedFor)).toBeGreaterThan(now + HOUR);
      expect(at(a.proposedFor)).toBeLessThan(now + 9 * 24 * HOUR);
      expect(a.reason).toMatch(/best (X|LinkedIn) slots\. From last week's digest: /);
      expect(a.checks.map((c: any) => c.key)).toEqual(['banned_words', 'avoid', 'length', 'hashtags', 'style_rules', 'hook']);
      expect(a.draft).toMatchObject({ author: 'agent', platform: a.channel.platform, simulated: true });
      expect(a.ideaTitle).toBeTruthy();
    }
    for (const ch of [x, li]) {
      const mine = run.approvals.filter((a: any) => a.channel.id === ch.id);
      expect(mine).toHaveLength(2);
      expect(Math.abs(at(mine[0].proposedFor) - at(mine[1].proposedFor))).toBeGreaterThanOrEqual(3 * HOUR);
      expect(sameLocalDay(mine[0].proposedFor, mine[1].proposedFor)).toBe(false);
    }
    // Nothing within 3h of the post already scheduled on X.
    for (const a of run.approvals.filter((a: any) => a.channel.id === x.id)) expect(Math.abs(at(a.proposedFor) - scheduledAt.getTime())).toBeGreaterThanOrEqual(3 * HOUR);

    // Nothing was published or scheduled by the agent.
    const posts = (await json('GET', `/v1/posts?brandId=${brandId}`, undefined, 200)).data;
    expect(posts).toHaveLength(1);
  });

  it('shows up in the run log, the agent list and the approval queue', async () => {
    expect(await json('GET', `/v1/agent-runs/${run.id}`, undefined, 200)).toEqual(run);
    const top = (await json('GET', `/v1/agent-runs?brandId=${brandId}&topLevel=true`, undefined, 200)).data;
    expect(top.map((r: any) => r.id)).toEqual([run.id]);
    const all = (await json('GET', `/v1/agent-runs?brandId=${brandId}&agentId=weekly_plan`, undefined, 200)).data;
    expect(all).toHaveLength(5);
    expect((await json('GET', '/v1/agent-runs?source=mcp', undefined, 200)).data).toEqual([]);
    await json('GET', '/v1/agent-runs?source=nope', undefined, 400);

    const { data: agents } = await json('GET', '/v1/agents', undefined, 200);
    expect(agents[0].lastRun).toMatchObject({ id: run.id, status: 'succeeded', approvalCount: 4 });

    const queue = await json('GET', `/v1/approvals?runId=${run.id}`, undefined, 200);
    expect(queue.counts).toEqual({ pending: 4, approved: 0, rejected: 0 });
    const times = queue.data.map((a: any) => at(a.proposedFor));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('reuses a fresh digest and keeps clear of the slots it already proposed', async () => {
    const again = await json('POST', '/v1/agents/weekly_plan/runs', { inputs: { brandId, platforms: ['x'], postsPerPlatform: 2 } }, 201);
    expect(again.status).toBe('succeeded');
    expect(again.steps[0].detail).toMatch(/^Reused today's digest/);
    expect(again.children.map((c: any) => c.kind)).toEqual(['ideas', 'draft', 'draft']);
    const taken = run.approvals.filter((a: any) => a.channel.id === x.id).map((a: any) => at(a.proposedFor));
    for (const a of again.approvals) for (const t of [...taken, scheduledAt.getTime()]) expect(Math.abs(at(a.proposedFor) - t)).toBeGreaterThanOrEqual(3 * HOUR);
  });

  it('puts ideas and drafts on a campaign canvas', async () => {
    const campaign = await json('POST', '/v1/campaigns', { brandId, name: 'Launch' }, 201);
    const r = await json('POST', '/v1/agents/weekly_plan/runs', { inputs: { brandId, platforms: ['linkedin'], postsPerPlatform: 1, campaignId: campaign.id } }, 201);
    expect(r.status).toBe('succeeded');
    const { items, edges } = await json('GET', `/v1/campaigns/${campaign.id}/canvas`, undefined, 200);
    const frameOf = (title: string) => items.find((i: any) => i.kind === 'frame' && i.data.title === title).id;
    const idea = items.find((i: any) => i.kind === 'idea');
    const draft = items.find((i: any) => i.kind === 'draft');
    expect(idea).toMatchObject({ parentId: frameOf('Ideas'), refId: r.output.ideaIds[0] });
    expect(idea.entity.campaignId).toBe(campaign.id);
    expect(draft).toMatchObject({ parentId: frameOf('Drafts'), refId: r.output.draftIds[0] });
    expect(edges).toEqual([expect.objectContaining({ source: idea.id, target: draft.id })]);
  });

  it('records a failure on the run and still returns it', async () => {
    const broken = new SimulatedModel();
    broken.digest = async () => {
      throw new Error('model is down');
    };
    const other = (await json('POST', '/v1/brands', { name: 'Fresh' }, 201)).id;
    await json('POST', '/v1/sandbox/channels', { brandId: other, platform: 'x', handle: 'fresh' }, 201);
    const offApp = createApp(db, {}, createDeps(db, { publishMode: 'sandbox', model: broken }));
    const res = await offApp.request('/v1/agents/weekly_plan/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inputs: { brandId: other } }) });
    expect(res.status).toBe(201);
    const failed = await res.json();
    expect(failed).toMatchObject({ status: 'failed', error: 'model is down', summary: 'Failed at "Read last week".', approvalCount: 0 });
    expect(failed.steps).toEqual([expect.objectContaining({ key: 'digest', status: 'failed', detail: 'model is down' })]);
    expect(failed.children).toEqual([expect.objectContaining({ kind: 'insights', status: 'failed' })]);
  });
});

describe('repurpose a winner', () => {
  it('drafts a published post for the other platforms and queues it', async () => {
    const post = await json('POST', '/v1/posts', { channelId: x.id, parts: [{ text: '41% of my posts got 80% of their views in the first 6 hours.' }] }, 201);
    expect(post.status).toBe('published');
    const r = await json('POST', '/v1/agents/repurpose_winner/runs', { inputs: { postId: post.id } }, 201);
    expect(r).toMatchObject({ status: 'succeeded', brandId, inputs: { postId: post.id, platforms: ['linkedin'] } });
    expect(r.steps.map((s: any) => s.key)).toEqual(['post', 'idea', 'drafts', 'checks', 'slots', 'approvals']);
    expect(r.approvals).toHaveLength(1);
    expect(r.approvals[0]).toMatchObject({ channel: { id: li.id, platform: 'linkedin' }, agentId: 'repurpose_winner', ideaTitle: expect.stringMatching(/^Repurpose: 41%/) });
    expect(r.children).toEqual([expect.objectContaining({ kind: 'draft', parentRunId: r.id })]);

    const scheduled = (await json('GET', `/v1/posts?brandId=${brandId}&status=scheduled`, undefined, 200)).data[0];
    expect((await json('POST', '/v1/agents/repurpose_winner/runs', { inputs: { postId: scheduled.id } }, 400)).error.message).toMatch(/only published posts/);
  });
});

describe('voice check', () => {
  it('flags a banned word and an over-length part, deterministically', async () => {
    const text = `I leverage one simple trick. ${'This sentence pads the post well past the limit. '.repeat(7)}`;
    const draft = await json('POST', '/v1/drafts', { brandId, platform: 'x', parts: [{ text }] }, 201);
    const r = await json('POST', '/v1/agents/voice_check/runs', { inputs: { draftId: draft.id } }, 201);
    expect(r).toMatchObject({ status: 'succeeded', agentId: 'voice_check', children: [], summary: '2 issues: Banned words, Length' });
    const checks = r.output.report.checks;
    expect(r.output.report).toMatchObject({ draftId: draft.id, ok: false });
    expect(checks.find((c: any) => c.key === 'banned_words')).toEqual({ key: 'banned_words', ok: false, severity: 'fail', label: 'Banned words', detail: 'Uses "leverage".' });
    expect(checks.find((c: any) => c.key === 'length')).toMatchObject({ ok: false, severity: 'fail', detail: expect.stringMatching(/^The post is \d+ characters; X allows 280\.$/) });
    expect(checks.find((c: any) => c.key === 'hook')).toMatchObject({ ok: true, severity: 'info' });

    const fine = await json('POST', '/v1/drafts', { brandId, platform: 'linkedin', parts: [{ text: 'A seamless content piece #a #b #c #d!' }] }, 201);
    const r2 = await json('POST', '/v1/agents/voice_check/runs', { inputs: { draftId: fine.id } }, 201);
    const byKey = Object.fromEntries(r2.output.report.checks.map((c: any) => [c.key, c]));
    expect(byKey.banned_words.ok).toBe(true);
    expect(byKey.avoid).toMatchObject({ ok: false, severity: 'warn', detail: 'The voice avoids "seamless".' });
    expect(byKey.hashtags).toMatchObject({ ok: false, severity: 'warn' });
    expect(byKey.style_rules.detail).toMatch(/Use "post" instead of "content piece"\. "No hashtags", but the draft has 4\./);
    expect(byKey.length.ok).toBe(true);
  });
});

describe('approvals', () => {
  const pending = async () => (await json('GET', `/v1/approvals?brandId=${brandId}&status=pending`, undefined, 200)).data;

  it('lists pending first, soonest first, with counts', async () => {
    const all = await json('GET', '/v1/approvals', undefined, 200);
    expect(all.counts.pending).toBe(all.data.length);
    const times = all.data.map((a: any) => at(a.proposedFor));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    await json('GET', '/v1/approvals?status=maybe', undefined, 400);
  });

  it('approving schedules a post at the proposed slot through the posts path', async () => {
    const [a] = await pending();
    const { approval, post } = await json('POST', `/v1/approvals/${a.id}/approve`, {}, 200);
    expect(approval).toMatchObject({ id: a.id, status: 'approved', postId: post.id, decidedAt: expect.any(String) });
    expect(post).toMatchObject({ status: 'scheduled', scheduledFor: a.proposedFor, channelId: a.channel.id, ideaId: a.ideaId });
    expect(post.parts).toEqual(a.draft.parts);
    const idea = (await json('GET', `/v1/ideas?brandId=${brandId}`, undefined, 200)).data.find((i: any) => i.id === a.ideaId);
    expect(idea.status).toBe('scheduled');
    expect((await json('POST', `/v1/approvals/${a.id}/approve`, {}, 409)).error.code).toBe('CONFLICT');
  });

  it('edited parts become a new human draft version', async () => {
    const [a] = await pending();
    const parts = [{ text: 'Edited by a person before approving.', media: [] }];
    const { approval, post } = await json('POST', `/v1/approvals/${a.id}/approve`, { parts }, 200);
    expect(approval.draft).toMatchObject({ author: 'human', version: a.draft.version + 1, ideaId: a.ideaId, parts });
    expect(post.parts).toEqual(parts);
    const versions = (await json('GET', `/v1/drafts?ideaId=${a.ideaId}&all=1`, undefined, 200)).data.filter((d: any) => d.platform === a.channel.platform);
    expect(versions.map((d: any) => d.author)).toEqual(['human', 'agent']);
  });

  it('refuses a proposed time in the past unless a new time is given', async () => {
    const [a] = await pending();
    await db.query("UPDATE approvals SET proposed_for = now() - interval '1 hour' WHERE id = $1", [a.id]);
    expect((await json('POST', `/v1/approvals/${a.id}/approve`, {}, 400)).error.message).toMatch(/has passed/);
    expect((await json('POST', `/v1/approvals/${a.id}/approve`, { scheduledFor: new Date(Date.now() - HOUR).toISOString() }, 400)).error.message).toMatch(/future/);
    const later = new Date(Date.now() + 48 * HOUR).toISOString();
    const { approval, post } = await json('POST', `/v1/approvals/${a.id}/approve`, { scheduledFor: later }, 200);
    expect(approval.status).toBe('approved');
    expect(post.scheduledFor).toBe(later);
  });

  it('rejects with a note', async () => {
    const [a] = await pending();
    const r = await json('POST', `/v1/approvals/${a.id}/reject`, { note: 'Off-brand hook.' }, 200);
    expect(r).toMatchObject({ status: 'rejected', decidedNote: 'Off-brand hook.' });
    expect(r.postId).toBeUndefined();
    await json('POST', `/v1/approvals/${a.id}/reject`, {}, 409);
    await json('POST', '/v1/approvals/apr_missing/reject', {}, 404);
  });

  it('approves or rejects in bulk, reporting each one', async () => {
    const [a, b] = await pending();
    const rejected = (await json('GET', `/v1/approvals?status=rejected`, undefined, 200)).data[0];
    const { results } = await json('POST', '/v1/approvals/bulk', { action: 'approve', ids: [a.id, rejected.id, 'apr_missing'] }, 200);
    expect(results).toEqual([
      { id: a.id, ok: true },
      { id: rejected.id, ok: false, error: expect.stringMatching(/already rejected/) },
      { id: 'apr_missing', ok: false, error: expect.stringMatching(/not found/) },
    ]);
    expect((await json('POST', '/v1/approvals/bulk', { action: 'reject', ids: [b.id] }, 200)).results).toEqual([{ id: b.id, ok: true }]);
    const counts = (await json('GET', `/v1/approvals?brandId=${brandId}`, undefined, 200)).counts;
    expect(counts.approved).toBe(4);
    expect(counts.rejected).toBe(2);
  });
});
