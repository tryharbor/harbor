import Link from 'next/link';
import type { NormalizedMetrics } from '@harbor/core';
import { removePost, resolvePost } from '../../actions';
import { getPost, loadAll, type PostDetail } from '../../api';
import { CurveChart } from '../../components/curve-chart';
import { LoadError, MetricLine, PageHeader, PlatformTag, StatusPill, VerdictTag, compact, when } from '../../ui';

export const dynamic = 'force-dynamic';

const METRICS: { key: keyof NormalizedMetrics; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'reach', label: 'Reach' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Replies' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
  { key: 'profileVisits', label: 'Profile visits' },
  { key: 'linkClicks', label: 'Link clicks' },
];

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadAll<[PostDetail]>([getPost(id)]);
  if (!res.ok) return (<><Link href="/performance">← Performance</Link><LoadError message={res.error} /></>);
  const [post] = res.data;
  const here = `/performance/${post.id}`;
  const shown = METRICS.filter((m) => post.snapshots.some((s) => s.metrics[m.key] !== undefined));

  return (
    <>
      <Link href="/performance">← Performance</Link>
      <PageHeader
        title={post.parts[0]?.text.slice(0, 80) || 'Post'}
        sub={<span className="row"><PlatformTag platform={post.channel.platform} handle={post.channel.handle} /> <span>{post.brandName}</span> <StatusPill status={post.status} /> {post.status === 'published' ? <VerdictTag outcome={post.outcome} /> : null} {post.url ? <a href={post.url} target="_blank" rel="noreferrer">Open on {post.channel.platform}</a> : null}</span>}
      />

      {post.error ? <p className={post.status === 'published' ? 'notice' : 'error'} role="status">{post.error.message}</p> : null}
      {post.status === 'unknown' ? (
        <section className="attention stack">
          <h2>Did it go out?</h2>
          <p className="muted">Harbor sent this post but couldn't confirm it landed. Check the account, then tell Harbor. It never retries these on its own, so you won't get a double post.</p>
          <div className="row">
            {(['published', 'not_published'] as const).map((outcome) => (
              <form key={outcome} action={resolvePost}>
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="outcome" value={outcome} />
                <input type="hidden" name="returnTo" value={here} />
                <button type="submit" className={outcome === 'published' ? 'primary' : undefined}>{outcome === 'published' ? 'It went out' : "It didn't, retry"}</button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid-2">
        <section className="stack">
          <h2>Growth curve</h2>
          {post.snapshots.length === 0 ? (
            <p className="muted">
              {post.status === 'published'
                ? `First snapshot ${post.publishedAt ? `around ${when(new Date(Date.parse(post.publishedAt) + 3_600_000).toISOString(), { hour: 'numeric', minute: '2-digit' })}` : 'an hour after publishing'}. Then at 6h, 24h, 72h and 7 days.`
                : 'Snapshots start an hour after the post goes live.'}
            </p>
          ) : (
            (() => {
              const metric: 'views' | 'likes' = post.outcome?.metric ?? (post.snapshots.some((x) => x.metrics.views !== undefined) ? 'views' : 'likes');
              return (
                <CurveChart
                  metric={metric}
                  points={post.snapshots.filter((x) => x.metrics[metric] !== undefined).map((x) => ({ ageHours: Math.max(x.ageHours, 0.5), value: x.metrics[metric] as number }))}
                  baseline={post.baselineCurve ?? []}
                />
              );
            })()
          )}
          <MetricLine metrics={post.latest?.metrics} />
        </section>
        <section className="stack">
          <h2>The post</h2>
          {post.parts.map((part, i) => (
            <div key={i} className="stack">
              {post.parts.length > 1 ? <span className="muted small">Part {i + 1}</span> : null}
              <p style={{ whiteSpace: 'pre-wrap' }}>{part.text}</p>
              {part.media.map((m) => <a key={m.url} className="small" href={m.url} target="_blank" rel="noreferrer">{m.kind}: {m.url}</a>)}
            </div>
          ))}
          <p className="muted small">{post.publishedAt ? `Published ${when(post.publishedAt)}` : post.scheduledFor ? `Scheduled for ${when(post.scheduledFor)}` : ''}</p>
          {post.status === 'scheduled' || post.status === 'failed' ? (
            <form action={removePost}>
              <input type="hidden" name="postId" value={post.id} />
              <input type="hidden" name="returnTo" value="/performance" />
              <button type="submit">Remove</button>
            </form>
          ) : null}
        </section>
      </div>

      {post.snapshots.length ? (
        <section className="scroll">
          <h2>Snapshots</h2>
          <table>
            <thead><tr><th>Taken</th><th className="num">Age</th>{shown.map((m) => <th key={m.key} className="num">{m.label}</th>)}</tr></thead>
            <tbody>
              {post.snapshots.map((s) => (
                <tr key={s.takenAt}>
                  <td className="small">{when(s.takenAt)}</td>
                  <td className="num">{s.ageHours < 1 ? `${Math.round(s.ageHours * 60)}m` : `${Math.round(s.ageHours)}h`}</td>
                  {shown.map((m) => <td key={m.key} className="num">{compact(s.metrics[m.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

