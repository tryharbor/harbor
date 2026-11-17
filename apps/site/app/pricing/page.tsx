import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '../../components/reveal';
import { CtaBand, PageHero, SectionHead } from '../../components/ui';
import { PRICING } from '../../lib/pricing';
import { SITE } from '../../lib/site';
import './pricing.css';
import { pageMeta } from '../../lib/seo';
import { JsonLd, faqPage } from '../../lib/jsonld';

/** The FAQ below as plain text, for structured data. Keep in step with the visible answers. */
const FAQ_LD = [
  { q: 'What counts as a business?', a: 'A business is one thing you run: your shop, your coaching practice, your app, or a client’s business. Each one has its own Business Memory, website, apps, marketing and money, so nothing mixes between them.' },
  { q: 'What are app builds?', a: 'When you ask Harbor to build or change an app, an AI writes the code. Each plan includes a monthly amount of that AI time at the provider’s list price. A small change costs cents and most first apps cost under a dollar. Every build stops at a cap you set, $5 by default.' },
  { q: 'Can I use my own AI key?', a: 'Yes. Pick Anthropic (Claude), OpenAI or Google (Gemini) on any plan. With your own key, the provider bills you directly and builds don’t use your plan’s allowance.' },
  { q: 'Do I need to know how to code?', a: 'No. You describe what you want in plain words and see it working in a live preview. The code is still real and yours, with every version kept.' },
  { q: 'Will Harbor ever post without asking?', a: 'No. The assistant and agents draft and propose, and every post waits in Approvals until a person approves it.' },
];

export const metadata: Metadata = pageMeta('/pricing', {
  title: 'Pricing',
  description: 'One price for your website, apps, marketing and money. Starter $19 for 2 businesses, Builder $49 for 6, Agency $149 for 25. Early pricing.',
  alternates: { canonical: '/pricing' },
});

type Cell = string | boolean;
const COLUMNS = ['Starter', 'Builder', 'Agency'] as const;
const ROWS: { group: string; rows: { label: string; cells: [Cell, Cell, Cell]; note?: string }[] }[] = [
  {
    group: 'Your businesses',
    rows: [
      { label: 'Businesses', cells: ['2', '6', '25'] },
      { label: 'Business Memory: offer, customers, pricing, brand', cells: [true, true, true] },
      { label: 'Branding: colours, fonts, style', cells: [true, true, true] },
    ],
  },
  {
    group: 'Build',
    rows: [
      { label: 'Website: three designs, written for you, hosted', cells: [true, true, true] },
      { label: 'Contact form and customer messages', cells: [true, true, true] },
      { label: 'Full apps: sign-in, database, payments', cells: ['Try it', true, true] },
      { label: 'App builds each month', cells: ['$5', '$25', '$75'], note: 'AI build time at the provider’s list price. Most first apps cost under $1. With your own AI key, builds don’t count.' },
      { label: 'Live preview and every version kept', cells: [true, true, true] },
    ],
  },
  {
    group: 'Market',
    rows: [
      { label: 'AI assistant with post options to pick from', cells: [true, true, true] },
      { label: 'X, LinkedIn, Instagram, Threads', cells: [true, true, true] },
      { label: 'Approvals inbox: nothing posts without you', cells: [true, true, true] },
      { label: 'Automations', cells: [false, true, true] },
    ],
  },
  {
    group: 'Money',
    rows: [
      { label: 'Revenue from Stripe, plus what you add by hand', cells: [true, true, true] },
      { label: 'Every business side by side', cells: [false, false, true] },
    ],
  },
  {
    group: 'Included',
    rows: [
      { label: 'Pick Anthropic, OpenAI or Google', cells: [true, true, true] },
      { label: 'Use your own AI key', cells: [true, true, true] },
      { label: 'API access for your own tools and agents', cells: [false, true, true] },
      { label: 'Hosting and backups', cells: [true, true, true] },
      { label: 'Client review links', cells: [false, false, 'Coming'] },
      { label: 'Support', cells: ['Email', 'Priority email', 'Priority email'] },
    ],
  },
];

const XCOST = [
  { what: 'A post', cost: '≈ $0.015' },
  { what: 'A post with a link', cost: '≈ $0.20' },
  { what: 'One metrics read', cost: '≈ $0.005' },
  { what: 'Harbor’s 5 reads per post, first week', cost: '≈ $0.025' },
];

function Mark({ value }: { value: Cell }) {
  if (value === true) return <span className="pr-yes" aria-label="Included">✓</span>;
  if (value === false) return <span className="pr-no" aria-label="Not included">–</span>;
  return <span>{value}</span>;
}

export default function PricingPage() {
  return (
    <>
      <JsonLd data={faqPage(FAQ_LD)} />
      <PageHero
        eyebrow="Pricing"
        title="One price for the whole business."
        lede="Your website, your app, your marketing and your money, in one place. Early pricing: Harbor is opening soon."
      />

      {/* Plans */}
      <section className="container" aria-label="Plans">
        <div className="pr-plans">
          {PRICING.map((p, i) => {
            const featured = 'featured' in p && p.featured;
            const external = p.href.startsWith('mailto:');
            return (
              <Reveal key={p.name} delay={i * 70} className={`pr-plan${featured ? ' featured' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="label">{p.name}</span>
                  {featured ? <span className="tag pr-tag"><span className="pixels" style={{ width: 15, height: 4 }} aria-hidden="true" />Recommended</span> : <span className="tag">Opening soon</span>}
                </div>
                <strong className="pr-price">{p.price}<span>{p.per}</span></strong>
                <p style={{ margin: 0 }}><strong>{p.summary}</strong> <span className="muted">{p.limit}</span></p>
                {external
                  ? <a className={`btn${featured ? ' primary' : ''}`} href={p.href}>{p.cta}</a>
                  : <Link className={`btn${featured ? ' primary' : ''}`} href={p.href}>{p.cta}</Link>}
                <ul className="check-list">
                  {p.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={200}>
          <p className="dim small pr-note">
            Prices are early and may change before Harbor opens. Early access means we’ll email you when your plan is ready; nothing is charged until then.
          </p>
        </Reveal>
      </section>

      {/* Comparison */}
      <section className="section">
        <div className="container stack" style={{ gap: 40 }}>
          <SectionHead eyebrow="Compare" title="What each plan includes." lede="The same Harbor on every plan. Plans differ in how many businesses they hold and how much building the AI does each month." />
          <Reveal>
            <div className="pr-table-wrap" role="region" aria-label="Plan comparison" tabIndex={0}>
              <table className="pr-table">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr">Feature</span></th>
                    {COLUMNS.map((c) => <th key={c} scope="col" className={c === 'Builder' ? 'featured' : undefined}>{c}</th>)}
                  </tr>
                </thead>
                {ROWS.map((g) => (
                  <tbody key={g.group}>
                    <tr className="pr-group"><th scope="rowgroup">{g.group}</th>{COLUMNS.map((c) => <td key={c} className={`pr-group-col${c === 'Builder' ? ' featured' : ''}`} aria-hidden="true">{c}</td>)}</tr>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row">{r.label}{r.note ? <span className="pr-row-note">{r.note}</span> : null}</th>
                        {r.cells.map((c, i) => <td key={COLUMNS[i]} className={COLUMNS[i] === 'Builder' ? 'featured' : undefined}><Mark value={c} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Reveal>
          <p className="dim small" style={{ margin: 0 }}>Columns describe what each plan includes when Harbor opens.</p>
        </div>
      </section>

      {/* Why one place */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="Why one place" title="Stop juggling five tools." lede="A new business usually means a website builder, a social scheduler, a spreadsheet for money and a developer for anything custom. Harbor is one place, and every part already knows your business." />
          <div className="cards">
            {[
              { n: '01', t: 'Priced per business, not per seat', d: 'Most founders work alone or with one or two people. What grows is the number of things you run, so that’s what a plan counts.' },
              { n: '02', t: 'Start from what you already told it', d: 'Describe the business once. The website, the app, the posts and the money view all start from it, so you never fill in the same details twice.' },
              { n: '03', t: 'Why there’s no free plan yet', d: 'Every business on Harbor costs real money to run: AI to write and build, hosting for sites and apps, platform fees. For now, a free plan would come out of pocket.' },
            ].map((c, i) => (
              <Reveal key={c.n} delay={i * 80} className="card">
                <span className="mono small" style={{ color: 'var(--pink)' }}>{c.n}</span>
                <strong className="pr-card-title">{c.t}</strong>
                <span className="muted">{c.d}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section rule">
        <div className="container split pr-faq-split">
          <SectionHead eyebrow="FAQ" title="Questions people ask." lede={<>Something missing? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</>} />
          <Reveal delay={100}>
            <div className="pr-faq">
              <details name="pricing-faq" open>
                <summary>What counts as a business?</summary>
                <div>
                  <p>A business is one thing you run: your shop, your coaching practice, your app, or a client’s business. Each one has its own Business Memory, website, apps, marketing and money, so nothing mixes between them.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>What are app builds?</summary>
                <div>
                  <p>When you ask Harbor to build or change an app, an AI writes the code. Each plan includes a monthly amount of that AI time, counted at the provider’s list price. A small change costs cents; most first apps cost under a dollar.</p>
                  <p>Every build stops at a cap you set ($5 by default), so nothing runs away. Websites don’t use builds.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>Can I use my own AI key?</summary>
                <div>
                  <p><strong>Yes.</strong> Pick Anthropic (Claude), OpenAI or Google (Gemini) on any plan. With your own key, the provider bills you directly and builds don’t use your plan’s allowance.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>Do I need to know how to code?</summary>
                <div>
                  <p>No. You describe what you want in plain words and see it working in a live preview. The code is still real and yours, with every version kept, so you can go back to any earlier one.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>What does X cost?</summary>
                <div>
                  <p>X’s API is pay-per-use: X bills each post and each read. Rough numbers from X’s console:</p>
                  <dl className="pr-costs">
                    {XCOST.map((c) => <div key={c.what}><dt>{c.what}</dt><dd className="mono">{c.cost}</dd></div>)}
                  </dl>
                  <p>So a post without a link costs about four cents all in, and one with a link about 22 cents. X usage is covered up to your plan’s limits. LinkedIn, Instagram and Threads don’t charge for API use.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>Will Harbor ever post without asking?</summary>
                <div>
                  <p>No. The assistant and agents draft and propose, and every post waits in Approvals until a person approves it. That’s the same on every plan. <Link href="/blog/how-harbors-approvals-inbox-works">How the approvals inbox works</Link>.</p>
                </div>
              </details>
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
