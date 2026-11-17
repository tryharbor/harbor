import type { Brand } from '@harbor/core';
import type { SiteCopy } from '@harbor/ai';
import { markOn, palette, readableOn } from './design-render.ts';

/**
 * A Website-mode site as one HTML page: the copy (from Business Memory) in one of three design directions, coloured
 * and set in type from Business Memory → Branding. Every piece of text is escaped. No scripts: the contact form is a
 * plain POST, so the page works everywhere and is fast.
 */

export const DIRECTIONS = ['bold', 'classic', 'minimal'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const DIRECTION_INFO: Record<Direction, { name: string; note: string }> = {
  bold: { name: 'Bold', note: 'Big type on your main colour. Confident and loud.' },
  classic: { name: 'Classic', note: 'Warm and trustworthy, with cards and clear sections.' },
  minimal: { name: 'Minimal', note: 'Lots of white space; colour only where it counts.' },
};

export interface SiteSettings {
  /** Where the main button goes: a booking page, a Stripe payment link, a shop. Falls back to the contact form. */
  ctaUrl?: string;
}

export interface RenderOptions {
  direction: Direction;
  settings: SiteSettings;
  /** Where the contact form posts. */
  contactAction: string;
  /** Shown after the form was sent. */
  sent?: boolean;
  /** Draft previews get a banner and noindex. */
  preview?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fontStack = (name: string, fallback: string) => (name ? `'${name.replace(/'/g, '')}', ${fallback}` : fallback);
const SANS = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** A Google Fonts link for the brand's fonts (names only; the visitor's browser loads them). */
function fontLink(names: string[]): string {
  const families = [...new Set(names.filter((n) => /^[A-Za-z0-9 ]{2,40}$/.test(n)))];
  if (!families.length) return '';
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700`).join('&');
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">`;
}

const safeUrl = (u?: string) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : undefined);

export function renderSite(brand: Brand, copy: SiteCopy, opts: RenderOptions): string {
  const p = palette(brand);
  const b = brand.memory.branding;
  const name = brand.name.replace(/\s*\(demo\)$/, '');
  const d = opts.direction;
  const head = fontStack(b.fonts.heading, d === 'classic' ? SERIF : SANS);
  const body = fontStack(b.fonts.body, SANS);
  const cta = safeUrl(opts.settings.ctaUrl) ?? '#contact';
  const logo = brand.logoUrl && (brand.logoUrl.startsWith('data:image/') || safeUrl(brand.logoUrl)) ? brand.logoUrl : undefined;

  // Colours per direction: the page, the hero, cards and the button, each with readable text on it.
  const page = d === 'bold' ? '#ffffff' : d === 'classic' ? p.neutral : '#ffffff';
  const heroBg = d === 'bold' ? p.primary : d === 'classic' ? p.secondary : '#ffffff';
  const button = markOn(heroBg, p.accent, p.primary, p.secondary, '#111111');
  const pageButton = markOn(page, p.primary, p.accent, '#111111');
  const card = d === 'classic' ? '#ffffff' : d === 'bold' ? p.neutral : '#f6f6f6';
  const ink = readableOn(page);
  const accentLine = markOn(page, p.accent, p.primary);

  const mark = logo
    ? `<img src="${esc(logo)}" alt="" class="logo">`
    : `<span class="mono" style="background:${pageButton};color:${readableOn(pageButton)}">${esc(name.charAt(0).toUpperCase())}</span>`;

  const sections = copy.sections.map((s) => {
    switch (s.kind) {
      case 'hero':
        return `<header class="hero"><div class="wrap">
          <h1>${esc(s.headline)}</h1>
          ${s.sub ? `<p class="lede">${esc(s.sub)}</p>` : ''}
          <a class="btn" href="${esc(cta)}">${esc(s.cta || 'Get in touch')}</a>
        </div></header>`;
      case 'offers':
        return `<section class="offers"><div class="wrap"><h2>${esc(s.title)}</h2><div class="grid">${s.items
          .map((i) => `<article class="card"><h3>${esc(i.name)}</h3><p>${esc(i.summary)}</p>${i.price ? `<p class="price">${esc(i.price)}</p>` : ''}</article>`)
          .join('')}</div></div></section>`;
      case 'proof':
        return `<section class="proof"><div class="wrap"><h2>${esc(s.title)}</h2><ul>${s.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></section>`;
      case 'about':
        return `<section class="about"><div class="wrap narrow"><h2>${esc(s.title)}</h2><p>${esc(s.body)}</p></div></section>`;
      case 'contact':
        return `<section class="contact" id="contact"><div class="wrap narrow"><h2>${esc(s.title)}</h2>${s.body ? `<p>${esc(s.body)}</p>` : ''}
          ${opts.sent ? '<p class="sent" role="status">Thanks. Your message is on its way, and we\'ll get back to you soon.</p>' : `<form method="post" action="${esc(opts.contactAction)}" class="form">
            <label>Name<input name="name" required maxlength="120" autocomplete="name"></label>
            <label>Email<input name="email" type="email" required maxlength="200" autocomplete="email"></label>
            <label>Message<textarea name="message" required maxlength="2000" rows="4"></textarea></label>
            <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
            ${opts.preview ? '<button class="btn alt" type="button" disabled>Sending is off in the preview</button>' : '<button class="btn alt" type="submit">Send message</button>'}
          </form>`}
        </div></section>`;
    }
  }).join('\n');

  const heroInk = readableOn(heroBg);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(copy.title)}</title>
<meta name="description" content="${esc(copy.description)}">
${opts.preview ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(copy.title)}"><meta property="og:description" content="${esc(copy.description)}">
${fontLink([b.fonts.heading, b.fonts.body])}
<style>
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:${page};color:${ink};font:17px/1.6 ${body}}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}.narrow{max-width:720px}
h1,h2,h3{font-family:${head};line-height:1.1;margin:0 0 .5em;letter-spacing:-.02em}
h2{font-size:clamp(28px,4vw,40px)}h3{font-size:20px}
p{margin:0 0 1em}
.top{display:flex;align-items:center;gap:12px;padding:18px 24px;max-width:1080px;margin:0 auto;font-weight:600}
.logo,.mono{width:36px;height:36px;border-radius:9px;object-fit:cover;display:inline-grid;place-items:center;font-weight:700}
.btn{display:inline-block;padding:14px 24px;border-radius:999px;background:${button};color:${readableOn(button)};font-weight:600;text-decoration:none;border:0;font:inherit;font-weight:600;cursor:pointer}
.btn.alt{background:${pageButton};color:${readableOn(pageButton)}}
.hero{background:${heroBg};color:${heroInk};padding:${d === 'minimal' ? '96px 0 64px' : '88px 0'}}
.hero h1{font-size:clamp(40px,7vw,${d === 'bold' ? 84 : 64}px);max-width:16ch}
.lede{font-size:clamp(18px,2.2vw,22px);max-width:40ch;opacity:.9;margin-bottom:28px}
section{padding:72px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.card{background:${card};color:${readableOn(card)};border-radius:16px;padding:24px${d === 'classic' ? `;box-shadow:0 1px 3px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.05)` : ''}}
.card p{margin:0}.price{margin-top:12px!important;font-weight:600}
.proof ul{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.proof li{padding-left:34px;position:relative;font-size:19px}
.proof li:before{content:'';position:absolute;left:0;top:.55em;width:18px;height:3px;border-radius:2px;background:${accentLine}}
${d === 'bold' ? `.proof{background:${p.neutral};color:${readableOn(p.neutral)}}` : ''}
${d === 'minimal' ? `section+section{border-top:1px solid rgba(0,0,0,.08)}` : ''}
.form{display:grid;gap:14px;margin-top:20px}
.form label{display:grid;gap:6px;font-size:15px;font-weight:600}
.form input,.form textarea{font:inherit;font-weight:400;padding:12px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.15);background:#fff;color:#111}
.form .btn{justify-self:start}
.hp{position:absolute;left:-9999px}
.sent{padding:16px;border-radius:12px;background:${card};color:${readableOn(card)}}
footer{padding:32px 24px;text-align:center;font-size:14px;opacity:.7}
.preview{position:sticky;top:0;z-index:5;background:#18181a;color:#fff;text-align:center;font:600 13px/1 ${SANS};padding:10px}
@media (max-width:640px){section{padding:56px 0}.hero{padding:64px 0}}
</style></head>
<body>
${opts.preview ? '<div class="preview">Preview: only you can see this until you publish.</div>' : ''}
<div class="top">${mark}<span>${esc(name)}</span></div>
${sections}
<footer>© ${new Date().getFullYear()} ${esc(name)}${brand.memory.business.location ? ` · ${esc(brand.memory.business.location)}` : ''}</footer>
</body></html>`;
}
