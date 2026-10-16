import Link from 'next/link';
import type { Channel } from '@harbor/core';
import { getBrands, getChannels, getIdeas, getPosts, loadAll, type BrandView, type IdeaView, type PostView } from './api';
import { BrandMark, Flash, LoadError, MetricLine, PageHeader, PlatformTag, StatusPill, Upcoming, when } from './ui';

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const flash = await searchParams;
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const res = await loadAll<[BrandView[], Channel[], PostView[], IdeaView[]]>([getBrands(), getChannels(), getPosts({ limit: '200' }), getIdeas()]);
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (!res.ok) return (<><PageHeader title="Home" sub={today} /><LoadError message={res.error} /></>);
  const [brands, channels, posts, ideas] = res.data;

  if (brands.length === 0) {
    return (
      <>
        <PageHeader title="Welcome to Harbor" sub="One place for every brand you run." />
        <section className="stack">
          <h2>Start with your first brand</h2>
          <p className="muted">Add a brand, describe how it sounds, connect its accounts, then post. Harbor starts learning from every post it publishes.</p>
          <div><Link className="button primary" href="/brands/new">Add a brand</Link></div>
        </section>
      </>
    );
  }

  const needsCheck = posts.filter((p) => p.status === 'unknown' || p.status === 'failed');
  const staleChannels = channels.filter((c) => c.status !== 'connected');
  const upNext = posts
    .filter((p) => p.status === 'scheduled' && p.scheduledFor && p.scheduledFor <= weekAhead)
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));
  const recent = posts.filter((p) => p.status === 'published').slice(0, 6);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  return (
    <>
      <PageHeader
        eyebrow={`Home · ${today}`}
        title="Where every brand stands"
        sub="What needs you, what's going out, and what's working."
        actions={<><Link className="button" href="/hub">Open the hub</Link><Link className="button primary" href="/compose">New post</Link></>}
      />
      <Flash params={flash} />

      {needsCheck.length + staleChannels.length > 0 ? (
        <section className="attention stack" aria-label="Needs attention">
          <h2>Needs your attention</h2>
          <ul className="list">
            {staleChannels.map((c) => (
              <li key={c.id}>
                <span><PlatformTag platform={c.platform} handle={c.account.handle} /> <span className={`pill s-${c.status}`}>{c.status.replace('_', ' ')}</span></span>
                <span className="muted small">{brandName.get(c.brandId)}: reconnect this account before its next post. <Link href={`/brands/${c.brandId}/channels`}>Reconnect</Link></span>
              </li>
            ))}
            {needsCheck.map((p) => (
              <li key={p.id}>
                <span><StatusPill status={p.status} /> <PlatformTag platform={p.channel.platform} handle={p.channel.handle} /> <span className="muted small">{p.brandName}</span></span>
                <span className="small">{p.parts[0]?.text.slice(0, 100)}</span>
                {p.error ? <span className="muted small">{p.error.message}</span> : null}
                <Link className="small" href={`/performance/${p.id}`}>Open</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid-2">
        <section>
          <h2>Coming up this week</h2>
          {upNext.length === 0 ? (
            <p className="muted">Nothing scheduled. <Link href="/compose">Write a post</Link> or move an approved idea forward in the <Link href="/hub">hub</Link>.</p>
          ) : (
            <ul className="list">
              {upNext.map((p) => (
                <li key={p.id}>
                  <span className="row small"><strong>{when(p.scheduledFor, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</strong> <PlatformTag platform={p.channel.platform} handle={p.channel.handle} /> <span className="muted">{p.brandName}</span></span>
                  <span>{p.parts[0]?.text.slice(0, 140)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="stack">
          <h2>This week's read</h2>
          <Upcoming title="Weekly digest">
            What worked across your brands and why: format, topic, hook, timing. It needs about a week of post snapshots, so it starts filling in after your first posts have run for 7 days.
          </Upcoming>
        </section>
      </div>

      <section>
        <h2>Recent results</h2>
        {recent.length === 0 ? (
          <p className="muted">Once posts go out, Harbor checks them at 1h, 6h, 24h, 72h and 7 days. Results show up here.</p>
        ) : (
          <ul className="list">
            {recent.map((p) => (
              <li key={p.id}>
                <span className="row small"><PlatformTag platform={p.channel.platform} handle={p.channel.handle} /> <span className="muted">{p.brandName} · {when(p.publishedAt)}</span></span>
                <Link href={`/performance/${p.id}`}>{p.parts[0]?.text.slice(0, 140)}</Link>
                <MetricLine metrics={p.latest?.metrics} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Brands</h2>
        <div className="grid">
          {brands.map((b) => {
            const bc = channels.filter((c) => c.brandId === b.id);
            const pipeline = ideas.filter((i) => i.brandId === b.id && i.status !== 'live').length;
            const live = posts.filter((p) => p.brandId === b.id && p.status === 'published').length;
            return (
              <Link key={b.id} href={`/brands/${b.id}`} className="card stack" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="row" style={{ gap: 10 }}><BrandMark name={b.name} logoUrl={b.logoUrl} size={28} /><strong style={{ fontWeight: 500 }}>{b.name}</strong></span>
                <span className="muted small">{b.memory.products[0]?.summary || 'No product described yet'}</span>
                <span className="row small">
                  {bc.length ? bc.map((c) => <PlatformTag key={c.id} platform={c.platform} iconOnly />) : <span className="muted">No accounts connected</span>}
                </span>
                <span className="muted small">{pipeline} ideas in progress · {live} posts published</span>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
