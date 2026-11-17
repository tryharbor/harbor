import type { Metadata } from 'next';
import { FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { MoneyAddPreview, MoneyMonthPreview, MoneyWeekPreview } from '../../../components/previews/os';
import { CtaBand } from '../../../components/ui';
import '../product.css';
import { pageMeta } from '../../../lib/seo';

export const metadata: Metadata = pageMeta('/product/money', {
  title: "Money",
  description: "See what came in this month without a spreadsheet: Stripe sales come in on their own, add the rest by hand, and see it next to everything else.",
});

const f = feature('money');

export default function MoneyPage() {
  return (
    <>
      <FeatureHero f={f} title="See it pay." lede="What came in this month, what kind of week it was, and where it came from. Your Stripe sales arrive on their own; add anything else in a few seconds." windowTitle="Money · Tidewater Coffee">
        <MoneyMonthPreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'stripe', label: "From Stripe" },
        { id: 'by-hand', label: "By hand" },
        { id: 'week', label: "This week" },
      ]} />

      <FeatureSection
        id="stripe" n={1} f={f}
        eyebrow="From Stripe"
        title="Your sales, without the spreadsheet."
        body={<><p>Connect Stripe once and your sales come in on their own, every day. See the month, the trend, and money in next to money out.</p></>}
        points={["Month by month, at a glance", "Sorted into sales, subscriptions and services", "Harbor only reads: it never moves your money"]}
        windowTitle="Money · November"
        preview={<MoneyMonthPreview />}
      />
      <FeatureSection
        id="by-hand" n={2} f={f} flip
        eyebrow="By hand"
        title="Cash, markets and everything else."
        body={<><p>Sold a few bags at the market? Paid for a new grinder? Add it in seconds, so the numbers are the whole picture, not just the online part.</p></>}
        windowTitle="Add"
        preview={<MoneyAddPreview />}
      />
      <FeatureSection
        id="week" n={3} f={f}
        eyebrow="This week"
        title="Know if it was a good week."
        body={<><p>Harbor compares this week with your usual week, next to what you posted, so you can tell what’s working without doing the maths.</p></>}
        windowTitle="This week"
        preview={<MoneyWeekPreview />}
      />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
