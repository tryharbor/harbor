import type { Metadata } from 'next';
import { FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { AssistantPreview, MoneyWeekPreview, PostImagePreview, PostPickerPreview } from '../../../components/previews/os';
import { CtaBand } from '../../../components/ui';
import '../product.css';
import { pageMeta } from '../../../lib/seo';

export const metadata: Metadata = pageMeta('/product/market', {
  title: "Market",
  description: "Ask for this week’s posts and pick the ones you like. Posts for Instagram, LinkedIn, X and Threads that already know your business, with pictures in your colours.",
});

const f = feature('market');

export default function MarketPage() {
  return (
    <>
      <FeatureHero f={f} title="Posts that already know your business." lede="Ask for this week’s posts and pick the ones you like. They know what you sell, who buys it and what it costs, so they sound like you from the first draft." windowTitle="Market · This week">
        <PostPickerPreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'ask', label: "Just ask" },
        { id: 'pictures', label: "Pictures" },
        { id: 'publish', label: "Publish" },
      ]} />

      <FeatureSection
        id="ask" n={1} f={f}
        eyebrow="Just ask"
        title="Ask the way you’d ask a person."
        body={<><p>“Three posts for the holiday gift box.” “Something for Monday about our new roast.” Harbor’s assistant comes back with options, and you pick, tweak or ask again.</p></>}
        points={["Several options every time", "Shorter, warmer or punchier on request", "Ideas for what to post next"]}
        windowTitle="Assistant"
        preview={<AssistantPreview />}
      />
      <FeatureSection
        id="pictures" n={2} f={f} flip
        eyebrow="Pictures"
        title="With a picture that fits."
        body={<><p>Every post can come with an image made in your colours and sized for each platform, so your feed looks like one business, not five different templates.</p></>}
        points={["Your colours and fonts", "Square, portrait or wide, per platform"]}
        windowTitle="Post · Picture"
        preview={<PostImagePreview />}
      />
      <FeatureSection
        id="publish" n={3} f={f}
        eyebrow="Publish"
        title="Out to every platform, on your schedule."
        body={<><p>Instagram, LinkedIn, X and Threads from one place. Pick a time or post now, and see which posts people actually responded to.</p></>}
        points={["Schedule a week at once", "See what worked, and do more of it"]}
        windowTitle="This week"
        preview={<MoneyWeekPreview />}
      />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
