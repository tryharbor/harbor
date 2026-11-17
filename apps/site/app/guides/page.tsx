import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '../../components/reveal';
import { CtaBand, PageHero } from '../../components/ui';
import { formatDate } from '../../lib/blog';
import { KIND_LABEL, TRADES, getGuides } from '../../lib/guides';
import { pageMeta } from '../../lib/seo';
import './guides.css';

export const metadata: Metadata = pageMeta('/guides', {
  title: 'Guides for starting a service business',
  description: 'Plain, current guides for starting a local service business: what it costs, what to charge, and how to get your first customers. Every number sourced and dated.',
});

export default function GuidesIndex() {
  const guides = getGuides();
  const trades = [...new Set(guides.map((g) => g.trade))];
  return (
    <>
      <PageHero
        eyebrow="Guides"
        title="Start your service business."
        lede="What it really costs, what to charge, and how to find your first customers. Plain answers, with every number sourced and kept up to date."
      />
      <section className="container stack" style={{ gap: 56, paddingBottom: 'clamp(48px, 8vw, 96px)' }}>
        {trades.map((t) => (
          <div key={t} className="stack" style={{ gap: 20 }}>
            <Reveal><h2 className="h2" style={{ margin: 0 }}>{TRADES[t]}</h2></Reveal>
            <div className="cards">
              {guides.filter((g) => g.trade === t).map((g, i) => (
                <Reveal key={g.slug} delay={i * 50}>
                  <Link href={`/guides/${g.slug}`} className="card" style={{ height: '100%' }}>
                    <span className="label">{KIND_LABEL[g.kind]}</span>
                    <strong style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{g.title}</strong>
                    <span className="muted small">{g.description}</span>
                    <span className="dim small" style={{ marginTop: 'auto' }}>Updated {formatDate(g.updated)}</span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        ))}
      </section>
      <CtaBand />
    </>
  );
}
