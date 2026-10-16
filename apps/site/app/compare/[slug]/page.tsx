import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Answer, Faq, Related } from '../../../components/guide';
import { Reveal } from '../../../components/reveal';
import { CtaBand, PageHero, SectionHead } from '../../../components/ui';
import { COMPARISONS, comparison } from '../../../lib/compare';
import { JsonLd, breadcrumbs, faqPage } from '../../../lib/jsonld';
import { pageMeta } from '../../../lib/seo';
import { SITE } from '../../../lib/site';
import '../../guide.css';

export const dynamicParams = false;
export const generateStaticParams = () => COMPARISONS.map((c) => ({ slug: c.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = comparison((await params).slug);
  return c ? pageMeta(`/compare/${c.slug}`, { title: c.metaTitle, description: c.description }) : { title: 'Not found' };
}

const checked = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const c = comparison((await params).slug);
  if (!c) notFound();
  const others = COMPARISONS.filter((x) => x.slug !== c.slug);
  return (
    <>
      <JsonLd
        data={[
          faqPage(c.faq),
          breadcrumbs([['Comparisons', '/compare'], [`Harbor vs ${c.name}`, `/compare/${c.slug}`]]),
          { '@context': 'https://schema.org', '@type': 'WebPage', name: c.metaTitle, description: c.description, url: `${SITE.url}/compare/${c.slug}`, dateModified: c.checkedOn, about: [{ '@id': `${SITE.url}/#software` }, { '@type': 'SoftwareApplication', name: c.name, url: c.url }] },
        ]}
      />
      <PageHero
        eyebrow={`Comparison · checked ${checked(c.checkedOn)}`}
        title={`Harbor vs ${c.name}`}
        actions={<><Link className="btn primary" href={SITE.start}>Get started</Link><a className="btn" href="#glance">At a glance</a></>}
      />
      <section className="container" style={{ marginTop: -24 }}>
        <Answer>{c.answer}</Answer>
      </section>

      <section className="section tight" id="glance">
        <div className="container stack" style={{ gap: 24 }}>
          <SectionHead eyebrow="At a glance" title={`Harbor and ${c.name}, side by side.`} />
          <Reveal delay={80}>
            <div className="cmp-wrap">
              <table className="cmp">
                <thead><tr><th scope="col"><span className="sr-only">Feature</span></th><th scope="col">Harbor</th><th scope="col">{c.name}</th></tr></thead>
                <tbody>
                  {c.rows.map((r) => (
                    <tr key={r.label}><th scope="row">{r.label}</th><td className="harbor" data-label="Harbor">{r.harbor}</td><td data-label={c.name}>{r.them}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
          <span className="small dim">{c.name} details are from its own site and docs, checked {checked(c.checkedOn)}. Prices and features change; see the sources below.</span>
        </div>
      </section>

      <section className="section tight rule">
        <div className="container">
          <Reveal>
            <div className="choose">
              <div>
                <span className="eyebrow"><span className="pixels" />Choose Harbor if</span>
                <ul className="check-list">{c.chooseHarbor.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
              <div>
                <span className="eyebrow">Choose {c.name} if</span>
                <ul className="check-list c-violet">{c.chooseThem.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section rule">
        <div className="container stack" style={{ gap: 40 }}>
          <SectionHead eyebrow="The differences that matter" title="Where they differ." />
          <div className="cards">
            {c.differences.map((d, i) => (
              <Reveal key={d.title} delay={i * 60} className="card">
                <span className="mono small" style={{ color: 'var(--pink)' }}>{String(i + 1).padStart(2, '0')}</span>
                <strong style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.02em' }}>{d.title}</strong>
                <span className="muted">{d.body}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section rule">
        <div className="container split" style={{ alignItems: 'start' }}>
          <SectionHead eyebrow="FAQ" title="Questions people ask." />
          <Reveal delay={80}><Faq items={c.faq} name={`faq-${c.slug}`} /></Reveal>
        </div>
      </section>

      <section className="section tight rule">
        <div className="container stack" style={{ gap: 20 }}>
          <span className="label">Sources, checked {checked(c.checkedOn)}</span>
          <ul className="sources">{c.sources.map((s) => <li key={s.url}><a href={s.url} rel="nofollow noopener" target="_blank">{s.label}</a></li>)}</ul>
          <span className="small dim">Something out of date? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> and we’ll fix it.</span>
          <Related items={[...others.map((o) => ({ href: `/compare/${o.slug}`, label: `Harbor vs ${o.name}` })), { href: '/pricing', label: 'Pricing' }]} />
        </div>
      </section>

      <CtaBand />
    </>
  );
}
