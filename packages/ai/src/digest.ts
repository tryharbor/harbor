import type { Platform } from '@harbor/core';
import { preview } from './text.ts';
import type { DigestFinding, DigestInput, DigestPost, DigestResult } from './types.ts';

/**
 * The simulated model's weekly digest. Deterministic and computed only from the input: wins and misses are the
 * period's outcomes, patterns compare the brand's posts by trait (format, length, hook, publish hour, platform),
 * and recommendations join the strongest patterns with the brand's best posting slots. Every finding lists the
 * posts it is about and their post_performance signals.
 */

export type HourBand = 'morning' | 'midday' | 'evening' | 'night';
export const hourBand = (h: number): HourBand => (h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 16 ? 'midday' : h >= 16 && h < 22 ? 'evening' : 'night');

export interface PostTraits {
  thread: boolean;
  media: boolean;
  numberHook: boolean;
  questionHook: boolean;
  firstPerson: boolean;
  length: 'short' | 'medium' | 'long';
  band: HourBand;
}

const firstSentence = (text: string) => text.trim().split(/(?<=[.!?])\s+|\n/)[0]?.trim() ?? '';

export function postTraits(p: Pick<DigestPost, 'parts' | 'hasMedia' | 'hour'>): PostTraits {
  const hook = (p.parts[0] ?? '').trim();
  const len = [...hook].length;
  return {
    thread: p.parts.length > 1,
    media: p.hasMedia,
    numberHook: /^[^\p{L}\p{N}]*\p{N}/u.test(hook),
    questionHook: firstSentence(hook).endsWith('?'),
    firstPerson: /^[^\p{L}\p{N}]*I(?![\p{L}])/u.test(hook),
    length: len < 100 ? 'short' : len < 220 ? 'medium' : 'long',
    band: hourBand(p.hour),
  };
}

// ---- Formatting ----

const PLATFORM_NAMES: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const x = (r: number) => `${Math.round(r * 10) / 10}×`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const slot = (weekday: number, hour: number) => `${DAYS[weekday]} ${hour}:00`;
const snippet = (p: DigestPost) => preview(p.parts[0] ?? '', 60);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listing = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

const signalsOf = (posts: DigestPost[]) => [...new Set(posts.map((p) => p.signalId).filter((s): s is string => !!s))];
const finding = (title: string, detail: string, posts: DigestPost[], confidence: number): DigestFinding => ({
  title,
  detail,
  posts: posts.map((p) => p.id),
  signalIds: signalsOf(posts),
  confidence: round2(clamp(confidence, 0.05, 0.95)),
});

// ---- Features (one trait value against the rest) ----

interface Feature {
  dimension: 'format' | 'media' | 'hook' | 'length' | 'hour';
  id: string;
  test: (t: PostTraits) => boolean;
  /** Plural noun phrase: "threads". */
  label: string;
  /** What it is compared with: "single posts". */
  contrast: string;
  /** Imperative for recommendations: "Post threads". */
  advice: string;
  /** "it was a thread": used to explain why a post did well. */
  trait: string;
  /** Formats only exist on some platforms: compare only where both sides occur. */
  withinPlatforms: boolean;
}

const BAND_HOURS: Record<HourBand, string> = { morning: '5–11h', midday: '11–16h', evening: '16–22h', night: '22–5h' };
const FEATURES: Feature[] = [
  { dimension: 'format', id: 'thread', test: (t) => t.thread, label: 'threads', contrast: 'single posts', advice: 'Post threads', trait: 'it was a thread', withinPlatforms: true },
  { dimension: 'media', id: 'media', test: (t) => t.media, label: 'posts with media', contrast: 'text-only posts', advice: 'Add an image or video', trait: 'it had media', withinPlatforms: true },
  { dimension: 'hook', id: 'number', test: (t) => t.numberHook, label: 'posts that open with a number', contrast: 'other openings', advice: 'Open with a number', trait: 'it opened with a number', withinPlatforms: false },
  { dimension: 'hook', id: 'question', test: (t) => t.questionHook, label: 'posts that open with a question', contrast: 'other openings', advice: 'Open with a question', trait: 'it opened with a question', withinPlatforms: false },
  { dimension: 'hook', id: 'first_person', test: (t) => t.firstPerson, label: 'first-person openings ("I …")', contrast: 'other openings', advice: 'Open in the first person ("I …")', trait: 'it opened in the first person', withinPlatforms: false },
  { dimension: 'length', id: 'short', test: (t) => t.length === 'short', label: 'short posts (under 100 characters)', contrast: 'longer posts', advice: 'Keep the opening under 100 characters', trait: 'it was short', withinPlatforms: false },
  { dimension: 'length', id: 'medium', test: (t) => t.length === 'medium', label: 'medium-length posts (100–220 characters)', contrast: 'shorter or longer posts', advice: 'Aim for 100–220 characters', trait: 'it was medium length', withinPlatforms: false },
  { dimension: 'length', id: 'long', test: (t) => t.length === 'long', label: 'long posts (220+ characters)', contrast: 'shorter posts', advice: 'Write longer posts (220+ characters)', trait: 'it was long', withinPlatforms: false },
  ...(['morning', 'midday', 'evening', 'night'] as const).map(
    (band): Feature => ({
      dimension: 'hour', id: band, test: (t) => t.band === band, label: `${band} posts (${BAND_HOURS[band]})`, contrast: 'other times of day',
      advice: band === 'midday' ? 'Post around midday' : `Post in the ${band}`, trait: `it went out in the ${band}`, withinPlatforms: false,
    }),
  ),
];

interface Pattern {
  feature: Feature;
  group: DigestPost[];
  rest: DigestPost[];
  medGroup: number;
  medRest: number;
  lift: number;
  strength: number;
  platform?: Platform;
}

const LIFT = 1.2;
const MIN_GROUP = 3;
const ratioOf = (p: DigestPost) => p.outcome!.ratio;
/** Posts with a usable ratio against their platform median. */
const rated = (posts: DigestPost[]) => posts.filter((p) => p.outcome && p.outcome.ratio > 0 && p.outcome.comparablePosts >= 2);

/** The platform most of these posts are on (≥ 75%). */
function dominantPlatform(posts: DigestPost[]): Platform | undefined {
  const counts = new Map<Platform, number>();
  for (const p of posts) counts.set(p.platform, (counts.get(p.platform) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return top && top[1] / posts.length >= 0.75 ? top[0] : undefined;
}

function findPatterns(posts: DigestPost[]): Pattern[] {
  const pool = rated(posts);
  const traits = new Map(pool.map((p) => [p.id, postTraits(p)]));
  const has = (f: Feature, p: DigestPost) => f.test(traits.get(p.id)!);
  const found: Pattern[] = [];
  const consider = (feature: Feature, eligible: DigestPost[], platform?: Platform) => {
    const group = eligible.filter((p) => has(feature, p));
    const rest = eligible.filter((p) => !has(feature, p));
    if (group.length < MIN_GROUP || rest.length < MIN_GROUP) return;
    const medGroup = median(group.map(ratioOf));
    const medRest = median(rest.map(ratioOf));
    if (!(medRest > 0) || !(medGroup > 0)) return;
    const lift = medGroup / medRest;
    if (lift < LIFT && lift > 1 / LIFT) return;
    const strength = Math.abs(Math.log(lift)) * Math.sqrt(Math.min(group.length, rest.length));
    found.push({ feature, group, rest, medGroup, medRest, lift, strength, platform: platform ?? dominantPlatform(group) });
  };
  const platforms = [...new Set(pool.map((p) => p.platform))].sort();
  for (const feature of FEATURES) {
    // Formats only exist on some platforms, so they are never pooled across platforms that lack one side.
    if (!feature.withinPlatforms) consider(feature, pool);
    // Every trait is also compared within each platform: effects such as threads or publish hour are platform-specific.
    for (const platform of platforms) consider(feature, pool.filter((p) => p.platform === platform), platform);
  }
  // The strongest per dimension (and one positive per hook type is enough).
  const best = new Map<string, Pattern>();
  const signOf = new Map<string, boolean>();
  for (const p of found.sort((a, b) => b.strength - a.strength || a.feature.id.localeCompare(b.feature.id))) {
    // A trait that beat the median somewhere and trailed it elsewhere: keep only the stronger reading.
    const up = p.lift > 1;
    if (signOf.has(p.feature.id) && signOf.get(p.feature.id) !== up) continue;
    signOf.set(p.feature.id, up);
    const key = `${p.feature.dimension}:${up ? '+' : '-'}`;
    if (!best.has(key)) best.set(key, p);
  }
  return [...best.values()].sort((a, b) => b.strength - a.strength || a.feature.id.localeCompare(b.feature.id));
}

const patternConfidence = (p: Pattern) => 0.25 + 0.12 * Math.sqrt(Math.min(p.group.length, p.rest.length)) + 0.25 * Math.min(1, Math.abs(Math.log(p.lift)));
const on = (platform?: Platform) => (platform ? ` on ${PLATFORM_NAMES[platform]}` : '');
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const byRatioDesc = (a: DigestPost, b: DigestPost) => ratioOf(b) - ratioOf(a) || a.id.localeCompare(b.id);
const newestFirst = (a: DigestPost, b: DigestPost) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id);

function patternFinding(p: Pattern): DigestFinding {
  const up = p.lift > 1;
  const title = `${upper(p.feature.label)} ${up ? 'beat' : 'trailed'} ${p.feature.contrast}${on(p.platform)}`;
  const examples = [...p.group].sort(byRatioDesc);
  const lead = up ? examples[0]! : examples.at(-1)!;
  const detail =
    `Your ${p.group.length} ${p.feature.label} did a median ${x(p.medGroup)} your platform median, against ${x(p.medRest)} for ${p.rest.length} ${p.feature.contrast}. ` +
    `${up ? 'Best' : 'Weakest'}: "${snippet(lead)}" (${x(ratioOf(lead))}).`;
  return finding(title, detail, (up ? examples : [...examples].reverse()).slice(0, 5), patternConfidence(p));
}

function platformFinding(posts: DigestPost[]): DigestFinding | undefined {
  const withViews = posts.filter((p) => p.views24h !== undefined);
  const groups = [...new Set(withViews.map((p) => p.platform))]
    .map((platform) => {
      const list = withViews.filter((p) => p.platform === platform);
      return { platform, list, med: median(list.map((p) => p.views24h!)) };
    })
    .filter((g) => g.list.length >= MIN_GROUP && g.med > 0)
    .sort((a, b) => b.med - a.med || a.platform.localeCompare(b.platform));
  if (groups.length < 2) return undefined;
  const hi = groups[0]!;
  const lo = groups.at(-1)!;
  const lift = hi.med / lo.med;
  if (lift < 1.3) return undefined;
  const top = [...hi.list].sort((a, b) => b.views24h! - a.views24h! || a.id.localeCompare(b.id)).slice(0, 5);
  return finding(
    `${PLATFORM_NAMES[hi.platform]} reaches ${x(lift)} more people than ${PLATFORM_NAMES[lo.platform]}`,
    `Median ${fmt(hi.med)} views at 24h on ${PLATFORM_NAMES[hi.platform]} (${plural(hi.list.length, 'post')}) against ${fmt(lo.med)} on ${PLATFORM_NAMES[lo.platform]} (${plural(lo.list.length, 'post')}).`,
    top,
    0.3 + 0.1 * Math.sqrt(Math.min(hi.list.length, lo.list.length)) + 0.2 * Math.min(1, Math.log(lift)),
  );
}

/** Why a post did well: its traits that beat the median across posts, or that are rare for the brand. */
function whyItWorked(post: DigestPost, patterns: Pattern[], posts: DigestPost[]): string {
  const t = postTraits(post);
  const matched = patterns.filter((p) => p.lift > 1 && p.feature.test(t) && (!p.feature.withinPlatforms || p.group.some((g) => g.platform === post.platform)));
  const traits = matched.map((p) => p.feature.trait);
  if (!traits.length) {
    const peers = posts.filter((p) => p.platform === post.platform && p.id !== post.id);
    for (const f of FEATURES) {
      if (!f.test(t) || f.dimension === 'length') continue;
      const share = peers.length ? peers.filter((p) => f.test(postTraits(p))).length / peers.length : 0;
      if (share < 0.35) traits.push(f.trait);
    }
  }
  const when = `it went out ${DAYS[post.weekday]} at ${post.hour}:00 (${t.band})`;
  if (!traits.some((s) => s.startsWith('it went out'))) traits.push(when);
  const lifts = matched.map((p) => `${p.feature.label} ${x(p.medGroup)}`);
  return `What set it apart: ${listing(traits.map((s, i) => (i === 0 ? s : s.replace(/^it /, ''))))}.${lifts.length ? ` Across your recent posts, ${listing(lifts)} the median.` : ''}`;
}

function whatItLacked(post: DigestPost, patterns: Pattern[]): string {
  const t = postTraits(post);
  const missing = patterns.filter(
    (p) => p.lift > 1 && !p.feature.test(t) && (!p.feature.withinPlatforms || p.group.some((g) => g.platform === post.platform)),
  );
  const had = patterns.filter((p) => p.lift < 1 && p.feature.test(t));
  const out: string[] = [];
  if (missing.length) out.push(`It had none of what has been working: ${listing(missing.map((p) => `${p.feature.label} (${x(p.medGroup)})`))}.`);
  if (had.length) out.push(`${upper(listing(had.map((p) => p.feature.label)))} have trailed your median (${listing(had.map((p) => x(p.medGroup)))}).`);
  return out.join(' ') || `It went out ${DAYS[post.weekday]} at ${post.hour}:00; nothing in its format stands out, so compare its hook with your best posts.`;
}

// ---- Best times ----

type BestTimes = DigestInput['bestTimes'][number];

/** "weekday mornings", "evenings", "weekend middays". */
function slotPhrase(bt: BestTimes): string {
  const top = bt.top.slice(0, 5);
  if (!top.length) return '';
  const weekdays = top.filter((s) => s.weekday >= 1 && s.weekday <= 5).length;
  const days = weekdays / top.length >= 0.8 ? 'weekday ' : weekdays === 0 ? 'weekend ' : '';
  const counts = new Map<HourBand, number>();
  for (const s of top) counts.set(hourBand(s.hour), (counts.get(hourBand(s.hour)) ?? 0) + 1);
  const [band] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
  return `${days}${band}s`;
}
const slotList = (bt: BestTimes, n = 3) => bt.top.slice(0, n).map((s) => slot(s.weekday, s.hour)).join(', ');

/** "your last 3 did 1.8× the median", or the whole group's median when the latest posts point the other way. */
function evidence(p: Pattern, last: DigestPost[]): string {
  const recent = median(last.map(ratioOf));
  if (recent > 1 === p.lift > 1) return `your last ${last.length} did ${x(recent)} the median`;
  return `your ${p.group.length} ${p.feature.label} did ${x(p.medGroup)} the median`;
}

function recommendations(input: DigestInput, patterns: Pattern[], posts: DigestPost[]): DigestFinding[] {
  const recs: DigestFinding[] = [];
  const mentioned = new Set<Platform>();
  const times = new Map(input.bestTimes.map((b) => [b.platform, b]));
  const ratedPosts = rated(posts);

  for (const p of patterns.filter((q) => q.lift > 1).slice(0, 2)) {
    const platform = p.platform ?? dominantPlatform(p.group) ?? [...p.group].sort(newestFirst)[0]?.platform;
    const last = [...p.group].sort(newestFirst).slice(0, 3);
    const bt = platform ? times.get(platform) : undefined;
    const when = p.feature.dimension !== 'hour' && bt ? ` ${slotPhrase(bt)}` : '';
    if (platform) mentioned.add(platform);
    const title = `${p.feature.advice}${on(platform)}${when}; ${evidence(p, last)}`;
    const detail =
      `${upper(p.feature.label)} did ${x(p.medGroup)} your median against ${x(p.medRest)} for ${p.feature.contrast}.` +
      (bt ? ` Best ${PLATFORM_NAMES[bt.platform]} slots: ${slotList(bt)} (${bt.basis === 'history' ? 'from your own posts' : 'mostly platform defaults; more posts will sharpen this'}).` : '');
    recs.push(finding(title, detail, last, patternConfidence(p) * 0.9));
  }

  const neg = patterns.find((q) => q.lift < 1);
  if (neg && recs.length < 3) {
    const last = [...neg.group].sort(newestFirst).slice(0, 3);
    recs.push(
      finding(
        `Fewer ${neg.feature.label}${on(neg.platform)}; ${evidence(neg, last)}`,
        `${upper(neg.feature.label)} did ${x(neg.medGroup)} your median against ${x(neg.medRest)} for ${neg.feature.contrast}.`,
        last,
        patternConfidence(neg) * 0.8,
      ),
    );
  }

  for (const bt of input.bestTimes) {
    if (recs.length >= 4) break;
    if (mentioned.has(bt.platform) || !bt.top.length) continue;
    const inSlots = ratedPosts.filter((p) => p.platform === bt.platform && bt.top.some((s) => s.weekday === p.weekday && Math.abs(s.hour - p.hour) <= 1));
    recs.push(
      finding(
        `Schedule ${PLATFORM_NAMES[bt.platform]} posts for ${slotPhrase(bt)} (${slotList(bt)})`,
        bt.basis === 'history'
          ? `Your ${PLATFORM_NAMES[bt.platform]} posts did best at 24h when published around these times${inSlots.length ? `: ${plural(inSlots.length, 'post')} near them did a median ${x(median(inSlots.map(ratioOf)))}` : ''}.`
          : `Not enough ${PLATFORM_NAMES[bt.platform]} history yet, so these are the platform's usual peak hours. Harbor will switch to your own data as posts come in.`,
        inSlots.sort(byRatioDesc).slice(0, 5),
        bt.basis === 'history' ? 0.6 : 0.3,
      ),
    );
    mentioned.add(bt.platform);
  }

  if (!recs.length) {
    recs.push(finding('Publish at least 3 posts per platform', 'Harbor compares each post with the brand median for its platform at the same age; that needs 3 comparable posts.', [], 0.9));
  }
  return recs;
}

// ---- The digest ----

export function digest(input: DigestInput): DigestResult {
  const posts = [...input.posts].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
  const inPeriod = posts.filter((p) => p.inPeriod);
  const patterns = findPatterns(posts);

  const wins = inPeriod
    .filter((p) => p.outcome?.verdict === 'outperformed')
    .sort(byRatioDesc)
    .slice(0, 3)
    .map((p, i) => {
      const o = p.outcome!;
      const why = i === 0 ? ` ${whyItWorked(p, patterns, posts)}` : '';
      return finding(
        `${PLATFORM_NAMES[p.platform]} post at ${x(o.ratio)} the median: "${snippet(p)}"`,
        `${fmt(o.actual)} ${o.metric} at ${o.atAgeHours}h against a median of ${fmt(o.baseline)} (${plural(o.comparablePosts, 'comparable post')}).${why}`,
        [p],
        0.5 + 0.05 * Math.min(o.comparablePosts, 8),
      );
    });

  const misses = inPeriod
    .filter((p) => p.outcome?.verdict === 'underperformed')
    .sort((a, b) => ratioOf(a) - ratioOf(b) || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((p) => {
      const o = p.outcome!;
      return finding(
        `${PLATFORM_NAMES[p.platform]} post at ${x(o.ratio)} the median: "${snippet(p)}"`,
        `${fmt(o.actual)} ${o.metric} at ${o.atAgeHours}h against a median of ${fmt(o.baseline)}. ${whatItLacked(p, patterns)}`,
        [p],
        0.45 + 0.05 * Math.min(o.comparablePosts, 8),
      );
    });

  const patternFindings = patterns.slice(0, 5).map(patternFinding);
  const platform = platformFinding(posts);
  if (platform) patternFindings.push(platform);
  // No win this period: explain the best recent outperformer instead.
  if (!wins.length) {
    const best = rated(posts).filter((p) => p.outcome!.verdict === 'outperformed').sort(byRatioDesc)[0];
    if (best) {
      patternFindings.push(
        finding(
          `Why your best recent post worked: "${snippet(best)}"`,
          `${x(ratioOf(best))} the ${PLATFORM_NAMES[best.platform]} median at ${best.outcome!.atAgeHours}h. ${whyItWorked(best, patterns, posts)}`,
          [best],
          0.5,
        ),
      );
    }
  }

  const recs = recommendations(input, patterns, posts);

  const from = Date.parse(input.period.from);
  const to = Date.parse(input.period.to);
  const days = Math.max(1, Math.round((to - from) / 86_400_000));
  const s = input.stats;
  let headline: string;
  if (s.published === 0) {
    headline = `No posts published in the last ${plural(days, 'day')}${s.posts ? ` (${plural(s.posts, 'post')} scheduled or in progress)` : ''}.`;
    if (patternFindings[0]) headline += ` From your history: ${patternFindings[0].title}.`;
  } else {
    const views = s.medianViews24h !== undefined ? `, median ${fmt(s.medianViews24h)} views at 24h` : '';
    const change =
      s.change === undefined
        ? ''
        : Math.round(Math.abs(s.change - 1) * 100) === 0
          ? ` (flat vs the previous ${plural(days, 'day')})`
          : ` (${s.change >= 1 ? '+' : '−'}${Math.round(Math.abs(s.change - 1) * 100)}% vs the previous ${plural(days, 'day')})`;
    const top = patterns[0];
    const lead = top
      ? ` ${upper(top.feature.label)} ${top.lift > 1 ? 'beat' : 'trailed'} ${top.feature.contrast}${on(top.platform)} (${x(top.medGroup)} vs ${x(top.medRest)}).`
      : wins[0]
        ? ` Top post: ${wins[0].title.split(':')[0]}.`
        : '';
    headline = `${plural(s.published, 'post')} published${views}${change}.${lead}`;
  }

  return { headline, wins, misses, patterns: patternFindings, recommendations: recs };
}
