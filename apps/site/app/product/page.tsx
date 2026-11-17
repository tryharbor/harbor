import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FeatureSection } from '../../components/product/feature';
import { AppBuilderPreview, BusinessFactsPreview, MoneyMonthPreview, PostPickerPreview } from '../../components/previews/os';
import { CtaBand, PageHero } from '../../components/ui';
import { FEATURES, SITE } from '../../lib/site';
import './product.css';
import { pageMeta } from '../../lib/seo';

export const metadata: Metadata = pageMeta('/product', {
  title: 'How it works',
  description: 'Describe your business once. Harbor builds your website or app, writes your posts and shows you the money coming in, all from that one description.',
});

const VERBS = ['Describe', 'Build', 'Market', 'Get paid'];
const STEPS: { title: string; body: ReactNode; points: string[]; window: string; preview: ReactNode }[] = [
  {
    title: 'Start by telling Harbor about your business.',
    body: <p>What you sell, who buys it, what it costs and how it looks. A few plain questions, once. Everything after this already knows it.</p>,
    points: ['Your offer, prices and customers', 'Your colours, fonts and style', 'Change it any time, and everything follows'],
    window: 'Tidewater Coffee', preview: <BusinessFactsPreview />,
  },
  {
    title: 'Get your website, or build the app.',
    body: <p>A website written for you with three designs to pick from, or an app your customers sign in to, built from a plain description. Start with one; add the other when you need it.</p>,
    points: ['Websites with a contact form, live in minutes', 'Apps with accounts, a database and payments', 'Every version kept'],
    window: 'Tidewater Coffee · Subscription orders', preview: <AppBuilderPreview />,
  },
  {
    title: 'Tell people about it.',
    body: <p>Ask for this week’s posts and pick the ones you like. They’re written about what you actually sell, with pictures in your colours, for Instagram, LinkedIn, X and Threads.</p>,
    points: ['Several options to pick from', 'Pictures sized for each platform', 'Schedule the week in one go'],
    window: 'Market · This week', preview: <PostPickerPreview />,
  },
  {
    title: 'See the money come in.',
    body: <p>Your Stripe sales arrive on their own; add cash and costs in seconds. See the month, the trend and whether this was a good week, without a spreadsheet.</p>,
    points: ['Money in and money out', 'This week against your usual week', 'Right next to your marketing'],
    window: 'Money · November', preview: <MoneyMonthPreview />,
  },
];

export default function ProductPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From one description to a business that pays."
        lede="Describe your business once. Harbor builds your website or app, writes your posts, and shows you the money coming in, all from that one description."
        actions={<><Link className="btn primary" href={SITE.start}>Get early access</Link><Link className="btn" href="/pricing">See pricing</Link></>}
      >
        <nav className="pp-strip" aria-label="The four parts of Harbor">
          {FEATURES.map((f, i) => (
            <Link key={f.slug} href={f.href} className={`c-${f.color}`}>
              <span className="mono small ink-c">{String(i + 1).padStart(2, '0')}</span>
              <span className="pp-verb">{VERBS[i]}</span>
              <strong><span className="swatch" style={{ marginRight: 10 }} />{f.name}</strong>
              <span className="muted small">{f.short}</span>
              <span className="link-arrow" style={{ marginTop: 'auto' }}>Explore →</span>
            </Link>
          ))}
        </nav>
      </PageHero>

      {FEATURES.map((f, i) => (
        <FeatureSection
          key={f.slug}
          id={f.slug}
          n={i + 1}
          f={f}
          flip={i % 2 === 1}
          eyebrow={`${VERBS[i]} · ${f.name}`}
          title={STEPS[i]!.title}
          body={STEPS[i]!.body}
          points={STEPS[i]!.points}
          windowTitle={STEPS[i]!.window}
          preview={STEPS[i]!.preview}
          after={<Link className="link-arrow" href={f.href}>More on {f.name} →</Link>}
        />
      ))}

      <CtaBand />
    </>
  );
}
