import type { Metadata } from 'next';
import { FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { BrandKitPreview, BusinessFactsPreview, FromOnePlacePreview } from '../../../components/previews/os';
import { CtaBand } from '../../../components/ui';
import '../product.css';
import { pageMeta } from '../../../lib/seo';

export const metadata: Metadata = pageMeta('/product/business', {
  title: "Your business",
  description: "Describe your business once: what you sell, who buys it, what it costs and how it looks. Your website, app, posts and money all start from it.",
});

const f = feature('business');

export default function BusinessPage() {
  return (
    <>
      <FeatureHero f={f} title="Tell Harbor once. Never type it again." lede="What you sell, who buys it, what it costs and how it looks. Describe your business once, and your website, your app, your posts and your money all start from it." windowTitle="Tidewater Coffee">
        <BusinessFactsPreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'describe', label: "Describe it" },
        { id: 'look', label: "Your look" },
        { id: 'everywhere', label: "Everywhere" },
      ]} />

      <FeatureSection
        id="describe" n={1} f={f}
        eyebrow="Describe it"
        title="In your own words."
        body={<><p>Answer a few plain questions about your business, or paste what you already have. Harbor keeps it as the one place everything else reads from, so it’s always the same story everywhere.</p></>}
        points={["What you sell and what it costs", "Who your customers are and why they pick you", "Where you work, and what you’re aiming for"]}
        windowTitle="Your business"
        preview={<FromOnePlacePreview />}
      />
      <FeatureSection
        id="look" n={2} f={f} flip
        eyebrow="Your look"
        title="Your colours, everywhere."
        body={<><p>Pick your colours, fonts and style once. Your website, your app and the pictures on your posts all use them, so everything looks like it came from the same business.</p></>}
        points={["Colours with a role each: main, accent, background", "Fonts for headings and text", "How your pictures should feel"]}
        windowTitle="Branding"
        preview={<BrandKitPreview />}
      />
      <FeatureSection
        id="everywhere" n={3} f={f}
        eyebrow="Everywhere"
        title="Change it once. It changes everywhere."
        body={<><p>Raise your price or add a new product, and the next website edit, the next app build and the next post already know. No hunting through five tools to update the same line.</p></>}
        windowTitle="Your business"
        preview={<BusinessFactsPreview />}
      />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
