import Link from 'next/link';
import { createBrand } from '../../actions';
import { getBrand, getChannels, getMode, loadAll, type BrandView, type Mode } from '../../api';
import { AudienceStep } from '../../components/audience-step';
import { MemoryPreview } from '../../components/memory-sections';
import { SandboxConnect } from '../../components/sandbox-connect';
import { VoiceLearner } from '../../components/voice-learner';
import { Flash, LoadError, PageHeader, PlatformTag } from '../../ui';
import type { Channel } from '@harbor/core';

export const dynamic = 'force-dynamic';

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'audience', label: 'Audience' },
  { key: 'voice', label: 'Voice' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'done', label: 'Done' },
] as const;
type Step = (typeof STEPS)[number]['key'];

export default async function NewBrandWizard({ searchParams }: { searchParams: Promise<{ step?: string; brandId?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const step: Step = s.brandId ? ((STEPS.find((x) => x.key === s.step)?.key ?? 'audience') as Step) : 'basics';
  const index = STEPS.findIndex((x) => x.key === step);
  const url = (k: Step) => `/brands/new?brandId=${s.brandId}&step=${k}`;

  let brand: BrandView | undefined;
  let channels: Channel[] = [];
  let mode: Mode | undefined;
  if (s.brandId) {
    const res = await loadAll<[BrandView, Channel[], Mode]>([getBrand(s.brandId), getChannels(s.brandId), getMode()]);
    if (!res.ok) return <LoadError message={res.error} />;
    [brand, channels, mode] = res.data;
  }
  const next = STEPS[index + 1];

  return (
    <>
      <PageHeader title={brand ? `Set up ${brand.name}` : 'Add a brand'} sub="Four short steps. Everything here can be edited later in Brand Memory." />
      <nav className="steps" aria-label="Setup steps">
        {STEPS.map((x, i) => (
          brand && i > 0 ? (
            <Link key={x.key} href={url(x.key)} className={`step${i < index ? ' done' : ''}`} aria-current={x.key === step ? 'step' : undefined}>{String(i + 1).padStart(2, '0')} {x.label}</Link>
          ) : (
            <span key={x.key} className={`step${i < index ? ' done' : ''}`} aria-current={x.key === step ? 'step' : undefined}>{String(i + 1).padStart(2, '0')} {x.label}</span>
          )
        ))}
      </nav>
      <Flash params={s} />

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
        <div className="stack-lg">
          {step === 'basics' ? (
            <form action={createBrand} className="card stack">
              <span className="label">01 · Basics</span>
              <h2 style={{ margin: 0 }}>What are you posting for?</h2>
              <p className="muted small">A product, a company or your own name. Each brand keeps its own voice, audiences and accounts.</p>
              <div className="field"><label htmlFor="name">Brand name</label><input id="name" name="name" required maxLength={200} placeholder="Harbor" autoFocus /></div>
              <div className="field"><label htmlFor="summary">What it is, in a sentence</label><input id="summary" name="summary" placeholder="The open-source content strategist for builders" /></div>
              <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="field"><label htmlFor="cta">Main call to action</label><input id="cta" name="cta" placeholder="Join the waitlist" /></div>
                <div className="field"><label htmlFor="url">Link</label><input id="url" name="url" type="url" placeholder="https://…" /></div>
              </div>
              <div><button className="primary" type="submit">Continue</button></div>
            </form>
          ) : null}

          {brand && step === 'audience' ? <AudienceStep brandId={brand.id} returnTo={url('audience')} existing={brand.memory.audiences} /> : null}

          {brand && step === 'voice' ? (
            <div className="stack-lg">
              <div className="stack" style={{ gap: 6 }}>
                <h2 style={{ margin: 0 }}>How does {brand.name} sound?</h2>
                <p className="muted small">Pick a few posts that sound like {brand.name}. Harbor turns them into a voice (personality, values, do and avoid rules) and keeps refining it from what actually performs once you're posting.</p>
              </div>
              <VoiceLearner brandId={brand.id} returnTo={url('voice')} savedExampleChars={brand.memory.examplePosts.reduce((n, e) => n + e.text.length, 0)} skipHref={url('accounts')} importHref={url('accounts')} />
            </div>
          ) : null}

          {brand && step === 'accounts' ? (
            <div className="stack-lg">
              <div className="stack" style={{ gap: 6 }}>
                <h2 style={{ margin: 0 }}>Connect {brand.name}'s accounts</h2>
                <p className="muted small">
                  {mode?.publish === 'sandbox'
                    ? 'Sandbox mode: these are practice accounts. Posts are recorded and measured with simulated numbers, never sent.'
                    : 'Live mode: you\'ll sign in on each platform.'}
                </p>
              </div>
              {channels.length ? (
                <section><ul className="list">{channels.map((c) => <li key={c.id}><span className="row"><PlatformTag platform={c.platform} handle={c.account.handle} /><span className={`pill s-${c.status}`}>{c.status.replace('_', ' ')}</span></span></li>)}</ul></section>
              ) : null}
              {mode?.publish === 'sandbox' ? <SandboxConnect brandId={brand.id} returnTo={url('accounts')} /> : (
                <p><Link className="button" href={`/brands/${brand.id}/channels`}>Open channels</Link></p>
              )}
            </div>
          ) : null}

          {brand && step === 'done' ? (
            <div className="empty" style={{ padding: 32 }}>
              <span className="label">Ready</span>
              <h2 style={{ margin: 0 }}>{brand.name} is set up.</h2>
              <p className="muted">Next: let Harbor suggest ideas, or write the first post yourself.</p>
              <div className="row">
                <Link className="button primary" href={`/hub?brand=${brand.id}`}>Get ideas in the hub</Link>
                <Link className="button" href={`/compose?brandId=${brand.id}`}>Write a post</Link>
                <Link className="button" href={`/brands/${brand.id}/memory`}>Open Brand Memory</Link>
              </div>
            </div>
          ) : null}

          {brand && next && step !== 'done' ? (
            <div className="spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <span className="dim small">Everything here can be changed later in Brand Memory.</span>
              <span className="row" style={{ gap: 6 }}>
                <Link className="button" href={url(next.key)}>Skip this step</Link>
                <Link className="button inverse" href={url(next.key)}>{next.key === 'done' ? 'Finish' : `Next: ${next.label}`} →</Link>
              </span>
            </div>
          ) : null}
        </div>

        {brand ? <MemoryPreview brand={brand} title="Live preview" focus={step === 'audience' ? 'audiences' : step === 'voice' ? 'voice' : undefined} /> : (
          <aside className="preview-card dots">
            <span className="label">Live preview</span>
            <p className="muted small">As you add the audience, voice and accounts, this card fills in with what Harbor knows about the brand.</p>
          </aside>
        )}
      </div>
    </>
  );
}
