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
  { q: 'What counts as a brand?', a: 'A brand is one thing you post for: your product, a side project, your own name, a client. Each brand has its own Brand Memory, connected accounts and baseline. One brand can post to all four platforms.' },
  { q: 'Do I need my own platform developer apps?', a: 'No. Harbor Cloud connects through Harbor’s own apps: you click Connect and sign in to each platform.' },
  { q: 'What does X cost?', a: 'X’s API is pay-per-use: about $0.015 per post, about $0.20 for a post with a link, and $0.005 per metrics read. Harbor reads each post 5 times, so a post costs about 4 cents to publish and track, or about 22 cents with a link. LinkedIn, Instagram and Threads don’t charge for API use.' },
  { q: 'Will Harbor ever post without asking?', a: 'No. Agents, automations and MCP clients can draft and propose, and every proposal waits in Approvals until a person approves it.' },
];

export const metadata: Metadata = pageMeta('/pricing', {
  title: 'Pricing',
  description: 'Harbor Cloud is priced per brand: Starter $19 for 2 brands, Builder $49 for 6, Agency $149 for 25. Early pricing.',
  alternates: { canonical: '/pricing' },
});

type Cell = string | boolean;
const COLUMNS = ['Starter', 'Builder', 'Agency'] as const;
const ROWS: { group: string; rows: { label: string; cells: [Cell, Cell, Cell]; note?: string }[] }[] = [
  {
    group: 'Brands and platforms',
    rows: [
      { label: 'Brands', cells: ['2', '6', '25'] },
      { label: 'X, LinkedIn, Instagram, Threads', cells: [true, true, true] },
      { label: 'Brand Memory per brand', cells: [true, true, true] },
      { label: 'Media library and platform crops', cells: [true, true, true] },
    ],
  },
  {
    group: 'Agents',
    rows: [
      { label: 'Weekly plan, digest, voice refresh', cells: [true, true, true] },
      { label: 'Approvals inbox', cells: [true, true, true] },
      { label: 'Automations', cells: [false, true, true] },
      { label: 'MCP server and API keys', cells: [false, true, true] },
      { label: 'AI and metrics limits', cells: ['Standard', 'Higher', 'Higher'], note: 'Plans have monthly limits on AI runs, X reads and snapshot retention.' },
    ],
  },
  {
    group: 'Included',
    rows: [
      { label: 'Hosting and backups', cells: [true, true, true] },
      { label: 'Connect accounts in a click', cells: [true, true, true] },
      { label: 'X API costs', cells: ['Within limits', 'Within limits', 'Within limits'] },
      { label: 'Cross-brand reporting', cells: [true, true, true] },
      { label: 'Client review links', cells: [false, false, 'Coming'] },
    ],
  },
  {
    group: 'Support',
    rows: [
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
        title="Priced per brand, not per seat."
        lede="Early pricing. Harbor Cloud is opening soon."
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
                  {featured ? <span className="tag pr-tag"><span className="pixels" style={{ width: 15, height: 4 }} aria-hidden="true" />Recommended</span> : <span className="tag">Cloud · soon</span>}
                </div>
                <strong className="pr-price">{p.price}<span>{p.per}</span></strong>
                <p className="muted" style={{ margin: 0 }}>{p.brands}</p>
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
            Cloud prices are early and may change before Cloud opens. Early access means we’ll email you when your plan is ready; nothing is charged until then.
          </p>
        </Reveal>
      </section>

      {/* Comparison */}
      <section className="section">
        <div className="container stack" style={{ gap: 40 }}>
          <SectionHead eyebrow="Compare" title="What each plan includes." lede="The same Harbor on every plan. Plans differ in how many brands they hold and how much the agents can do each month." />
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
          <p className="dim small" style={{ margin: 0 }}>Cloud columns describe what we plan to offer when Cloud opens.</p>
        </div>
      </section>

      {/* Why per brand */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="Why per brand" title="You count brands, not seats." lede="A solo founder with a product, a side project and a personal account is one person with three brands. Harbor’s price follows the thing that actually grows." />
          <div className="cards">
            {[
              { n: '01', t: 'Brands are the unit builders think in', d: 'Seats don’t matter when you work alone. The number of things you post for does. Each brand in Harbor has its own Brand Memory, baseline and best times, so that’s what a plan counts.' },
              { n: '02', t: 'No sales call', d: 'Pick a cheap self-serve plan and start. Tools priced per seat for marketing departments are built for a different buyer.' },
              { n: '03', t: 'Why there’s no free tier yet', d: 'Every active user costs real money: model tokens for agents and drafts, X’s pay-per-read API, storage for metric snapshots. For now, a free tier would come out of pocket.' },
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
                <summary>What counts as a brand?</summary>
                <div>
                  <p>A brand is one thing you post for: your product, a side project, your own name, a client. In Harbor each brand has its own Brand Memory (voice, audiences, offers, knowledge), its own connected accounts and its own baseline, so one brand’s results never skew another’s.</p>
                  <p>One brand can post to all four platforms. Your product’s X and LinkedIn accounts are one brand, not two.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>Do I need my own platform developer apps?</summary>
                <div>
                  <p><strong>No.</strong> Harbor Cloud connects through Harbor’s own apps, so you click Connect and sign in to each platform. Nothing to register, no developer console.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>What does X cost?</summary>
                <div>
                  <p>X’s API is pay-per-use: X bills each post and each read. Rough numbers from X’s console:</p>
                  <dl className="pr-costs">
                    {XCOST.map((c) => <div key={c.what}><dt>{c.what}</dt><dd className="mono">{c.cost}</dd></div>)}
                  </dl>
                  <p>So a post without a link costs about four cents all in, and one with a link about 22 cents. Reading replies and importing past posts are billed reads too, so they’re off by default. X’s pricing changes, so treat these as rough.</p>
                  <p>X usage is covered up to your plan’s limits. LinkedIn, Instagram and Threads don’t charge for API use.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>Will Harbor ever post without asking?</summary>
                <div>
                  <p>No. Agents, automations and MCP clients can draft and propose, and every proposal waits in Approvals until a person approves it. That’s the same on every plan. <Link href="/blog/how-harbors-approvals-inbox-works">How the approvals inbox works</Link>.</p>
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
