import Link from 'next/link';
import type { ReactNode } from 'react';
import { FEATURES, SITE, type Feature } from '../../lib/site';
import { Reveal } from '../reveal';
import { PageHero, Window } from '../ui';

/** The building blocks of a product page (Sanity's product-page pattern): hero with a big window, alternating splits, related list, prev/next. */

export const feature = (slug: string) => FEATURES.find((f) => f.slug === slug)!;

export function FeatureHero({ f, title, lede, windowTitle, children }: { f: Feature; title: ReactNode; lede: ReactNode; windowTitle: string; children: ReactNode }) {
  return (
    <PageHero
      eyebrow={f.name}
      color={f.color}
      title={title}
      lede={lede}
      actions={<><Link className="btn primary" href={SITE.start}>Get started</Link><Link className="btn" href="/product">How the pieces fit</Link></>}
    >
      <div className={`pp-stage dots c-${f.color}`}>
        <Window title={windowTitle} className="pp-hero-window">{children}</Window>
      </div>
    </PageHero>
  );
}

/** Jump links under the hero: one per section, numbered like the sections themselves. */
export function SectionIndex({ f, items }: { f: Feature; items: { id: string; label: string }[] }) {
  return (
    <nav className={`container pp-index c-${f.color}`} aria-label={`${f.name} sections`}>
      {items.map((it, i) => (
        <a key={it.id} href={`#${it.id}`}><span className="mono ink-c">{String(i + 1).padStart(2, '0')}</span>{it.label}</a>
      ))}
    </nav>
  );
}

/** One idea per section: copy on one side, a live preview of that exact thing on the other. */
export function FeatureSection({
  id, n, f, eyebrow, title, body, points, windowTitle, preview, flip = false, wide = false, after,
}: {
  id: string; n: number; f: Feature; eyebrow: string; title: ReactNode; body: ReactNode; points?: ReactNode[]; windowTitle: string; preview: ReactNode; flip?: boolean; wide?: boolean; after?: ReactNode;
}) {
  return (
    <section className="section rule pp-section" id={id}>
      <div className={`container pp-split${flip ? ' flip' : ''}${wide ? ' wide' : ''}`}>
        <Reveal className="pp-copy">
          <div className="stack" style={{ gap: 20 }}>
            <span className={`eyebrow c-${f.color}`}><span className="mono ink-c">{String(n).padStart(2, '0')}</span>{eyebrow}</span>
            <h2 className="pp-h">{title}</h2>
            <div className="pp-body">{body}</div>
            {points?.length ? <ul className={`check-list c-${f.color}`}>{points.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
            {after}
          </div>
        </Reveal>
        <Reveal delay={120} className="pp-visual">
          <Window title={windowTitle}>{preview}</Window>
        </Reveal>
      </div>
    </section>
  );
}

export function AlsoInArea({ f, items }: { f: Feature; items: { title: string; body: ReactNode; href?: string }[] }) {
  return (
    <section className="section tight rule">
      <div className="container stack" style={{ gap: 28 }}>
        <Reveal><span className={`eyebrow c-${f.color}`}><span className="swatch" />Also in {f.name}</span></Reveal>
        <div className="pp-also">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 50} className="pp-also-item">
              {it.href ? <Link href={it.href}><strong>{it.title} →</strong></Link> : <strong>{it.title}</strong>}
              <span className="muted small">{it.body}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Previous and next feature, in the order of the loop. The ends point back to the overview. */
export function FeatureNav({ f }: { f: Feature }) {
  const i = FEATURES.findIndex((x) => x.slug === f.slug);
  const prev = FEATURES[i - 1];
  const next = FEATURES[i + 1];
  const Side = ({ to, dir }: { to?: Feature; dir: 'prev' | 'next' }) => (
    <Link href={to?.href ?? '/product'} className={`pp-nav-link ${dir}${to ? ` c-${to.color}` : ''}`}>
      <span className="label">{dir === 'prev' ? '← Previous' : 'Next →'}</span>
      <span className="pp-nav-name">{to ? <span className="swatch" /> : <span className="pixels" />}{to?.name ?? 'Product overview'}</span>
      <span className="muted small">{to?.pitch ?? 'The loop, and how the five pieces fit together.'}</span>
    </Link>
  );
  return (
    <div className="container">
      <nav className="pp-nav" aria-label="More of Harbor">
        <Side to={prev} dir="prev" />
        <Side to={next} dir="next" />
      </nav>
    </div>
  );
}
