import type { Metadata } from 'next';
import { AlsoInArea, FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { MemoryComparePreview } from '../../../components/previews/memory-compare';
import { MemoryOverviewPreview } from '../../../components/previews/memory-overview';
import { PickPostsPreview } from '../../../components/previews/pick-posts';
import { SaveToMemoryPreview } from '../../../components/previews/save-memory';
import { VoiceMixerPreview } from '../../../components/previews/voice-mixer';
import { VoiceRefreshPreview } from '../../../components/previews/voice-refresh';
import { CtaBand } from '../../../components/ui';
import '../product.css';

export const metadata: Metadata = {
  title: 'Brand Memory',
  description: 'A memory per brand: voice, audiences, products, knowledge and style rules. Harbor learns it from posts you pick and refines it from what actually performed, with every rule linked to its evidence.',
};

const f = feature('brand-memory');

export default function BrandMemoryPage() {
  return (
    <>
      <FeatureHero
        f={f}
        title="Every brand remembers how it sounds."
        lede="Brand Memory holds each brand’s voice, audiences, products, knowledge and style rules. Every draft and every agent reads it, and it learns from what your posts actually did."
        windowTitle="Brand Memory · Harbor"
      >
        <MemoryOverviewPreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'pick', label: 'Pick posts' },
        { id: 'mixer', label: 'Voice mixer' },
        { id: 'results', label: 'Learned from results' },
        { id: 'preview', label: 'With and without' },
        { id: 'save', label: 'Save to memory' },
      ]} />

      <FeatureSection
        id="pick" n={1} f={f}
        eyebrow="Start in a minute"
        title="Pick posts that sound like you."
        body={<p>A voice guide from a blank page is slow. Tick a few sample posts that sound like the brand, two or three is enough, and Harbor proposes a voice: personality, values, do and avoid rules. Or paste your own posts, or import them from a connected account.</p>}
        points={['Six sample personalities, two posts each', 'A strength meter shows when there’s enough to learn from', 'Nothing is saved until you choose “Use this voice”']}
        windowTitle="Brand Memory · Learn the voice"
        preview={<PickPostsPreview />}
      />

      <FeatureSection
        id="mixer" n={2} f={f} flip
        eyebrow="Fine-tune"
        title="Dial the voice in, and read the result."
        body={<p>Five dials, each between two poles: company or personal, calm or punchy, story-led or data-led, serious or playful, polished or candid. A sample post on a fixed topic rewrites as you drag, so you hear the change before saving. Push a dial past a third of the way and it adds a plain rule.</p>}
        points={['The dials start from the posts you picked', 'Rules a dial now contradicts are dropped', 'Go on, drag one: it’s the app’s own logic']}
        windowTitle="Brand Memory · Voice mixer"
        preview={<VoiceMixerPreview />}
      />

      <FeatureSection
        id="results" n={3} f={f}
        eyebrow="Learned from results"
        title="Rules with receipts."
        body={
          <>
            <p>The voice refresh compares the brand’s posts that beat its median with the ones that didn’t, over the last 90 days. When something like opening with a number lifts results by 1.25× or more, with at least 3 posts on each side, it proposes a do rule. At 0.8× or below, an avoid rule.</p>
            <p>Rules your results contradict are proposed for removal. You approve changes the same way you approve posts.</p>
          </>
        }
        points={['Every change shows its lift and the posts behind it', 'Tick the ones to keep; unticked changes are rejected', 'Run it by hand or on a schedule, once 6 posts have a verdict']}
        windowTitle="Approvals · Brand Memory"
        preview={<VoiceRefreshPreview />}
      />

      <FeatureSection
        id="preview" n={4} f={f} flip
        eyebrow="Preview Brand Memory"
        title="See exactly what memory changes."
        body={<p>Write a one-line brief or pick an idea, choose a platform, and Harbor drafts it twice with the same model: once with the brand as it is, once with an empty memory. Words that only appear with memory are highlighted, and every rule that fired is listed with its evidence.</p>}
        points={['Do and avoid rules, banned words, terms, products and audiences', 'Each fired rule links to the posts that prove it', 'Nothing is saved; it’s one recorded run']}
        windowTitle="Brand Memory · Preview"
        preview={<MemoryComparePreview />}
      />

      <FeatureSection
        id="save" n={5} f={f}
        eyebrow="Save to Brand Memory"
        title="Keep the good stuff where you find it."
        body={<p>On any post, reply, reply theme, signal or draft, one action saves it to Brand Memory as a knowledge note, a verbatim excerpt, an example post, or a do or avoid rule. It stays linked to where it came from, so the rule carries its evidence.</p>}
        points={['A reply that asks a good question becomes knowledge', 'A post that nailed the tone becomes an example', 'Duplicates are refused, so memory stays tidy']}
        windowTitle="Performance · Replies"
        preview={<SaveToMemoryPreview />}
      />

      <AlsoInArea f={f} items={[
        { title: 'Audiences', body: 'Who they are, their pain points and their goals, so drafts speak to someone in particular.' },
        { title: 'Products', body: 'What each one is in a sentence, its call to action, a link and its proof points.' },
        { title: 'Style rules', body: 'Terms to use instead of others, and formatting rules like a hashtag cap.' },
        { title: 'Import past posts', body: 'Scan a connected Instagram or Threads account, untick what to skip, and a new brand has history on day one. X works when paid reads are on.' },
        { title: 'Competitors', body: 'Accounts to watch and what to watch them for.' },
        { title: 'For agents, too', body: 'MCP clients read it with get_brand_memory and add to it with add_knowledge and save_to_memory.', href: '/developers' },
      ]} />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
