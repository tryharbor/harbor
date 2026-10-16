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
  { q: 'Do I need my own platform developer apps?', a: 'Self-hosted: yes. Harbor publishes through developer apps you register on X, LinkedIn, Meta (Instagram) and Threads; for your own accounts none need app review. Cloud: no. Cloud will connect through Harbor’s own apps.' },
  { q: 'What does X cost?', a: 'X’s API is pay-per-use: about $0.015 per post, about $0.20 for a post with a link, and $0.005 per metrics read. Harbor reads each post 5 times, so a post costs about 4 cents to publish and track, or about 22 cents with a link. LinkedIn, Instagram and Threads don’t charge for API use.' },
  { q: 'Can I move from self-host to Cloud?', a: 'That’s the plan. Both run the same code on Postgres, so moving is a database move. Connected accounts are reconnected once, because their tokens belong to your own developer apps.' },
  { q: 'Will Harbor ever post without asking?', a: 'No. Agents, automations and MCP clients can draft and propose, and every proposal waits in Approvals until a person approves it.' },
  { q: 'Is self-hosting really free?', a: 'Yes. Harbor is open source under the AGPL, with every feature included and no brand limit. You pay only for your own server, database and any platform or model usage.' },
];

export const metadata: Metadata = pageMeta('/pricing', {
  title: 'Pricing',
  description: 'Self-host Harbor free forever under the AGPL, or use Harbor Cloud, priced per brand: Starter $19 for 2 brands, Builder $49 for 6, Agency $149 for 25. Early pricing.',
  alternates: { canonical: '/pricing' },
});

type Cell = string | boolean;
const COLUMNS = ['Self-host', 'Starter', 'Builder', 'Agency'] as const;
const ROWS: { group: string; rows: { label: string; cells: [Cell, Cell, Cell, Cell]; note?: string }[] }[] = [
  {
    group: 'Brands and platforms',
    rows: [
      { label: 'Brands', cells: ['Unlimited', '2', '6', '25'] },
      { label: 'X, LinkedIn, Instagram, Threads', cells: [true, true, true, true] },
      { label: 'Brand Memory per brand', cells: [true, true, true, true] },
      { label: 'Media library and platform crops', cells: [true, true, true, true] },
    ],
  },
  {
    group: 'Agents',
    rows: [
      { label: 'Weekly plan, digest, voice refresh', cells: [true, true, true, true] },
      { label: 'Approvals inbox', cells: [true, true, true, true] },
      { label: 'Automations', cells: [true, false, true, true] },
      { label: 'MCP server and API keys', cells: [true, false, true, true] },
      { label: 'AI and metrics limits', cells: ['No limits', 'Standard', 'Higher', 'Higher'], note: 'Self-hosted Harbor runs the simulated model for free. Cloud plans have monthly limits on AI runs, X reads and snapshot retention.' },
    ],
  },
  {
    group: 'Running it',
    rows: [
      { label: 'Hosting', cells: ['Your server', 'Harbor', 'Harbor', 'Harbor'] },
      { label: 'Backups', cells: ['Yours to run', true, true, true] },
      { label: 'Platform developer apps', cells: ['Your own', 'Not needed', 'Not needed', 'Not needed'], note: 'On Cloud you connect through Harbor’s own apps. That needs each platform’s app review, which happens before Cloud opens.' },
      { label: 'X API costs', cells: ['Billed to you by X', 'Within limits', 'Within limits', 'Within limits'] },
      { label: 'Cross-brand reporting', cells: [true, true, true, true] },
      { label: 'Client review links', cells: [false, false, false, 'Coming'] },
      { label: 'Source code', cells: ['AGPL', 'AGPL', 'AGPL', 'AGPL'] },
    ],
  },
  {
    group: 'Support',
    rows: [
      { label: 'Support', cells: ['GitHub', 'Email', 'Priority email', 'Priority email'] },
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
        lede="Early pricing. Harbor Cloud is opening soon; self-hosting is free forever."
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
                  {featured ? <span className="tag pr-tag"><span className="pixels" style={{ width: 15, height: 4 }} aria-hidden="true" />Recommended</span> : i === 0 ? <span className="tag">Free forever</span> : <span className="tag">Cloud · soon</span>}
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
          <SectionHead eyebrow="Compare" title="Self-host or Cloud." lede="The same Harbor either way. The difference is who runs the server, who holds the platform apps and who pays the platform bills." />
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
                    <tr className="pr-group"><th scope="rowgroup" colSpan={5}>{g.group}</th></tr>
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
              { n: '02', t: 'No sales call', d: 'Start free by self-hosting, then pick a cheap self-serve plan if you’d rather not run a server. Tools priced per seat for marketing departments are built for a different buyer.' },
              { n: '03', t: 'Why there’s no hosted free tier yet', d: 'Every active Cloud user costs real money: model tokens for agents and drafts, X’s pay-per-read API, storage for metric snapshots. A hosted free tier would come out of pocket. Self-hosting is the free path.' },
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
                  <p><strong>Self-hosted: yes.</strong> Harbor publishes through developer apps you register on X, LinkedIn, Meta (Instagram) and Threads. For your own accounts none of them need app review, because you only connect accounts that hold a role on your app. Allow about an hour for all four. The <Link href="/open-source#guide">self-host guide</Link> walks through it.</p>
                  <p><strong>Cloud: no.</strong> Cloud will connect through Harbor’s own apps, so you click Connect and sign in. That needs each platform’s app review, which is why Cloud isn’t open yet.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>What does X cost?</summary>
                <div>
                  <p>X’s API is pay-per-use: you add credits in the X developer console and X bills each post and each read. Rough numbers from X’s console:</p>
                  <dl className="pr-costs">
                    {XCOST.map((c) => <div key={c.what}><dt>{c.what}</dt><dd className="mono">{c.cost}</dd></div>)}
                  </dl>
                  <p>So a post without a link costs about four cents all in, and one with a link about 22 cents. Reading replies and importing past posts are billed reads too, so they’re off by default (<code>HARBOR_X_READ_REPLIES</code>). Set a spending limit in X’s console either way. Check X’s current pricing; it changes.</p>
                  <p>Self-hosted, X bills you directly. On Cloud, X usage is covered up to your plan’s limits. LinkedIn, Instagram and Threads don’t charge for API use.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>Can I move from self-host to Cloud?</summary>
                <div>
                  <p>That’s the plan. Both run the same code on Postgres, so moving is a database move, not a rewrite: your brands, Brand Memory, posts and their metric history come with you. We’ll publish the steps before Cloud opens.</p>
                  <p>One thing won’t carry over: connected accounts. Their tokens were issued to your own developer apps and are encrypted with your <code>HARBOR_SECRET_KEY</code>, so on Cloud you reconnect each account once. Moving back to self-hosting works the same way.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>Will Harbor ever post without asking?</summary>
                <div>
                  <p>No. Agents, automations and MCP clients can draft and propose, and every proposal waits in Approvals until a person approves it. That’s the same on every plan. <Link href="/blog/why-harbor-never-posts-without-you">Why we built it that way</Link>.</p>
                </div>
              </details>
              <details name="pricing-faq">
                <summary>Is self-hosting really free?</summary>
                <div>
                  <p>Yes. Harbor is open source under the AGPL, with every feature included and no brand limit. You pay for your own server, database and any platform or model usage. In sandbox mode with the simulated model it costs nothing to run at all.</p>
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
