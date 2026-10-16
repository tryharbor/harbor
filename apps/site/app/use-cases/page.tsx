import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '../../components/reveal';
import { CtaBand, PageHero } from '../../components/ui';
import { COMPARISONS } from '../../lib/compare';
import { pageMeta } from '../../lib/seo';
import { USE_CASES } from '../../lib/use-cases';
import '../guide.css';

export const metadata: Metadata = pageMeta('/use-cases', {
  title: 'Use cases and comparisons',
  description: 'How builders use Harbor: content for several brands, planning posts from Claude over MCP, and self-hosted publishing. Plus honest comparisons with Postiz, Buffer and Jasper.',
});

export default function UseCasesIndex() {
  return (
    <>
      <PageHero eyebrow="Use cases" title="What people use Harbor for." lede="Each page answers one question plainly, then shows how Harbor handles it." />
      <section className="container stack" style={{ gap: 40, paddingBottom: 80 }}>
        <div className="cards">
          {USE_CASES.map((u, i) => (
            <Reveal key={u.slug} delay={i * 60}>
              <Link href={`/use-cases/${u.slug}`} className="card" style={{ height: '100%' }}>
                <span className="label">{u.eyebrow.replace('Use case · ', '')}</span>
                <strong style={{ fontWeight: 500, fontSize: 21, letterSpacing: '-0.02em' }}>{u.metaTitle}</strong>
                <span className="muted small">{u.description}</span>
                <span className="link-arrow" style={{ marginTop: 'auto' }}>Read →</span>
              </Link>
            </Reveal>
          ))}
        </div>
        <span className="label">Comparisons</span>
        <div className="cards">
          {COMPARISONS.map((c, i) => (
            <Reveal key={c.slug} delay={i * 60}>
              <Link href={`/compare/${c.slug}`} className="card" style={{ height: '100%' }}>
                <strong style={{ fontWeight: 500, fontSize: 21, letterSpacing: '-0.02em' }}>Harbor vs {c.name}</strong>
                <span className="muted small">{c.summary}</span>
                <span className="link-arrow" style={{ marginTop: 'auto' }}>Compare →</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
