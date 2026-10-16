import { describe, expect, it } from 'vitest';
import { HarborError, brandVoiceSchema } from '@harbor/core';
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
    const idea = { title: 'How I handle context switching between brands', angle: 'Most users hit the same wall. I batch by brand, one per day. It cut my Monday planning from 90 minutes to 20. Show the calendar.' };
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
