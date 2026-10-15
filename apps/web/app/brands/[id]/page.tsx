import Link from 'next/link';
import type { Channel, NormalizedMetrics } from '@harbor/core';
import { createPost, disconnectChannel, removePost, resolvePost } from '../../actions';
import { API_PUBLIC_URL, ApiError, getBrand, getChannels, getPlatforms, getPosts, type PlatformInfo, type PostView } from '../../api';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<PostView['status'], string> = {
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  pending: 'Processing',
  published: 'Published',
  failed: 'Failed',
  unknown: 'Check platform',
};

const METRIC_COLUMNS: { key: keyof NormalizedMetrics; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Replies' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'saves', label: 'Saves' },
];

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ connected?: string; error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  let data: { brand: Awaited<ReturnType<typeof getBrand>>; channels: Channel[]; posts: PostView[]; platforms: PlatformInfo[] };
  try {
    const [brand, channels, posts, platforms] = await Promise.all([getBrand(id), getChannels(id), getPosts(id), getPlatforms()]);
    data = { brand, channels, posts, platforms };
  } catch (err) {
    return (
      <main>
        <Link href="/">← Brands</Link>
        <p className="error" role="alert">{err instanceof ApiError ? err.message : 'Could not load this brand.'}</p>
      </main>
    );
  }
  const { brand, channels, posts, platforms } = data;
  const connected = channels.filter((c) => c.status === 'connected');
  const noMetrics = new Set(platforms.filter((p) => !p.reportsMetrics).map((p) => p.platform));

  return (
    <main>
      <div className="stack">
        <Link href="/">← Brands</Link>
        <h1>{brand.name}</h1>
      </div>
      {flash.connected ? <p className="notice" role="status">Connected {flash.connected}.</p> : null}
      {flash.notice ? <p className="notice" role="status">{flash.notice}</p> : null}
      {flash.error ? <p className="error" role="alert">{flash.error}</p> : null}

      <section>
        <h2>Channels</h2>
        {channels.length === 0 ? <p className="muted">No accounts connected yet.</p> : (
          <div className="stack">
            {channels.map((c) => (
              <div key={c.id} className="row">
                <strong>{platforms.find((p) => p.platform === c.platform)?.name ?? c.platform}</strong>
                <span>@{c.account.handle}</span>
                <span className={`pill s-${c.status}`}>{c.status.replace('_', ' ')}</span>
                {c.tokenExpiresAt ? <span className="muted">token until {when(c.tokenExpiresAt)}</span> : null}
                {c.status !== 'connected' ? (
                  <a className="button" href={`${API_PUBLIC_URL}/v1/channels/${c.platform}/connect?brandId=${brand.id}`}>Reconnect</a>
                ) : null}
                <form action={disconnectChannel}>
                  <input type="hidden" name="brandId" value={brand.id} />
                  <input type="hidden" name="channelId" value={c.id} />
                  <button type="submit">Disconnect</button>
                </form>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <span className="muted">Connect:</span>
          {platforms.map((p) => (
            <a key={p.platform} className="button" href={`${API_PUBLIC_URL}/v1/channels/${p.platform}/connect?brandId=${brand.id}`}>
              {p.name}
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2>Write a post</h2>
        {connected.length === 0 ? <p className="muted">Connect a channel first.</p> : (
          <form action={createPost} className="stack">
            <input type="hidden" name="brandId" value={brand.id} />
            <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="muted" style={{ marginBottom: 6 }}>Post to</legend>
              {connected.map((c) => (
                <label key={c.id} className="channel-pick">
                  <input type="checkbox" name="channelId" value={c.id} defaultChecked={connected.length === 1} />
                  {platforms.find((p) => p.platform === c.platform)?.name} @{c.account.handle}
                </label>
              ))}
            </fieldset>
            <label htmlFor="body" className="muted">Text. A line with only <code>---</code> starts the next post in a thread.</label>
            <textarea id="body" name="body" required />
            <div className="row">
              <div style={{ flex: '2 1 280px' }}>
                <label htmlFor="mediaUrl" className="muted">Image or video URL (public; required for Instagram)</label>
                <input id="mediaUrl" name="mediaUrl" type="url" placeholder="https://…" />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="scheduledFor" className="muted">Schedule (leave empty to post now)</label>
                <input id="scheduledFor" name="scheduledFor" type="datetime-local" />
              </div>
            </div>
            <div><button className="primary" type="submit">Publish</button></div>
          </form>
        )}
      </section>

      <section>
        <h2>Posts</h2>
        {posts.length === 0 ? <p className="muted">Nothing posted from Harbor yet.</p> : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>When</th><th>Channel</th><th>Post</th><th>Status</th>
                  {METRIC_COLUMNS.map((m) => <th key={m.key} className="num">{m.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td>{when(p.publishedAt ?? p.scheduledFor ?? p.createdAt)}</td>
                    <td>{p.channel.platform} @{p.channel.handle}</td>
                    <td style={{ maxWidth: 320 }}>
                      {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.parts[0]?.text.slice(0, 120)}</a> : p.parts[0]?.text.slice(0, 120)}
                      {p.parts.length > 1 ? <span className="muted"> (+{p.parts.length - 1} in thread)</span> : null}
                      {p.error ? <div className={p.status === 'published' ? 'muted' : 'error'} style={{ marginTop: 6, padding: 6 }}>{p.error.message}</div> : null}
                      {p.status === 'unknown' ? (
                        <div className="row" style={{ marginTop: 6 }}>
                          {(['published', 'not_published'] as const).map((outcome) => (
                            <form key={outcome} action={resolvePost}>
                              <input type="hidden" name="brandId" value={brand.id} />
                              <input type="hidden" name="postId" value={p.id} />
                              <input type="hidden" name="outcome" value={outcome} />
                              <button type="submit">{outcome === 'published' ? 'It went out' : "It didn't go out, retry"}</button>
                            </form>
                          ))}
                        </div>
                      ) : null}
                      {p.status === 'scheduled' || p.status === 'failed' ? (
                        <form action={removePost} style={{ marginTop: 6 }}>
                          <input type="hidden" name="brandId" value={brand.id} />
                          <input type="hidden" name="postId" value={p.id} />
                          <button type="submit">Remove</button>
                        </form>
                      ) : null}
                    </td>
                    <td><span className={`pill s-${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
                    {METRIC_COLUMNS.map((m) => (
                      <td key={m.key} className="num">
                        {noMetrics.has(p.channel.platform) ? <span className="muted">n/a</span> : (p.latest?.metrics[m.key] ?? <span className="muted">–</span>)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 10 }}>
              Metrics are snapshots at 1h, 6h, 24h, 72h and 7 days after publishing. LinkedIn shows n/a until Harbor has LinkedIn partner access.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
