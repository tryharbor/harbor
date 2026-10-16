import type { Brand, BrandVoice, Platform, PostPart, Signal, VoiceValue } from '@harbor/core';
import {
  EMOJI_RE,
  EMOJI_RE_G,
  FILLERS,
  HEDGES,
  HYPE_WORDS,
  STOPWORDS,
  charLen,
  containsWord,
  ensureEnd,
  estimateTokens,
  hardWrap,
  lowerFirst,
  mean,
  pct,
  preview,
  quantile,
  rate,
  splitSentences,
  stripEnd,
  uniqueBy,
  upperFirst,
  wordCount,
  wordRe,
  words,
  type Sentence,
} from './text.ts';
import type {
  ContentModel,
  DraftInput,
  GenerateIdeasInput,
  IdeaSuggestion,
  LearnVoiceInput,
  ModelResult,
  RewriteInput,
} from './types.ts';

export const SIMULATED_MODEL_NAME = 'simulated-v1';

export interface SimulatedModelOptions {
  /** Clock for `learnedAt`; inject a fixed one for reproducible output. */
  now?: () => Date;
}

/**
 * A deterministic, offline stand-in for a real model. It never calls the network; every output is computed from
 * the inputs (the brand's memory, signals and the text given), so the same input always gives the same output.
 */
export class SimulatedModel implements ContentModel {
  readonly name = SIMULATED_MODEL_NAME;
  readonly simulated = true;
  private readonly now: () => Date;

  constructor(opts: SimulatedModelOptions = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  private wrap<T>(input: unknown, result: T): ModelResult<T> {
    return { result, usage: { inputTokens: estimateTokens(input), outputTokens: estimateTokens(result) }, model: this.name, simulated: true };
  }

  async learnVoice(input: LearnVoiceInput): Promise<ModelResult<BrandVoice>> {
    return this.wrap(input, learnVoice(input, this.now()));
  }

  async generateIdeas(input: GenerateIdeasInput): Promise<ModelResult<IdeaSuggestion[]>> {
    return this.wrap({ ...input, brand: input.brand.memory }, generateIdeas(input));
  }

  async draft(input: DraftInput): Promise<ModelResult<PostPart[]>> {
    return this.wrap({ ...input, brand: input.brand.memory }, draft(input));
  }

  async rewrite(input: RewriteInput): Promise<ModelResult<string[]>> {
    return this.wrap({ ...input, brand: input.brand.memory }, rewrite(input));
  }
}

// =====================================================================================================================
// Voice
// =====================================================================================================================

const FIRST_SINGULAR = /(?<![\p{L}])(I|I'm|I’m|I've|I’ve|I'd|I’d|I'll|I’ll|me|my|mine|myself)(?![\p{L}])/u;
const FIRST_PLURAL = /(?<![\p{L}])(we|we're|we’re|we've|we’ve|our|ours|us|ourselves)(?![\p{L}])/iu;
const SECOND_PERSON = /(?<![\p{L}])(you|your|you're|you’re|yours|yourself)(?![\p{L}])/iu;
const CONTRACTION = /[\p{L}]+['’](s|re|ve|d|ll|t|m)(?![\p{L}])/iu;
const SCENE_OPENERS = /^(every|last|yesterday|this morning|today|tonight|on (mon|tues|wednes|thurs|fri|satur|sun)day|when|at \d|in 20\d\d|three|two|\d+ (years|months|weeks|days) ago)/i;
const CANDOR_WORDS = ['mistake', 'mistakes', 'failed', 'wrong', 'learned', 'honest', 'revenue', 'cost', 'costs', 'lost', 'numbers', 'mrr', 'broke'];

export interface VoiceStats {
  sentences: Sentence[];
  avgWords: number;
  medianWords: number;
  p90Words: number;
  fragmentRate: number;
  questionRate: number;
  exclaimRate: number;
  firstSingularRate: number;
  firstPluralRate: number;
  secondPersonRate: number;
  numberRate: number;
  contractionRate: number;
  emojiRate: number;
  hashtagCount: number;
  hedgeRate: number;
  sceneOpenRate: number;
  linesPerExample: number;
  hype: string[];
  candor: number;
  topWords: { word: string; count: number }[];
}

export function voiceStats(examples: string[]): VoiceStats {
  const sentences = examples.flatMap((ex, i) => splitSentences(ex, i));
  const lens = sentences.map((s) => wordCount(s.text));
  const counts = new Map<string, number>();
  for (const ex of examples) {
    for (const w of words(ex)) {
      const lw = w.toLowerCase().replace(/['’]s$/, '');
      if (lw.length < 3 || STOPWORDS.has(lw) || /^\d/.test(lw)) continue;
      counts.set(lw, (counts.get(lw) ?? 0) + 1);
    }
  }
  const all = examples.join('\n');
  return {
    sentences,
    avgWords: mean(lens),
    medianWords: quantile(lens, 0.5),
    p90Words: quantile(lens, 0.9),
    fragmentRate: rate(sentences, (s) => wordCount(s.text) <= 4 && !s.text.endsWith('?')),
    questionRate: rate(sentences, (s) => s.text.endsWith('?')),
    exclaimRate: rate(sentences, (s) => s.text.includes('!')),
    firstSingularRate: rate(sentences, (s) => FIRST_SINGULAR.test(s.text)),
    firstPluralRate: rate(sentences, (s) => FIRST_PLURAL.test(s.text)),
    secondPersonRate: rate(sentences, (s) => SECOND_PERSON.test(s.text)),
    numberRate: rate(sentences, (s) => /\d/.test(s.text)),
    contractionRate: rate(sentences, (s) => CONTRACTION.test(s.text)),
    emojiRate: rate(sentences, (s) => EMOJI_RE.test(s.text)),
    hashtagCount: (all.match(/(^|\s)#[\p{L}\d_]+/gu) ?? []).length,
    hedgeRate: rate(sentences, (s) => HEDGES.some((h) => containsWord(s.text, h))),
    sceneOpenRate: rate(examples, (ex) => SCENE_OPENERS.test(ex.trim())),
    linesPerExample: mean(examples.map((ex) => ex.split(/\n+/).filter((l) => l.trim()).length)),
    hype: HYPE_WORDS.filter((w) => containsWord(all, w)),
    candor: CANDOR_WORDS.filter((w) => containsWord(all, w)).length,
    topWords: [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([word, count]) => ({ word, count })),
  };
}

const dedupeStrings = (xs: string[]) => uniqueBy(xs.filter((x) => x.trim()), (x) => x.trim().toLowerCase());

export function learnVoice(input: LearnVoiceInput, now: Date): BrandVoice {
  const { brandName, examples, existing } = input;
  const st = voiceStats(examples);
  const n = st.sentences.length;
  const avg = Math.round(st.avgWords);
  const singular = st.firstSingularRate >= 0.15 && st.firstSingularRate >= st.firstPluralRate;
  const plural = !singular && st.firstPluralRate >= 0.15;
  const you = st.secondPersonRate >= 0.15;
  const numbers = st.numberRate >= 0.15;
  const questions = st.questionRate >= 0.08;
  const calm = st.exclaimRate < 0.05 && st.hype.length === 0;
  const fragments = st.fragmentRate >= 0.12;
  const top = st.topWords.map((t) => t.word);

  // ---- summary ----
  const length = avg <= 10 ? 'short, punchy' : avg <= 17 ? 'medium-length' : 'long, explanatory';
  const summary: string[] = [
    `${brandName} writes in ${length} sentences (about ${avg} words on average${fragments ? `, with frequent fragments` : ''}).`,
  ];
  if (singular) summary.push(`It speaks in the first person ("I"), as one person sharing what they did${you ? ', and talks to the reader as "you"' : ''}.`);
  else if (plural) summary.push(`It speaks as "we", a team voice${you ? ' that addresses the reader as "you"' : ''}.`);
  else if (you) summary.push('It talks straight to the reader as "you".');
  else summary.push('It rarely talks about itself; the subject stays in front.');
  if (numbers) summary.push(`Claims come with concrete numbers (${pct(st.numberRate)} of sentences include one).`);
  if (questions) summary.push(`Questions pull the reader in (${pct(st.questionRate)} of sentences).`);
  if (calm) summary.push('The tone is calm: no hype words and almost no exclamation marks.');
  else if (st.exclaimRate >= 0.15) summary.push('The tone is energetic, with frequent exclamation marks.');
  if (top.length) summary.push(`Recurring words: ${top.slice(0, 5).join(', ')}.`);

  // ---- values ----
  const values: VoiceValue[] = [];
  if (numbers) values.push({ name: 'Specific', meaning: `Backs claims with real numbers and details (${Math.round(st.numberRate * n)} of ${n} sentences include a figure).` });
  if (singular) values.push({ name: 'Personal', meaning: 'Writes as a person with a point of view, not as a company.' });
  if (plural) values.push({ name: 'Team-first', meaning: 'Speaks for the team as "we" and credits the people doing the work.' });
  if (st.candor >= 2) values.push({ name: 'Transparent', meaning: 'Shares what went wrong, what things cost and what was learned.' });
  if (avg <= 12) values.push({ name: 'Concise', meaning: `Says it in as few words as possible; the average sentence is ${avg} words.` });
  if (you || questions) values.push({ name: 'Conversational', meaning: 'Talks with the reader, not at them.' });
  if (calm) values.push({ name: 'Grounded', meaning: 'Lets the facts carry the message; no hype.' });
  if (st.contractionRate >= 0.15) values.push({ name: 'Plain-spoken', meaning: 'Uses everyday words and contractions.' });
  if (values.length < 2) values.push({ name: 'Clear', meaning: 'Puts the main point first and keeps one idea per sentence.' });

  // ---- do / avoid ----
  const doRules: string[] = [`Keep sentences around ${avg} words${fragments ? '; fragments are fine' : ''}.`];
  if (st.sceneOpenRate >= 0.3) doRules.push('Open with a specific moment or scene, not a claim.');
  if (singular) doRules.push('Write in the first person ("I"), from your own experience.');
  if (plural) doRules.push('Write as "we" when speaking for the team.');
  if (numbers) doRules.push('Use real numbers instead of adjectives ("4 brands", not "many brands").');
  if (you) doRules.push('Address the reader as "you".');
  if (questions) doRules.push('Ask the reader one direct question.');
  if (st.linesPerExample >= 3) doRules.push('Put each idea on its own line.');
  if (top.length >= 3) doRules.push(`Come back to the core topics: ${top.slice(0, 3).join(', ')}.`);

  const avoid: string[] = [];
  if (st.hype.length) avoid.push(`Hype words: ${st.hype.join(', ')}.`);
  else if (calm) avoid.push('Hype words (leverage, seamless, unlock, game-changer).');
  if (st.exclaimRate < 0.03) avoid.push('Exclamation marks.');
  if (st.hashtagCount === 0) avoid.push('Hashtags.');
  if (st.emojiRate === 0) avoid.push('Emoji.');
  if (st.hedgeRate < 0.05) avoid.push('Hedging ("might", "maybe", "kind of").');
  if (avg <= 15) avoid.push(`Sentences longer than ${Math.max(20, Math.round(st.p90Words) + 5)} words.`);
  if (singular && st.firstPluralRate < 0.05) avoid.push('A corporate "we" voice.');

  // ---- excerpts: the most representative sentences, verbatim ----
  const scored = st.sentences
    .filter((s) => s.text.length >= 30 && s.text.length <= 400 && wordCount(s.text) >= 6)
    .map((s) => {
      const wc = wordCount(s.text);
      const target = Math.max(8, avg * 1.3);
      let score = -Math.abs(wc - target) / target;
      score += top.filter((w) => containsWord(s.text, w)).length * 0.4;
      if (singular && FIRST_SINGULAR.test(s.text)) score += 0.4;
      if (numbers && /\d/.test(s.text)) score += 0.4;
      if (questions && s.text.endsWith('?')) score += 0.3;
      if (s.index === 0) score += 0.3; // openers carry the voice
      if (st.hype.some((h) => containsWord(s.text, h))) score -= 2;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score || a.s.source - b.s.source || a.s.index - b.s.index);
  const want = Math.min(5, Math.max(3, Math.round(n / 6)));
  const picked: Sentence[] = [];
  const perSource = new Map<number, number>();
  for (const pass of [1, 2, Infinity]) {
    for (const { s } of scored) {
      if (picked.length >= want) break;
      if (picked.includes(s) || picked.some((p) => p.text === s.text)) continue;
      if ((perSource.get(s.source) ?? 0) >= pass) continue;
      picked.push(s);
      perSource.set(s.source, (perSource.get(s.source) ?? 0) + 1);
    }
  }
  if (picked.length === 0 && examples[0]) picked.push({ text: examples[0].trim().slice(0, 400), source: 0, index: 0 });
  const excerpts = picked.map((s) => ({ text: s.text, source: `Example ${s.source + 1}` }));

  const sources = examples.map((ex, i) => ({ kind: 'example' as const, label: `Example ${i + 1}: ${preview(ex, 60)}`, ref: `example:${i + 1}` }));

  const prior = existing;
  const valueNames = new Set((prior?.values ?? []).map((v) => v.name.toLowerCase()));
  return {
    summary: summary.join(' '),
    values: [...(prior?.values ?? []), ...values.filter((v) => !valueNames.has(v.name.toLowerCase()))].slice(0, 8),
    do: dedupeStrings([...doRules, ...(prior?.do ?? [])]),
    avoid: dedupeStrings([...avoid, ...(prior?.avoid ?? [])]),
    bannedWords: dedupeStrings([...(prior?.bannedWords ?? []), ...st.hype]),
    excerpts,
    sources,
    learnedAt: now.toISOString(),
    learnedBy: SIMULATED_MODEL_NAME,
  };
}

// =====================================================================================================================
// Ideas
// =====================================================================================================================

interface PerfData {
  ratio?: number;
  metric?: string;
  platform?: Platform;
  text?: string;
  value?: number;
  median?: number;
}

const perf = (s: Signal): PerfData => (s.data ?? {}) as PerfData;
const snippet = (text: string | undefined, max = 60) => preview(splitSentences(text ?? '')[0]?.text ?? text ?? '', max);
const fmtRatio = (r: number) => `${r >= 10 ? Math.round(r) : Math.round(r * 10) / 10}x`;
const PLATFORM_NAMES: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };

/** Speaks as "I" unless the voice says otherwise. */
const povOf = (brand: Brand): 'I' | 'we' => {
  const v = brand.memory.voice;
  const text = [v.summary, ...v.do, ...v.values.map((x) => x.name)].join(' ');
  if (/"we"|team voice|team-first/i.test(text) && !/"I"|first person|personal/i.test(text)) return 'we';
  return 'I';
};

export function generateIdeas(input: GenerateIdeasInput): IdeaSuggestion[] {
  const { brand, signals } = input;
  const count = Math.max(1, Math.min(20, Math.floor(input.count || 5)));
  const m = brand.memory;
  const pov = povOf(brand);
  const my = pov === 'I' ? 'my' : 'our';
  const performance = signals.filter((s) => s.kind === 'post_performance' && typeof perf(s).ratio === 'number');
  const ranked = [...performance].sort((a, b) => perf(b).ratio! - perf(a).ratio! || a.id.localeCompare(b.id));
  const winners = ranked.filter((s) => perf(s).ratio! >= 1.15);
  const losers = [...ranked].reverse().filter((s) => perf(s).ratio! <= 0.75);
  const manual = signals.filter((s) => s.kind === 'manual');
  const competitor = signals.filter((s) => s.kind === 'competitor_post' || s.kind === 'trend' || s.kind === 'comment');
  const audience = m.audiences[0];
  const product = m.products[0];
  const audienceName = audience ? lowerFirst(audience.name) : 'people like you';
  const bestPostText = input.recentPosts
    .filter((p) => p.metrics?.views !== undefined || p.metrics?.likes !== undefined)
    .sort((a, b) => (b.metrics?.views ?? b.metrics?.likes ?? 0) - (a.metrics?.views ?? a.metrics?.likes ?? 0))[0]?.text;

  /** The signal that best supports an idea about `topic`: a manual signal mentioning it, else the top performer. */
  const cite = (topic: string, fallbackNote: string): IdeaSuggestion['basis'] => {
    const t = topic.toLowerCase();
    const direct = manual.find((s) => s.summary.toLowerCase().includes(t)) ?? competitor.find((s) => s.summary.toLowerCase().includes(t));
    if (direct) return [{ signalId: direct.id, note: preview(direct.summary, 120) }];
    const best = winners[0] ?? ranked[0] ?? manual[0] ?? signals[0];
    return best ? [{ signalId: best.id, note: fallbackNote }] : [];
  };
  const perfNote = (s: Signal) => {
    const d = perf(s);
    return `${PLATFORM_NAMES[d.platform ?? 'x'] ?? 'Post'} post at ${fmtRatio(d.ratio!)} the brand median ${d.metric ?? 'views'}`;
  };

  const buckets: IdeaSuggestion[][] = [[], [], [], [], [], []];

  // 1. Double down on what worked.
  for (const s of winners.slice(0, 3)) {
    const d = perf(s);
    const topic = snippet(d.text);
    buckets[0]!.push({
      title: `Go one level deeper on "${topic}"`,
      angle: `"${topic}" reached ${fmtRatio(d.ratio!)} the usual ${d.metric ?? 'views'}. Follow it up while the topic is warm: take the one detail people reacted to and turn it into a step-by-step for ${audienceName}.`,
      basis: [{ signalId: s.id, note: perfNote(s) }],
    });
  }
  if (winners[0]) {
    const s = winners[0];
    buckets[0]!.push({
      title: `The template behind "${snippet(perf(s).text, 50)}"`,
      angle: `Show the structure of ${my} best recent post (hook, proof, ask) so ${audienceName} can reuse it. Publish the template and one filled-in example.`,
      basis: [{ signalId: s.id, note: perfNote(s) }],
    });
  }

  // 2. Audience pain points.
  for (const a of m.audiences) {
    for (const p of a.painPoints.slice(0, 3)) {
      const pain = stripEnd(p);
      buckets[1]!.push({
        title: pov === 'I' ? `How I handle ${lowerFirst(pain)}` : `How we handle ${lowerFirst(pain)}`,
        angle: `Most ${lowerFirst(a.name)} hit the same wall: ${lowerFirst(pain)}. Name it in the first line, show the exact workaround ${pov === 'I' ? 'I use' : 'we use'} with one real example, and end with ${product ? `how ${product.name} takes care of it` : 'one thing to try this week'}.`,
        basis: cite(pain, `Pain point of ${a.name}`),
      });
      buckets[5]!.push({
        title: `The ${lowerFirst(pain)} advice ${pov === 'I' ? "I'd" : "we'd"} ignore`,
        angle: `A contrarian take for ${lowerFirst(a.name)}: the common advice about ${lowerFirst(pain)}, why it doesn't hold up, and what to do instead.`,
        basis: cite(pain, `Pain point of ${a.name}`),
      });
    }
    for (const g of a.goals.slice(0, 2)) {
      const goal = stripEnd(g);
      buckets[3]!.push({
        title: `A checklist to ${lowerFirst(goal).replace(/^to /, '')}`,
        angle: `${upperFirst(a.name)} want to ${lowerFirst(goal).replace(/^to /, '')}. Give them a short checklist, ${my} own numbers next to each step, and the one step most people skip.`,
        basis: cite(goal, `Goal of ${a.name}`),
      });
    }
  }

  // 3. Product proof.
  for (const pr of m.products) {
    for (const proof of pr.proofPoints.slice(0, 2)) {
      buckets[2]!.push({
        title: `Proof: ${stripEnd(proof)}`,
        angle: `Show, don't claim: walk through what's behind "${stripEnd(proof)}" for ${audienceName}, with the before and after.${pr.cta ? ` Close with: ${stripEnd(pr.cta)}.` : ''}`,
        basis: cite(pr.name, `Supports ${pr.name}`),
      });
    }
    if (pr.proofPoints.length === 0 && pr.summary) {
      buckets[2]!.push({
        title: `What ${pr.name} actually does in a week`,
        angle: `${stripEnd(pr.summary)}. Show one real week of using it, day by day, instead of a feature list.${pr.cta ? ` Close with: ${stripEnd(pr.cta)}.` : ''}`,
        basis: cite(pr.name, `Explains ${pr.name}`),
      });
    }
  }

  // 4. Fix what underperformed.
  for (const s of losers.slice(0, 2)) {
    const d = perf(s);
    buckets[4]!.push({
      title: `Second try: "${snippet(d.text, 50)}"`,
      angle: `This landed at ${fmtRatio(d.ratio!)} the usual ${d.metric ?? 'views'}. The topic may be fine; post the same point with a sharper first line (a number or a scene) and a single ask.`,
      basis: [{ signalId: s.id, note: perfNote(s) }],
    });
  }

  // 5. Competitors, trends, notes.
  for (const s of competitor.slice(0, 2)) {
    buckets[3]!.push({
      title: `${pov === 'I' ? 'My' : 'Our'} take: ${preview(s.summary, 70)}`,
      angle: `Others are talking about this. Add what only ${pov === 'I' ? 'you' : 'your team'} can: a specific example from ${brand.name} and a clear opinion.`,
      basis: [{ signalId: s.id, note: preview(s.summary, 120) }],
    });
  }
  for (const k of m.knowledge.slice(0, 2)) {
    buckets[5]!.push({
      title: `From ${my} notes: ${stripEnd(k.title)}`,
      angle: `${k.body ? `${preview(k.body, 200)} ` : ''}Turn this note into a post for ${audienceName}: one takeaway, one example, one question.`,
      basis: cite(k.title, `From the brand's knowledge: ${k.title}`),
    });
  }

  // 6. Fallback when the brand has little memory yet.
  if (bestPostText && !winners.length) {
    buckets[0]!.push({
      title: `Expand on "${snippet(bestPostText, 50)}"`,
      angle: `${upperFirst(my)} strongest recent post so far. Take its main claim and back it with one number and one story.`,
      basis: cite(snippet(bestPostText), 'Best recent post'),
    });
  }
  buckets[5]!.push({
    title: `What ${my} week building ${brand.name} looked like`,
    angle: `A plain build-in-public update: what shipped, what broke, one number, and what's next. Easy to write and it shows the work.`,
    basis: cite(brand.name, 'Build-in-public update'),
  });

  // Round-robin across buckets for variety, then dedupe.
  const ordered: IdeaSuggestion[] = [];
  for (let i = 0; buckets.some((b) => b.length > i); i++) for (const b of buckets) if (b[i]) ordered.push(b[i]!);
  let ideas = uniqueBy(ordered, (i) => i.title.toLowerCase()).filter((i) => i.basis.length > 0 || signals.length === 0);

  // Not enough? Offer the strongest ideas again in another format.
  const formats = ['As a thread', 'As a carousel', 'As a short video script', 'As a poll'];
  const base = [...ideas];
  for (let f = 0; ideas.length < count && base.length && f < formats.length; f++) {
    for (const idea of base) {
      if (ideas.length >= count) break;
      ideas.push({ ...idea, title: `${formats[f]}: ${idea.title}`, angle: `${idea.angle} Format: ${lowerFirst(formats[f]!)}.` });
    }
  }
  ideas = ideas.slice(0, count).map((i) => ({ ...i, title: preview(i.title, 300), angle: preview(i.angle, 4000) }));
  return ideas;
}

// =====================================================================================================================
// Drafting
// =====================================================================================================================

/** Apply the brand's style rules and banned words to generated text. */
export function applyStyle(brand: Brand, text: string): string {
  const m = brand.memory;
  let out = text;
  for (const t of m.styleRules.terms) {
    out = out.replace(wordRe(t.insteadOf), (hit) => (/^[A-Z]/.test(hit) ? upperFirst(t.use) : t.use));
  }
  const banned = dedupeStrings([...m.voice.bannedWords, ...hypeWordsIn(m.voice.avoid)]);
  for (const w of banned) out = out.replace(wordRe(w), '').replace(/ {2,}/g, ' ').replace(/ ([,.;:!?])/g, '$1');
  const avoid = [...m.voice.avoid, ...m.styleRules.formatting].join(' ').toLowerCase();
  if (/exclamation/.test(avoid)) out = out.replace(/!+/g, '.');
  if (/hashtag/.test(avoid)) out = out.replace(/(^|\s)#[\p{L}\d_]+/gu, '$1').replace(/ {2,}/g, ' ');
  if (/emoji/.test(avoid)) out = out.replace(EMOJI_RE_G, '').replace(/ {2,}/g, ' ');
  return out
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

/** Hype words named inside avoid rules (e.g. "Hype words: leverage, unlock."). */
const hypeWordsIn = (rules: string[]) => HYPE_WORDS.filter((w) => rules.some((r) => containsWord(r, w)));

const isThreadPlatform = (p: Platform) => p === 'x' || p === 'threads';

/** Pack paragraphs into parts of at most `max` characters, numbering them "n/N" when there's more than one. */
export function packThread(paragraphs: string[], max: number): string[] {
  const reserve = 6; // " 12/12"
  const limit = Math.max(20, max - reserve);
  const units = paragraphs.flatMap((p) =>
    charLen(p) <= limit ? [p] : splitSentences(p).flatMap((s) => (charLen(s.text) <= limit ? [s.text] : hardWrap(s.text, limit))),
  );
  const parts: string[] = [];
  let cur = '';
  for (const u of units) {
    const next = cur ? `${cur}\n\n${u}` : u;
    if (charLen(next) <= limit) cur = next;
    else {
      if (cur) parts.push(cur);
      cur = u;
    }
  }
  if (cur) parts.push(cur);
  if (parts.length === 1) return charLen(parts[0]!) <= max ? parts : hardWrap(parts[0]!, max);
  return parts.map((p, i) => `${p} ${i + 1}/${parts.length}`);
}

/** Fit paragraphs into one part of at most `max` characters, dropping whole sentences from the middle first. */
export function fitSingle(paragraphs: string[], max: number, keepLast = true): string {
  const join = (ps: string[]) => ps.filter(Boolean).join('\n\n');
  let ps = [...paragraphs];
  while (charLen(join(ps)) > max && ps.length > 2) ps.splice(keepLast ? ps.length - 2 : ps.length - 1, 1);
  let text = join(ps);
  if (charLen(text) > max) text = hardWrap(text, max - 1)[0]! + '…';
  return text;
}

const IMPERATIVES = new Set(
  'add ask close end follow give go publish post put show take tell turn walk write share name pick test explain list open start try use describe'.split(' '),
);
const isInstruction = (s: string) => IMPERATIVES.has((words(s)[0] ?? '').toLowerCase()) || /^format:/i.test(s);

export function draft(input: DraftInput): PostPart[] {
  const { brand, idea, platform, maxLength } = input;
  const m = brand.memory;
  const pov = povOf(brand);
  const product = m.products[0];
  const audience = m.audiences[0];

  const hook = ensureEnd(stripEnd(idea.title).replace(/^"(.*)"$/, '$1'));
  // The angle mixes statements (usable as copy) with instructions to the writer ("Show the workaround…").
  // Statements go into the draft; the first instruction becomes a bracketed note where the owner adds the specifics.
  const angleSentences = splitSentences(idea.angle).map((s) => s.text);
  const statements = angleSentences.filter((s) => !isInstruction(s));
  const instruction = angleSentences.find(isInstruction);
  const paragraphs: string[] = [hook];
  paragraphs.push(...statements.slice(0, 3).map(ensureEnd));
  if (instruction) paragraphs.push(`[${stripEnd(instruction)}.]`);
  if (audience?.painPoints[0] && !idea.angle.toLowerCase().includes(audience.painPoints[0].toLowerCase())) {
    paragraphs.push(`If ${lowerFirst(stripEnd(audience.painPoints[0]))} sounds familiar, this one's for you.`);
  }
  const proof = product?.proofPoints[0];
  if (proof) paragraphs.push(`Proof point: ${stripEnd(proof)}.`);
  if (product?.cta || product?.url) {
    const cta = product.cta ? stripEnd(product.cta) : `More on ${product.name}`;
    if (platform === 'instagram') paragraphs.push(`${cta} (link in bio).`);
    else paragraphs.push(product.url ? `${cta}: ${product.url}` : `${cta}.`);
  } else if (m.voice.do.some((d) => /question/i.test(d))) {
    paragraphs.push(pov === 'I' ? 'How do you handle this?' : 'How does your team handle this?');
  }

  const styled = paragraphs.map((p) => applyStyle(brand, p)).filter(Boolean);
  const max = Math.max(20, maxLength);
  const total = charLen(styled.join('\n\n'));
  if (isThreadPlatform(platform) && total > max) return packThread(styled, max).map((text) => ({ text, media: [] }));
  return [{ text: fitSingle(styled, max), media: [] }];
}

// =====================================================================================================================
// Rewriting
// =====================================================================================================================

const removeWords = (text: string, list: string[]) =>
  list.reduce((t, w) => t.replace(wordRe(w), ''), text).replace(/ {2,}/g, ' ').replace(/ ([,.;:!?])/g, '$1').replace(/^\s*,\s*/, '');

const tidy = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function shorter(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((p) => removeWords(p, FILLERS).trim()).filter(Boolean);
  const sentences = paragraphs.flatMap((p, pi) => splitSentences(p).map((s) => ({ ...s, pi })));
  if (sentences.length <= 2) {
    // Drop trailing clauses after commas until noticeably shorter.
    const s = removeWords(text, FILLERS);
    const clauses = s.split(/,\s+/);
    const cut = clauses.length > 1 ? ensureEnd(clauses.slice(0, Math.max(1, Math.ceil(clauses.length / 2))).join(', ')) : s;
    return tidy(charLen(cut) < charLen(text) ? cut : preview(s, Math.max(10, Math.floor(charLen(s) * 0.7))));
  }
  const target = Math.floor(charLen(text) * 0.6);
  const keep = new Set([0, sentences.length - 1]);
  const byLength = sentences.map((s, i) => ({ i, wc: wordCount(s.text) })).filter((x) => !keep.has(x.i)).sort((a, b) => a.wc - b.wc || a.i - b.i);
  let len = charLen(sentences.filter((_, i) => keep.has(i)).map((s) => s.text).join(' '));
  for (const { i } of byLength) {
    const add = charLen(sentences[i]!.text) + 1;
    if (len + add > target) continue;
    keep.add(i);
    len += add;
  }
  const out: string[][] = [];
  sentences.forEach((s, i) => {
    if (!keep.has(i)) return;
    (out[s.pi] ??= []).push(s.text);
  });
  return tidy(out.filter(Boolean).map((p) => p.join(' ')).join('\n\n'));
}

function punchier(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((p) => {
    let t = removeWords(p, [...HEDGES, ...FILLERS]);
    t = t.replace(/,\s+(and|but|so)\s+/gi, (_, w: string) => `. ${upperFirst(w.toLowerCase())} `);
    t = t.replace(/;\s+/g, '. ');
    t = t.replace(/!+/g, '.');
    return splitSentences(t)
      .map((s) => ensureEnd(upperFirst(s.text.trim())))
      .join(' ');
  });
  // A hook of 12 words or fewer.
  const first = splitSentences(paragraphs[0] ?? '')[0]?.text;
  if (first && wordCount(first) > 12) {
    const clause = first.split(/,\s+|\s+(?:because|which|that|so)\s+/)[0]!;
    const hook = wordCount(clause) <= 12 ? ensureEnd(clause) : ensureEnd(words(first).slice(0, 10).join(' '));
    paragraphs[0] = `${hook}\n\n${paragraphs[0]!.slice(first.length).trim() || first}`.trim();
  }
  return tidy(paragraphs.join('\n\n'));
}

const VAGUE: [RegExp, string][] = [
  [/\ba lot of\b/gi, '[number]'],
  [/\blots of\b/gi, '[number]'],
  [/\bmany\b/gi, '[N]'],
  [/\bseveral\b/gi, '[N]'],
  [/\bsome\b/gi, '[N]'],
  [/\brecently\b/gi, '[when exactly]'],
  [/\bsoon\b/gi, '[date]'],
  [/\bsignificantly\b/gi, 'by [X%]'],
  [/\bbetter\b/gi, 'better ([how much])'],
  [/\bfaster\b/gi, 'faster ([from → to])'],
];

function moreSpecific(brand: Brand, text: string): string {
  let out = text;
  for (const [re, rep] of VAGUE) out = out.replace(re, rep);
  const m = brand.memory;
  const withProof = m.products.find((p) => p.proofPoints.length);
  const extra = withProof ? `${withProof.name}: ${stripEnd(withProof.proofPoints[0]!)}` : undefined;
  if (extra && !out.toLowerCase().includes(withProof!.proofPoints[0]!.toLowerCase())) {
    out = `${out.trim()}\n\nProof point: ${extra}.`;
  } else if (!/\d/.test(out)) {
    out = `${out.trim()}\n\n[Add one real number here: users, hours saved, revenue, days.]`;
  }
  return tidy(out);
}

function hookVariations(brand: Brand, text: string): string[] {
  const sentences = splitSentences(text);
  const first = sentences[0]?.text ?? text.trim();
  const rest = text.trim().slice(text.trim().indexOf(first) + first.length).trim();
  const core = stripEnd(first);
  const pain = brand.memory.audiences.flatMap((a) => a.painPoints)[0];
  const n = Math.max(2, Math.min(9, sentences.length - 1));
  const join = (hook: string) => tidy(rest ? `${hook}\n\n${rest}` : hook);
  const hooks = [
    `Unpopular opinion: ${lowerFirst(core)}.`,
    pain ? `If ${lowerFirst(stripEnd(pain))} is eating your week, read this.` : `What would change if ${lowerFirst(core)}?`,
    `${n} lines on something I learned the hard way: ${lowerFirst(core)}.`,
  ];
  return uniqueBy(hooks.map(join), (h) => h);
}

export function rewrite(input: RewriteInput): string[] {
  const { brand, text, instruction } = input;
  const style = (t: string) => applyStyle(brand, t);
  switch (instruction) {
    case 'shorter':
      return [style(shorter(text))];
    case 'punchier':
      return [style(punchier(text))];
    case 'more_specific':
      return [style(moreSpecific(brand, text))];
    case 'hook_variations':
      return hookVariations(brand, text).map(style);
  }
}
