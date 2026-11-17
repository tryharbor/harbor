import type { CSSProperties } from 'react';
import type { BrandView, PostOption } from '../api';

/**
 * A square post graphic built from Business Memory → Branding: three layouts (headline, quote, list) in the brand's
 * colours, heading font, tagline and logo. With no colours saved yet it falls back to Harbor's ink and pink, so every
 * option still looks finished.
 */

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

function palette(brand: BrandView) {
  const colors = brand.memory.branding.colors;
  const pick = (role: string) => colors.find((c) => c.role === role)?.hex;
  const primary = pick('primary') ?? colors[0]?.hex ?? FALLBACK.primary;
  const accent = pick('accent') ?? colors.find((c) => c.hex !== primary && c.role !== 'neutral')?.hex ?? FALLBACK.accent;
  const neutral = pick('neutral') ?? FALLBACK.neutral;
  const secondary = pick('secondary') ?? FALLBACK.secondary;
  return { primary, accent, neutral, secondary };
}

/** Two or three short lines for the list layout: the draft's own list items, or its first sentences. */
function listItems(text: string, headline: string): string[] {
  // Bracketed notes ([Add the specifics.]) are for the owner, never the design.
  text = text.replace(/\[[^\]]*\]/g, '');
  const bullets = text.split('\n').map((l) => l.trim()).filter((l) => /^([-•*]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, ''));
  const source = bullets.length >= 2 ? bullets : text.replace(/(https?:\/\/\S+|#[\p{L}\p{N}_]+)/gu, '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s && s !== headline);
  return source.slice(0, 3).map((s) => (s.length > 70 ? `${s.slice(0, 67).replace(/\s+\S*$/, '')}…` : s));
}

export function PostDesign(props: { brand: BrandView; option: PostOption }) {
  // Sizes inside are in cqw of the frame, so the padded design box itself can use them too.
  return <div className="pd-frame"><Design {...props} /></div>;
}

function Design({ brand, option }: { brand: BrandView; option: PostOption }) {
  const p = palette(brand);
  const { headline, sub, layout } = option.design;
  const heading = brand.memory.branding.fonts.heading;
  const headFont: CSSProperties = heading ? { fontFamily: `"${heading}", var(--font-sans)` } : {};
  const mark = brand.logoUrl
    ? <img src={brand.logoUrl} alt="" className="pd-logo" />
    : <span className="pd-monogram" style={{ background: p.accent, color: readableOn(p.accent) }}>{brand.name.charAt(0)}</span>;
  const footer = (color: string) => (
    <div className="pd-foot" style={{ color }}>
      {mark}
      <span>{brand.name.replace(/\s*\(demo\)$/, '')}</span>
    </div>
  );

  if (layout === 'quote') {
    const ink = readableOn(p.neutral);
    return (
      <div className="pd pd-quote" style={{ background: p.neutral, color: ink }} role="img" aria-label={`Quote design: ${headline}`}>
        <span className="pd-quote-mark" style={{ color: p.accent }} aria-hidden="true">“</span>
        <p className="pd-head" style={headFont}>{headline}</p>
        {sub ? <p className="pd-sub">{sub}</p> : null}
        <div className="pd-band" style={{ background: p.primary }}>{footer(readableOn(p.primary))}</div>
      </div>
    );
  }
  if (layout === 'list') {
    const items = listItems(option.drafts[0]?.parts[0]?.text ?? '', headline);
    const ink = readableOn(p.secondary);
    return (
      <div className="pd pd-list" style={{ background: p.secondary, color: ink }} role="img" aria-label={`List design: ${headline}`}>
        <div className="pd-stripe" style={{ background: p.primary }} aria-hidden="true" />
        <p className="pd-head" style={headFont}>{headline}</p>
        <ol className="pd-items">
          {items.map((it, i) => (
            <li key={i}><span className="pd-num" style={{ background: p.accent, color: readableOn(p.accent) }}>{i + 1}</span>{it}</li>
          ))}
        </ol>
        {footer(ink)}
      </div>
    );
  }
  const ink = readableOn(p.primary);
  return (
    <div className="pd pd-headline" style={{ background: p.primary, color: ink }} role="img" aria-label={`Headline design: ${headline}`}>
      <span className="pd-chip" style={{ background: p.accent, color: readableOn(p.accent) }}>{option.label}</span>
      <p className="pd-head" style={headFont}>{headline}</p>
      {sub ? <p className="pd-sub">{sub}</p> : null}
      {footer(ink)}
    </div>
  );
}
