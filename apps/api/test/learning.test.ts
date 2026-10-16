import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { brandMemorySchema, type NormalizedMetrics, type Platform, type PostPart } from '@harbor/core';
import { createApp, createDeps, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { classifyReply, groupThemes, regroupBrandThemes, upsertReplies } from '../src/services/replies.ts';
import { insertHistoricalPost } from '../src/services/sandbox-history.ts';
import { VOICE_CHANGE_TEMPLATES } from '@harbor/ai';
import { AVOID_LIFT, DO_LIFT, FEATURES, featureLifts, proposeChanges, ruleMatches, type LearningPost } from '../src/services/voice-learning.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
const send = sender(() => app);
const json = async (method: string, path: string, body?: unknown, status?: number) => {
  const res = await send(method, path, body);
  const out = res.status === 204 ? undefined : await res.json();
  if (status !== undefined) expect(res.status, JSON.stringify(out)).toBe(status);
  return out;
};

const DAY = 86_400_000;
const text = (t: string, more: string[] = []): PostPart[] => [{ text: t, media: [] }, ...more.map((m) => ({ text: m, media: [] }))];
/** Views grow to `final` by 168h. */
const curve = (final: number) => (age: number): NormalizedMetrics => ({ views: Math.round(final * Math.min(1, age / 168)), likes: Math.round((final * Math.min(1, age / 168)) / 20) });
const brand = async (name: string, memory: unknown = {}) => (await json('POST', '/v1/brands', { name, memory }, 201)) as { id: string; name: string };
const channel = async (brandId: string, platform: Platform, handle = 'acct') => (await json('POST', '/v1/sandbox/channels', { brandId, platform, handle }, 201)) as { id: string };

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  db = await openDb('memory://');
  app = createApp(db, {}, createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated' }));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});

// ---- Voice refresh analysis (pure) ----

const lp = (id: string, first: string, ratio: number, more: string[] = []): LearningPost => ({
  id, platform: 'x', parts: [first, ...more], ratio, verdict: ratio >= 1.3 ? 'outperformed' : ratio >= 0.7 ? 'met' : 'underperformed', signalId: `sig_${id}`,
});
const voice = (v: Partial<{ do: string[]; avoid: string[]; excerpts: { text: string }[] }> = {}) => brandMemorySchema.parse({ voice: v }).voice;

describe('voice refresh analysis', () => {
  // 4 first-person posts at 2.0, 1.8, 1.6, 1.4 and 4 others at 1.0, 0.9, 0.8, 0.7.
  const posts = [
    lp('a', 'I shipped the poller today.', 2.0), lp('b', 'I deleted three calendars.', 1.8), lp('c', "I'm done guessing what works.", 1.6), lp('d', 'My numbers from last month.', 1.4),
    lp('e', 'The final number lies.', 1.0), lp('f', 'Content tools assume one brand.', 0.9), lp('g', 'Shipping log: retries.', 0.8), lp('h', 'Open source, AGPL.', 0.7),
  ];

  it('computes lift as median(with) / median(without)', () => {
    const fp = featureLifts(posts).find((l) => l.feature === 'firstPerson')!;
    expect(fp).toMatchObject({ withCount: 4, withoutCount: 4, lift: 2 }); // 1.7 / 0.85
    expect(fp.posts).toEqual(['a', 'b', 'c', 'd']);
  });

  it('needs 3 posts on each side', () => {
    const lifts = featureLifts([...posts.slice(0, 2), ...posts.slice(4)]);
    expect(lifts.find((l) => l.feature === 'firstPerson')).toBeUndefined();
    // Every post is short, so "short" has nobody on the other side.
    expect(featureLifts(posts).find((l) => l.feature === 'short')).toBeUndefined();
  });

  it('turns lift ≥ 1.25 into a do rule and ≤ 0.8 into an avoid rule, nothing in between', () => {
    const changes = proposeChanges(voice(), posts);
    const fp = changes.find((c) => c.feature === 'firstPerson')!;
    expect(fp).toMatchObject({ op: 'add', target: 'voice.do', lift: 2, why: 'Posts opening in the first person did 2× the median (4 vs 4 posts).' });
    expect(fp.evidence.posts.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(fp.evidence.posts[0]).toMatchObject({ text: 'I shipped the poller today.', platform: 'x', ratio: 2, verdict: 'outperformed' });
    expect(fp.evidence.signals).toEqual(['sig_a', 'sig_b', 'sig_c', 'sig_d']);

    // Swap the ratios: first-person posts now lose (lift 0.5) → an avoid rule, worst posts first.
    const flipped = posts.map((p, i) => ({ ...p, ratio: posts[(i + 4) % 8]!.ratio }));
    const avoid = proposeChanges(voice(), flipped).find((c) => c.feature === 'firstPerson')!;
    expect(avoid).toMatchObject({ op: 'add', target: 'voice.avoid', lift: 0.5 });
    expect(avoid.evidence.posts[0]!.id).toBe('d');

    // Close to 1: no rule either way.
    const flat = posts.map((p) => ({ ...p, ratio: p.id < 'e' ? 1.1 : 1.0 }));
    expect(featureLifts(flat).find((l) => l.feature === 'firstPerson')!.lift).toBeGreaterThan(AVOID_LIFT);
    expect(featureLifts(flat).find((l) => l.feature === 'firstPerson')!.lift).toBeLessThan(DO_LIFT);
    expect(proposeChanges(voice(), flat).some((c) => c.feature === 'firstPerson')).toBe(false);
  });

  it('skips a rule that already exists', () => {
    const changes = proposeChanges(voice({ do: ['Write in the first person ("I"), from your own experience.'] }), posts);
    expect(changes.some((c) => c.feature === 'firstPerson')).toBe(false);
  });

  it('proposes removing a rule the results contradict', () => {
    const rule = 'Opening in the first person; lead with the reader.';
    const changes = proposeChanges(voice({ avoid: [rule] }), posts);
    expect(changes[0]).toMatchObject({ op: 'remove', target: 'voice.avoid', text: rule, feature: 'firstPerson', lift: 2 });
    expect(changes[0]!.why).toMatch(/goes against the results: posts opening in the first person did 2×/);
    expect(changes.find((c) => c.op === 'add' && c.feature === 'firstPerson')).toBeTruthy();
  });

  it('words every rule so the next refresh recognizes it', () => {
    for (const f of FEATURES) {
      const t = VOICE_CHANGE_TEMPLATES[f.key]!;
      for (const rule of [t.do, t.avoid, f.doText, f.avoidText]) {
        expect(ruleMatches(rule, f), `${f.key}: ${rule}`).toBe(true);
        expect(FEATURES.filter((g) => ruleMatches(rule, g)).map((g) => g.key), rule).toEqual([f.key]);
      }
    }
  });

  it('proposes excerpts from the top 1–2 winners, never twice, and at most 6 changes', () => {
    const changes = proposeChanges(voice({ excerpts: [{ text: 'I deleted three calendars.' }] }), posts);
    const excerpts = changes.filter((c) => c.target === 'voice.excerpts');
    expect(excerpts.map((c) => c.text)).toEqual(['I shipped the poller today.', "I'm done guessing what works."]);
    expect(excerpts[0]!.evidence.posts.map((p) => p.id)).toEqual(['a']);
    const many = [...posts, ...['x1', 'x2', 'x3'].map((id) => lp(id, `#tag ${id} 🔥 https://a.example?`, 0.3, ['part 2']))];
    expect(proposeChanges(voice(), many).length).toBeLessThanOrEqual(6);
  });
});

// ---- The agent and applying proposals ----

describe('voice refresh agent and memory proposals', () => {
  let brandId: string;
  let run: any;
  let proposal: any;

  beforeAll(async () => {
    brandId = (await brand('Learner', { voice: { do: ['Use real numbers'], avoid: ['Exclamation marks.'] } })).id;
    const x = await channel(brandId, 'x', 'learner');
    for (let i = 0; i < 12; i++) {
      const fp = i % 2 === 0;
      await insertHistoricalPost(db, {
        brandId, channelId: x.id, platform: 'x', publishedAt: new Date(Date.now() - (30 - i) * DAY),
        parts: text(fp ? `I tried a new routine for week ${i}. It saved me two hours of planning.` : `Week ${i} of the content routine, in short.`),
        metricsAt: curve(fp ? 2000 + i * 10 : 1000 + i * 10),
      });
    }
  });

  it('is in the agent library', async () => {
    const def = await json('GET', '/v1/agents/voice_refresh', undefined, 200);
    expect(def).toMatchObject({ name: 'Voice refresh', category: 'review', produces: ['report', 'approvals'], triggers: ['manual', 'schedule'] });
    expect(def.steps.map((s: any) => s.key)).toEqual(['outcomes', 'compare', 'rules', 'propose', 'queue']);
    expect(def.inputs).toEqual([expect.objectContaining({ key: 'brandId', type: 'brand', required: true })]);
  });

  it('compares winners with losers and queues a proposal with evidence', async () => {
    run = await json('POST', '/v1/agents/voice_refresh/runs', { inputs: { brandId } }, 201);
    expect(run).toMatchObject({ agentId: 'voice_refresh', status: 'succeeded', simulated: true, approvalCount: 0 });
    expect(run.steps.map((s: any) => [s.key, s.status])).toEqual([['outcomes', 'succeeded'], ['compare', 'succeeded'], ['rules', 'succeeded'], ['propose', 'succeeded'], ['queue', 'succeeded']]);
    expect(run.children.map((c: any) => c.kind)).toEqual(['voice']);
    const queue = run.steps.find((s: any) => s.key === 'queue');
    expect(queue.refs).toEqual([expect.objectContaining({ kind: 'proposal', id: run.output.proposalId })]);

    const list = await json('GET', `/v1/memory-proposals?status=pending&brandId=${brandId}`, undefined, 200);
    expect(list.counts).toEqual({ pending: 1, applied: 0, rejected: 0 });
    proposal = list.data[0];
    expect(proposal).toMatchObject({ id: run.output.proposalId, brandId, brandName: 'Learner', runId: run.id, agentId: 'voice_refresh', status: 'pending' });
    expect(proposal.changes.length).toBeGreaterThanOrEqual(2);
    const fp = proposal.changes.find((c: any) => c.target === 'voice.do' && /first person/.test(c.text));
    expect(fp).toMatchObject({ id: expect.stringMatching(/^c\d+$/), op: 'add', status: 'pending', text: 'Open in the first person ("I", "My"): start with what you did.' });
    expect(fp.lift).toBeGreaterThanOrEqual(1.25);
    expect(fp.why).toMatch(/^Posts opening in the first person did [\d.]+× the median \(6 vs 6 posts\)\.$/);
    expect(fp.evidence.posts).toHaveLength(6);
    expect(fp.evidence.posts[0]).toMatchObject({ platform: 'x', verdict: 'outperformed', text: expect.stringMatching(/^I tried/) });
    expect(fp.evidence.signals).toHaveLength(6);
    expect(proposal.changes.some((c: any) => c.target === 'voice.excerpts')).toBe(true);
  });

  it('applies a partial accept: accepted changes merge with evidence, the rest are rejected', async () => {
    const fp = proposal.changes.find((c: any) => c.target === 'voice.do');
    const res = await json('POST', `/v1/memory-proposals/${proposal.id}/apply`, { accept: [fp.id] }, 200);
    expect(res.proposal.status).toBe('applied');
    expect(res.proposal.decidedAt).toEqual(expect.any(String));
    for (const c of res.proposal.changes) expect(c.status).toBe(c.id === fp.id ? 'accepted' : 'rejected');
    expect(res.memory.voice.do).toEqual(['Use real numbers', fp.text]);
    expect(res.memory.voice.excerpts).toEqual([]);
    expect(res.memory.voice.evidence).toEqual([
      { rule: fp.text, kind: 'do', posts: fp.evidence.posts.map((p: any) => p.id), signals: fp.evidence.signals, note: fp.why, source: 'refresh', at: expect.any(String) },
    ]);
    expect((await json('GET', `/v1/brands/${brandId}`, undefined, 200)).memory.voice.evidence).toHaveLength(1);
    expect((await json('GET', `/v1/memory-proposals?brandId=${brandId}`, undefined, 200)).counts).toEqual({ pending: 0, applied: 1, rejected: 0 });
  });

  it('refuses a proposal that is no longer pending (409) and unknown change ids (400)', async () => {
    expect((await json('POST', `/v1/memory-proposals/${proposal.id}/apply`, { accept: [] }, 409)).error.code).toBe('CONFLICT');
    await json('POST', '/v1/memory-proposals/mpr_missing/apply', { accept: [] }, 404);
    const again = await json('POST', '/v1/agents/voice_refresh/runs', { inputs: { brandId } }, 201);
    // The accepted rule now exists, so it isn't proposed again.
    const next = await json('GET', `/v1/memory-proposals?status=pending&brandId=${brandId}`, undefined, 200);
    expect(next.data[0].id).toBe(again.output.proposalId);
    expect(next.data[0].changes.some((c: any) => /first person/.test(c.text))).toBe(false);
    await json('POST', `/v1/memory-proposals/${again.output.proposalId}/apply`, { accept: ['c99'] }, 400);
    const rejected = await json('POST', `/v1/memory-proposals/${again.output.proposalId}/apply`, { accept: [] }, 200);
    expect(rejected.proposal.status).toBe('rejected');
    expect(rejected.proposal.changes.every((c: any) => c.status === 'rejected')).toBe(true);
  });

  it('skips the queue when there is nothing to learn yet', async () => {
    const empty = (await brand('Empty')).id;
    const r = await json('POST', '/v1/agents/voice_refresh/runs', { inputs: { brandId: empty } }, 201);
    expect(r.status).toBe('succeeded');
    expect(r.steps.find((s: any) => s.key === 'queue').status).toBe('skipped');
    expect(r.output.proposalId).toBeUndefined();
  });
});

// ---- Save to Brand Memory ----

describe('save to Brand Memory', () => {
  let brandId: string;
  let postId: string;
  let signalId: string;
  let draftId: string;

  beforeAll(async () => {
    brandId = (await brand('Saver')).id;
    const x = await channel(brandId, 'x', 'saver');
    postId = await insertHistoricalPost(db, { brandId, channelId: x.id, platform: 'x', parts: text('Two make money, one breaks even, one is a hobby.'), publishedAt: new Date(Date.now() - 9 * DAY), metricsAt: curve(900) });
    await json('POST', '/v1/ideas/generate', { brandId, count: 1 }, 201); // derives the post's performance signal
    signalId = (await json('GET', `/v1/brands/${brandId}/signals`, undefined, 200)).data.find((s: any) => s.kind === 'post_performance').id;
    draftId = (await json('POST', '/v1/drafts', { brandId, platform: 'x', parts: [{ text: 'Never post the same thing everywhere.' }] }, 201)).id;
  });

  const save = (body: unknown, status: number) => json('POST', `/v1/brands/${brandId}/memory/save`, body, status);

  it('saves a post as a knowledge note', async () => {
    const res = await save({ from: { kind: 'post', id: postId }, as: 'knowledge', note: 'Our best-known line.' }, 200);
    expect(res.saved).toEqual({ target: 'knowledge', text: 'Two make money, one breaks even, one is a hobby.' });
    const note = res.memory.knowledge.at(-1);
    expect(note).toMatchObject({ kind: 'note', title: 'Two make money, one breaks even, one is a hobby.' });
    expect(note.body).toMatch(/^Two make money.*\n\nOur best-known line\.\n\nSaved from post https:\/\/sandbox\.harbor\.local\/x\//s);
  });

  it('saves a post as an excerpt, with evidence linking the post and its signal', async () => {
    const res = await save({ from: { kind: 'post', id: postId }, as: 'excerpt' }, 200);
    expect(res.saved.target).toBe('voice.excerpts');
    expect(res.memory.voice.excerpts).toEqual([{ text: 'Two make money, one breaks even, one is a hobby.', source: 'Saved from post' }]);
    expect(res.memory.voice.evidence).toEqual([
      { rule: 'Two make money, one breaks even, one is a hobby.', kind: 'excerpt', posts: [postId], signals: [signalId], source: 'saved', at: expect.any(String) },
    ]);
  });

  it('saves a post as an example post with its platform', async () => {
    const res = await save({ from: { kind: 'post', id: postId }, as: 'example' }, 200);
    expect(res.saved.target).toBe('examplePosts');
    expect(res.memory.examplePosts.at(-1)).toMatchObject({ platform: 'x', text: 'Two make money, one breaks even, one is a hobby.', url: expect.stringContaining('sandbox.harbor.local') });
  });

  it('saves a signal as a do rule and a draft as an avoid rule', async () => {
    const d = await save({ from: { kind: 'signal', id: signalId }, as: 'do', text: 'Lead with the split of what makes money.' }, 200);
    expect(d.saved).toEqual({ target: 'voice.do', text: 'Lead with the split of what makes money.' });
    expect(d.memory.voice.do).toContain('Lead with the split of what makes money.');
    expect(d.memory.voice.evidence.find((e: any) => e.kind === 'do')).toMatchObject({ rule: 'Lead with the split of what makes money.', signals: [signalId], posts: [postId], source: 'saved' });
    const a = await save({ from: { kind: 'draft', id: draftId }, as: 'avoid' }, 200);
    expect(a.saved).toEqual({ target: 'voice.avoid', text: 'Never post the same thing everywhere.' });
    expect(a.memory.voice.avoid).toContain('Never post the same thing everywhere.');
  });

  it('refuses a duplicate (409) and a source from another brand (400)', async () => {
    expect((await save({ from: { kind: 'post', id: postId }, as: 'excerpt' }, 409)).error.code).toBe('CONFLICT');
    await save({ from: { kind: 'draft', id: draftId }, as: 'avoid', text: 'never post the same thing everywhere.' }, 409);
    const other = (await brand('Other')).id;
    const res = await json('POST', `/v1/brands/${other}/memory/save`, { from: { kind: 'post', id: postId }, as: 'do' }, 400);
    expect(res.error.message).toMatch(/another brand/);
    await save({ from: { kind: 'post', id: 'pst_missing' }, as: 'do' }, 404);
    await save({ from: { kind: 'post', id: postId }, as: 'tweet' }, 400);
  });

  it('drops evidence when its rule is edited away', async () => {
    const current = (await json('GET', `/v1/brands/${brandId}`, undefined, 200)).memory.voice;
    const patched = await json('PATCH', `/v1/brands/${brandId}`, { memory: { voice: { ...current, do: [] } } }, 200);
    // The do rule's evidence goes with it; the avoid rule and the excerpt keep theirs.
    expect(patched.memory.voice.evidence.map((e: any) => e.kind).sort()).toEqual(['avoid', 'excerpt']);
  });
});

// ---- Preview ----

describe('preview Brand Memory', () => {
  it('drafts with and without memory and lists the rules that fired, with their evidence', async () => {
    const at = new Date().toISOString();
    const memory = {
      ...RICH_MEMORY,
      voice: { ...RICH_MEMORY.voice, bannedWords: ['leverage'], evidence: [{ rule: 'leverage', kind: 'banned', posts: [], signals: [], note: 'Reads as hype.', source: 'owner', at }] },
    };
    const b = await brand('Previewer', memory);
    const drafts = async () => (await json('GET', `/v1/drafts?brandId=${b.id}`, undefined, 200)).data.length;
    const before = await drafts();
    const res = await json('POST', `/v1/brands/${b.id}/memory/preview`, { brief: 'How I leverage one content routine for four brands.', platform: 'linkedin' }, 200);
    expect(res.platform).toBe('linkedin');
    expect(res.with.parts[0].text).not.toBe(res.without.parts[0].text);
    expect(res.with.parts[0].text).not.toMatch(/leverage/i);
    expect(res.without.parts[0].text).toMatch(/leverage/i);
    expect(res.with.parts[0].text).toMatch(/Join the waitlist/);
    expect(res.applied.length).toBeGreaterThan(0);
    expect(res.applied).toContainEqual({ kind: 'banned', text: 'leverage', evidence: expect.objectContaining({ note: 'Reads as hype.', source: 'owner' }) });
    expect(res.applied).toContainEqual({ kind: 'product', text: 'Harbor' });
    expect(res.applied).toContainEqual({ kind: 'audience', text: 'Indie hackers' });
    expect(res.run).toMatchObject({ id: expect.stringMatching(/^run_/), simulated: true });
    expect(await drafts()).toBe(before);
    const [row] = await db.query<{ kind: string; source: string }>('SELECT kind, source FROM agent_runs WHERE id = $1', [res.run.id]);
    expect(row).toEqual({ kind: 'preview', source: 'studio' });

    const idea = await json('POST', '/v1/ideas', { brandId: b.id, title: 'One routine, four brands' }, 201);
    expect((await json('POST', `/v1/brands/${b.id}/memory/preview`, { ideaId: idea.id, platform: 'x' }, 200)).with.parts.length).toBeGreaterThan(0);
    await json('POST', `/v1/brands/${b.id}/memory/preview`, { platform: 'x' }, 400);
  });
});

// ---- Replies ----

describe('replies', () => {
  it('classifies replies by kind', () => {
    expect(classifyReply('How do you measure the growth curve?')).toBe('question');
    expect(classifyReply('Is there an API')).toBe('question');
    expect(classifyReply('Not sure this matters for small accounts.')).toBe('objection');
    expect(classifyReply('Why would I pay for this?')).toBe('objection');
    expect(classifyReply('Looks nice but too expensive for me.')).toBe('objection');
    expect(classifyReply('Love this 🔥')).toBe('praise');
    expect(classifyReply('This is exactly what I needed.')).toBe('praise');
    expect(classifyReply('Please add LinkedIn support.')).toBe('request');
    expect(classifyReply('Can you share the template?')).toBe('request');
    expect(classifyReply('Saw this on my feed.')).toBe('other');
  });

  it('groups replies of the same kind by a shared keyword, and leaves one theme per kind for the rest', () => {
    const r = (id: string, kind: any, t: string, postText = 'Harbor checks every post at 1h, 6h, 24h with a growth curve.') => ({ id, postId: `p_${id.length}`, kind, text: t, postText });
    const groups = groupThemes([
      r('1', 'question', 'How is the growth curve measured?'),
      r('2', 'question', 'What does the curve look like at 24h?'),
      r('3', 'question', 'Does the curve include reposts?'),
      r('4', 'question', 'Which plan do I need?'),
      r('5', 'praise', 'Love the curve idea'),
      r('6', 'praise', 'Great writeup'),
    ]);
    expect(groups.map((g) => [g.key, g.replyIds])).toEqual([
      ['question:curve', ['1', '2', '3']],
      ['praise:*', ['5', '6']],
      ['question:*', ['4']],
    ]);
  });

  let brandId: string;
  let postId: string;

  it('upserts one comment signal per theme and keeps its id when regrouped', async () => {
    brandId = (await brand('Replies')).id;
    const th = await channel(brandId, 'threads', 'replies');
    postId = await insertHistoricalPost(db, { brandId, channelId: th.id, platform: 'threads', parts: text('Our pricing page is finally live.'), publishedAt: new Date(Date.now() - 3 * DAY), metricsAt: curve(500) });
    const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    await upsertReplies(db, { id: postId, brandId }, [
      { platformReplyId: 'r1', author: { handle: 'ana' }, text: 'How does the pricing work for teams?', createdAt: at(30) },
      { platformReplyId: 'r2', author: { handle: 'ben' }, text: 'What is the pricing after the trial?', createdAt: at(29) },
      { platformReplyId: 'r3', author: { handle: 'cy', displayName: 'Cy' }, text: 'Love it 🔥', createdAt: at(28), likes: 4 },
    ]);
    expect(await regroupBrandThemes(db, brandId)).toBe(2);
    const signals = async () => (await db.query<{ id: string; summary: string; source: any }>("SELECT id, summary, source FROM signals WHERE brand_id = $1 AND kind = 'comment' ORDER BY summary", [brandId]));
    const first = await signals();
    expect(first.map((s) => s.summary)).toEqual(['1 person left praise', '2 people asked about "pricing"']);
    expect(first[1]!.source).toMatchObject({ theme: 'question:pricing', replyKind: 'question', keyword: 'pricing', postIds: [postId] });
    expect(first[1]!.source.replyIds).toHaveLength(2);

    await upsertReplies(db, { id: postId, brandId }, [{ platformReplyId: 'r4', author: { handle: 'dee' }, text: 'Is the pricing in euros?', createdAt: at(20) }]);
    await regroupBrandThemes(db, brandId);
    const second = await signals();
    expect(second.find((s) => s.source.theme === 'question:pricing')!.id).toBe(first[1]!.id);
    expect(second.find((s) => s.source.theme === 'question:pricing')!.summary).toBe('3 people asked about "pricing"');

    // Themes feed ideas like any other signal.
    expect((await json('GET', `/v1/brands/${brandId}/signals`, undefined, 200)).data.filter((s: any) => s.kind === 'comment')).toHaveLength(2);
  });

  it('lists a post’s replies with their themes, and the brand’s conversation', async () => {
    const res = await json('GET', `/v1/posts/${postId}/replies`, undefined, 200);
    expect(res.supported).toBe(true);
    expect(res.data.map((r: any) => r.text)[0]).toBe('Is the pricing in euros?');
    expect(res.data.find((r: any) => r.author.handle === 'cy')).toMatchObject({ kind: 'praise', likes: 4, author: { handle: 'cy', displayName: 'Cy' }, themeId: expect.stringMatching(/^sig_/) });
    expect(res.themes[0]).toMatchObject({ label: '3 people asked about "pricing"', kind: 'question', keyword: 'pricing', count: 3, posts: [postId] });
    expect(res.themes[0].sample).toHaveLength(3);

    const conv = await json('GET', `/v1/brands/${brandId}/conversation?days=30`, undefined, 200);
    expect(conv.total).toBe(4);
    expect(conv.byKind).toEqual({ question: 3, objection: 0, praise: 1, request: 0, other: 0 });
    expect(conv.themes.map((t: any) => t.count)).toEqual([3, 1]);
    expect((await json('GET', `/v1/brands/${brandId}/conversation?days=1`, undefined, 200)).total).toBe(1);
    await json('GET', `/v1/brands/${brandId}/conversation?days=zero`, undefined, 400);
  });

  it('fetches sandbox replies on demand and says where replies are not supported', async () => {
    const b = (await brand('Sandbox replies')).id;
    const x = await channel(b, 'x', 'sbx');
    const li = await channel(b, 'linkedin', 'sbx');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await insertHistoricalPost(db, { brandId: b, channelId: x.id, platform: 'x', parts: text(`Growth curves beat totals, lesson ${i}.`), publishedAt: new Date(Date.now() - (10 + i) * DAY), key: `replies-${i}` }));
    }
    let total = 0;
    for (const id of ids) {
      const res = await json('POST', `/v1/posts/${id}/replies/refresh`, undefined, 200);
      expect(res.supported).toBe(true);
      total += res.data.length;
      const again = await json('POST', `/v1/posts/${id}/replies/refresh`, undefined, 200);
      expect(again.data.map((r: any) => r.id)).toEqual(res.data.map((r: any) => r.id));
    }
    expect(total).toBeGreaterThan(0);
    expect((await json('GET', `/v1/brands/${b}/conversation`, undefined, 200)).themes.length).toBeGreaterThan(0);

    const liPost = await insertHistoricalPost(db, { brandId: b, channelId: li.id, platform: 'linkedin', parts: text('LinkedIn post'), publishedAt: new Date(Date.now() - 2 * DAY) });
    expect(await json('POST', `/v1/posts/${liPost}/replies/refresh`, undefined, 200)).toEqual({ data: [], themes: [], supported: false });
    const { data: platforms } = await json('GET', '/v1/platforms', undefined, 200);
    expect(Object.fromEntries(platforms.map((p: any) => [p.platform, p.reportsReplies]))).toEqual({ x: true, linkedin: false, instagram: true, threads: true });
  });
});

// ---- Import past posts ----

describe('import past posts', () => {
  let brandId: string;
  let threads: { id: string };
  let scan: any;
  let imported: any;

  beforeAll(async () => {
    brandId = (await brand('Importer', { examplePosts: [{ platform: 'threads', text: 'Roasting batch 41 today: cherry, cocoa and a little honey.' }] })).id;
    threads = await channel(brandId, 'threads', 'importer');
  });

  it('scans the channel for review', async () => {
    scan = await json('POST', `/v1/channels/${threads.id}/import/scan`, { limit: 30 }, 200);
    expect(scan).toMatchObject({ scanId: expect.stringMatching(/^imp_/), channelId: threads.id, supported: true });
    expect(scan.found.length).toBeGreaterThanOrEqual(15);
    expect(scan.found.length).toBeLessThanOrEqual(30);
    for (const p of scan.found) {
      expect(p).toMatchObject({ platformPostId: expect.stringMatching(/^sbx_/), text: expect.any(String), publishedAt: expect.any(String), alreadyImported: false });
      expect(Date.now() - Date.parse(p.publishedAt)).toBeLessThan(61 * DAY);
    }
    const times = scan.found.map((p: any) => Date.parse(p.publishedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('imports the reviewed posts as published, imported posts with one snapshot each', async () => {
    const include = scan.found.slice(2).map((p: any) => p.platformPostId);
    imported = await json('POST', `/v1/channels/${threads.id}/import`, { scanId: scan.scanId, include }, 200);
    expect(imported).toMatchObject({ imported: include.length, skipped: 0 });
    expect(imported.postIds).toHaveLength(include.length);
    const post = await json('GET', `/v1/posts/${imported.postIds[0]}`, undefined, 200);
    expect(post).toMatchObject({ status: 'published', origin: 'imported', platformPostId: include[0], publishedAt: new Date(scan.found[2].publishedAt).toISOString() });
    expect(post.snapshots).toHaveLength(1);
    expect(post.snapshots[0].adapterVersion).toBe('import');
    // No jobs for ages already past.
    const [jobs] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM snapshot_jobs j JOIN posts p ON p.id = j.post_id WHERE p.id = ANY($1::text[]) AND j.due_at < now()', [imported.postIds]);
    expect(jobs!.n).toBe(0);
  });

  it('flags already imported posts on a rescan and skips them on import', async () => {
    const again = await json('POST', `/v1/channels/${threads.id}/import/scan`, {}, 200);
    expect(again.found.map((p: any) => p.platformPostId)).toEqual(scan.found.map((p: any) => p.platformPostId));
    expect(again.found.map((p: any) => p.alreadyImported)).toEqual(scan.found.map((_: any, i: number) => i >= 2));
    const res = await json('POST', `/v1/channels/${threads.id}/import`, { scanId: again.scanId, include: again.found.slice(0, 3).map((p: any) => p.platformPostId) }, 200);
    expect(res).toMatchObject({ imported: 2, skipped: 1 });
  });

  it('gives imported posts verdicts', async () => {
    const posts = await Promise.all(imported.postIds.map((id: string) => json('GET', `/v1/posts/${id}`, undefined, 200)));
    const old = posts.filter((p: any) => Date.now() - Date.parse(p.publishedAt) > 8 * DAY);
    expect(old.length).toBeGreaterThan(5);
    for (const p of old) {
      expect(p.outcome).toMatchObject({ atAgeHours: 168, metric: 'views' });
      expect(['outperformed', 'met', 'underperformed']).toContain(p.outcome.verdict);
    }
  });

  it('says when a channel can’t be scanned and rejects unknown scans', async () => {
    const li = await channel(brandId, 'linkedin', 'importer');
    const res = await json('POST', `/v1/channels/${li.id}/import/scan`, {}, 200);
    expect(res).toMatchObject({ supported: false, found: [] });
    await json('POST', `/v1/channels/${threads.id}/import`, { scanId: 'imp_missing', include: [] }, 404);
    await json('POST', `/v1/channels/${threads.id}/import/scan`, { limit: 51 }, 400);
  });
});
