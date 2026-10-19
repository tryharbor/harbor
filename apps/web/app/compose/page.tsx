import Link from 'next/link';
import type { Channel } from '@harbor/core';
import { createPost } from '../actions';
import { ComposeMedia } from '../components/compose-media';
import { PostOrSchedule } from '../components/post-or-schedule';
import { TzInput } from '../components/tz-input';
import { API_BROWSER_URL, getBrands, getChannels, getIdeas, loadAll, type BrandView, type IdeaView } from '../api';
import { Flash, LoadError, PageHeader, PlatformTag, Upcoming } from '../ui';

export const dynamic = 'force-dynamic';

const LIMITS = 'X 280 · Threads 500 · Instagram 2,200 · LinkedIn 3,000 characters';

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ brandId?: string; ideaId?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const res = await loadAll<[BrandView[], Channel[], IdeaView[]]>([getBrands(), getChannels(), getIdeas({ brandId: s.brandId })]);
  if (!res.ok) return (<><PageHeader title="New post" /><LoadError message={res.error} /></>);
  const [brands, channels, ideas] = res.data;
  const idea = ideas.find((i) => i.id === s.ideaId);
  const brandId = idea?.brandId ?? s.brandId;
  const connected = channels.filter((c) => c.status === 'connected' && (!brandId || c.brandId === brandId));
  const here = `/compose?${new URLSearchParams(Object.entries({ brandId: s.brandId ?? '', ideaId: s.ideaId ?? '' }).filter(([, v]) => v))}`;
  const openIdeas = ideas.filter((i) => i.status === 'approved' || i.status === 'drafting');

  return (
    <>
      <PageHeader
        eyebrow="Quick post"
        title="New post"
        sub={idea ? <>For the idea <strong>{idea.title}</strong> · {idea.brandName}</> : 'Write once, post to any connected account.'}
      />
      <Flash params={s} />

      {brands.length === 0 ? (
        <p className="muted">Add a brand first. <Link href="/brands/new">Add a brand</Link></p>
      ) : (
        <div className="grid-2">
          <section>
            {connected.length === 0 ? (
              <div className="stack">
                <p className="muted">No connected accounts{brandId ? ' for this brand' : ''} yet.</p>
                <div className="row">
                  {(brandId ? brands.filter((b) => b.id === brandId) : brands).map((b) => (
                    <Link key={b.id} className="button" href={`/brands/${b.id}/channels`}>Connect accounts for {b.name}</Link>
                  ))}
                </div>
              </div>
            ) : (
              <form action={createPost} className="stack">
                <TzInput />
                <input type="hidden" name="returnTo" value={here} />
                {idea ? <input type="hidden" name="ideaId" value={idea.id} /> : null}
                <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="muted small" style={{ marginBottom: 6 }}>Post to</legend>
                  {brands.filter((b) => connected.some((c) => c.brandId === b.id)).map((b) => (
                    <div key={b.id} className="row">
                      <strong className="small" style={{ minWidth: 90 }}>{b.name}</strong>
                      {connected.filter((c) => c.brandId === b.id).map((c) => (
                        <label key={c.id} className="channel-pick">
                          <input type="checkbox" name="channelId" value={c.id} defaultChecked={connected.length === 1} />
                          <PlatformTag platform={c.platform} handle={c.account.handle} />
                        </label>
                      ))}
                    </div>
                  ))}
                </fieldset>
                <div className="field">
                  <label htmlFor="body">Text. A line with only <code>---</code> starts the next post in the thread.</label>
                  <textarea id="body" name="body" required defaultValue={idea ? `${idea.title}\n\n${idea.angle}`.trim() : ''} />
                  <span className="muted small">{LIMITS}</span>
                </div>
                <ComposeMedia apiUrl={API_BROWSER_URL} channels={connected.map((c) => ({ id: c.id, platform: c.platform, brandId: c.brandId }))} />
                <PostOrSchedule />
              </form>
            )}
          </section>
          <div className="stack">
            {!idea && openIdeas.length ? (
              <section className="stack">
                <h2>Write from an idea</h2>
                <ul className="list">
                  {openIdeas.slice(0, 8).map((i) => (
                    <li key={i.id}>
                      <Link href={`/compose?brandId=${i.brandId}&ideaId=${i.id}`}>{i.title}</Link>
                      <span className="muted small">{i.brandName} · {i.status}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <Upcoming title="Draft in this brand's voice">
              Harbor will draft the post from the idea and the brand's memory, then adapt it per platform: a thread for X, a longer post for LinkedIn, a caption for Instagram.
            </Upcoming>
          </div>
        </div>
      )}
    </>
  );
}
