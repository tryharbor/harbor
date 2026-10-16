import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '../../components/reveal';
import { CtaBand, PageHero } from '../../components/ui';
import { formatDate } from '../../lib/blog';
import { SITE } from '../../lib/site';
import './changelog.css';
import { pageMeta } from '../../lib/seo';

export const metadata: Metadata = pageMeta('/changelog', {
  title: 'Changelog',
  description: 'What’s new in Harbor: onboarding, the media library, Brand Memory that learns, agents and the MCP server, insights, the campaign canvas, Studio and direct publishing.',
  alternates: { canonical: '/changelog' },
});

type Entry = { id: string; date: string; title: string; color: 'pink' | 'violet' | 'coral' | 'amber' | 'yellow'; summary: string; notes: string[]; link?: { href: string; label: string } };

/** From the repo's milestones (git log), newest first, written for people using Harbor. */
const ENTRIES: Entry[] = [
  {
    id: 'onboarding',
    date: '2026-10-16',
    title: 'A friendlier first brand',
    color: 'pink',
    summary: 'Setting up a brand is shorter, and it’s easier to get a voice that sounds right before you’ve posted anything.',
    notes: [
      'Start a voice by picking sample posts that sound like your brand, from six personalities, or paste or import your own. About two posts is now enough to learn from, and a strength meter shows how much more would help.',
      'The voice mixer: five dials (company to personal, calm to punchy, story-led to data-led, serious to playful, polished to candid). Each one adds a plain do or avoid rule, and a sample post rewrites itself as you move it. You can build a voice from the dials alone.',
      'Voices learned from samples keep the style but not the samples’ facts or recurring words.',
      'The audience step starts from examples: indie hackers, founders, small businesses, creators, developers, customers.',
      'Every step can be skipped, and the live preview highlights the step you’re on.',
      'A new brand overview: setup progress, posts published, median views, what’s waiting for approval, the next post, recent results, all four accounts, the latest digest and ideas.',
      'In the Studio, Post now and Schedule are separate buttons. Post now asks once to confirm, the result shows right in the pane, and posts already made from the idea are listed so nothing goes out twice.',
      'Post previews use the connected account’s own picture and name.',
      'Every dropdown is now Harbor’s own, with keyboard and typeahead support.',
    ],
  },
  {
    id: 'media-library',
    date: '2026-10-16',
    title: 'Media library',
    color: 'coral',
    summary: 'Every brand has its own library of images and video, with crops made for each platform.',
    notes: [
      'Upload by drag and drop or from a URL. Uploading the same file twice gives you the one you already have.',
      'Alt text, tags and a focal point per image, with live previews of each crop: 4:5, 1:1, 16:9, 1.91:1 and 9:16.',
      'Harbor serves the crops at public URLs, which is how Instagram and Threads fetch your media.',
      'Each platform’s media rules are checked before anything publishes, and the voice check flags a missing or poorly fitting image. Instagram approvals need an image before you can approve them.',
      'Pick media in the Studio editor or right on an approval card. The weekly plan attaches tagged images to Instagram drafts.',
      'The voice refresh now measures how images, carousels and video perform.',
      'Safer self-hosting: through a tunnel, the API only answers OAuth callbacks, media, the MCP server and health checks. Importing from a URL refuses private and internal addresses.',
    ],
  },
  {
    id: 'brand-memory-learns',
    date: '2026-10-15',
    title: 'Brand Memory that learns',
    color: 'pink',
    summary: 'Results now flow back into each brand’s voice, with the evidence attached and your approval required.',
    notes: [
      'The voice refresh agent compares posts that beat the brand’s median with the ones that didn’t, and proposes rule changes with their lift and the posts behind them. You review them in Approvals.',
      'Every learned or saved rule links to the posts and signals it came from.',
      'Save to Brand Memory from any post, reply or reply theme.',
      'Preview Brand Memory: the same brief drafted with and without memory, with the rules that fired.',
      'Replies are fetched at 24 hours and 3 days, sorted into questions, objections, praise and requests, and grouped into themes that feed new ideas. Threads and Instagram are supported; X is opt-in because X bills each read.',
      'Import a channel’s past posts: scan, uncheck what doesn’t belong, import. Imported posts count toward verdicts from day one.',
    ],
    link: { href: '/blog/learning-a-brands-voice-from-what-performed', label: 'How the voice refresh works' },
  },
  {
    id: 'agents-mcp',
    date: '2026-10-15',
    title: 'Agents, approvals and the MCP server',
    color: 'violet',
    summary: 'Agents plan and draft the week. Nothing they make goes out until a person approves it.',
    notes: [
      'An agent library: weekly plan, repurpose a winner, voice check and weekly digest, each with a step-by-step run log.',
      'Automations run an agent on a schedule or after a post is published or outperforms, with a daily cap. An automation that fails three times in a row pauses itself.',
      'The Approvals inbox: approve, edit, reschedule, reject or approve in bulk. Every proposal shows its voice checks and why it got its slot.',
      'API keys with read and write scopes, and an MCP server over Streamable HTTP with a Brand Memory resource, plus a stdio bridge for clients that need it. MCP can propose posts, never publish them.',
    ],
    link: { href: '/developers#mcp', label: 'MCP tools and setup' },
  },
  {
    id: 'insights',
    date: '2026-10-15',
    title: 'Insights engine',
    color: 'yellow',
    summary: 'Every post is judged against the brand’s own median at the same age, not against vanity totals.',
    notes: [
      'Verdicts per post: outperformed, met, underperformed, or inconclusive when there isn’t enough history yet.',
      'Each post’s growth curve is charted against the brand’s baseline curve, with a hover readout.',
      'Best posting times as a 7 × 24 heatmap, blending your own history with each platform’s typical peaks.',
      'A weekly digest per brand: wins, misses, patterns and recommendations, each citing the posts behind it.',
      'A cross-brand overview, and a week calendar in the Hub with best times shaded and drag to reschedule.',
    ],
  },
  {
    id: 'canvas',
    date: '2026-10-15',
    title: 'Campaign canvas',
    color: 'coral',
    summary: 'A board per campaign, for laying out ideas, drafts, results and notes in one place.',
    notes: [
      'Resizable, renamable frames, and cards for ideas, drafts, posts, signals and notes. Drag cards between frames and connect them.',
      'A docked agent panel: suggest ideas, draft the selected idea using the cards connected to it as context, pull in top posts and signals.',
      'A library drawer and a table view of the same cards.',
      'Platform and brand logos throughout, and a sidebar that collapses to icons.',
    ],
  },
  {
    id: 'studio',
    date: '2026-10-15',
    title: 'Studio and Brand Memory',
    color: 'pink',
    summary: 'A structured memory for each brand, and a Studio for drafting every platform at once. All of it runs free, with no keys.',
    notes: [
      'Sandbox mode and a simulated model are the default: every platform is simulated with its real limits, and nothing leaves your machine.',
      'Brand Memory: voice, audiences, products, knowledge, style rules and example posts, with a voice-learning agent.',
      'The Studio: one pane per platform with a live preview, rewrites, versions and scheduling.',
      'A new-brand wizard with a live preview of the memory as you fill it in, and idea suggestions in the Hub.',
      'A light theme by default with a dark toggle, square controls throughout.',
    ],
  },
  {
    id: 'platform',
    date: '2026-10-15',
    title: 'Direct publishing and the platform shell',
    color: 'amber',
    summary: 'The first version of Harbor: publish to X, LinkedIn, Instagram and Threads through their own APIs, and watch each post’s first week.',
    notes: [
      'Connect accounts on all four platforms through your own developer apps. Account tokens are encrypted at rest.',
      'Publish now or schedule, including threads. Metrics are read at 1 hour, 6 hours, 24 hours, 3 days and 7 days.',
      'If a publish can’t be confirmed, Harbor asks you to check instead of retrying, so nothing double-posts.',
      'The app shell: Home (what needs attention, what’s coming up, recent results), the Hub with board, table and calendar views of the pipeline, Performance, brand pages and a composer.',
      'A demo mode with sample brands and history, on its own database.',
    ],
    link: { href: '/open-source#guide', label: 'Self-host guide' },
  },
];

export default function ChangelogPage() {
  return (
    <>
      <PageHero
        eyebrow="Changelog"
        title="What’s new in Harbor."
        lede="Harbor is built in public. Here’s every milestone so far, newest first."
        actions={<a className="btn sm" href={`${SITE.github}/commits/main`}>Commits on GitHub</a>}
      />
      <section className="container" style={{ paddingBottom: 'clamp(48px, 7vw, 96px)' }}>
        <nav className="cl-index" aria-label="Milestones">
          {ENTRIES.map((e) => <a key={e.id} href={`#${e.id}`} className={`c-${e.color}`}><span className="swatch" />{e.title}</a>)}
        </nav>
        <ol className="cl-list">
          {ENTRIES.map((e, i) => (
            <li key={e.id} id={e.id} className={`cl-entry c-${e.color}`}>
              <Reveal className="cl-aside">
                <time dateTime={e.date} className="label">{formatDate(e.date)}</time>
                <span className="cl-num mono">{String(ENTRIES.length - i).padStart(2, '0')}</span>
              </Reveal>
              <div className="cl-body">
                <Reveal delay={60}>
                  <h2 className="h3 cl-title"><span className="swatch" aria-hidden="true" />{e.title}</h2>
                </Reveal>
                <Reveal delay={100}><p className="cl-summary">{e.summary}</p></Reveal>
                <Reveal delay={140}>
                  <ul className="check-list cl-notes">{e.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </Reveal>
                {e.link ? <Reveal delay={180}><Link className="link-arrow" href={e.link.href}>{e.link.label} →</Link></Reveal> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <CtaBand />
    </>
  );
}
