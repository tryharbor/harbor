import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CodeBlock } from '../../../components/code-block';
import { Answer, Faq, Related } from '../../../components/guide';
import { AgentRunPreview } from '../../../components/previews/agent-run';
import { ApprovalsPreview } from '../../../components/previews/approvals';
import { BrandsOverviewPreview } from '../../../components/previews/brands-overview';
import { CalendarPreview } from '../../../components/previews/calendar';
import { CheckpointCurvePreview } from '../../../components/previews/checkpoints';
import { DigestPreview } from '../../../components/previews/digest';
import { McpPreview } from '../../../components/previews/mcp';
import { MemoryOverviewPreview } from '../../../components/previews/memory-overview';
import { PlatformRulesPreview } from '../../../components/previews/platform-rules';
import { PublishQueuePreview } from '../../../components/previews/publish-queue';
import { SafePublishPreview } from '../../../components/previews/safe-publish';
import { VoiceMixerPreview } from '../../../components/previews/voice-mixer';
import { Reveal } from '../../../components/reveal';
import { CtaBand, PageHero, SectionHead, Window } from '../../../components/ui';
import { JsonLd, breadcrumbs, faqPage } from '../../../lib/jsonld';
import { pageMeta } from '../../../lib/seo';
import { SITE } from '../../../lib/site';
import { USE_CASES, useCase, type PreviewKey } from '../../../lib/use-cases';
import '../../product/product.css';
import '../../guide.css';

export const dynamicParams = false;
export const generateStaticParams = () => USE_CASES.map((u) => ({ slug: u.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const u = useCase((await params).slug);
  return u ? pageMeta(`/use-cases/${u.slug}`, { title: u.metaTitle, description: u.description }) : { title: 'Not found' };
}

const PREVIEWS: Record<PreviewKey, () => ReactNode> = {
  'brands-overview': () => <BrandsOverviewPreview />,
  'memory-overview': () => <MemoryOverviewPreview />,
  approvals: () => <ApprovalsPreview />,
  calendar: () => <CalendarPreview />,
  mcp: () => <McpPreview />,
  'agent-run': () => <AgentRunPreview />,
  'safe-publish': () => <SafePublishPreview />,
  'publish-queue': () => <PublishQueuePreview />,
  'checkpoint-curve': () => <CheckpointCurvePreview />,
  digest: () => <DigestPreview />,
  'voice-mixer': () => <VoiceMixerPreview />,
  'platform-rules': () => <PlatformRulesPreview />,
};

export default async function UseCasePage({ params }: { params: Promise<{ slug: string }> }) {
  const u = useCase((await params).slug);
  if (!u) notFound();
  return (
    <>
      <JsonLd data={[faqPage(u.faq), breadcrumbs([['Use cases', '/use-cases'], [u.label, `/use-cases/${u.slug}`]])]} />
      <PageHero
        eyebrow={u.eyebrow}
        title={u.title}
        actions={<><Link className="btn primary" href={SITE.start}>Get started</Link><Link className="btn" href="/product">How Harbor works</Link></>}
      />
      <section className="container" style={{ marginTop: -24 }}>
        <Answer>{u.answer}</Answer>
      </section>

      <section className="section tight">
        <div className="container split" style={{ alignItems: 'start' }}>
          <SectionHead eyebrow="The problem" title={u.problem.title} />
          <Reveal delay={80}>
            <ul className="check-list" style={{ fontSize: 17 }}>{u.problem.points.map((p) => <li key={p}>{p}</li>)}</ul>
          </Reveal>
        </div>
      </section>

      {u.steps.map((s, i) => (
        <section key={s.title} className="section tight rule">
          <div className={`container split${i % 2 ? ' flip' : ''}`}>
            <Reveal>
              <div className="stack" style={{ gap: 16 }}>
                <span className="eyebrow"><span className="mono">{String(i + 1).padStart(2, '0')}</span>How Harbor handles it</span>
                <h2 className="h2" style={{ fontSize: 'clamp(28px, 3.6vw, 44px)' }}>{s.title}</h2>
                <p className="lede" style={{ margin: 0 }}>{s.body}</p>
              </div>
            </Reveal>
            <Reveal delay={100}><Window title={s.window}>{PREVIEWS[s.preview]()}</Window></Reveal>
          </div>
        </section>
      ))}

      <section className="section rule">
        <div className="container split" style={{ alignItems: 'start' }}>
          <SectionHead eyebrow="Step by step" title={u.workflow.title} />
          <Reveal delay={80}>
            <div className="stack" style={{ gap: 20 }}>
              <ol className="guide-steps">{u.workflow.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {u.code ? <CodeBlock title={u.code.title} code={u.code.lines} /> : null}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section rule">
        <div className="container split" style={{ alignItems: 'start' }}>
          <SectionHead eyebrow="FAQ" title="Questions people ask." />
          <Reveal delay={80}><Faq items={u.faq} name={`faq-${u.slug}`} /></Reveal>
        </div>
        <div className="container" style={{ marginTop: 48 }}><Related items={u.related} /></div>
      </section>

      <CtaBand />
    </>
  );
}
