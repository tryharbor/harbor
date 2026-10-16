import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FeatureSection } from '../../components/product/feature';
import { LoopDiagram } from '../../components/product/loop-diagram';
import { AgentRunPreview } from '../../components/previews/agent-run';
import { CalendarPreview } from '../../components/previews/calendar';
import { CurvePreview } from '../../components/previews/curve';
import { DraftsPreview } from '../../components/previews/drafts';
import { MemoryPreview } from '../../components/previews/memory';
import { Reveal } from '../../components/reveal';
import { CtaBand, PageHero, SectionHead } from '../../components/ui';
import { FEATURES, SITE } from '../../lib/site';
import './product.css';
import { pageMeta } from '../../lib/seo';

export const metadata: Metadata = pageMeta('/product', {
  title: 'Product',
  description: 'How Harbor works: Brand Memory, agents with approvals, a Studio and canvas, direct publishing and insights, in one loop where every post’s results shape the next plan.',
});

const VERBS = ['Remember', 'Plan', 'Draft', 'Publish', 'Learn'];
const STEPS: { title: string; body: ReactNode; points: string[]; window: string; preview: ReactNode }[] = [
  {
    title: 'Each brand keeps its own memory.',
    body: <p>Voice, audiences, products, knowledge and style rules, per brand. Start by picking sample posts that sound right, then let results refine it: the voice refresh proposes rules with the posts behind them, and you approve each change.</p>,
    points: ['Learned from posts you pick, paste or import', 'Every rule links to its evidence', 'Preview a draft with and without memory'],
    window: 'Brand Memory', preview: <MemoryPreview />,
  },
  {
    title: 'Agents plan the week. You approve it.',
    body: <p>The weekly plan reads last week’s digest, finds open best-time slots, suggests ideas, drafts them and checks each draft against the voice. What it makes waits in Approvals with the reason for every slot.</p>,
    points: ['Five built-in agents, every run logged', 'Automations on a schedule or on post events', 'Claude can work in Harbor over MCP'],
    window: 'Agents · Run log', preview: <AgentRunPreview />,
  },
  {
    title: 'One idea, drafted for every platform.',
    body: <p>Each platform gets a draft in its native shape and limits, with a live preview. Ask for rewrites, keep versions, and lay out a campaign on a canvas where connected cards become the agent’s context.</p>,
    points: ['Ideas cite the signals behind them', 'Threads, carousels and per-part counts', 'A board or table per campaign'],
    window: 'Studio', preview: <DraftsPreview />,
  },
  {
    title: 'Out at the hours that work.',
    body: <p>Direct to X, LinkedIn, Instagram and Threads through each platform’s API, checked against its rules and cropped from the media library. The calendar is shaded by this brand’s best times; drag a post to move it.</p>,
    points: ['Sandbox mode for free, labeled practice runs', 'Focal-point crops for every platform', 'Never retries a post it can’t confirm'],
    window: 'Hub · Calendar', preview: <CalendarPreview />,
  },
  {
    title: 'What worked, and why.',
    body: <p>Every post is measured at 1h, 6h, 24h, 3 days and 7 days against the brand’s own median at the same age. The weekly digest says what worked, what missed and what to do next, and feeds the next plan.</p>,
    points: ['Outperformed, met, underperformed or inconclusive', 'Best times as a 7 × 24 map per brand', 'Reply themes become signals for new ideas'],
    window: 'Performance', preview: <CurvePreview />,
  },
];
const RULES = [
  { title: 'Agents propose, people publish', body: 'No agent, automation or MCP client publishes or schedules. Everything goes through Approvals.' },
  { title: 'Every idea cites its reason', body: 'Suggested ideas link to the signals behind them: past posts, reply themes, competitors, trends.' },
  { title: 'Simulated is always labeled', body: 'Sandbox publishing and the built-in model are tagged wherever their output shows up.' },
  { title: 'Each brand is its own baseline', body: 'A win on one brand never skews another. Medians, best times and voice are all per brand.' },
];

export default function ProductPage() {
  return (
    <>
      <PageHero
        eyebrow="Product"
        title="One loop, five pieces."
        lede="Harbor remembers how each brand sounds, plans the week from what worked, drafts it for every platform, publishes at the right hours and learns from every post. Each piece feeds the next."
        actions={<><Link className="btn primary" href={SITE.start}>Get started</Link><a className="btn" href="#fit">How the pieces fit</a></>}
      >
        <nav className="pp-strip" aria-label="The five pieces">
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
          after={<Link className="link-arrow" href={f.href}>Explore {f.name} →</Link>}
        />
      ))}

      <section className="section rule" id="fit" style={{ scrollMarginTop: 60 }}>
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead
            eyebrow="How the pieces fit"
            title="Every result shapes the next plan."
            lede="Most tools stop once a post is out. In Harbor, what a post did flows back into the brand’s memory and the next week’s plan. Pick a stage to see what it reads and what it writes."
          />
          <Reveal><LoopDiagram /></Reveal>
        </div>
      </section>

      <section className="section tight rule">
        <div className="container stack" style={{ gap: 32 }}>
          <Reveal><span className="eyebrow"><span className="pixels" />Rules it keeps</span></Reveal>
          <div className="pp-rules">
            {RULES.map((r, i) => (
              <Reveal key={r.title} delay={i * 60}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <strong>{r.title}</strong>
                  <span className="muted small">{r.body}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
