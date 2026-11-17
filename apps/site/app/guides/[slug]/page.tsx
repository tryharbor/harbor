import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Reveal } from '../../../components/reveal';
import { CtaBand } from '../../../components/ui';
import { formatDate } from '../../../lib/blog';
import { KIND_LABEL, TRADES, getGuide, getGuides } from '../../../lib/guides';
import { JsonLd, breadcrumbs, faqPage } from '../../../lib/jsonld';
import { SITE } from '../../../lib/site';
import '../../blog/blog.css';
import '../guides.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return getGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = getGuide((await params).slug);
  if (!g) return { title: 'Not found' };
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { type: 'article', title: g.title, description: g.description, url: `/guides/${g.slug}`, publishedTime: g.published, modifiedTime: g.updated },
    twitter: { card: 'summary_large_image', title: g.title, description: g.description },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = getGuide((await params).slug);
  if (!g) notFound();
  const related = getGuides().filter((x) => x.trade === g.trade && x.slug !== g.slug);
  const url = `${SITE.url}/guides/${g.slug}`;

  return (
    <>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, url, mainEntityOfPage: url, datePublished: g.published, dateModified: g.updated, author: { '@type': 'Organization', name: 'Harbor', url: SITE.url }, publisher: { '@type': 'Organization', name: 'Harbor', url: SITE.url } }} />
      <JsonLd data={breadcrumbs([['Guides', '/guides'], [g.title, `/guides/${g.slug}`]])} />
      {g.faq.length ? <JsonLd data={faqPage(g.faq)} /> : null}
      <article className="section blog-article">
        <div className="container">
          <Reveal><Link href="/guides" className="label blog-back">← All guides</Link></Reveal>
          <header className="blog-head">
            <Reveal delay={40}>
              <span className="eyebrow"><span className="pixels" />{TRADES[g.trade]} · {KIND_LABEL[g.kind]}<span aria-hidden="true">·</span>Updated <time dateTime={g.updated}>{formatDate(g.updated)}</time><span aria-hidden="true">·</span>{g.minutes} min read</span>
            </Reveal>
            <Reveal delay={80}><h1 className="h1 blog-h1">{g.title}</h1></Reveal>
          </header>
          <Reveal delay={120}>
            <div className="guide-answer">
              <span className="label">The short answer</span>
              <p>{g.answer}</p>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <div className="prose blog-prose guide-prose" dangerouslySetInnerHTML={{ __html: g.html }} />
          </Reveal>
        </div>
      </article>

      {related.length ? (
        <section className="section tight rule">
          <div className="container stack" style={{ gap: 24 }}>
            <span className="label">More on starting a {TRADES[g.trade]?.toLowerCase()}</span>
            <div className="cards">
              {related.map((r) => (
                <Link key={r.slug} href={`/guides/${r.slug}`} className="card">
                  <span className="label">{KIND_LABEL[r.kind]}</span>
                  <strong style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{r.title}</strong>
                  <span className="muted small">{r.description}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <CtaBand title="Get your cleaning business online." lede="Describe your business and Harbor builds the website, writes your first posts, and shows you the money coming in." />
    </>
  );
}
