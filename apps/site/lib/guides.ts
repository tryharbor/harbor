import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Marked } from 'marked';
import { extractFaq, parseFrontmatter } from './blog';

/**
 * Guides for starting a local service business (docs/marketing/content-strategy.md): markdown in content/guides/*.md.
 * Unlike blog posts they're kept current, so each shows when it was last checked, and opens with a short direct answer.
 *
 *   ---
 *   title: How much does it cost to start a cleaning business in 2026?
 *   description: One line for search results and the guides index.
 *   answer: The 40–60 word direct answer shown first, in a box.
 *   trade: cleaning                (groups guides on the index; "general" for every trade)
 *   kind: cost                     (start | cost | price | customers | general)
 *   published: 2026-11-17
 *   updated: 2026-11-17            (when the facts were last checked)
 *   author: Derek                  (optional; Derek by default)
 *   ---
 *
 * A "## FAQ" section becomes FAQPage data, as on the blog. End with "## Sources": every figure has one.
 */

/** Each trade's name on the index, and how the closing banner talks to someone starting one. */
export const TRADES: Record<string, string> = { cleaning: 'Cleaning business', 'lawn-care': 'Lawn care business', 'dog-grooming': 'Dog grooming business', general: 'Any service business' };
export const TRADE_CTA: Record<string, string> = { cleaning: 'Get your cleaning business online.', 'lawn-care': 'Get your lawn care business online.', 'dog-grooming': 'Get your grooming business online.', general: 'Get your business online.' };
export const KINDS = ['start', 'cost', 'price', 'customers', 'general'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { start: 'Start', cost: 'Costs', price: 'Pricing', customers: 'First customers', general: 'Guide' };

export type Guide = {
  slug: string; title: string; description: string; answer: string; trade: string; kind: Kind;
  published: string; updated: string; author: string; html: string; minutes: number; faq: { q: string; a: string }[];
};

const DIR = join(process.cwd(), 'content', 'guides');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const marked = new Marked({ gfm: true });

function load(file: string): Guide {
  const slug = file.replace(/\.md$/, '');
  const where = `content/guides/${file}`;
  if (!SLUG.test(slug)) throw new Error(`${where}: file names are the slug (lowercase, dashes).`);
  const { data, body } = parseFrontmatter(readFileSync(join(DIR, file), 'utf8'));
  const need = (k: string) => {
    const v = data[k];
    if (typeof v !== 'string' || !v) throw new Error(`${where}: frontmatter needs "${k}".`);
    return v;
  };
  const kind = need('kind') as Kind;
  if (!KINDS.includes(kind)) throw new Error(`${where}: kind must be one of ${KINDS.join(', ')}.`);
  const trade = need('trade');
  if (!TRADES[trade]) throw new Error(`${where}: unknown trade "${trade}" (add it to TRADES).`);
  const published = need('published');
  const updated = need('updated');
  if (!DATE.test(published) || !DATE.test(updated)) throw new Error(`${where}: dates must be YYYY-MM-DD.`);
  if (!/^##\s+Sources\s*$/m.test(body)) throw new Error(`${where}: needs a "## Sources" section.`);
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug, kind, trade, published, updated,
    author: typeof data.author === 'string' && data.author ? data.author : 'Derek',
    title: need('title'), description: need('description'), answer: need('answer'),
    html: marked.parse(body, { async: false }),
    minutes: Math.max(1, Math.round(words / 230)),
    faq: extractFaq(body),
  };
}

const ORDER: Kind[] = ['start', 'cost', 'price', 'customers', 'general'];

/** Every guide, grouped order: by trade, then start → cost → price → customers. */
export function getGuides(): Guide[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  // The all-trades guides first, then each trade.
  const rank = (t: string) => (t === 'general' ? 0 : 1);
  return files.map(load).sort((a, b) => rank(a.trade) - rank(b.trade) || a.trade.localeCompare(b.trade) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.slug.localeCompare(b.slug));
}

export const getGuide = (slug: string) => getGuides().find((g) => g.slug === slug);
