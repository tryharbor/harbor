import type { Metadata } from 'next';
import { AlsoInArea, FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { BrandsOverviewPreview } from '../../../components/previews/brands-overview';
import { CheckpointCurvePreview } from '../../../components/previews/checkpoints';
import { DigestPreview } from '../../../components/previews/digest';
import { HeatmapPreview } from '../../../components/previews/heatmap';
import { ReplyThemesPreview } from '../../../components/previews/reply-themes';
import { VerdictsPreview } from '../../../components/previews/verdicts';
import { CtaBand } from '../../../components/ui';
import '../product.css';

export const metadata: Metadata = {
  title: 'Insights',
  description: 'Growth curves at 1h, 6h, 24h, 3 days and 7 days against the brand’s own median, clear verdicts, a weekly digest that cites its posts, best times per brand and themes from replies.',
};

const f = feature('insights');

export default function InsightsPage() {
  return (
    <>
      <FeatureHero
        f={f}
        title="Every post, against your own median."
        lede="Harbor measures each post at five ages and compares it with the brand’s median on the same platform at the same age. The weekly digest turns that into what to do next, citing the posts."
        windowTitle="Insights"
      >
        <BrandsOverviewPreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'curves', label: 'Growth curves' },
        { id: 'verdicts', label: 'Verdicts' },
        { id: 'digest', label: 'Weekly digest' },
        { id: 'best-times', label: 'Best times' },
        { id: 'replies', label: 'Reply themes' },
      ]} />

      <FeatureSection
        id="curves" n={1} f={f}
        eyebrow="Growth curves"
        title="Five checkpoints, one fair comparison."
        body={<p>A post’s views at 24 hours mean little on their own. Harbor snapshots every post at 1h, 6h, 24h, 3 days and 7 days, and draws its curve against the median of the brand’s other posts on that platform at the same age.</p>}
        points={['Each brand and platform keeps its own baseline', 'Every snapshot is kept, metric by metric', 'Imported posts join in at their true age']}
        windowTitle="Performance · Growth curve"
        preview={<CheckpointCurvePreview />}
        after={<span className="label">Pick a checkpoint to compare</span>}
      />

      <FeatureSection
        id="verdicts" n={2} f={f} flip
        eyebrow="Verdicts"
        title="A verdict you can act on."
        body={<p>At 1.3× the median or more, a post outperformed. Under 0.7×, it underperformed. In between, it met the brand’s usual. With fewer than 3 comparable posts, Harbor says inconclusive instead of guessing.</p>}
        points={['A first outperform can start an automation', 'Verdicts feed the voice refresh and the digest', 'LinkedIn shows metrics as unavailable until partner access, never estimated']}
        windowTitle="Performance · Verdicts"
        preview={<VerdictsPreview />}
      />

      <FeatureSection
        id="digest" n={3} f={f}
        eyebrow="Weekly digest"
        title="A digest that says what to do next."
        body={<p>Once a week, or whenever you ask, Harbor reads every post’s curve and writes what worked, what didn’t, the patterns, and what to do next. Each finding carries a confidence and cites the posts behind it. The weekly plan reads it before suggesting anything.</p>}
        points={['Run it by hand or on a schedule', 'Every finding links to its posts', 'The weekly plan reuses a digest under 24 hours old']}
        windowTitle="Insights · Weekly digest"
        preview={<DigestPreview />}
      />

      <FeatureSection
        id="best-times" n={4} f={f} flip
        eyebrow="Best times"
        title="Best times, from your own posts."
        body={<p>A 7 × 24 grid per brand, in one hue: darker is better. Scores come from the brand’s own posts, blended with platform norms until there’s enough history. The top 5 are outlined, and each cell shows its score and what it’s based on.</p>}
        points={['Every brand has its own map', 'The same scores shade the calendar', 'Agents use them to propose slots']}
        windowTitle="Insights · Best times"
        preview={<HeatmapPreview />}
        after={<span className="label">Hover or tap a cell</span>}
      />

      <FeatureSection
        id="replies" n={5} f={f}
        eyebrow="Reply themes"
        title="What people keep saying."
        body={<p>Harbor reads replies 24 hours and 3 days after each post and groups them by kind (questions, objections, praise and requests) and by what they have in common. Each theme becomes a signal that ideas and the weekly plan can cite, and any theme can be saved to Brand Memory.</p>}
        points={['Instagram and Threads replies, plus X when paid reads are on', 'LinkedIn’s API doesn’t allow reading replies yet', 'Each theme counts its replies and the posts they came from']}
        windowTitle="Insights · Conversation"
        preview={<ReplyThemesPreview />}
      />

      <AlsoInArea f={f} items={[
        { title: 'Across your brands', body: 'One table: posts published, median at 24h, change on last week, and how many beat or missed the median.' },
        { title: 'Repurpose this winner', body: 'An outperforming post offers to run the repurpose agent for your other platforms.', href: '/product/agents' },
        { title: 'Save what worked', body: 'Save a post as an example or a rule, or an underperformer as an avoid rule.', href: '/product/brand-memory#save' },
        { title: 'Per-post detail', body: 'Every snapshot in a table, the replies, and a clear answer to “did it go out?”.', href: '/product/publishing#safe' },
      ]} />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
