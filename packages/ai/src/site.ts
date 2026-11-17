import type { Brand } from '@harbor/core';

/**
 * Website copy: the words on a business's generated site, section by section. The site's look comes from Branding and
 * the chosen design direction; this is only what it says. Every claim must come from Business Memory.
 */

export type SiteSection =
  | { kind: 'hero'; headline: string; sub: string; cta: string }
  | { kind: 'offers'; title: string; items: { name: string; summary: string; price?: string }[] }
  | { kind: 'proof'; title: string; points: string[] }
  | { kind: 'about'; title: string; body: string }
  | { kind: 'contact'; title: string; body: string };

export interface SiteCopy {
  /** The browser tab title and search result title. */
  title: string;
  /** The search result description (about 150 characters). */
  description: string;
  sections: SiteSection[];
}

export interface SiteCopyInput {
  brand: Brand;
}

const sentence = (s: string) => {
  const t = s.trim();
  return !t ? '' : /[.!?]$/.test(t) ? t : `${t}.`;
};

const CTA: Record<string, string> = { service: 'Book now', product: 'Shop now', ecommerce: 'Shop now', software: 'Get started', creator: 'Join now' };

/** The simulated model's site: assembled from Business Memory as written, inventing nothing. */
export function simulatedSiteCopy({ brand }: SiteCopyInput): SiteCopy {
  const m = brand.memory;
  const b = m.business;
  const name = brand.name.replace(/\s*\(demo\)$/, '');
  const product = m.products[0];
  const headline = m.branding.tagline || b.oneLiner || product?.summary || name;
  const sub = [b.oneLiner && b.oneLiner !== headline ? b.oneLiner : '', b.location ? `Serving ${b.location}.` : ''].filter(Boolean).map(sentence).join(' ') || sentence(product?.summary ?? '');
  const cta = product?.cta || CTA[b.type ?? ''] || 'Get in touch';

  const sections: SiteSection[] = [{ kind: 'hero', headline, sub, cta }];
  const items = m.products.map((p) => ({ name: p.name, summary: sentence(p.summary) }));
  if (items.length) sections.push({ kind: 'offers', title: b.type === 'service' ? 'What we do' : 'What we offer', items: b.pricing && items.length === 1 ? [{ ...items[0]!, price: b.pricing }] : items });
  else if (b.pricing) sections.push({ kind: 'offers', title: 'Pricing', items: [{ name, summary: sentence(b.pricing) }] });
  const points = [...b.differentiators, ...(product?.proofPoints ?? [])].filter((p, i, a) => a.indexOf(p) === i).slice(0, 4);
  if (points.length) sections.push({ kind: 'proof', title: `Why ${name}`, points: points.map(sentence) });
  const about = [b.oneLiner, m.audiences[0]?.description].filter(Boolean).map((s) => sentence(s!)).join(' ');
  if (about) sections.push({ kind: 'about', title: `About ${name}`, body: about });
  sections.push({ kind: 'contact', title: 'Get in touch', body: b.location ? `Questions, quotes or bookings in ${b.location}: send a message and we'll get back to you.` : "Send a message and we'll get back to you." });

  return {
    title: b.oneLiner ? `${name}: ${b.oneLiner.replace(/[.!?]$/, '')}` : name,
    description: (b.oneLiner || product?.summary || headline).slice(0, 155),
    sections,
  };
}
