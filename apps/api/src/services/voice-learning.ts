import { MEDIA_RULES, postPartSchema, type BrandVoice, type MediaKind, type Platform } from '@harbor/core';
import { splitSentences, words, type DraftChange } from '@harbor/ai';
import type { Db } from '../db/client.ts';
import { COMPARABLE_WINDOW_DAYS, median, type Verdict } from './outcomes.ts';
import { PLATFORM_NAMES } from './voice-check.ts';

/**
 * The voice refresh's analysis. Deterministic, no model call: it compares the brand's published posts with a
 * verdict (last 90 days) on simple features of their opening part, and turns clear differences into proposed
 * Brand Memory changes, each with the posts behind it.
 *
 * - Lift of a feature = median(ratio of posts with it) / median(ratio of posts without it), where ratio is the
 *   post's outcome against the brand + platform median. It only counts with at least 3 posts on each side.
 * - Media features (has_image, carousel, video) only compare posts on platforms where media is optional.
 * - Lift ≥ 1.25 → a `do` rule; lift ≤ 0.8 → an `avoid` rule; skipped when an equivalent rule exists (the rule
 *   contains one of the feature's canonical phrases, case-insensitive).
 * - An existing rule that maps to a feature pointing the other way is proposed for removal.
 * - The best sentence of the top 1–2 outperforming posts is proposed as an excerpt (one when there are already 3+ rule
 *   changes, so a run stays reviewable).
 * - At most 6 changes: removals first, then new rules (strongest first), with room kept for one excerpt.
 */

export const DO_LIFT = 1.25;
export const AVOID_LIFT = 0.8;
export const MIN_POSTS_PER_SIDE = 3;
export const MAX_CHANGES = 6;
/** Evidence keeps this many posts per change. */
const EVIDENCE_POSTS = 12;

export interface FeatureDef {
  key: string;
  /** "Posts opening in the first person", the subject of a `why`. */
  label: string;
  /** Lower-case phrases that mark a rule as being about this feature. Rule wording always contains one. */
  phrases: string[];
  /** Plain wording, used when the model doesn't polish it. */
  doText: string;
  avoidText: string;
  /** `media`: the kinds of the first part's media items. */
  test(parts: string[], media: MediaKind[]): boolean;
  /**
   * Media features only compare posts on platforms where media is optional: every Instagram post has media, so it
   * says nothing there.
   */
  mediaOptionalOnly?: boolean;
}

const first = (parts: string[]) => (parts[0] ?? '').trim();
const firstSentence = (t: string) => t.split('\n')[0] ?? '';

export const FEATURES: FeatureDef[] = [
  {
    key: 'firstPerson', label: 'Posts opening in the first person', phrases: ['first person'],
    doText: 'Open in the first person.', avoidText: 'Opening in the first person.',
    test: (p) => /^(I\s|I['’]m\b|My\s)/.test(first(p)),
  },
  {
    key: 'numberOpen', label: 'Posts opening with a number', phrases: ['open with a number', 'opening with a number', 'opens with a number'],
    doText: 'Open with a number.', avoidText: 'Opening with a number.',
    test: (p) => /^[^\p{L}\p{N}]*\p{N}/u.test(first(p)),
  },
  {
    key: 'questionOpen', label: 'Posts opening with a question', phrases: ['open with a question', 'opening with a question', 'opens with a question'],
    doText: 'Open with a question.', avoidText: 'Opening with a question.',
    test: (p) => /^[^.!?]*\?/.test(firstSentence(first(p))),
  },
  {
    key: 'list', label: 'Posts with a list', phrases: ['a list', 'lists', 'bullet'],
    doText: 'Use a list.', avoidText: 'Bullet lists.',
    test: (p) => first(p).split('\n').some((l) => /^\s*(-|•|1\.)/.test(l)),
  },
  {
    key: 'linkFirst', label: 'Posts with a link in the first part', phrases: ['link in the first', 'links in the first'],
    doText: 'Put the link in the first part.', avoidText: 'Links in the first part.',
    test: (p) => /https?:\/\/\S+|www\.\S+/i.test(first(p)),
  },
  {
    key: 'hashtag', label: 'Posts with hashtags', phrases: ['hashtag'],
    doText: 'Add a hashtag.', avoidText: 'Hashtags.',
    test: (p) => /(^|\s)#[\p{L}\p{N}_]+/u.test(first(p)),
  },
  {
    key: 'emoji', label: 'Posts with emoji', phrases: ['emoji'],
    doText: 'Use an emoji.', avoidText: 'Emoji.',
    test: (p) => /\p{Extended_Pictographic}/u.test(first(p)),
  },
  {
    key: 'short', label: 'Short posts (under 120 characters)', phrases: ['under 120 characters', 'keep posts short', 'short posts'],
    doText: 'Keep posts short: under 120 characters.', avoidText: 'Short posts (under 120 characters).',
    test: (p) => [...first(p)].length < 120,
  },
  {
    key: 'long', label: 'Long posts (over 400 characters)', phrases: ['over 400 characters', 'long posts', 'go long'],
    doText: 'Go long: over 400 characters.', avoidText: 'Long posts (over 400 characters).',
    test: (p) => [...first(p)].length > 400,
  },
  {
    key: 'thread', label: 'Threads', phrases: ['thread'],
    doText: 'Turn bigger points into a thread.', avoidText: 'Threads.',
    test: (p) => p.length > 1,
  },
  {
    key: 'endsQuestion', label: 'Posts ending with a question', phrases: ['end with a question', 'ending with a question', 'ends with a question', 'ask the reader'],
    doText: 'End with a question.', avoidText: 'Ending with a question.',
    test: (p) => first(p).endsWith('?'),
  },
  {
    key: 'has_image', label: 'Posts with an image', phrases: ['an image', 'images', 'photo'], mediaOptionalOnly: true,
    doText: 'Add an image.', avoidText: 'Images on text posts.',
    test: (_p, m) => m.includes('image'),
  },
  {
    key: 'carousel', label: 'Carousels (more than one media item)', phrases: ['carousel'], mediaOptionalOnly: true,
    doText: 'Use a carousel.', avoidText: 'Carousels.',
    test: (_p, m) => m.length > 1,
  },
  {
    key: 'video', label: 'Posts with video', phrases: ['video'], mediaOptionalOnly: true,
    doText: 'Post video.', avoidText: 'Video posts.',
    test: (_p, m) => m.includes('video'),
  },
];

/** Platforms where a post can go out without media, so having media is a choice worth learning from. */
const mediaOptional = (platform: Platform) => !MEDIA_RULES[platform].required;

const featureOf = (key: string) => FEATURES.find((f) => f.key === key)!;

/** Whether a stored rule is about a feature. */
export const ruleMatches = (rule: string, feature: FeatureDef) => feature.phrases.some((p) => rule.toLowerCase().includes(p));

export interface LearningPost {
  id: string;
  platform: Platform;
  parts: string[];
  /** The kinds of the first part's media items. */
  media?: MediaKind[];
  ratio: number;
  verdict: Verdict;
  /** Its post_performance signal. */
  signalId?: string;
}

export interface FeatureLift {
  feature: string;
  label: string;
  lift: number;
  withCount: number;
  withoutCount: number;
  /** Post ids with the feature, best ratio first. */
  posts: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every feature with at least 3 posts on each side and a usable baseline. */
export function featureLifts(posts: LearningPost[]): FeatureLift[] {
  const out: FeatureLift[] = [];
  for (const f of FEATURES) {
    const pool = f.mediaOptionalOnly ? posts.filter((p) => mediaOptional(p.platform)) : posts;
    const yes = pool.filter((p) => f.test(p.parts, p.media ?? []));
    const no = pool.filter((p) => !f.test(p.parts, p.media ?? []));
    if (yes.length < MIN_POSTS_PER_SIDE || no.length < MIN_POSTS_PER_SIDE) continue;
    const base = median(no.map((p) => p.ratio));
    if (!(base > 0)) continue;
    out.push({
      feature: f.key,
      label: f.label,
      lift: round2(median(yes.map((p) => p.ratio)) / base),
      withCount: yes.length,
      withoutCount: no.length,
      posts: [...yes].sort((a, b) => b.ratio - a.ratio || a.id.localeCompare(b.id)).map((p) => p.id),
    });
  }
  return out;
}

export interface EvidencePost {
  id: string;
  text: string;
  platform: Platform;
  ratio?: number;
  verdict?: string;
}

/** A change the refresh proposes, with the posts and signals behind it. */
export type ProposedChange = DraftChange & { evidence: { posts: EvidencePost[]; signals: string[] } };

const preview = (t: string, max = 200) => {
  const flat = t.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

function evidenceFor(ids: string[], byId: Map<string, LearningPost>): ProposedChange['evidence'] {
  const posts = ids.slice(0, EVIDENCE_POSTS).map((id) => byId.get(id)!).filter(Boolean);
  return {
    posts: posts.map((p) => ({ id: p.id, text: preview(p.parts[0] ?? ''), platform: p.platform, ratio: p.ratio, verdict: p.verdict })),
    signals: posts.map((p) => p.signalId).filter((s): s is string => !!s),
  };
}

/** The sentence of a post that best shows the voice: the first one of 6+ words and 30–280 characters, else the opening. */
export function bestSentence(parts: string[]): string | undefined {
  const sentences = parts.flatMap((p) => splitSentences(p).map((s) => s.text));
  const good = sentences.find((s) => s.length >= 30 && s.length <= 280 && words(s).length >= 6);
  const text = good ?? sentences[0] ?? (parts[0] ?? '').trim();
  return text && text.length <= 2000 ? text : undefined;
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The changes a refresh proposes for this voice, from these posts (and their lifts). */
export function proposeChanges(voice: BrandVoice, posts: LearningPost[], lifts = featureLifts(posts)): ProposedChange[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const removals: ProposedChange[] = [];
  const adds: ProposedChange[] = [];
  const strongest = [...lifts].sort((a, b) => Math.abs(Math.log(b.lift)) - Math.abs(Math.log(a.lift)) || a.feature.localeCompare(b.feature));
  for (const l of strongest) {
    const dir = l.lift >= DO_LIFT ? 'do' : l.lift <= AVOID_LIFT ? 'avoid' : undefined;
    if (!dir) continue;
    const f = featureOf(l.feature);
    const other = dir === 'do' ? 'avoid' : 'do';
    const did = `${l.label} did ${l.lift}× the median (${l.withCount} vs ${l.withoutCount} posts)`;
    // Best posts first for a `do`, worst first for an `avoid`.
    const ids = dir === 'do' ? l.posts : [...l.posts].reverse();
    for (const rule of voice[other].filter((r) => ruleMatches(r, f))) {
      removals.push({ op: 'remove', target: `voice.${other}`, text: rule, why: `"${rule}" goes against the results: ${did.charAt(0).toLowerCase()}${did.slice(1)}.`, lift: l.lift, feature: f.key, evidence: evidenceFor(ids, byId) });
    }
    if (voice[dir].some((r) => ruleMatches(r, f))) continue;
    adds.push({ op: 'add', target: `voice.${dir}`, text: dir === 'do' ? f.doText : f.avoidText, why: `${did}.`, lift: l.lift, feature: f.key, evidence: evidenceFor(ids, byId) });
  }

  // Two excerpts when the rules say little, one when there are 3+ rule changes to review already.
  const rulesFound = removals.length + adds.length;
  const wantExcerpts = rulesFound >= 3 ? 1 : 2;
  const excerpts: ProposedChange[] = [];
  const winners = posts.filter((p) => p.verdict === 'outperformed').sort((a, b) => b.ratio - a.ratio || a.id.localeCompare(b.id));
  for (const p of winners) {
    if (excerpts.length >= wantExcerpts) break;
    const text = bestSentence(p.parts);
    if (!text || voice.excerpts.some((e) => sameText(e.text, text)) || excerpts.some((e) => sameText(e.text, text))) continue;
    excerpts.push({ op: 'add', target: 'voice.excerpts', text, why: `From ${/^[AEIOUX]/.test(PLATFORM_NAMES[p.platform]) ? 'an' : 'a'} ${PLATFORM_NAMES[p.platform]} post that did ${p.ratio}× the median.`, lift: p.ratio, evidence: evidenceFor([p.id], byId) });
  }

  const rules = [...removals, ...adds].slice(0, MAX_CHANGES - Math.min(excerpts.length, 1));
  return [...rules, ...excerpts].slice(0, MAX_CHANGES);
}

/** Do and avoid rules the lifts confirm (covered) or contradict, for the run's "rules" step. */
export function ruleCoverage(voice: BrandVoice, lifts: FeatureLift[]): { covered: string[]; contradicted: string[] } {
  const covered: string[] = [];
  const contradicted: string[] = [];
  for (const l of lifts) {
    const f = featureOf(l.feature);
    for (const r of voice.do.filter((x) => ruleMatches(x, f))) (l.lift >= DO_LIFT ? covered : l.lift <= AVOID_LIFT ? contradicted : []).push(r);
    for (const r of voice.avoid.filter((x) => ruleMatches(x, f))) (l.lift <= AVOID_LIFT ? covered : l.lift >= DO_LIFT ? contradicted : []).push(r);
  }
  return { covered: [...new Set(covered)], contradicted: [...new Set(contradicted)] };
}

/** The brand's published posts from the last 90 days with a verdict (not inconclusive), with their signals. */
export async function loadLearningPosts(db: Db, brandId: string): Promise<LearningPost[]> {
  const rows = await db.query<{ id: string; platform: Platform; parts: unknown; ratio: number; verdict: Verdict; signal_id: string | null }>(
    `SELECT p.id, ch.platform, d.parts, o.ratio, o.verdict,
       (SELECT s.id FROM signals s WHERE s.brand_id = p.brand_id AND s.kind = 'post_performance' AND s.source->>'postId' = p.id LIMIT 1) AS signal_id
     FROM posts p JOIN channels ch ON ch.id = p.channel_id JOIN outcomes o ON o.post_id = p.id LEFT JOIN drafts d ON d.id = p.draft_id
     WHERE p.brand_id = $1 AND p.status = 'published' AND p.published_at >= now() - make_interval(days => $2)
       AND o.verdict <> 'inconclusive' AND o.ratio > 0
     ORDER BY p.published_at, p.id`,
    [brandId, COMPARABLE_WINDOW_DAYS],
  );
  return rows.map((r) => {
    const parts = postPartSchema.array().catch([]).parse(r.parts ?? []);
    return {
      id: r.id,
      platform: r.platform,
      parts: parts.map((x) => x.text),
      media: (parts[0]?.media ?? []).map((m) => m.kind),
      ratio: round2(Number(r.ratio)),
      verdict: r.verdict,
      ...(r.signal_id ? { signalId: r.signal_id } : {}),
    };
  });
}
