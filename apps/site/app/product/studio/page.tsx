import type { Metadata } from 'next';
import { AlsoInArea, FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { CanvasPreview } from '../../../components/previews/canvas';
import { IdeasSignalsPreview } from '../../../components/previews/ideas-signals';
import { PlatformEditorPreview } from '../../../components/previews/platform-editor';
import { RewritesPreview } from '../../../components/previews/rewrites';
import { StudioIdeaPreview } from '../../../components/previews/studio-idea';
import { CtaBand } from '../../../components/ui';
import '../product.css';
import { pageMeta } from '../../../lib/seo';

export const metadata: Metadata = pageMeta('/product/studio', {
  title: 'Studio & Canvas',
  description: 'Draft one idea for X, LinkedIn, Instagram and Threads at once, with live platform previews and character limits. Rewrites, versions, ideas that cite their signals, and a canvas per campaign.',
});

const f = feature('studio');

export default function StudioPage() {
  return (
    <>
      <FeatureHero
        f={f}
        title="One idea, every platform, in its own shape."
        lede="Studio drafts an idea for X, LinkedIn, Instagram and Threads at once, in the brand’s voice and inside each platform’s limits. Campaigns get a canvas where evidence, ideas and drafts sit side by side."
        windowTitle="Studio · Ship small"
      >
        <StudioIdeaPreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'ideas', label: 'Ideas with reasons' },
        { id: 'drafting', label: 'Per-platform drafts' },
        { id: 'rewrites', label: 'Rewrites and versions' },
        { id: 'canvas', label: 'Campaign canvas' },
      ]} />

      <FeatureSection
        id="ideas" n={1} f={f}
        eyebrow="Ideas"
        title="Ideas that show their reasons."
        body={<p>Harbor suggests ideas from signals: how past posts performed, themes in replies, competitor posts and trends. Each suggested idea cites the signals behind it, so you can see why it’s on the list before you spend time on it.</p>}
        points={['Reply themes become signals on their own', 'Add your own ideas too, with an optional angle', 'Ideas move along the pipeline: idea, drafting, approved, scheduled, live']}
        windowTitle="Hub · Ideas"
        preview={<IdeasSignalsPreview />}
      />

      <FeatureSection
        id="drafting" n={2} f={f} flip
        eyebrow="Per-platform drafts"
        title="Write once. See it the way each platform shows it."
        body={<p>Each platform gets its own pane: an editor, a live preview in that platform’s layout, and a counter against its limit: 280 on X, 3,000 on LinkedIn, 2,200 on Instagram, 500 on Threads. On X and Threads, a line of three dashes starts the next post in the thread.</p>}
        points={['LinkedIn previews cut at “see more”, so you see the fold', 'Instagram asks for an image or video first', 'Post now asks once more before it sends']}
        windowTitle="Studio · Draft pane"
        preview={<PlatformEditorPreview />}
        after={<span className="label">Type in the editor: the preview and counts follow</span>}
      />

      <FeatureSection
        id="rewrites" n={3} f={f}
        eyebrow="Rewrites and versions"
        title="Another take, one click away."
        body={<p>Ask for hook variations, a shorter version, a punchier one or a more specific one. Variations come back beside the editor: use one, tweak it, and save it as a new version. Every version is kept, by Harbor or by you, and any of them loads back in one click.</p>}
        points={['Hook variations change only the opener of a thread', 'Versions are numbered and say who wrote them', 'Nothing is saved until you choose to']}
        windowTitle="Studio · Rewrite"
        preview={<RewritesPreview />}
      />

      <FeatureSection
        id="canvas" n={4} f={f} wide
        eyebrow="Campaign canvas"
        title="A canvas for every campaign."
        body={<p>Lay a campaign out on a board: frames for evidence, ideas and drafts, and cards for ideas, drafts, posts, notes and signals. Connect a post, a signal or a note to an idea and the agent drafts with them as context. The agent panel also suggests ideas into a frame and brings in top posts and signals.</p>}
        points={['The same campaign as a board or a table', 'Pull ideas, posts and signals in from the library', 'The weekly plan can fill a campaign’s frames for you']}
        windowTitle="Campaign · October launch"
        preview={<CanvasPreview />}
      />

      <AlsoInArea f={f} items={[
        { title: 'Context you can see', body: 'Before drafting, chips show what the agent will use: voice, audiences, products, style rules and cited signals.' },
        { title: 'Media from the library', body: 'Attach an image or video and Studio picks the crop each platform prefers.', href: '/product/publishing#media' },
        { title: 'Post now or schedule', body: 'From the pane, with posts already made from this idea listed so nothing goes out twice.' },
        { title: 'Labeled when simulated', body: 'Drafts from the built-in model carry a Simulated tag, everywhere they appear.' },
        { title: 'Voice check', body: 'The weekly plan and repurpose runs check each draft against the brand voice and the platform’s rules.', href: '/product/agents' },
      ]} />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
