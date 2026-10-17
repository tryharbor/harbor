/** Small, dependency-free text helpers for the simulated model. */

export interface Sentence {
  /** Verbatim slice of the source text. */
  text: string;
  /** Index of the example it came from. */
  source: number;
  /** Position within its source. */
  index: number;
}

/** Split into sentences without altering them: each `text` is an exact substring of the input. */
export function splitSentences(text: string, source = 0): Sentence[] {
  const out: Sentence[] = [];
  let index = 0;
  for (const line of text.split(/\n+/)) {
    // A period touching a letter or digit (1.7x, github.com) isn't a sentence end.
    const re = /(?:[^.!?…]|\.(?=[\p{L}\p{N}]))+(?:[.!?…]+["'’”)\]]*|$)/gu;
    for (const m of line.matchAll(re)) {
      const s = m[0].trim();
      if (s && /[\p{L}\p{N}]/u.test(s)) out.push({ text: s, source, index: index++ });
    }
  }
  return out;
}

export const words = (text: string): string[] => text.match(/[\p{L}][\p{L}'’-]*|\d+(?:[.,]\d+)*%?/gu) ?? [];
export const wordCount = (text: string) => words(text).length;

export const STOPWORDS = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between both
  but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each even ever every few for from
  further get gets got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his
  how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's like make made me more most much mustn't my
  myself need new no nor not now of off on once one only or other ought our ours ourselves out over own really same shan't she
  she'd she'll she's should shouldn't so some still such than that that's the their theirs them themselves then there there's
  these they they'd they'll they're they've thing things this those though through to too two under until up us very was wasn't
  way we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will
  with won't would wouldn't yet you you'd you'll you're you've your yours yourself yourselves day days week weeks time today
  going want know see said say says use used using back first last next well many lot lots`.split(/\s+/),
);

/** Words that read as marketing hype. Detected ones go to the voice's avoid list and banned words. */
export const HYPE_WORDS = [
  'leverage', 'seamless', 'seamlessly', 'unlock', 'unleash', 'transform', 'transformative', 'revolutionary', 'revolutionize',
  'game-changer', 'game-changing', 'synergy', 'disrupt', 'disruptive', 'cutting-edge', 'supercharge', 'skyrocket', 'effortless',
  'effortlessly', 'world-class', 'best-in-class', 'next-level', 'ultimate', 'empower', 'robust', 'innovative', 'magic', 'magical',
  'groundbreaking', 'turbocharge', '10x',
];

export const HEDGES = ['i think', 'maybe', 'might', 'kind of', 'sort of', 'perhaps', 'probably', 'i guess', 'i feel like', 'somewhat'];
export const FILLERS = ['really', 'very', 'just', 'actually', 'basically', 'literally', 'honestly', 'simply', 'quite', 'totally'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const wordRe = (w: string, flags = 'gi') => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, `${flags}u`);

export const containsWord = (text: string, w: string) => wordRe(w, 'i').test(text);

export const EMOJI_RE = /\p{Extended_Pictographic}/u;
export const EMOJI_RE_G = /\p{Extended_Pictographic}️?/gu;

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export const rate = <T>(xs: T[], pred: (x: T) => boolean) => (xs.length ? xs.filter(pred).length / xs.length : 0);

export const pct = (r: number) => `${Math.round(r * 100)}%`;

/** First `max` characters, cut at a word boundary, with an ellipsis when cut. */
export function preview(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

export const lowerFirst = (s: string) => (s && !/^[A-Z]{2}/.test(s) && !/^I\b/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);
/**
 * A user-entered phrase put mid-sentence: lower-cases the first letter when the first word reads as an ordinary
 * capitalized word ("Building in public" → "building in public", "Setting up OAuth apps" → "setting up OAuth apps").
 * Names and acronyms keep their capitals: a one-letter or camel-case first word, or a two-word name ("X API costs",
 * "GitHub stars", "Claude Code").
 */
export const midSentence = (s: string) => {
  const [first = '', second = ''] = s.trim().split(/\s+/);
  if (!/^[A-Z][a-z]/.test(first) || /[A-Z]/.test(first.slice(1)) || /^\W*[A-Z]/.test(second)) return s.trim();
  return lowerFirst(s.trim());
};
export const upperFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
export const stripEnd = (s: string) => s.trim().replace(/[\s.!?…:;,]+$/, '');
export const ensureEnd = (s: string) => (/[.!?…:)"'”]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export const uniqueBy = <T>(xs: T[], key: (x: T) => string): T[] => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export const charLen = (s: string) => [...s].length;

/** Rough token estimate (~4 characters per token), used for simulated usage. */
export const estimateTokens = (v: unknown) => Math.max(1, Math.ceil((typeof v === 'string' ? v : JSON.stringify(v) ?? '').length / 4));

/** Split text into chunks no longer than `max` characters, breaking at word boundaries when possible. */
export function hardWrap(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (charLen(rest) > max) {
    const chars = [...rest];
    const head = chars.slice(0, max).join('');
    const at = head.lastIndexOf(' ');
    const cut = at > max * 0.4 ? at : head.length;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
