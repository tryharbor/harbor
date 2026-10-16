import Link from 'next/link';
import type { NormalizedMetrics } from '@harbor/core';
import { advanceSandbox } from '../actions';
import { getMode, getPlatforms, getPosts, loadAll, type Mode, type PlatformInfo, type PostView } from '../api';
import { Flash, LoadError, PageHeader, PlatformTag, StatusPill, VerdictTag, compact, when } from '../ui';

export const dynamic = 'force-dynamic';

const COLUMNS: { key: keyof NormalizedMetrics; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Replies' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'saves', label: 'Saves' },
  { key: 'linkClicks', label: 'Link clicks' },
];

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const flash = await searchParams;
  const res = await loadAll<[PostView[], PlatformInfo[], Mode]>([getPosts({ limit: '300' }), getPlatforms(), getMode()]);
  if (!res.ok) return (<><PageHeader title="Performance" /><LoadError message={res.error} /></>);
  const [posts, platforms, mode] = res.data;
  const noMetrics = new Set(platforms.filter((p) => !p.reportsMetrics).map((p) => p.platform));
  const published = posts.filter((p) => p.status === 'published');
  const total = (k: keyof NormalizedMetrics) => published.reduce((sum, p) => sum + (p.latest?.metrics[k] ?? 0), 0);

  return (
    <>
      <PageHeader eyebrow="Performance" title="What your posts actually did" sub="Every post Harbor published, across brands. Each one is checked at 1h, 6h, 24h, 72h and 7 days." />
      <Flash params={flash} />
      {mode.publish === 'sandbox' ? (
        <form action={advanceSandbox} className="spread staging" style={{ padding: '12px 16px' }}>
          <input type="hidden" name="returnTo" value="/performance" />
          <span className="row small"><span className="tag">Sandbox</span><span className="muted">Simulated numbers. Fast-forward time to watch growth curves fill in.</span></span>
          <span className="row">
            {[['1', '+1h'], ['6', '+6h'], ['24', '+1 day'], ['168', '+7 days']].map(([h, label]) => (
              <button key={h} type="submit" name="hours" value={h} className="mono-button">{label}</button>
            ))}
          </span>
        </form>
      ) : null}
      <div className="grid">
        <div className="card stat"><span className="muted small">Posts published</span><strong>{published.length}</strong></div>
        <div className="card stat"><span className="muted small">Views (latest snapshot)</span><strong>{compact(total('views'))}</strong></div>
        <div className="card stat"><span className="muted small">Likes</span><strong>{compact(total('likes'))}</strong></div>
        <div className="card stat"><span className="muted small">Replies</span><strong>{compact(total('comments'))}</strong></div>
      </div>
      <section className="scroll">
        {posts.length === 0 ? (
          <p className="muted">Nothing published from Harbor yet. <Link href="/compose">Write the first post</Link>.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th><th>Post</th><th>Channel</th><th>Status</th><th>Vs. median</th><th className="num">Age</th>
                {COLUMNS.map((c) => <th key={c.key} className="num">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="small">{when(p.publishedAt ?? p.scheduledFor ?? p.createdAt)}</td>
                  <td style={{ maxWidth: 340 }}>
                    <Link href={`/performance/${p.id}`}>{p.parts[0]?.text.slice(0, 100) || '(media only)'}</Link>
                    <div className="muted small">{p.brandName}{p.parts.length > 1 ? ` · thread of ${p.parts.length}` : ''}</div>
                  </td>
                  <td><PlatformTag platform={p.channel.platform} handle={p.channel.handle} /></td>
                  <td><StatusPill status={p.status} /></td>
                  <td>{p.status === 'published' ? <VerdictTag outcome={p.outcome} /> : <span className="dim">–</span>}</td>
                  <td className="num small">{p.latest ? `${Math.round(p.latest.ageHours)}h` : '–'}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="num">
                      {noMetrics.has(p.channel.platform) ? <span className="muted">n/a</span> : compact(p.latest?.metrics[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {noMetrics.size ? <p className="muted small">n/a: LinkedIn only shares personal-post metrics with partner apps. Harbor publishes there but can't measure yet.</p> : null}
    </>
  );
}
