import { HarborError, z, type Brand, type BrandVoice, type PostPart } from '@harbor/core';
import type { LlmProvider, LlmRequest } from './providers.ts';
import type { SiteCopy, SiteCopyInput } from './site.ts';
import type {
  ContentModel, DigestInput, DigestResult, DraftChange, DraftInput, GenerateIdeasInput, IdeaSuggestion, LearnVoiceInput, ModelResult,
  RefineVoiceChangesInput, RewriteInput,
} from './types.ts';

/**
 * Harbor's AI features on a real model, any provider. Each feature is one structured request: a system prompt with the
 * business's memory, the task, and a JSON schema the answer must match. Answers are checked before Harbor uses them
 * (ids must exist, excerpts must be verbatim, lengths must fit), and a bad answer is an error, never a silent guess.
 */

const RULES = [
  'Write as the business, in its voice. Plain, specific and warm; no hype, no buzzwords.',
  'Only state facts that appear in the business brief. Never invent credentials, licences, awards, prices, numbers, customers or quotes.',
  'Follow every do, avoid, banned word, preferred term and formatting rule in the brief.',
  'Answer with JSON only, matching the schema exactly.',
].join('\n');

/** Business Memory as a compact brief for prompts. Empty sections are left out. */
export function memoryBrief(brand: Brand): string {
  const m = brand.memory;
  const b = m.business;
  const v = m.voice;
  const lines: string[] = [`Name: ${brand.name.replace(/\s*\(demo\)$/, '')}`];
  const add = (label: string, value: string | undefined) => value?.trim() && lines.push(`${label}: ${value.trim()}`);
  const list = (label: string, xs: string[]) => xs.length && lines.push(`${label}:\n${xs.map((x) => `- ${x}`).join('\n')}`);
  add('What it does', b.oneLiner);
  add('Kind of business', b.type);
  add('Stage', b.stage);
  add('Where', b.location);
  add('Pricing', b.pricing);
  add('Website', b.website);
  list('Facts customers pick it for (may be stated as true)', b.differentiators);
  list('Goals this quarter', b.goals);
  for (const p of m.products) list(`Product: ${p.name}${p.summary ? ` (${p.summary})` : ''}${p.cta ? `, call to action "${p.cta}"` : ''}`, p.proofPoints);
  for (const a of m.audiences) list(`Audience: ${a.name}${a.description ? ` (${a.description})` : ''}`, [...a.painPoints.map((x) => `pain: ${x}`), ...a.goals.map((x) => `goal: ${x}`)]);
  add('Voice', v.summary);
  list('Voice values', v.values.map((x) => (x.meaning ? `${x.name}: ${x.meaning}` : x.name)));
  list('Do', v.do);
  list('Avoid', v.avoid);
  add('Banned words', v.bannedWords.join(', '));
  list('Lines that sound exactly right', v.excerpts.map((e) => e.text));
  list('Preferred terms', m.styleRules.terms.map((t) => `say "${t.use}", not "${t.insteadOf}"`));
  list('Formatting rules', m.styleRules.formatting);
  list('Knowledge', m.knowledge.map((k) => `${k.title}${k.body ? `: ${k.body.slice(0, 600)}` : ''}`));
  add('Tagline', m.branding.tagline);
  add('Visual style', m.branding.visualStyle);
  return lines.join('\n');
}

const str = { type: 'string' } as const;
const strArr = { type: 'array', items: str } as const;
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });

export class PromptedModel implements ContentModel {
  readonly simulated = false;
  readonly name: string;

  constructor(readonly llm: LlmProvider, readonly model: string, private readonly now: () => Date = () => new Date()) {
    this.name = model;
  }

  /** One structured request; the answer is parsed and checked with `schema`, else it's an error. */
  private async ask<T>(task: string, req: Omit<LlmRequest, 'system' | 'prompt'> & { brand?: Brand; prompt: string }, check: z.ZodType<T>): Promise<ModelResult<T>> {
    const system = [`You are Harbor, the strategist and writer for a small business. Task: ${task}.`, RULES, req.brand ? `\nBusiness brief:\n${memoryBrief(req.brand)}` : ''].join('\n');
    const res = await this.llm.complete(this.model, { system, prompt: req.prompt, schema: req.schema, schemaName: req.schemaName, maxTokens: req.maxTokens, effort: req.effort });
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      throw new HarborError('UPSTREAM_ERROR', `${this.model} answered with something that isn't JSON. Try again.`);
    }
    const out = check.safeParse(parsed);
    if (!out.success) throw new HarborError('UPSTREAM_ERROR', `${this.model} answered in the wrong shape (${out.error.issues[0]?.path.join('.') || 'root'}). Try again.`);
    return { result: out.data, usage: res.usage, model: res.model, simulated: false };
  }

  async draft(input: DraftInput): Promise<ModelResult<PostPart[]>> {
    const context = (input.context ?? []).map((c) => `- (${c.kind}) ${c.text}`).join('\n');
    const r = await this.ask(
      `write one ${input.platform} post`,
      {
        brand: input.brand,
        schemaName: 'post_draft',
        schema: obj({ parts: { type: 'array', items: obj({ text: str }), minItems: 1, maxItems: 10 } }),
        maxTokens: 4000,
        prompt: [
          `Platform: ${input.platform}. Each part is at most ${input.maxLength} characters. Use more than one part only for a thread.`,
          `Idea: ${input.idea.title}`,
          input.idea.angle ? `Angle: ${input.idea.angle}` : '',
          context ? `Extra material, most relevant first:\n${context}` : '',
          'If a specific detail is needed that the brief does not give, write a short bracketed note for the owner, like [add the price].',
        ].filter(Boolean).join('\n'),
      },
      z.object({ parts: z.array(z.object({ text: z.string().min(1) })).min(1).max(10) }),
    );
    const parts = r.result.parts.map((p) => ({ text: p.text.trim().slice(0, input.maxLength), media: [] }));
    return { ...r, result: parts, trace: [] };
  }

  async rewrite(input: RewriteInput): Promise<ModelResult<string[]>> {
    const n = input.instruction === 'hook_variations' ? 3 : 1;
    const how = { shorter: 'Make it shorter. Keep the meaning and every fact.', punchier: 'Make it punchier: stronger verbs, tighter sentences, a sharper first line.', more_specific: 'Make it more specific, using only details from the brief.', hook_variations: 'Write three different opening lines (hooks), each followed by the rest of the post unchanged.' }[input.instruction];
    const r = await this.ask(
      `rewrite a ${input.platform} post`,
      { brand: input.brand, schemaName: 'rewrites', schema: obj({ versions: { type: 'array', items: str, minItems: n, maxItems: n } }), maxTokens: 4000, prompt: `${how}\nReturn ${n} version${n > 1 ? 's' : ''}.\n\nPost:\n${input.text}` },
      z.object({ versions: z.array(z.string().min(1)).min(1) }),
    );
    return { ...r, result: r.result.versions.slice(0, n) };
  }

  async generateIdeas(input: GenerateIdeasInput): Promise<ModelResult<IdeaSuggestion[]>> {
    const signals = input.signals.slice(0, 40);
    const r = await this.ask(
      `suggest ${input.count} post ideas`,
      {
        brand: input.brand,
        schemaName: 'ideas',
        schema: obj({ ideas: { type: 'array', items: obj({ title: str, angle: str, basis: { type: 'array', items: obj({ signalId: str, note: str }), minItems: 1 } }) } }),
        maxTokens: 6000,
        prompt: [
          `Suggest ${input.count} distinct post ideas. Each idea cites at least one signal by its id, with a short note on why.`,
          `Signals:\n${signals.map((s) => `- ${s.id} (${s.kind}): ${s.summary}`).join('\n')}`,
          input.recentPosts.length ? `Recent posts:\n${input.recentPosts.slice(0, 15).map((p) => `- (${p.platform}) ${p.text.slice(0, 200)}`).join('\n')}` : '',
          input.existingTitles?.length ? `Already on the board (don't repeat):\n${input.existingTitles.map((t) => `- ${t}`).join('\n')}` : '',
          input.guidance?.length ? `Direction, most important first:\n${input.guidance.map((g) => `- ${g}`).join('\n')}` : '',
          input.speaksFor?.length ? `Brands this person speaks for:\n${input.speaksFor.map((b) => `- ${b.name}${b.summary ? `: ${b.summary}` : ''}`).join('\n')}` : '',
        ].filter(Boolean).join('\n\n'),
      },
      z.object({ ideas: z.array(z.object({ title: z.string().min(1), angle: z.string(), basis: z.array(z.object({ signalId: z.string(), note: z.string() })) })) }),
    );
    const known = new Set(signals.map((s) => s.id));
    // An idea must rest on a real signal; ones that cite only made-up ids are dropped.
    const ideas = r.result.ideas
      .map((i) => ({ ...i, basis: i.basis.filter((b) => known.has(b.signalId)) }))
      .filter((i) => i.basis.length)
      .slice(0, input.count);
    return { ...r, result: ideas };
  }

  async learnVoice(input: LearnVoiceInput): Promise<ModelResult<BrandVoice>> {
    const r = await this.ask(
      `describe the writing voice of ${input.brandName} from its own posts`,
      {
        schemaName: 'voice',
        schema: obj({ summary: str, values: { type: 'array', items: obj({ name: str, meaning: str }) }, do: strArr, avoid: strArr, excerpts: strArr }),
        maxTokens: 6000,
        effort: 'high',
        prompt: [
          'From these examples, describe the voice specifically enough that someone new could write like it.',
          'summary: personality and style in 2 to 4 sentences. values: 3 to 5. do and avoid: 3 to 6 concrete rules each.',
          'excerpts: 3 to 5 short sentences copied exactly, character for character, from the examples.',
          `Examples:\n${input.examples.map((e, i) => `--- example ${i + 1}\n${e}`).join('\n')}`,
        ].join('\n'),
      },
      z.object({ summary: z.string().min(1), values: z.array(z.object({ name: z.string().min(1), meaning: z.string() })), do: z.array(z.string()), avoid: z.array(z.string()), excerpts: z.array(z.string()) }),
    );
    const all = input.examples.join('\n');
    const existing = input.existing;
    const voice: BrandVoice = {
      summary: r.result.summary,
      values: r.result.values.slice(0, 6),
      do: r.result.do,
      avoid: r.result.avoid,
      // Owner-curated banned words are kept.
      bannedWords: existing?.bannedWords ?? [],
      // Only lines that really appear in the examples count as excerpts.
      excerpts: r.result.excerpts.filter((e) => e.trim() && all.includes(e.trim())).map((text) => ({ text: text.trim() })),
      sources: input.examples.map((_, i) => ({ kind: 'example' as const, label: `Example ${i + 1}` })),
      learnedAt: this.now().toISOString(),
      learnedBy: r.model,
      evidence: existing?.evidence ?? [],
    };
    return { ...r, result: voice };
  }

  async digest(input: DigestInput): Promise<ModelResult<DigestResult>> {
    const finding = obj({ title: str, detail: str, posts: strArr, signalIds: strArr, confidence: { type: 'number' } });
    const fz = z.object({ title: z.string(), detail: z.string(), posts: z.array(z.string()), signalIds: z.array(z.string()), confidence: z.number() });
    const posts = input.posts.slice(-120).map((p) => ({ id: p.id, platform: p.platform, hook: p.parts[0]?.slice(0, 160), inPeriod: p.inPeriod, weekday: p.weekday, hour: p.hour, outcome: p.outcome, signalId: p.signalId }));
    const r = await this.ask(
      `write the weekly digest for ${input.brandName}`,
      {
        schemaName: 'digest',
        schema: obj({ headline: str, wins: { type: 'array', items: finding }, misses: { type: 'array', items: finding }, patterns: { type: 'array', items: finding }, recommendations: { type: 'array', items: finding } }),
        maxTokens: 8000,
        effort: 'high',
        prompt: [
          `Period ${input.period.from} to ${input.period.to}. Stats: ${JSON.stringify(input.stats)}.`,
          'Every finding cites the post ids (and their signal ids) it rests on. Use only these numbers; confidence is 0 to 1.',
          `Posts:\n${JSON.stringify(posts)}`,
          `Best times: ${JSON.stringify(input.bestTimes)}`,
        ].join('\n\n'),
      },
      z.object({ headline: z.string().min(1), wins: z.array(fz), misses: z.array(fz), patterns: z.array(fz), recommendations: z.array(fz) }),
    );
    const ids = new Set(input.posts.map((p) => p.id));
    const sigs = new Set(input.posts.map((p) => p.signalId).filter(Boolean));
    const clean = (fs: z.infer<typeof fz>[]) => fs.map((f) => ({ ...f, posts: f.posts.filter((p) => ids.has(p)), signalIds: f.signalIds.filter((s) => sigs.has(s)), confidence: Math.max(0, Math.min(1, f.confidence)) }));
    return { ...r, result: { headline: r.result.headline, wins: clean(r.result.wins), misses: clean(r.result.misses), patterns: clean(r.result.patterns), recommendations: clean(r.result.recommendations) } };
  }

  async refineVoiceChanges(input: RefineVoiceChangesInput): Promise<ModelResult<DraftChange[]>> {
    if (!input.changes.length) return { result: [], usage: { inputTokens: 0, outputTokens: 0 }, model: this.model, simulated: false };
    const r = await this.ask(
      `polish the wording of proposed voice rules for ${input.brandName}`,
      {
        schemaName: 'rules',
        schema: obj({ texts: strArr }),
        maxTokens: 3000,
        prompt: `Rewrite each rule as a short, clear instruction to a writer. Same number, same order, same meaning.\n${input.changes.map((c, i) => `${i + 1}. (${c.op} ${c.target}) ${c.text}`).join('\n')}`,
      },
      z.object({ texts: z.array(z.string()) }),
    );
    // Removals must keep the stored rule's exact text; a missing or empty rewrite keeps the original.
    const result = input.changes.map((c, i) => (c.op === 'remove' ? c : { ...c, text: r.result.texts[i]?.trim() || c.text }));
    return { ...r, result };
  }

  async siteCopy(input: SiteCopyInput): Promise<ModelResult<SiteCopy>> {
    const section = {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['hero', 'offers', 'proof', 'about', 'contact'] },
        headline: str, sub: str, cta: str, title: str, body: str, points: strArr,
        items: { type: 'array', items: obj({ name: str, summary: str, price: str }, ['name', 'summary']) },
      },
      required: ['kind'],
      additionalProperties: false,
    };
    const r = await this.ask(
      'write the words for the business’s one-page website',
      {
        brand: input.brand,
        schemaName: 'site_copy',
        schema: obj({ title: str, description: str, sections: { type: 'array', items: section } }),
        maxTokens: 6000,
        effort: 'high',
        prompt: [
          'Write a one-page site, sections in this order: hero (headline under 9 words, sub of one or two sentences, cta of 2 or 3 words);',
          'offers (title, items with name, summary and price only when the brief gives one); proof (title, 2 to 4 points from the brief’s facts);',
          'about (title, body of 2 to 4 sentences); contact (title, body of one sentence). Leave out offers or proof when the brief has nothing for them.',
          'title: the browser tab title. description: a search description under 155 characters.',
        ].join('\n'),
      },
      z.object({
        title: z.string().min(1),
        description: z.string(),
        sections: z.array(z.object({ kind: z.enum(['hero', 'offers', 'proof', 'about', 'contact']), headline: z.string().optional(), sub: z.string().optional(), cta: z.string().optional(), title: z.string().optional(), body: z.string().optional(), points: z.array(z.string()).optional(), items: z.array(z.object({ name: z.string(), summary: z.string(), price: z.string().optional() })).optional() })),
      }),
    );
    const sections = r.result.sections.map((s): SiteCopy['sections'][number] => {
      switch (s.kind) {
        case 'hero':
          return { kind: 'hero', headline: s.headline ?? '', sub: s.sub ?? '', cta: s.cta ?? 'Get in touch' };
        case 'offers':
          return { kind: 'offers', title: s.title ?? 'What we offer', items: (s.items ?? []).map((i) => ({ name: i.name, summary: i.summary, ...(i.price ? { price: i.price } : {}) })) };
        case 'proof':
          return { kind: 'proof', title: s.title ?? 'Why us', points: s.points ?? [] };
        case 'about':
          return { kind: 'about', title: s.title ?? 'About', body: s.body ?? '' };
        case 'contact':
          return { kind: 'contact', title: s.title ?? 'Get in touch', body: s.body ?? '' };
      }
    });
    if (!sections.some((s) => s.kind === 'hero')) throw new HarborError('UPSTREAM_ERROR', `${this.model} left out the top of the page. Try again.`);
    return { ...r, result: { title: r.result.title, description: r.result.description.slice(0, 160), sections } };
  }
}
