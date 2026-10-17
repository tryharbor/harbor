import Link from 'next/link';
import { createBrand, createPerson } from '../../actions';
import { getBrand, getBrands, getChannels, getMode, getPlatforms, loadAll, type BrandView, type Mode, type PlatformInfo } from '../../api';
import { AudienceStep } from '../../components/audience-step';
import { MemoryPreview } from '../../components/memory-sections';
import { SandboxConnect } from '../../components/sandbox-connect';
import { VoiceLearner } from '../../components/voice-learner';
import { BrandMark, Flash, LoadError, PageHeader, PLATFORM_NAME, PlatformTag } from '../../ui';
import type { Channel } from '@harbor/core';

export const dynamic = 'force-dynamic';

const BRAND_STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'audience', label: 'Audience' },
  { key: 'voice', label: 'Voice' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'done', label: 'Done' },
] as const;
/** Your own account: connect first (it fills in your picture), then your voice from your own posts. */
const PERSON_STEPS = [
  { key: 'about', label: 'About you' },
  { key: 'connect', label: 'Connect' },
  { key: 'voice', label: 'Voice' },
  { key: 'done', label: 'Done' },
] as const;
type Step = (typeof BRAND_STEPS)[number]['key'] | (typeof PERSON_STEPS)[number]['key'];

/** Founders usually post on X and LinkedIn; those come first. */
const PERSON_PLATFORM_ORDER = ['x', 'linkedin', 'threads', 'instagram'];

export default async function NewBrandWizard({ searchParams }: { searchParams: Promise<{ step?: string; brandId?: string; kind?: string; redo?: string; notice?: string; error?: string; connected?: string }> }) {
  const s = await searchParams;

  let brand: BrandView | undefined;
  let channels: Channel[] = [];
  let mode: Mode | undefined;
  let all: BrandView[] = [];
  let platforms: PlatformInfo[] = [];
  const res = s.brandId
    ? await loadAll<[BrandView, Channel[], Mode, BrandView[], PlatformInfo[]]>([getBrand(s.brandId), getChannels(s.brandId), getMode(), getBrands(), getPlatforms()])
    : await loadAll<[BrandView[]]>([getBrands()]);
  if (!res.ok) return <LoadError message={res.error} />;
  if (s.brandId) [brand, channels, mode, all, platforms] = res.data as [BrandView, Channel[], Mode, BrandView[], PlatformInfo[]];
  else [all] = res.data as [BrandView[]];

  // Adding a brand is the default; your own account is an option offered on the brand form.
  const kind: 'brand' | 'person' = brand?.kind ?? (s.kind === 'person' ? 'person' : 'brand');
  const person = all.find((b) => b.kind === 'person');
  const brands = all.filter((b) => b.kind === 'brand');

  const steps = kind === 'person' ? PERSON_STEPS : BRAND_STEPS;
  const first = steps[0].key as Step;
  const step: Step = brand ? ((steps.find((x) => x.key === s.step)?.key ?? steps[1].key) as Step) : first;
  const index = steps.findIndex((x) => x.key === step);
  const url = (k: Step) => `/brands/new?brandId=${s.brandId}&${kind === 'person' ? 'kind=person&' : ''}step=${k}`;
  const next = steps[index + 1];
  const you = kind === 'person';
  const voiceSaved = !!brand?.memory.voice.summary && !s.redo;

  return (
    <>
      <PageHeader
        title={brand ? (you ? 'Set up your account' : `Set up ${brand.name}`) : you ? 'Add yourself' : 'Add a brand'}
        sub={you ? 'Three short steps. Your account speaks for you, about the brands you build.' : 'Four short steps. Everything here can be edited later in Brand Memory.'}
      />
      <nav className="steps" aria-label="Setup steps">
        {steps.map((x, i) => (
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
              <p className="muted small">A product or a company. Each brand keeps its own voice, audiences and accounts.</p>
              <div className="field"><label htmlFor="name">Brand name</label><input id="name" name="name" required maxLength={200} placeholder="Harbor" autoFocus /></div>
              <div className="field"><label htmlFor="summary">What it is, in a sentence</label><input id="summary" name="summary" placeholder="The open-source content strategist for builders" /></div>
              <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="field"><label htmlFor="cta">Main call to action</label><input id="cta" name="cta" placeholder="Join the waitlist" /></div>
                <div className="field"><label htmlFor="url">Link</label><input id="url" name="url" type="url" placeholder="https://…" /></div>
              </div>
              <div><button className="primary" type="submit">Continue</button></div>
              {person ? null : (
                <p className="small dim" style={{ margin: 0, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  Posting as yourself? <Link href="/brands/new?kind=person">Add your own founder account</Link> instead. Optional; your brands work without it.
                </p>
              )}
            </form>
          ) : null}

          {step === 'about' ? (
            person && !brand ? (
              <div className="empty" style={{ padding: 32 }}>
                <span className="label">Already added</span>
                <h2 style={{ margin: 0 }}>You have your own account: {person.name}.</h2>
                <p className="muted">There's one per workspace.</p>
                <p><Link className="button primary" href={`/brands/${person.id}`}>Open it</Link></p>
              </div>
            ) : (
              <form action={createPerson} className="card stack">
                <span className="label">01 · About you</span>
                <h2 style={{ margin: 0 }}>Your own account</h2>
                <p className="muted small">Harbor plans it like a person, not a company: first person, your opinions, what you're building. Your picture comes from the account you connect next.</p>
                <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" required maxLength={200} placeholder="Derek Koza" autoFocus /></div>
                <div className="field">
                  <label htmlFor="topics">What do you post about?</label>
                  <input id="topics" name="topics" placeholder="Building in public, pricing, open source, solo founder life" />
                  <span className="small dim">A few topics, separated by commas.</span>
                </div>
                {brands.length ? (
                  <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="small" style={{ marginBottom: 6 }}>Which of your brands do you post about?</legend>
                    <div className="chips">
                      {brands.map((b) => (
                        <label key={b.id} className="chip check-chip">
                          <input type="checkbox" name="speaksFor" value={b.id} defaultChecked={brands.length === 1} />
                          <BrandMark name={b.name} logoUrl={b.logoUrl} size={16} />{b.name}
                        </label>
                      ))}
                    </div>
                    <span className="small dim">Harbor suggests quoting their best posts with your take.</span>
                  </fieldset>
                ) : null}
                <div><button className="primary" type="submit">Continue</button></div>
              </form>
            )
          ) : null}

          {brand && step === 'audience' ? <AudienceStep brandId={brand.id} returnTo={url('audience')} existing={brand.memory.audiences} /> : null}

          {brand && step === 'connect' ? (
            <div className="stack-lg">
              <div className="stack" style={{ gap: 6 }}>
                <h2 style={{ margin: 0 }}>Connect your account</h2>
                <p className="muted small">
                  {mode?.publish === 'sandbox'
                    ? 'Sandbox mode: a practice account. Posts are recorded and measured with simulated numbers, never sent.'
                    : 'Optional. You\'ll sign in on the platform and come straight back here; your profile picture becomes your picture in Harbor. You can skip this and connect later.'}
                </p>
              </div>
              {channels.length ? (
                <section><ul className="list">{channels.map((c) => <li key={c.id}><span className="row"><PlatformTag platform={c.platform} handle={c.account.handle} /><span className={`pill s-${c.status}`}>{c.status.replace('_', ' ')}</span></span></li>)}</ul></section>
              ) : null}
              {mode?.publish === 'sandbox' ? <SandboxConnect brandId={brand.id} returnTo={url('connect')} preselect="x" /> : (
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {[...platforms].sort((a, b) => PERSON_PLATFORM_ORDER.indexOf(a.platform) - PERSON_PLATFORM_ORDER.indexOf(b.platform)).map((p, i) => (
                    <a key={p.platform} className={`button${i === 0 && !channels.length ? ' primary' : ''}`} href={`/connect/${p.platform}?${new URLSearchParams({ brandId: brand!.id, returnTo: url('connect') })}`}>
                      {channels.some((c) => c.platform === p.platform) ? `Connect another ${PLATFORM_NAME[p.platform]}` : `Connect ${PLATFORM_NAME[p.platform]}`}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {brand && step === 'voice' && voiceSaved ? (
            <section className="stack voice-saved reveal">
              <span className="label row" style={{ gap: 8 }}><span className="check ok" aria-hidden="true">✓</span>Voice saved</span>
              <h2 style={{ margin: 0 }}>{you ? 'This is how you sound' : `This is how ${brand.name} sounds`}</h2>
              <p style={{ margin: 0 }}>{brand.memory.voice.summary}</p>
              <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="kv"><span className="label">Do</span><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{brand.memory.voice.do.slice(0, 6).map((d) => <li key={d}>{d}</li>)}</ul></div>
                <div className="kv"><span className="label">Avoid</span><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{brand.memory.voice.avoid.slice(0, 6).map((d) => <li key={d}>{d}</li>)}</ul></div>
              </div>
              <span className="small dim">Harbor keeps refining this from what actually performs. Edit it any time in Brand Memory.</span>
              <div className="row" style={{ gap: 6 }}>
                <Link className="button primary" href={url(next?.key ?? 'done')}>Next: {next?.label ?? 'Done'} →</Link>
                <Link className="button" href={`${url('voice')}&redo=1`}>Change it</Link>
              </div>
            </section>
          ) : null}

          {brand && step === 'voice' && !voiceSaved ? (
            <div className="stack-lg">
              <div className="stack" style={{ gap: 6 }}>
                <h2 style={{ margin: 0 }}>{you ? 'How do you sound?' : `How does ${brand.name} sound?`}</h2>
                <p className="muted small">
                  {you
                    ? 'Paste a few of your own posts, separated by a line with ---. Your writing teaches Harbor more than any sample. No posts handy? Pick samples instead; the dials there start personal and candid.'
                    : `Pick a few posts that sound like ${brand.name}. Harbor turns them into a voice (personality, values, do and avoid rules) and keeps refining it from what actually performs once you're posting.`}
                </p>
              </div>
              <VoiceLearner
                brandId={brand.id}
                returnTo={url('voice')}
                savedExampleChars={brand.memory.examplePosts.reduce((n, e) => n + e.text.length, 0)}
                importHref={you ? `/brands/${brand.id}/channels` : url('accounts')}
                {...(you ? { initialMode: 'paste' as const, preset: 'founder' as const } : {})}
              />
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
              <h2 style={{ margin: 0 }}>{you ? "You're set up." : `${brand.name} is set up.`}</h2>
              <p className="muted">{you ? 'Next: let Harbor suggest posts in your voice, or write one yourself.' : 'Next: let Harbor suggest ideas, or write the first post yourself.'}</p>
              <div className="row">
                <Link className="button primary" href={`/hub?brand=${brand.id}`}>Get ideas in the hub</Link>
                <Link className="button" href={`/compose?brandId=${brand.id}`}>Write a post</Link>
                <Link className="button" href={`/brands/${brand.id}`}>{you ? 'Open your account' : 'Open the brand'}</Link>
              </div>
            </div>
          ) : null}

          {brand && next && step !== 'done' && !(step === 'voice' && voiceSaved) ? (
            <div className="spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <span className="dim small">Everything here can be changed later.</span>
              <span className="row" style={{ gap: 6 }}>
                <Link className="button" href={url(next.key)}>Skip this step</Link>
                <Link className="button inverse" href={url(next.key)}>{next.key === 'done' ? 'Finish' : `Next: ${next.label}`} →</Link>
              </span>
            </div>
          ) : null}
        </div>

        {brand ? <MemoryPreview brand={brand} title="Live preview" focus={step === 'audience' ? 'audiences' : step === 'voice' ? 'voice' : undefined} speaksForNames={brands.filter((b) => brand!.speaksFor.includes(b.id)).map((b) => b.name)} /> : (
          <aside className="preview-card dots">
            <span className="label">Live preview</span>
            <p className="muted small">{you ? 'As you connect your account and add your voice, this card fills in with what Harbor knows about you.' : 'As you add the audience, voice and accounts, this card fills in with what Harbor knows about the brand.'}</p>
          </aside>
        )}
      </div>
    </>
  );
}
