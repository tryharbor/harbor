import type { Metadata } from 'next';
import { AlsoInArea, FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { FocalCropsPreview } from '../../../components/previews/focal-crops';
import { PlatformRulesPreview } from '../../../components/previews/platform-rules';
import { PublishQueuePreview } from '../../../components/previews/publish-queue';
import { RescheduleCalendarPreview } from '../../../components/previews/reschedule';
import { SafePublishPreview } from '../../../components/previews/safe-publish';
import { ThreadCarouselPreview } from '../../../components/previews/thread-carousel';
import { CtaBand } from '../../../components/ui';
import '../product.css';

export const metadata: Metadata = {
  title: 'Publishing',
  description: 'Publish directly to X, LinkedIn, Instagram and Threads with each platform’s rules, threads and carousels, a best-times calendar, focal-point crops and a sandbox mode. Harbor never retries a post it can’t confirm.',
};

const f = feature('publishing');

export default function PublishingPage() {
  return (
    <>
      <FeatureHero
        f={f}
        title="Straight to the platforms, at the hours that work."
        lede="Harbor publishes to X, LinkedIn, Instagram and Threads through each platform’s own API, with no middleman. It knows each one’s rules, picks the right crop, and never guesses about a post it can’t confirm."
        windowTitle="Hub · Publishing"
      >
        <PublishQueuePreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'rules', label: 'Platform rules' },
        { id: 'threads', label: 'Threads and carousels' },
        { id: 'calendar', label: 'Best-times calendar' },
        { id: 'media', label: 'Media and crops' },
        { id: 'safe', label: 'Sandbox and safety' },
      ]} />

      <FeatureSection
        id="rules" n={1} f={f}
        eyebrow="Direct publishing"
        title="Four platforms, four rulebooks."
        body={<p>Harbor talks to each platform directly, through your own developer apps, and checks every draft against that platform’s rules before sending: text limits, how many images, whether video works, which aspect ratios are allowed. A failed check blocks publishing on that platform. A warning is advice.</p>}
        points={['Your own developer apps, with tokens encrypted at rest', 'Instagram needs media: JPEG, between 4:5 and 1.91:1', 'LinkedIn posts publish now; their metrics wait on LinkedIn partner access']}
        windowTitle="Voice check · Platform rules"
        preview={<PlatformRulesPreview />}
        after={<span className="label">Toggle the image to see Instagram’s check fail</span>}
      />

      <FeatureSection
        id="threads" n={2} f={f} flip
        eyebrow="Threads and carousels"
        title="Threads and carousels, the native way."
        body={<p>A thread on X or Threads goes out part by part, each one a reply to the last, with a count per part. On LinkedIn, extra parts are posted as comments under the post. Instagram and Threads carousels take up to 10 images, and one video on Instagram goes out as a Reel.</p>}
        points={['Per-part character counts while you write', 'Each carousel image uses the platform’s preferred crop', 'Instagram and Threads posts finish once the platform has processed them']}
        windowTitle="Studio · Preview"
        preview={<ThreadCarouselPreview />}
      />

      <FeatureSection
        id="calendar" n={3} f={f}
        eyebrow="Best-times calendar"
        title="A calendar shaded by what works."
        body={<p>The calendar shades each hour by how this brand’s posts do then, from its own history blended with platform norms. Scheduled posts drag to a new slot and save right away. Agents pick slots the same way: the best open hour on that channel, kept 3 hours clear of other posts and pending approvals.</p>}
        points={['One hue: darker is better', 'Scheduled posts move; published ones stay put', 'Each brand has its own best times']}
        windowTitle="Hub · Calendar"
        preview={<RescheduleCalendarPreview />}
        after={<span className="label">Drag a post to another hour</span>}
      />

      <FeatureSection
        id="media" n={4} f={f} flip
        eyebrow="Media library"
        title="Set the focal point once. Every crop follows."
        body={<p>Upload to the brand’s media library, click the part of the image that must stay in frame, and Harbor cuts each platform’s crop around it: 4:5, 1:1, 16:9, 1.91:1 and 9:16. Harbor hosts the files itself, so Instagram and Threads can fetch them from a public URL.</p>}
        points={['The same file uploaded twice is stored once', 'Alt text and tags, searchable', 'A file a scheduled post uses can’t be deleted']}
        windowTitle="Media · Focal point"
        preview={<FocalCropsPreview />}
      />

      <FeatureSection
        id="safe" n={5} f={f}
        eyebrow="Sandbox and safety"
        title="Safe to try. Safe to send."
        body={
          <>
            <p>Sandbox mode publishes to practice accounts: no OAuth, no network, the real platform’s length and media rules, and simulated metrics. You can run the whole loop for free.</p>
            <p>When Harbor sends a post but can’t confirm it landed, it never retries on its own. It asks you, so you never get a double post.</p>
          </>
        }
        points={['Sandbox and simulated output are always labeled', 'Rate limits retry with a backoff, since nothing went out', 'Post now asks you to confirm before it sends']}
        windowTitle="Performance · Did it go out?"
        preview={<SafePublishPreview />}
      />

      <AlsoInArea f={f} items={[
        { title: 'Snapshots from the first hour', body: 'Every published post is measured at 1h, 6h, 24h, 3 days and 7 days.', href: '/product/insights' },
        { title: 'Approvals first', body: 'Anything an agent drafted is scheduled only when a person approves it.', href: '/product/agents#approvals' },
        { title: 'Your own apps', body: 'Self-hosters register their own platform apps. Meta needs an HTTPS redirect, so local setups use a tunnel.', href: '/open-source' },
        { title: 'Not yet', body: 'Video on LinkedIn. Reading replies and past posts on LinkedIn, which its API restricts.' },
      ]} />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
