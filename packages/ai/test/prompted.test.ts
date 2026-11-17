import { describe, expect, it } from 'vitest';
import { HarborError } from '@harbor/core';
import { ModelRouter, PromptedModel, SimulatedModel, memoryBrief, simulatedSiteCopy, type LlmProvider, type LlmRequest } from '../src/index.ts';
import { EXAMPLES, RICH_MEMORY, makeBrand, signal } from './fixtures.ts';

/** A provider that records each request and answers with the next canned JSON. */
function fake(...answers: unknown[]): LlmProvider & { calls: { model: string; req: LlmRequest }[] } {
  const calls: { model: string; req: LlmRequest }[] = [];
  return {
    provider: 'openai',
    calls,
    async complete(model, req) {
      calls.push({ model, req });
      const a = answers.shift();
      return { text: typeof a === 'string' ? a : JSON.stringify(a), usage: { inputTokens: 100, outputTokens: 50 }, model };
    },
  };
}

const brand = makeBrand({ ...RICH_MEMORY, business: { oneLiner: 'Content strategy for builders.', differentiators: ['Measures every post at 5 checkpoints'], location: 'Chicago' } });

describe('memoryBrief', () => {
  it('puts the facts, voice and rules in, and leaves empty parts out', () => {
    const b = memoryBrief(brand);
    expect(b).toContain('What it does: Content strategy for builders.');
    expect(b).toContain('Facts customers pick it for (may be stated as true):\n- Measures every post at 5 checkpoints');
    expect(b).toContain('say "customers", not "users"');
    expect(b).toContain('Banned words: synergy');
    expect(b).not.toContain('Pricing:');
    expect(memoryBrief(makeBrand({}))).toBe('Name: Harbor');
  });
});

describe('PromptedModel', () => {
  it('drafts with the brief and the facts rule, and fits parts to the limit', async () => {
    const llm = fake({ parts: [{ text: 'x'.repeat(400) }] });
    const m = new PromptedModel(llm, 'gpt-6-astra');
    const r = await m.draft({ brand, idea: { title: 'Why we measure', angle: 'One honest detail.' }, platform: 'x', maxLength: 280 });
    expect(r).toMatchObject({ model: 'gpt-6-astra', simulated: false, usage: { inputTokens: 100, outputTokens: 50 } });
    expect(r.result).toEqual([{ text: 'x'.repeat(280), media: [] }]);
    const { req } = llm.calls[0]!;
    expect(req.system).toContain('Never invent credentials');
    expect(req.system).toContain('Measures every post at 5 checkpoints');
    expect(req.prompt).toContain('Idea: Why we measure');
    expect(req.schemaName).toBe('post_draft');
  });

  it('drops ideas that cite signals that do not exist', async () => {
    const llm = fake({ ideas: [
      { title: 'Real', angle: 'a', basis: [{ signalId: 'sig_1', note: 'n' }] },
      { title: 'Made up', angle: 'b', basis: [{ signalId: 'sig_nope', note: 'n' }] },
    ] });
    const r = await new PromptedModel(llm, 'm').generateIdeas({ brand, signals: [signal('sig_1', 'manual', 'A pain point')], recentPosts: [], count: 5 });
    expect(r.result.map((i) => i.title)).toEqual(['Real']);
  });

  it('keeps only excerpts that appear word for word, and the owner’s banned words', async () => {
    const real = 'Shipped the snapshot poller today.';
    const llm = fake({ summary: 'Plain.', values: [{ name: 'Candid', meaning: '' }], do: ['Use numbers'], avoid: ['Hype'], excerpts: [real, 'A line nobody wrote.'] });
    const existing = (await new SimulatedModel().learnVoice({ brandName: 'Harbor', examples: EXAMPLES })).result;
    const r = await new PromptedModel(llm, 'm').learnVoice({ brandName: 'Harbor', examples: EXAMPLES, existing: { ...existing, bannedWords: ['synergy'] } });
    expect(r.result.excerpts).toEqual([{ text: real }]);
    expect(r.result.bannedWords).toEqual(['synergy']);
    expect(r.result.learnedBy).toBe('m');
  });

  it('keeps a removal’s exact text when polishing voice changes', async () => {
    const llm = fake({ texts: ['Open with a number.', 'changed'] });
    const changes = [
      { op: 'add' as const, target: 'voice.do' as const, text: 'number open', why: 'w' },
      { op: 'remove' as const, target: 'voice.avoid' as const, text: 'Exclamation marks.', why: 'w' },
    ];
    const r = await new PromptedModel(llm, 'm').refineVoiceChanges({ brandName: 'H', voice: brand.memory.voice, changes });
    expect(r.result.map((c) => c.text)).toEqual(['Open with a number.', 'Exclamation marks.']);
  });

  it('turns a bad answer into a clear error', async () => {
    const m = new PromptedModel(fake('not json', { parts: [] }), 'm');
    const input = { brand, idea: { title: 't', angle: '' }, platform: 'x' as const, maxLength: 280 };
    const e1 = await m.draft(input).catch((e) => e);
    expect(e1).toBeInstanceOf(HarborError);
    expect(e1.code).toBe('UPSTREAM_ERROR');
    expect((await m.draft(input).catch((e) => e)).message).toMatch(/wrong shape/);
  });

  it('writes website copy and requires the top of the page', async () => {
    const llm = fake(
      { title: 'Harbor', description: 'd', sections: [{ kind: 'hero', headline: 'Post less, grow more', sub: 's', cta: 'Start' }, { kind: 'offers', title: 'Plans', items: [{ name: 'Builder', summary: 'six brands' }] }] },
      { title: 'Harbor', description: 'd', sections: [{ kind: 'about', title: 'About', body: 'b' }] },
    );
    const m = new PromptedModel(llm, 'm');
    const r = await m.siteCopy({ brand });
    expect(r.result.sections).toEqual([{ kind: 'hero', headline: 'Post less, grow more', sub: 's', cta: 'Start' }, { kind: 'offers', title: 'Plans', items: [{ name: 'Builder', summary: 'six brands' }] }]);
    await expect(m.siteCopy({ brand })).rejects.toThrow(/top of the page/);
  });
});

describe('simulatedSiteCopy', () => {
  it('builds the page from Business Memory without inventing anything', () => {
    const b = makeBrand({ ...RICH_MEMORY, business: { type: 'service', oneLiner: 'Plumbing for Chicago homes.', location: 'Chicago', differentiators: ['Licensed and insured in Illinois'] }, branding: { tagline: 'On time, every time.' } });
    const s = simulatedSiteCopy({ brand: b });
    expect(s.sections[0]).toEqual({ kind: 'hero', headline: 'On time, every time.', sub: 'Plumbing for Chicago homes. Serving Chicago.', cta: 'Join the waitlist' });
    expect(s.sections.find((x) => x.kind === 'proof')).toMatchObject({ points: ['Licensed and insured in Illinois.', 'Tracks every post at 1h, 6h, 24h, 72h and 7d.'] });
    expect(s.sections.at(-1)!.kind).toBe('contact');
    expect(s.title).toBe('Harbor: Plumbing for Chicago homes');
  });
});

describe('ModelRouter', () => {
  it('switches models without a restart and never shows the key', async () => {
    const llm = fake({ parts: [{ text: 'hi' }] });
    const router = new ModelRouter(new SimulatedModel(), { provider: 'simulated' }, () => llm);
    expect(router.active).toEqual({ provider: 'simulated', model: 'simulated-v1' });
    router.configure({ provider: 'google', apiKey: 'k' });
    expect(router.active).toEqual({ provider: 'google', model: 'gemini-4-argon' });
    expect(JSON.stringify(router.active)).not.toContain('k"');
    const r = await router.draft({ brand, idea: { title: 't', angle: '' }, platform: 'threads', maxLength: 500 });
    expect(r.result[0]!.text).toBe('hi');
    expect(() => router.configure({ provider: 'anthropic' })).toThrow(/API key/);
    router.configure({ provider: 'simulated' });
    expect(router.simulated).toBe(true);
  });
});
