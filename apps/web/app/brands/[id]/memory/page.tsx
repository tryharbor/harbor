import type { Brand } from '@harbor/core';
import { saveMemory } from '../../../actions';
import { getBrand, loadAll } from '../../../api';
import { Flash, LoadError, Upcoming } from '../../../ui';

export const dynamic = 'force-dynamic';

const join = (xs: string[]) => xs.join('\n');

export default async function MemoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const flash = await searchParams;
  const res = await loadAll<[Brand]>([getBrand(id)]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [brand] = res.data;
  const m = brand.memory;
  const exampleChars = m.examplePosts.reduce((n, e) => n + e.text.length, 0);

  return (
    <>
      <Flash params={flash} />
      <div className="grid-2">
        <form action={saveMemory} className="stack">
          <input type="hidden" name="brandId" value={brand.id} />

          <section className="stack">
            <h2>Voice</h2>
            <p className="muted small">How {brand.name} sounds. Specific enough that someone new could write like it.</p>
            <div className="field">
              <label htmlFor="voiceDescription">Personality and style</label>
              <textarea id="voiceDescription" name="voiceDescription" defaultValue={m.voice.description} placeholder="Candid, builder-to-builder. Short declarative sentences; specifics over adjectives…" />
            </div>
            <div className="field">
              <label htmlFor="voiceTraits">Values / traits (one per line)</label>
              <textarea id="voiceTraits" name="voiceTraits" defaultValue={join(m.voice.traits)} style={{ minHeight: 80 }} placeholder={'Transparent\nSpecific\nAnti-hype'} />
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: '1 1 220px' }}>
                <label htmlFor="voiceDo">Do (one rule per line)</label>
                <textarea id="voiceDo" name="voiceDo" defaultValue={join(m.voice.do)} style={{ minHeight: 110 }} placeholder={'Open with a scene, not a claim\nUse real numbers'} />
              </div>
              <div className="field" style={{ flex: '1 1 220px' }}>
                <label htmlFor="voiceDont">Avoid (one per line)</label>
                <textarea id="voiceDont" name="voiceDont" defaultValue={join(m.voice.dont)} style={{ minHeight: 110 }} placeholder={'leverage, seamless, unlock\nHedging ("might help")'} />
              </div>
            </div>
          </section>

          <section className="stack">
            <h2>Offer</h2>
            <div className="field">
              <label htmlFor="offerSummary">What it is, in a sentence</label>
              <input id="offerSummary" name="offerSummary" defaultValue={m.offer.summary} placeholder="The open-source content strategist for builders" />
            </div>
            <div className="row">
              <div className="field" style={{ flex: '1 1 220px' }}>
                <label htmlFor="offerCta">Main call to action</label>
                <input id="offerCta" name="offerCta" defaultValue={m.offer.callToAction ?? ''} placeholder="Join the waitlist" />
              </div>
              <div className="field" style={{ flex: '1 1 220px' }}>
                <label htmlFor="offerUrl">Link</label>
                <input id="offerUrl" name="offerUrl" type="url" defaultValue={m.offer.url ?? ''} placeholder="https://…" />
              </div>
            </div>
          </section>

          <section className="stack">
            <h2>Audience</h2>
            <div className="field">
              <label htmlFor="audienceDescription">Who it's for</label>
              <textarea id="audienceDescription" name="audienceDescription" defaultValue={m.audience.description} style={{ minHeight: 80 }} placeholder="Builders running two or more products…" />
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: '1 1 220px' }}>
                <label htmlFor="audienceSegments">Segments (one per line)</label>
                <textarea id="audienceSegments" name="audienceSegments" defaultValue={join(m.audience.segments)} style={{ minHeight: 90 }} />
              </div>
              <div className="field" style={{ flex: '1 1 220px' }}>
                <label htmlFor="audiencePainPoints">Pain points (one per line)</label>
                <textarea id="audiencePainPoints" name="audiencePainPoints" defaultValue={join(m.audience.painPoints)} style={{ minHeight: 90 }} />
              </div>
            </div>
          </section>

          <section className="stack">
            <h2>Example posts</h2>
            <p className="muted small">Your best real posts. Separate them with a line containing only <code>---</code>. Aim for at least 1,000 characters across 3 or more posts.</p>
            <textarea id="examples" name="examples" aria-label="Example posts" defaultValue={m.examplePosts.map((e) => e.text).join('\n---\n')} style={{ minHeight: 220 }} />
          </section>

          <div><button className="primary" type="submit">Save Brand Memory</button></div>
        </form>

        <aside className="stack" style={{ alignContent: 'start', position: 'sticky', top: 16 }}>
          <section className="stack">
            <h2>What Harbor knows</h2>
            <ul className="list small">
              <li><strong>Voice</strong><span className="muted">{m.voice.description ? `${m.voice.description.slice(0, 160)}${m.voice.description.length > 160 ? '…' : ''}` : 'Not described yet'}</span></li>
              <li><strong>Rules</strong><span className="muted">{m.voice.do.length} do · {m.voice.dont.length} avoid</span></li>
              <li><strong>Offer</strong><span className="muted">{m.offer.summary || 'Not described yet'}</span></li>
              <li><strong>Audience</strong><span className="muted">{m.audience.description ? m.audience.description.slice(0, 120) : 'Not described yet'}</span></li>
              <li>
                <strong>Examples</strong>
                <span className="muted">{m.examplePosts.length} posts · {exampleChars.toLocaleString('en-US')} characters {exampleChars >= 1000 ? '(enough to learn from)' : '(1,000+ recommended)'}</span>
              </li>
            </ul>
          </section>
          <Upcoming title="Learn the voice for me">
            Paste examples or pick your best-performing posts, and Harbor writes the personality, values, do/avoid rules and excerpts for you, then keeps them current as new posts outperform.
          </Upcoming>
          <Upcoming title="Competitors">
            Accounts to watch for {brand.name}. Their public posts become signals for ideas.
          </Upcoming>
        </aside>
      </div>
    </>
  );
}
