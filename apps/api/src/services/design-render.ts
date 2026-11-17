import sharp from 'sharp';
import type { Brand } from '@harbor/core';

/**
 * Post designs from Business Memory → Branding, drawn as a 1080×1080 SVG and rendered to PNG with sharp: the image
 * the assistant shows and the one attached to drafts. Three layouts (headline, quote, list) in the brand's colours,
 * heading font, tagline and logo. With no colours saved it uses Harbor's ink and pink, so it always looks finished.
 *
 * Text is set in the brand's heading font when the server has it, else Inter, else the system sans (the Docker
 * image installs Inter). Lines are wrapped here with an average glyph width, which is close enough for headlines.
 */

export type DesignLayout = 'headline' | 'quote' | 'list';
export interface DesignSpec {
  layout: DesignLayout;
  headline: string;
  sub?: string;
  label: string;
  /** The first draft's text: list items come from it. */
  body?: string;
}

const S = 1080;
const PAD = 97;
const FALLBACK = { primary: '#18181a', accent: '#f78ad9', neutral: '#f6f4ef', secondary: '#e8e8e8' };

/** Black or white, whichever reads better on a #rrggbb background (WCAG relative luminance). */
export function readableOn(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#111111';
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  return l > 0.179 ? '#111111' : '#ffffff';
}

export function palette(brand: Brand) {
  const colors = brand.memory.branding.colors;
  const pick = (role: string) => colors.find((c) => c.role === role)?.hex;
  const primary = pick('primary') ?? colors[0]?.hex ?? FALLBACK.primary;
  const accent = pick('accent') ?? colors.find((c) => c.hex !== primary && c.role !== 'neutral')?.hex ?? FALLBACK.accent;
  return { primary, accent, neutral: pick('neutral') ?? FALLBACK.neutral, secondary: pick('secondary') ?? FALLBACK.secondary, all: colors.map((c) => c.hex) };
}

/** How far apart two colours are in lightness (0–1): marks need to stand out from the background they sit on. */
const apart = (a: string, b: string) => {
  const lum = (h: string) => (/^#[0-9a-f]{6}$/i.test(h) ? (0.2126 * parseInt(h.slice(1, 3), 16) + 0.7152 * parseInt(h.slice(3, 5), 16) + 0.0722 * parseInt(h.slice(5, 7), 16)) / 255 : 0.5);
  return Math.abs(lum(a) - lum(b));
};
/** The first candidate that stands out on `bg`; black or white when none does. */
export function markOn(bg: string, ...candidates: string[]): string {
  return candidates.find((c) => c.toLowerCase() !== bg.toLowerCase() && apart(c, bg) >= 0.25) ?? readableOn(bg);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Emoji and other pictographs: system fonts can't be relied on to draw them, so designs leave them out. */
const clean = (s: string) => s.replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

/** Average advance per character as a share of the font size (Inter-like sans). */
const WIDTH = { bold: 0.53, semibold: 0.51, regular: 0.48 } as const;

/** Greedy word wrap to `maxWidth`, at most `maxLines` (the last line gets an ellipsis when text is cut). */
export function wrap(text: string, size: number, maxWidth: number, maxLines: number, weight: keyof typeof WIDTH = 'bold'): { lines: string[]; cut: boolean } {
  const per = Math.max(1, Math.floor(maxWidth / (size * WIDTH[weight])));
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= per) line = next;
    else {
      if (line) lines.push(line);
      line = w.length > per ? `${w.slice(0, per - 1)}…` : w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return { lines, cut: false };
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[\s,.;:!?-]*$/, '')}…`;
  return { lines: kept, cut: true };
}

/** The biggest size from `sizes` at which the text fits in `maxLines`. */
function fit(text: string, sizes: number[], maxWidth: number, maxLines: number, weight: keyof typeof WIDTH = 'bold') {
  for (const size of sizes) {
    const w = wrap(text, size, maxWidth, maxLines, weight);
    if (!w.cut) return { size, lines: w.lines };
  }
  const size = sizes[sizes.length - 1]!;
  return { size, lines: wrap(text, size, maxWidth, maxLines, weight).lines };
}

function textLines(lines: string[], x: number, y: number, size: number, lineHeight: number, attrs: string): string {
  return `<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lineHeight}">${esc(l)}</tspan>`).join('')}</text>`;
}

/** Two or three short lines for the list layout: the draft's own list items, or its first sentences. */
export function listItems(body: string, headline: string): string[] {
  const lines = body.replace(/\[[^\]]*\]/g, '').split('\n').map((l) => l.trim());
  const bullets = lines.filter((l) => /^([-•*]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, ''));
  const source = bullets.length >= 2 ? bullets : body.replace(/\[[^\]]*\]/g, '').replace(/(https?:\/\/\S+|#[\p{L}\p{N}_]+)/gu, '').split(/(?<=[.!?])\s+/).map((s) => clean(s)).filter((s) => s && s !== headline);
  // Leftover punctuation (a note's trailing ".") isn't an item.
  return source.map(clean).filter((s) => /[\p{L}\p{N}]/u.test(s)).slice(0, 3);
}

export function designSvg(brand: Brand, spec: DesignSpec): string {
  const p = palette(brand);
  const b = brand.memory.branding;
  const head = `${b.fonts.heading ? `'${esc(b.fonts.heading)}', ` : ''}Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif`;
  const bodyFont = `${b.fonts.body ? `'${esc(b.fonts.body)}', ` : ''}Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif`;
  const name = esc(brand.name.replace(/\s*\(demo\)$/, ''));
  const headline = clean(spec.headline) || clean(spec.label);
  const sub = spec.sub ? clean(spec.sub) : '';
  const logo = brand.logoUrl?.startsWith('data:image/') ? brand.logoUrl : undefined;
  const footer = (y: number, ink: string, bg: string) => {
    const m = markOn(bg, p.accent, p.primary, p.secondary, p.neutral, ...p.all);
    const mark = logo
      ? `<clipPath id="lc"><rect x="${PAD}" y="${y - 38}" width="76" height="76" rx="17"/></clipPath><image href="${esc(logo)}" x="${PAD}" y="${y - 38}" width="76" height="76" clip-path="url(#lc)" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect x="${PAD}" y="${y - 38}" width="76" height="76" rx="17" fill="${m}"/><text x="${PAD + 38}" y="${y + 15}" text-anchor="middle" font-size="44" font-weight="700" fill="${readableOn(m)}" font-family="${bodyFont}">${esc(brand.name.charAt(0).toUpperCase())}</text>`;
    return `${mark}<text x="${PAD + 104}" y="${y + 14}" font-size="38" font-weight="600" fill="${ink}" font-family="${bodyFont}">${name}</text>`;
  };
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">`;
  const W = S - PAD * 2;

  if (spec.layout === 'quote') {
    const ink = readableOn(p.neutral);
    const band = markOn(p.neutral, p.primary, p.accent, p.secondary, ...p.all);
    const h = fit(headline, [84, 76, 68, 60], W, 5, 'semibold');
    const top = 330;
    const subY = top + (h.lines.length - 1) * h.size * 1.15 + 80;
    const subLines = sub ? wrap(sub, 42, W, 2, 'regular').lines : [];
    return `${open}<rect width="${S}" height="${S}" fill="${p.neutral}"/>`
      + `<text x="${PAD - 8}" y="290" font-size="300" font-weight="700" fill="${markOn(p.neutral, p.accent, p.secondary, p.primary, ...p.all)}" font-family="Georgia, 'Times New Roman', serif">“</text>`
      + textLines(h.lines, PAD, top, h.size, 1.15, `font-weight="600" fill="${ink}" font-family="${head}" letter-spacing="-1"`)
      + (subLines.length ? textLines(subLines, PAD, subY, 42, 1.3, `fill="${ink}" fill-opacity="0.75" font-family="${bodyFont}"`) : '')
      + `<rect y="${S - 227}" width="${S}" height="227" fill="${band}"/>${footer(S - 113, readableOn(band), band)}</svg>`;
  }

  if (spec.layout === 'list') {
    const ink = readableOn(p.secondary);
    const num = markOn(p.secondary, p.accent, p.primary, p.neutral, ...p.all);
    const h = fit(headline, [80, 72, 64, 58], W, 4, 'bold');
    let y = 160 + h.size * 0.8;
    let out = `${open}<rect width="${S}" height="${S}" fill="${p.secondary}"/><rect width="28" height="${S}" fill="${markOn(p.secondary, p.primary, p.accent, ...p.all)}"/>`
      + textLines(h.lines, PAD, y, h.size, 1.12, `font-weight="700" fill="${ink}" font-family="${head}" letter-spacing="-1"`);
    y += (h.lines.length - 1) * h.size * 1.12 + 90;
    for (const [i, item] of listItems(spec.body ?? '', headline).entries()) {
      const t = wrap(item, 44, W - 110, 2, 'regular');
      out += `<circle cx="${PAD + 38}" cy="${y - 14}" r="38" fill="${num}"/>`
        + `<text x="${PAD + 38}" y="${y + 2}" text-anchor="middle" font-size="38" font-weight="700" fill="${readableOn(num)}" font-family="${bodyFont}">${i + 1}</text>`
        + textLines(t.lines, PAD + 110, y, 44, 1.3, `fill="${ink}" font-family="${bodyFont}"`);
      y += t.lines.length * 44 * 1.3 + 46;
      if (y > S - 230) break;
    }
    return `${out}${footer(S - 110, ink, p.secondary)}</svg>`;
  }

  const ink = readableOn(p.primary);
  const chip = markOn(p.primary, p.accent, p.secondary, p.neutral, ...p.all);
  const h = fit(headline, [108, 96, 86, 76, 68], W, 5, 'bold');
  const subLines = sub ? wrap(sub, 42, W, 2, 'regular').lines : [];
  const blockH = 90 + h.lines.length * h.size * 1.08 + (subLines.length ? 40 + subLines.length * 42 * 1.3 : 0);
  const top = Math.max(PAD, (S - 200 - blockH) / 2 + 40);
  // Measured generously: a pill that's a little wide reads fine, one that's short clips the label.
  const chipW = Math.round(spec.label.length * 34 * 0.6 + 60);
  const headTop = top + 90 + h.size * 0.85;
  return `${open}<rect width="${S}" height="${S}" fill="${p.primary}"/>`
    + `<rect x="${PAD}" y="${top}" width="${chipW}" height="62" rx="31" fill="${chip}"/>`
    + `<text x="${PAD + 28}" y="${top + 43}" font-size="34" font-weight="600" fill="${readableOn(chip)}" font-family="${bodyFont}">${esc(spec.label)}</text>`
    + textLines(h.lines, PAD, headTop, h.size, 1.08, `font-weight="700" fill="${ink}" font-family="${head}" letter-spacing="-2"`)
    + (subLines.length ? textLines(subLines, PAD, headTop + (h.lines.length - 1) * h.size * 1.08 + 80, 42, 1.3, `fill="${ink}" fill-opacity="0.8" font-family="${bodyFont}"`) : '')
    + `${footer(S - 110, ink, p.primary)}</svg>`;
}

export async function renderDesign(brand: Brand, spec: DesignSpec): Promise<Buffer> {
  return sharp(Buffer.from(designSvg(brand, spec))).png({ compressionLevel: 9 }).toBuffer();
}
