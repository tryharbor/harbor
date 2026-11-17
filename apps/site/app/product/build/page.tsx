import type { Metadata } from 'next';
import { FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { AppBasicsPreview, AppBuilderPreview, SitePickerPreview, VersionsPreview } from '../../../components/previews/os';
import { CtaBand } from '../../../components/ui';
import '../product.css';
import { pageMeta } from '../../../lib/seo';

export const metadata: Metadata = pageMeta('/product/build', {
  title: "Build",
  description: "Get a website that gets you booked, or build the app your customers sign in to, by describing it in plain words. Accounts, a database and payments come built in.",
});

const f = feature('build');

export default function BuildPage() {
  return (
    <>
      <FeatureHero f={f} title="Your website, or the product itself." lede="Get a website that gets you booked, or describe the app your business needs and watch it come together. No code, and it’s yours to keep." windowTitle="Tidewater Coffee · Subscription orders">
        <AppBuilderPreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'website', label: "Website" },
        { id: 'apps', label: "Apps" },
        { id: 'versions', label: "Every version" },
      ]} />

      <FeatureSection
        id="website" n={1} f={f}
        eyebrow="Website"
        title="Get online and get booked."
        body={<><p>Harbor writes your website from your business and gives you three designs to pick from. Change any word, press Publish, and you’re live, with a contact form that sends every enquiry straight to you.</p></>}
        points={["Three designs in your colours", "Edit the words yourself, any time", "Messages from your contact form in one place"]}
        windowTitle="Website · Pick a design"
        preview={<SitePickerPreview />}
      />
      <FeatureSection
        id="apps" n={2} f={f} flip
        eyebrow="Apps"
        title="When the product is software, build that too."
        body={<><p>A members area, a client portal, an order page, a booking tool. Describe it the way you’d explain it to a friend, and see it working as you go. Ask for the next thing whenever you’re ready.</p></>}
        points={["Customer accounts and sign-in", "A database for orders, members and bookings", "Payments through your own Stripe account"]}
        windowTitle="Every new app"
        preview={<AppBasicsPreview />}
      />
      <FeatureSection
        id="versions" n={3} f={f}
        eyebrow="Every version"
        title="Try anything. Go back any time."
        body={<><p>Every change is kept. If you don’t like where something went, go back to any earlier version in one click, and keep going from there.</p></>}
        windowTitle="Versions"
        preview={<VersionsPreview />}
      />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
