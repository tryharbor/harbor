import Link from 'next/link';
import type { Channel, Platform } from '@harbor/core';
import { savePersonDetails } from '../../actions';
import { getApprovals, getBrand, getBrands, getChannels, getDigest, getIdeas, getOverview, getPosts, loadAll, type ApprovalCounts, type BrandView, type Digest, type IdeaView, type OverviewBrand, type PostView } from '../../api';
import { PlatformIcon } from '../../platform-icon';
import { BrandMark, Flash, LoadError, MetricLine, PLATFORM_NAME, PlatformTag, StatusPill, VerdictTag, compact, when } from '../../ui';

export const dynamic = 'force-dynamic';

const PLATFORMS: Platform[] = ['x', 'linkedin', 'instagram', 'threads'];
const pct = (r: number) => `${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)}%`;

export default async function BrandOverview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ connected?: string; notice?: string; error?: string }> }) {
  const { id } = await params;
  const flash = await searchParams;
  const res = await loadAll<[BrandView, Channel[], PostView[], IdeaView[], { counts: ApprovalCounts }, Digest | undefined, OverviewBrand[], BrandView[]]>([
    getBrand(id),
    getChannels(id),
    getPosts({ brandId: id, limit: '60' }),
    getIdeas({ brandId: id }),
    getApprovals({ status: 'pending', brandId: id }),
    getDigest(id),
    getOverview().catch(() => []),
    getBrands(),
  ]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [brand, channels, posts, ideas, { counts }, digest, overview, allBrands] = res.data;
  const you = brand.kind === 'person';
  const otherBrands = allBrands.filter((b) => b.kind === 'brand');
  const m = brand.memory;
  const stats = overview.find((o) => o.brandId === id);
  const connected = channels.filter((c) => c.status === 'connected');
  const now = Date.now();
  const upNext = posts.filter((p) => p.status === 'scheduled' && p.scheduledFor && Date.parse(p.scheduledFor) >= now).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
  const recent = posts.filter((p) => p.status === 'published').slice(0, 6);
  const active = ideas.filter((i) => i.status !== 'live');

  const firstPost = { done: posts.some((p) => p.status === 'published' || p.status === 'scheduled'), label: 'Schedule a first post', why: 'Harbor starts learning from it.', href: `/compose?brandId=${id}`, cta: 'Write a post' };
  const steps = you
    ? [
        { done: connected.length > 0, label: 'Connect your account', why: 'X or LinkedIn. Your picture comes with it.', href: `/brands/new?brandId=${id}&kind=person&step=connect`, cta: 'Connect' },
        { done: !!m.voice.summary, label: 'Teach it your voice', why: 'Paste a few of your own posts.', href: `/brands/new?brandId=${id}&kind=person&step=voice`, cta: 'Add posts' },
        { done: m.topics.length > 0 || brand.speaksFor.length > 0, label: 'Your topics and brands', why: 'What you post about, and which brands.', href: '#about-you', cta: 'Add them' },
        firstPost,
      ]
    : [
        { done: m.products.length > 0 && m.audiences.length > 0, label: 'Describe it', why: 'What it is and who it’s for.', href: `/brands/new?brandId=${id}&step=audience`, cta: 'Add an audience' },
        { done: !!m.voice.summary, label: 'Learn the voice', why: 'Pick a few posts that sound right.', href: `/brands/new?brandId=${id}&step=voice`, cta: 'Pick posts' },
        { done: connected.length > 0, label: 'Connect an account', why: 'X, LinkedIn, Instagram or Threads.', href: `/brands/${id}/channels`, cta: 'Connect' },
        firstPost,
      ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  return (
    <>
      <Flash params={flash} />

      {nextStep ? (
        <section className="setup">
          <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />{you ? 'Set up your account' : `Set up ${brand.name}`} · {doneCount} of {steps.length}</span>
            <span className="meter" aria-hidden="true" style={{ width: 160 }}><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></span>
          </div>
          <ol className="setup-steps">
            {steps.map((s, i) => (
              <li key={s.label} className={s.done ? 'done' : s === nextStep ? 'next' : undefined}>
                <span className="mono small dim">{s.done ? '✓ Done' : String(i + 1).padStart(2, '0')}</span>
                <strong style={{ fontWeight: 500 }}>{s.label}</strong>
                <span className="small muted">{s.why}</span>
                {s.done ? null : <Link className={`button${s === nextStep ? ' primary' : ''}`} href={s.href}>{s.cta}</Link>}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {you ? (
        <form action={savePersonDetails} className="card stack" id="about-you">
          <input type="hidden" name="brandId" value={id} />
          <input type="hidden" name="returnTo" value={`/brands/${id}`} />
          <span className="label">About you</span>
          <div className="field">
            <label htmlFor="topics">What you post about</label>
            <input id="topics" name="topics" defaultValue={m.topics.join(', ')} placeholder="Building in public, pricing, open source" />
          </div>
          {otherBrands.length ? (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ marginBottom: 6 }}>Brands you post about</legend>
              <div className="chips">
                {otherBrands.map((b) => (
                  <label key={b.id} className="chip check-chip">
                    <input type="checkbox" name="speaksFor" value={b.id} defaultChecked={brand.speaksFor.includes(b.id)} />
                    <BrandMark name={b.name} logoUrl={b.logoUrl} size={16} />{b.name}
                  </label>
                ))}
              </div>
              <span className="small dim">Harbor suggests quoting their best posts with your take.</span>
            </fieldset>
          ) : null}
          <div><button type="submit">Save</button></div>
        </form>
      ) : null}

      <div className="stat-strip">
        <div className="stat"><span className="label">Published · 7 days</span><strong>{stats?.published7d ?? 0}</strong></div>
        <div className="stat">
          <span className="label">Median views at 24h</span>
          <strong>{stats?.medianViews24h !== undefined ? compact(stats.medianViews24h) : '–'}</strong>
          {stats?.change !== undefined ? <span className={`verdict ${Math.abs(stats.change - 1) < 0.05 ? 'met' : stats.change > 1 ? 'outperformed' : 'underperformed'}`}>{Math.abs(stats.change - 1) < 0.05 ? 'flat vs last week' : `${stats.change > 1 ? '↑' : '↓'} ${pct(stats.change)} vs last week`}</span> : <span className="small dim">After the first week of posts</span>}
        </div>
        <Link className="stat stat-link" href="/approvals">
          <span className="label">Waiting for you</span>
          <strong>{counts.pending}</strong>
          <span className="small dim">{counts.pending ? 'posts to approve →' : 'Nothing to approve'}</span>
        </Link>
        <div className="stat">
          <span className="label">Next post</span>
          {upNext[0] ? (
            <>
              <strong className="row" style={{ gap: 8, fontSize: 20 }}><PlatformIcon platform={upNext[0].channel.platform} size={16} />{when(upNext[0].scheduledFor, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</strong>
              <span className="small dim">{upNext.length} scheduled</span>
            </>
          ) : <><strong>–</strong><span className="small dim">Nothing scheduled</span></>}
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="stack">
            <div className="spread"><h2 style={{ margin: 0 }}>Up next</h2><Link className="small" href={`/hub?view=calendar&brand=${id}`}>Calendar →</Link></div>
            {upNext.length ? (
              <ul className="list">
                {upNext.slice(0, 5).map((p) => (
                  <li key={p.id} style={{ gridTemplateColumns: 'auto 1fr' }}>
                    <span className="mono small" style={{ whiteSpace: 'nowrap' }}>{when(p.scheduledFor, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    <Link href={`/performance/${p.id}`} className="row small" style={{ gap: 8, textDecoration: 'none', minWidth: 0 }}>
                      <PlatformTag platform={p.channel.platform} iconOnly /><span className="evidence-text">{p.parts[0]?.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty" style={{ padding: 18 }}>
                <span className="muted small">Nothing scheduled. Let the weekly plan draft a week for your approval, or write one yourself.</span>
                <span className="row" style={{ gap: 6 }}>
                  <Link className="button primary" href={`/agents/weekly_plan?brand=${id}`}>Plan the week</Link>
                  <Link className="button" href={`/compose?brandId=${id}`}>Write a post</Link>
                </span>
              </div>
            )}
          </section>

          <section className="stack">
            <div className="spread"><h2 style={{ margin: 0 }}>Recent posts</h2><Link className="small" href={`/performance?brand=${id}`}>Performance →</Link></div>
            {recent.length ? (
              <ul className="list">
                {recent.map((p) => (
                  <li key={p.id}>
                    <span className="row small" style={{ gap: 8, flexWrap: 'wrap' }}><PlatformTag platform={p.channel.platform} handle={p.channel.handle} /><span className="dim">{when(p.publishedAt, { month: 'short', day: 'numeric' })}</span><VerdictTag outcome={p.outcome} /></span>
                    <Link href={`/performance/${p.id}`}>{p.parts[0]?.text.slice(0, 160)}</Link>
                    <MetricLine metrics={p.latest?.metrics} />
                  </li>
                ))}
              </ul>
            ) : <p className="muted small" style={{ margin: 0 }}>Nothing published yet. Each post is measured at 1h, 6h, 24h, 3 days and 7 days, then compared with {brand.name}'s median.</p>}
          </section>
        </div>

        <aside className="stack">
          <section className="stack">
            <div className="spread"><h2 style={{ margin: 0 }}>Accounts</h2><Link className="small" href={`/brands/${id}/channels`}>Manage</Link></div>
            <ul className="account-list">
              {PLATFORMS.map((pl) => {
                const c = channels.find((x) => x.platform === pl);
                return (
                  <li key={pl}>
                    <PlatformIcon platform={pl} size={16} />
                    <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                      <span className="small">{PLATFORM_NAME[pl]}</span>
                      <span className="small dim evidence-text">{c ? `@${c.account.handle}` : 'Not connected'}</span>
                    </span>
                    {c ? <span className={`pill s-${c.status}`}>{c.status.replace('_', ' ')}</span> : <Link className="small" href={`/brands/${id}/channels`}>Connect</Link>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="stack">
            <div className="spread"><span className="label">Latest digest</span><Link className="small" href={`/insights?brand=${id}`}>Insights →</Link></div>
            {digest ? <strong style={{ fontWeight: 400, fontSize: 17, letterSpacing: '-0.01em' }}>{digest.headline}</strong> : <span className="small muted">Harbor writes a weekly digest once there's a week of posts: what worked, what didn't, what to do next.</span>}
          </section>

          <section className="stack">
            <div className="spread"><span className="label">Ideas in progress · {active.length}</span><Link className="small" href={`/hub?brand=${id}`}>Hub →</Link></div>
            {active.length ? (
              <ul className="list small">
                {active.slice(0, 5).map((i) => (
                  <li key={i.id} style={{ gridTemplateColumns: '1fr auto' }}><Link href={`/studio/${i.id}`} className="evidence-text">{i.title}</Link><span className={`pill s-${i.status}`}>{i.status}</span></li>
                ))}
              </ul>
            ) : <span className="small muted">No ideas yet. <Link href={`/hub?brand=${id}`}>Suggest some</Link> from {brand.name}'s Brand Memory.</span>}
          </section>
        </aside>
      </div>
    </>
  );
}
