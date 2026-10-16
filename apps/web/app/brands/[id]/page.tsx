import Link from 'next/link';
import type { Brand, Channel } from '@harbor/core';
import { getBrand, getChannels, getIdeas, getPosts, loadAll, type IdeaView, type PostView } from '../../api';
import { Flash, LoadError, MetricLine, PlatformTag, StatusPill, Upcoming, when } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function BrandOverview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ connected?: string; notice?: string; error?: string }> }) {
  const { id } = await params;
  const flash = await searchParams;
  const res = await loadAll<[Brand, Channel[], PostView[], IdeaView[]]>([getBrand(id), getChannels(id), getPosts({ brandId: id, limit: '20' }), getIdeas({ brandId: id })]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [brand, channels, posts, ideas] = res.data;
  const m = brand.memory;
  const memoryFilled = [m.voice.description, m.offer.summary, m.audience.description].filter(Boolean).length + (m.examplePosts.length ? 1 : 0);
  const steps = [
    { done: memoryFilled >= 3, label: 'Describe the brand', href: `/brands/${id}/memory` },
    { done: channels.length > 0, label: 'Connect an account', href: `/brands/${id}/channels` },
    { done: posts.length > 0, label: 'Publish a first post', href: `/compose?brandId=${id}` },
  ];

  return (
    <>
      <Flash params={flash} />
      {steps.some((s) => !s.done) ? (
        <section className="stack">
          <h2>Get {brand.name} set up</h2>
          <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
            {steps.map((s) => (
              <li key={s.label}>{s.done ? <span className="muted"><s>{s.label}</s> done</span> : <Link href={s.href}>{s.label}</Link>}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid-2">
        <section>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Recent posts</h2>
            <Link className="small" href={`/compose?brandId=${id}`}>New post</Link>
          </div>
          {posts.length === 0 ? <p className="muted">Nothing posted from Harbor yet.</p> : (
            <ul className="list">
              {posts.map((p) => (
                <li key={p.id}>
                  <span className="row small"><PlatformTag platform={p.channel.platform} handle={p.channel.handle} /> <StatusPill status={p.status} /> <span className="muted">{when(p.publishedAt ?? p.scheduledFor)}</span></span>
                  <Link href={`/performance/${p.id}`}>{p.parts[0]?.text.slice(0, 140)}</Link>
                  {p.status === 'published' ? <MetricLine metrics={p.latest?.metrics} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="stack">
          <section>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>Ideas in progress</h2>
              <Link className="small" href={`/hub?brand=${id}`}>Open in hub</Link>
            </div>
            {ideas.filter((i) => i.status !== 'live').length === 0 ? <p className="muted">No ideas yet.</p> : (
              <ul className="list">
                {ideas.filter((i) => i.status !== 'live').slice(0, 8).map((i) => (
                  <li key={i.id}><span>{i.title}</span><span className={`pill s-${i.status}`} style={{ justifySelf: 'start' }}>{i.status}</span></li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2>Accounts</h2>
            {channels.length === 0 ? <p className="muted">None yet. <Link href={`/brands/${id}/channels`}>Connect one</Link></p> : (
              <ul className="list">
                {channels.map((c) => (
                  <li key={c.id}><span className="row"><PlatformTag platform={c.platform} handle={c.account.handle} /> <span className={`pill s-${c.status}`}>{c.status.replace('_', ' ')}</span></span></li>
                ))}
              </ul>
            )}
          </section>
          <Upcoming title="Ideas from what worked">
            Harbor will suggest ideas for {brand.name} from its best posts, the questions people ask in replies and what competitors are getting traction on. Each idea will cite its reason.
          </Upcoming>
        </div>
      </div>
    </>
  );
}
