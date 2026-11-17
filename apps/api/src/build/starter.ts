import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Brand } from '@harbor/core';
import { markOn, palette, readableOn } from '../services/design-render.ts';
import type { Workspace } from './workspace.ts';

/**
 * The starting files for a new Full app (decision 0004's first starter): a small web app with sign-in, a database and
 * Stripe payments, in plain Node with no packages, so it installs instantly and has nothing to break.
 *
 * The code (server.js, lib/) is copied from apps/api/starter as is. The business-specific files are written here from
 * Business Memory: config.js (name, product, price), content/home.html, public/styles.css (brand colours) and a README
 * that tells the builder agent how the app is laid out.
 */

export const STARTER_DIR = fileURLToPath(new URL('../../starter', import.meta.url));

export interface Price { amountCents: number | null; currency: string; interval: 'day' | 'week' | 'month' | 'year' | null; label: string }

/**
 * The price to charge, from Business Memory's pricing text: a recurring price if there is one ("$18 a bag, or
 * $32/month subscription" → $32 monthly, since the starter signs people up), else the first price ("€45 per session"
 * → €45 once). How often counts only when it follows its own amount. Unreadable or missing → no price (payments stay
 * off until one is set in config.js).
 */
export function parsePrice(text: string): Price {
  const re = /([$€£])\s?(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}(?:[.,]\d{1,2})?)\s?(usd|eur|gbp|dollars?|euros?|pounds?)\b/gi;
  const found: Price[] = [];
  for (const m of text.matchAll(re)) {
    const symbol = (m[1] ?? m[4] ?? '$').toLowerCase();
    const currency = symbol === '€' || symbol.startsWith('eur') ? 'eur' : symbol === '£' || symbol.startsWith('gbp') || symbol.startsWith('pound') ? 'gbp' : 'usd';
    const amountCents = Math.round(Number((m[2] ?? m[3])!.replace(',', '.')) * 100);
    if (!(amountCents > 0)) continue;
    // Only the words right after this amount, up to the next price or clause.
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 16).split(/[,;]|\bor\b|[$€£]\s?\d/i)[0]!.toLowerCase();
    const interval = /^\s*(a|per|\/|each|every)\s?(month|mo)\b|^\s*monthly/.test(after) ? 'month'
      : /^\s*(a|per|\/|each|every)\s?(year|yr)\b|^\s*(yearly|annually)/.test(after) ? 'year'
      : /^\s*(a|per|\/|each|every)\s?week\b|^\s*weekly/.test(after) ? 'week' : null;
    const sym = currency === 'eur' ? '€' : currency === 'gbp' ? '£' : '$';
    const amount = amountCents % 100 ? (amountCents / 100).toFixed(2) : String(amountCents / 100);
    found.push({ amountCents, currency, interval, label: `${sym}${amount}${interval ? ` a ${interval}` : ''}` });
  }
  return found.find((p) => p.interval) ?? found[0] ?? { amountCents: null, currency: 'usd', interval: null, label: '' };
}

async function codeFiles(dir = STARTER_DIR): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await codeFiles(abs)));
    else if (e.isFile()) out.push(relative(STARTER_DIR, abs).split(sep).join('/'));
  }
  return out.sort();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function writeStarter(ws: Workspace, brand: Brand, projectName: string): Promise<void> {
  for (const path of await codeFiles()) await ws.write(path, await readFile(join(STARTER_DIR, path), 'utf8'));

  const name = brand.name.replace(/\s*\(demo\)$/, '');
  const business = brand.memory.business;
  const price = parsePrice(business.pricing);
  const p = palette(brand);
  const button = markOn('#ffffff', p.primary, p.accent, '#111111');
  const head = brand.memory.branding.fonts.heading;

  await ws.write('package.json', `${JSON.stringify({
    name: projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app',
    private: true,
    type: 'module',
    engines: { node: '>=22.13' },
    scripts: { dev: 'node --disable-warning=ExperimentalWarning server.js', start: 'node --disable-warning=ExperimentalWarning server.js' },
  }, null, 2)}\n`);

  await ws.write('config.js', `// The app's settings. Harbor filled these in from Business Memory; change them freely.
export default ${JSON.stringify({ businessName: name, productName: projectName, tagline: business.oneLiner, price }, null, 2)};
`);

  await ws.write('content/home.html', `    <section class="hero">
      <h1>${esc(projectName)}</h1>
      <p class="lead">${esc(business.oneLiner || `From ${name}.`)}</p>
      ${price.label ? `<p class="price">${esc(price.label)}</p>` : ''}
      <a class="btn" href="{{account_link}}">Get started</a>
    </section>
`);

  await ws.write('public/styles.css', `/* ${name}'s colours, from Harbor's Branding. */
:root {
  --brand: ${p.primary};
  --on-brand: ${readableOn(p.primary)};
  --accent: ${p.accent};
  --button: ${button};
  --on-button: ${readableOn(button)};
  --ink: #18181a;
  --muted: #62626a;
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 ${head ? `'${head.replace(/'/g, '')}', ` : ''}Inter, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--ink); background: #fafafa; }
a { color: inherit; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px; background: var(--brand); color: var(--on-brand); }
.top .brand { font-weight: 700; text-decoration: none; }
.top nav { display: flex; align-items: center; gap: 14px; }
.top nav form { margin: 0; }
main { max-width: 880px; margin: 0 auto; padding: 40px 24px; display: grid; gap: 20px; }
footer { max-width: 880px; margin: 0 auto; padding: 24px; font-size: 13px; }
h1 { font-size: clamp(30px, 5vw, 48px); line-height: 1.1; margin: 0 0 10px; letter-spacing: -0.02em; }
.card h1 { font-size: 26px; }
.lead { font-size: 18px; color: var(--muted); margin: 0 0 12px; }
.price { font-size: 20px; font-weight: 700; margin: 0 0 16px; }
.muted { color: var(--muted); }
.card { background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 2px 10px rgba(0,0,0,.05); }
.narrow { max-width: 420px; width: 100%; margin: 0 auto; }
.stack { display: grid; gap: 14px; }
.field { display: grid; gap: 4px; font-size: 14px; font-weight: 600; }
.field input { font: inherit; font-weight: 400; padding: 10px 12px; border: 1px solid #d4d4d8; border-radius: 8px; }
.btn { display: inline-block; font: inherit; font-weight: 600; padding: 10px 20px; border: 0; border-radius: 999px; background: var(--button); color: var(--on-button); text-decoration: none; cursor: pointer; }
.btn.small { padding: 6px 14px; font-size: 14px; }
.top .btn { background: var(--on-brand); color: var(--brand); }
.link { font: inherit; background: none; border: 0; color: inherit; cursor: pointer; padding: 0; text-decoration: underline; }
.error { margin: 0; padding: 10px 12px; border-radius: 8px; background: #fdecec; color: #8a1c1c; }
.notice { margin: 0; padding: 10px 12px; border-radius: 8px; background: #f2f2f4; }
.pill { display: inline-block; margin: 0; padding: 4px 12px; border-radius: 999px; background: #e7f6ec; color: #1d6b38; font-weight: 600; }
`);

  await ws.write('.gitignore', 'data/\nnode_modules/\n');

  await ws.write('README.md', `# ${projectName}

A web app for ${name}, built with Harbor. Plain Node (22.13 or newer), no packages: \`npm run dev\` starts it on PORT.

## How it's laid out

- \`server.js\`: the web server. Every page and form is one entry in \`ROUTES\`; add features by adding routes.
- \`lib/db.js\`: the database (SQLite, built into Node). Add tables there with \`CREATE TABLE IF NOT EXISTS\`.
- \`lib/auth.js\`: accounts and sign-in (email and password, hashed; sessions in an HttpOnly cookie).
- \`lib/payments.js\`: Stripe Checkout. On when the \`STRIPE_SECRET_KEY\` setting is set and \`config.js\` has a price.
- \`lib/pages.js\`: the pages, as HTML. Escape anything a visitor typed with \`esc()\`.
- \`content/home.html\`: the home page's content.
- \`public/\`: files served as they are (\`styles.css\` has the brand colours).
- \`config.js\`: business name, product name and price.
- \`data/\`: the database file. It stays on the app's server and is never copied into the project.

## Rules of the road

- Forms post to the app itself; the server refuses forms sent from other sites.
- Keep anything the app saves (orders, sign-ups, messages) in the database, not in files.
- Pages that need a signed-in customer use the \`user\` the route gets (undefined when signed out).
`);
}
