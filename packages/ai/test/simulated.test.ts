import { describe, expect, it } from 'vitest';
import { HarborError, brandSchema, brandVoiceSchema } from '@harbor/core';
import { AnthropicModel, SimulatedModel, createModel } from '../src/index.ts';
import { EXAMPLES, RICH_MEMORY, makeBrand, signal } from './fixtures.ts';

const clock = () => new Date('2026-10-01T00:00:00Z');
const model = new SimulatedModel({ now: clock });
const brand = makeBrand(RICH_MEMORY);
const signals = [
  signal('sig_top', 'post_performance', 'X post at 2.4x median views', { ratio: 2.4, metric: 'views', platform: 'x', text: 'I run four businesses. Every Monday I felt behind.' }),
  signal('sig_low', 'post_performance', 'Threads post at 0.4x median views', { ratio: 0.4, metric: 'views', platform: 'threads', text: 'Shipped: Harbor publishes to four platforms.' }),
  signal('sig_pain', 'manual', 'Audience pain point: Context switching between brands (Indie hackers)'),
];

describe('SimulatedModel', () => {
  it('is deterministic and marks its output as simulated', async () => {
    const a = await model.learnVoice({ brandName: 'Harbor', examples: EXAMPLES });
    const b = await new SimulatedModel({ now: clock }).learnVoice({ brandName: 'Harbor', examples: EXAMPLES });
    expect(a).toEqual(b);
    expect(a.model).toBe('simulated-v1');
    expect(a.simulated).toBe(true);
    expect(a.usage.inputTokens).toBeGreaterThan(0);
    expect(a.usage.outputTokens).toBeGreaterThan(0);
    const i1 = await model.generateIdeas({ brand, signals, recentPosts: [], count: 5 });
    const i2 = await model.generateIdeas({ brand, signals, recentPosts: [], count: 5 });
    expect(i1).toEqual(i2);
  });

  it('learns a voice from the examples, with verbatim excerpts', async () => {
    const { result: voice } = await model.learnVoice({ brandName: 'Harbor', examples: EXAMPLES });
    expect(brandVoiceSchema.safeParse(voice).success).toBe(true);
    expect(voice.summary).toContain('first person');
    expect(voice.values.map((v) => v.name)).toEqual(expect.arrayContaining(['Specific', 'Personal']));
    expect(voice.excerpts.length).toBeGreaterThanOrEqual(3);
    expect(voice.excerpts.length).toBeLessThanOrEqual(5);
    for (const e of voice.excerpts) {
      expect(e.text.length).toBeLessThanOrEqual(400);
      expect(EXAMPLES.some((ex) => ex.includes(e.text))).toBe(true);
    }
    expect(voice.sources).toHaveLength(EXAMPLES.length);
    expect(voice.sources.every((s) => s.kind === 'example')).toBe(true);
    expect(voice.learnedBy).toBe('simulated-v1');
    expect(voice.learnedAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('puts detected hype words on the avoid and banned lists, and keeps existing rules', async () => {
    const hype = [...EXAMPLES, 'We leverage AI to unlock seamless growth for every team. It is a game-changer!'];
    const { result } = await model.learnVoice({
      brandName: 'Harbor', examples: hype,
      existing: brandVoiceSchema.parse({ do: ['Owner rule'], bannedWords: ['synergy'], values: [{ name: 'Kind', meaning: 'x' }] }),
    });
    expect(result.avoid.join(' ')).toMatch(/leverage.*unlock|unlock.*leverage/);
    expect(result.bannedWords).toEqual(expect.arrayContaining(['synergy', 'leverage', 'unlock', 'seamless']));
    expect(result.do).toContain('Owner rule');
    expect(result.values[0]!.name).toBe('Kind');
    expect(result.excerpts.some((e) => /leverage/.test(e.text))).toBe(false);
  });

  it('generates ideas that cite the signals they use', async () => {
    const { result } = await model.generateIdeas({ brand, signals, recentPosts: [], count: 6 });
    expect(result).toHaveLength(6);
    const ids = new Set(signals.map((s) => s.id));
    for (const idea of result) {
      expect(idea.title.length).toBeGreaterThan(0);
      expect(idea.basis.length).toBeGreaterThanOrEqual(1);
      for (const c of idea.basis) expect(ids.has(c.signalId)).toBe(true);
    }
    const cited = new Set(result.flatMap((i) => i.basis.map((b) => b.signalId)));
    expect(cited).toEqual(ids);
    expect(result.map((i) => i.title).join(' ')).toMatch(/context switching/i);
    expect(new Set(result.map((i) => i.title)).size).toBe(result.length);
  });

  it('drafts within maxLength, threads long X drafts and uses the CTA and style rules', async () => {
    const idea = {
      title: 'How I handle context switching between brands',
      angle: 'Most users hit the same wall: four brands, four calendars, and a Monday spent deciding instead of writing. I batch by brand, one per day, and keep a single queue for all of them. It cut my Monday planning from 90 minutes to 20, and I post more than before. Show the calendar.',
    };
    const x = (await model.draft({ brand, idea, platform: 'x', maxLength: 280 })).result;
    expect(x.length).toBeGreaterThan(1);
    for (const p of x) expect([...p.text].length).toBeLessThanOrEqual(280);
    expect(x.at(-1)!.text).toContain('Join the waitlist');
    expect(x.map((p) => p.text).join(' ')).toContain('customers');
    expect(x.map((p) => p.text).join(' ')).not.toMatch(/\busers\b/);

    const tiny = (await model.draft({ brand, idea, platform: 'threads', maxLength: 120 })).result;
    for (const p of tiny) expect([...p.text].length).toBeLessThanOrEqual(120);

    const li = (await model.draft({ brand, idea, platform: 'linkedin', maxLength: 3000 })).result;
    expect(li).toHaveLength(1);
    expect(li[0]!.text).toContain('https://harbor.example');
    const short = (await model.draft({ brand, idea, platform: 'linkedin', maxLength: 150 })).result;
    expect([...short[0]!.text].length).toBeLessThanOrEqual(150);
  });

  it('uses connected context in drafts, deterministically', async () => {
    const idea = { title: 'My content week before vs. after', angle: '' };
    const context = [
      { kind: 'post' as const, text: 'I run four businesses. Every Monday I felt behind.' },
      { kind: 'post' as const, text: 'A weaker post.' },
      { kind: 'note' as const, text: 'Hook: open with a real number' },
      { kind: 'signal' as const, text: 'X post at 2.4x median views' },
    ];
    const a = await model.draft({ brand, idea, platform: 'linkedin', maxLength: 3000, context });
    const b = await model.draft({ brand, idea, platform: 'linkedin', maxLength: 3000, context });
    expect(a).toEqual(b);
    const text = a.result[0]!.text;
    expect(text).toContain('[Note: Hook: open with a real number.]');
    expect(text).toContain('What worked last time: "I run four businesses."');
    expect(text).not.toContain('A weaker post');
    expect(text).not.toContain('Why now');
    const plain = (await model.draft({ brand, idea, platform: 'linkedin', maxLength: 3000 })).result[0]!.text;
    expect(plain).not.toContain('[Note:');
    expect(a.usage.inputTokens).toBeGreaterThan((await model.draft({ brand, idea, platform: 'linkedin', maxLength: 3000 })).usage.inputTokens);
    const signalOnly = (await model.draft({ brand, idea, platform: 'x', maxLength: 280, context: [context[3]!] })).result;
    expect(signalOnly.map((p) => p.text).join(' ')).toContain('Why now: X post at 2.4x median views.');
    for (const p of signalOnly) expect([...p.text].length).toBeLessThanOrEqual(280);
  });

  it('rewrites: 3 hook variations, otherwise 1', async () => {
    const text = EXAMPLES[0]!;
    const hooks = (await model.rewrite({ brand, text, instruction: 'hook_variations', platform: 'x' })).result;
    expect(hooks).toHaveLength(3);
    expect(new Set(hooks).size).toBe(3);
    const short = (await model.rewrite({ brand, text, instruction: 'shorter', platform: 'x' })).result;
    expect(short).toHaveLength(1);
    expect(short[0]!.length).toBeLessThan(text.length);
    expect((await model.rewrite({ brand, text: 'I think it really helps, and we saw a lot of signups.', instruction: 'punchier', platform: 'x' })).result[0]).not.toMatch(/I think|really/);
    expect((await model.rewrite({ brand, text: 'We saw a lot of signups recently.', instruction: 'more_specific', platform: 'x' })).result[0]).toContain('[number]');
  });
});

describe('Simulated ideas and drafts from dogfooding', () => {
  const multi = makeBrand({
    ...RICH_MEMORY,
    audiences: [
      { id: 'aud1', name: 'Indie hackers', painPoints: ['Context switching between brands'], goals: ['Getting paid users'] },
      { id: 'aud2', name: 'Self-hosters', painPoints: ['Setting up OAuth apps'], goals: ['Run it on their own server'] },
      { id: 'aud3', name: 'Claude/MCP users', painPoints: ['Wiring tools into Claude'], goals: ['More inbound leads'] },
    ],
  });

  it('draws on every audience, not only the first', async () => {
    const { result } = await model.generateIdeas({ brand: multi, signals, recentPosts: [], count: 12 });
    const text = result.map((i) => `${i.title} ${i.angle}`).join(' ');
    expect(text).toMatch(/context switching/i);
    expect(text).toMatch(/OAuth/);
    expect(text).toMatch(/Claude/);
  });

  it('writes goal checklists grammatically, whatever form the goal is in', async () => {
    const { result } = await model.generateIdeas({ brand: multi, signals, recentPosts: [], count: 20 });
    const titles = result.map((i) => i.title);
    expect(titles).toContain('A checklist for getting paid users');
    expect(titles).toContain('A checklist to run it on their own server');
    expect(titles).toContain('A checklist for more inbound leads');
    expect(titles.join(' ')).not.toMatch(/checklist to getting|^Proof:/m);
  });

  it("doesn't suggest ideas already open on the board (ignoring a date or format prefix)", async () => {
    const first = (await model.generateIdeas({ brand, signals, recentPosts: [], count: 3 })).result;
    const existingTitles = [`Oct 27 · ${first[0]!.title}`, `As a thread: ${first[1]!.title}`, first[2]!.title.toUpperCase()];
    const next = (await model.generateIdeas({ brand, signals, recentPosts: [], count: 3, existingTitles })).result;
    expect(next.length).toBeGreaterThan(0);
    const keys = new Set(first.map((i) => i.title.toLowerCase()));
    for (const i of next) expect(keys.has(i.title.replace(/^As an? [\w ]+: /, '').toLowerCase())).toBe(false);
  });

  it('keeps a topic lower-case mid-sentence unless it is a name', async () => {
    const person = brandSchema.parse({ ...makeBrand(), kind: 'person', memory: { topics: ['Building in public', 'X API costs', 'GitHub stars'] } });
    const titles = (await model.generateIdeas({ brand: person, signals, recentPosts: [], count: 20 })).result.map((i) => i.title);
    expect(titles).toEqual(expect.arrayContaining(['My take on building in public', 'My take on X API costs', 'My take on GitHub stars']));
  });

  it("doesn't copy the idea title (or its date) into the draft, or label the proof point", async () => {
    const idea = { title: 'Oct 27 · Week 1 recap', angle: 'Week one of building Harbor in public is done. We shipped three fixes from dogfooding. Share the star count.' };
    const text = (await model.draft({ brand, idea, platform: 'linkedin', maxLength: 3000 })).result[0]!.text;
    expect(text.startsWith('Week one of building Harbor in public is done.')).toBe(true);
    expect(text).not.toMatch(/Oct 27|Week 1 recap|Proof point:/);
    expect(text).toContain('Tracks every post at 1h, 6h, 24h, 72h and 7d.');
    expect(text).not.toMatch(/sounds familiar/);
    const bare = (await model.draft({ brand, idea: { title: 'Nov 3 · X API costs', angle: '' }, platform: 'x', maxLength: 280 })).result.map((p) => p.text).join(' ');
    expect(bare).toContain('[Open with your hook on: X API costs.]');
    expect(bare).not.toMatch(/Nov 3/);
  });
});

describe('createModel', () => {
  it('defaults to the simulated model and keeps the real one switched off', async () => {
    expect(createModel({}).name).toBe('simulated-v1');
    expect(createModel({ HARBOR_MODEL: 'simulated' }).simulated).toBe(true);
    const real = createModel({ HARBOR_MODEL: 'anthropic' });
    expect(real).toBeInstanceOf(AnthropicModel);
    const err = await real.draft({ brand, idea: { title: 't', angle: '' }, platform: 'x', maxLength: 280 }).catch((e) => e);
    expect(err).toBeInstanceOf(HarborError);
    expect(err.code).toBe('NOT_IMPLEMENTED');
    expect(() => createModel({ HARBOR_MODEL: 'gpt' })).toThrow();
  });
});

describe('Brand Memory that learns', () => {
  it('traces the Brand Memory a draft actually used', async () => {
    const res = await model.draft({ brand, idea: { title: 'Our users leverage synergy', angle: 'Our users leverage synergy!' }, platform: 'linkedin', maxLength: 3000 });
    expect(res.result[0]!.text).not.toMatch(/leverage|synergy|!/);
    expect(res.trace).toEqual(
      expect.arrayContaining([
        { kind: 'term', text: '"customers" instead of "users"' },
        { kind: 'banned', text: 'synergy' },
        { kind: 'avoid', text: 'Hype words: leverage, unlock.' },
        { kind: 'avoid', text: 'Exclamation marks.' },
        { kind: 'audience', text: 'Indie hackers' },
        { kind: 'product', text: 'Harbor' },
      ]),
    );
    const plain = await model.draft({ brand, idea: { title: 'A calm title', angle: '' }, platform: 'x', maxLength: 280 });
    expect(plain.trace!.some((t) => t.kind === 'banned' || t.kind === 'term')).toBe(false);
    const empty = await model.draft({ brand: makeBrand({}), idea: { title: 'A calm title', angle: '' }, platform: 'x', maxLength: 280 });
    expect(empty.trace).toEqual([]);
  });

  it('polishes voice changes from templates, one per change in order, keeping removals verbatim', async () => {
    const voice = brandVoiceSchema.parse({ do: ['Write as "I"'] });
    const changes = [
      { op: 'remove' as const, target: 'voice.avoid' as const, text: 'Opening with a number', why: 'It goes against the results', feature: 'numberOpen' },
      { op: 'add' as const, target: 'voice.do' as const, text: 'Open with a number.', why: 'Posts opening with a number did 1.6× the median (5 vs 7 posts)', lift: 1.6, feature: 'numberOpen' },
      { op: 'add' as const, target: 'voice.excerpts' as const, text: 'Two make money, one breaks even.', why: 'From a winner.' },
    ];
    const res = await model.refineVoiceChanges({ brandName: 'Harbor', voice, changes });
    expect(res.simulated).toBe(true);
    expect(res.result.map((c) => c.text)).toEqual(['Opening with a number', 'Open with a number ("3 things…", "$1,240…").', 'Two make money, one breaks even.']);
    expect(res.result[0]!.why).toBe('It goes against the results.');
    expect(res.result[1]).toMatchObject({ lift: 1.6, feature: 'numberOpen' });
    expect(await model.refineVoiceChanges({ brandName: 'Harbor', voice, changes })).toEqual(res);
    await expect(new AnthropicModel().refineVoiceChanges()).rejects.toBeInstanceOf(HarborError);
  });
});
