import Link from 'next/link';
import type { IdeaStatus } from '@harbor/core';
import { createIdea, deleteIdea, moveIdea, suggestIdeas } from '../actions';
import { getBrands, getIdeas, getPosts, loadAll, type BrandView, type IdeaView, type PostView } from '../api';
import { Flash, LoadError, MetricLine, PageHeader, PlatformTag, StatusPill, when } from '../ui';

export const dynamic = 'force-dynamic';

type View = 'board' | 'table' | 'calendar';
type Search = { view?: string; brand?: string; month?: string; notice?: string; error?: string };

const STAGES: { key: IdeaStatus; label: string; hint: string }[] = [
  { key: 'idea', label: 'Ideas', hint: 'Worth posting about' },
  { key: 'drafting', label: 'Drafting', hint: 'Being written' },
  { key: 'approved', label: 'Approved', hint: 'Ready to schedule' },
  { key: 'scheduled', label: 'Scheduled', hint: 'Queued to publish' },
  { key: 'live', label: 'Live', hint: 'Published, being measured' },
];
const NEXT: Partial<Record<IdeaStatus, IdeaStatus>> = { idea: 'drafting', drafting: 'approved' };
const PREV: Partial<Record<IdeaStatus, IdeaStatus>> = { drafting: 'idea', approved: 'drafting' };

const href = (s: Search, patch: Partial<Search>) => {
  const p = new URLSearchParams();
  const merged = { view: s.view, brand: s.brand, month: s.month, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
  return `/hub${p.size ? `?${p}` : ''}`;
};

export default async function HubPage({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await searchParams;
  const view: View = s.view === 'table' || s.view === 'calendar' ? s.view : 'board';
  const res = await loadAll<[BrandView[], IdeaView[], PostView[]]>([getBrands(), getIdeas({ brandId: s.brand }), getPosts({ brandId: s.brand, limit: '500' })]);
  if (!res.ok) return (<><PageHeader title="Hub" /><LoadError message={res.error} /></>);
  const [brands, ideas, posts] = res.data;
  const here = href(s, { notice: undefined, error: undefined });

  return (
    <>
      <PageHeader
        eyebrow="Hub"
        title="Every idea, from first thought to measured result"
        sub="Ideas, drafts and posts across your brands. Board, table or calendar."
        actions={
          <>
            <nav className="segmented" aria-label="View">
              {(['board', 'table', 'calendar'] as const).map((v) => (
                <Link key={v} href={href(s, { view: v === 'board' ? undefined : v })} aria-current={view === v ? 'page' : undefined}>
                  {v[0]!.toUpperCase() + v.slice(1)}
                </Link>
              ))}
            </nav>
            <Link className="button primary" href="/compose">New post</Link>
          </>
        }
      />
      <nav className="row small" aria-label="Brand filter">
        <span className="muted">Brand:</span>
        <Link href={href(s, { brand: undefined })} aria-current={!s.brand ? 'page' : undefined} className={!s.brand ? 'pill' : undefined}>All brands</Link>
        {brands.map((b) => (
          <Link key={b.id} href={href(s, { brand: b.id })} aria-current={s.brand === b.id ? 'page' : undefined} className={s.brand === b.id ? 'pill' : undefined}>{b.name}</Link>
        ))}
      </nav>
      <Flash params={s} />
      {brands.length === 0 ? (
        <p className="muted">Add a brand first. <Link href="/brands/new">Add a brand</Link></p>
      ) : view === 'board' ? (
        <Board ideas={ideas} posts={posts} brands={brands} brandFilter={s.brand} here={here} />
      ) : view === 'table' ? (
        <Table ideas={ideas} posts={posts} />
      ) : (
        <Calendar posts={posts} month={s.month} s={s} />
      )}
    </>
  );
}

function Board({ ideas, posts, brands, brandFilter, here }: { ideas: IdeaView[]; posts: PostView[]; brands: BrandView[]; brandFilter?: string; here: string }) {
  const ideaTitle = new Map(ideas.map((i) => [i.id, i.title]));
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
  return (
    <div className="board">
      {STAGES.map((stage) => {
        const stageIdeas = ideas.filter((i) => i.status === stage.key && (stage.key === 'idea' || stage.key === 'drafting' || stage.key === 'approved'));
        const stagePosts =
          stage.key === 'scheduled'
            ? posts.filter((p) => ['scheduled', 'publishing', 'pending', 'unknown', 'failed'].includes(p.status))
            : stage.key === 'live'
              ? posts.filter((p) => p.status === 'published' && (p.publishedAt ?? '') >= twoWeeksAgo)
              : [];
        return (
          <section key={stage.key} className="column" aria-label={stage.label}>
            <div className="column-head">
              <h2>{stage.label}</h2>
              <span className="muted small">{stageIdeas.length + stagePosts.length}</span>
            </div>
            {stage.key === 'idea' ? (
              <form action={createIdea} className="item stack">
                <input type="hidden" name="returnTo" value={here} />
                {brandFilter ? <input type="hidden" name="brandId" value={brandFilter} /> : (
                  <select name="brandId" aria-label="Brand" required>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                <input name="title" placeholder="New idea…" aria-label="Idea" required maxLength={300} />
                <button type="submit">Add idea</button>
              </form>
            ) : null}
            {stage.key === 'idea' ? (
              <form action={suggestIdeas} className="item stack staging" style={{ background: 'transparent' }}>
                <input type="hidden" name="returnTo" value={here} />
                <span className="spread"><span className="label">Agent · Suggest ideas</span><span className="tag">Simulated</span></span>
                <span className="dim small">From what worked, audience pain points and products. Each idea cites its reason.</span>
                {brandFilter ? <input type="hidden" name="brandId" value={brandFilter} /> : (
                  <select name="brandId" aria-label="Brand to suggest for" required>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                <button type="submit" className="primary">Suggest 5 ideas</button>
              </form>
            ) : null}
            {stageIdeas.map((i) => (
              <article key={i.id} className="item">
                <div className="item-title">{i.title}</div>
                {i.angle ? <div className="muted small">{i.angle}</div> : null}
                <div className="item-meta">
                  <span>{i.brandName}</span>
                  {i.basis.length ? null : <span>added by you</span>}
                </div>
                {i.basis.slice(0, 2).map((b) => <span key={b.signalId} className="cite" style={{ justifySelf: 'start' }}>{b.note ?? 'cited signal'}</span>)}
                <div className="item-actions">
                  {PREV[i.status] ? <MoveButton id={i.id} to={PREV[i.status]!} label="←" here={here} title={`Back to ${PREV[i.status]}`} /> : null}
                  {NEXT[i.status] ? <MoveButton id={i.id} to={NEXT[i.status]!} label={`To ${NEXT[i.status]} →`} here={here} /> : null}
                  <Link className="button" href={`/studio/${i.id}`}>Studio →</Link>
                  <form action={deleteIdea} className="inline-form">
                    <input type="hidden" name="ideaId" value={i.id} />
                    <input type="hidden" name="returnTo" value={here} />
                    <button type="submit" className="link-button small" title="Delete idea">Delete</button>
                  </form>
                </div>
              </article>
            ))}
            {stagePosts.map((p) => (
              <Link key={p.id} href={`/performance/${p.id}`} className="item" style={{ textDecoration: 'none', color: 'inherit' }}>
                {p.ideaId && ideaTitle.get(p.ideaId) ? <div className="muted small">Idea: {ideaTitle.get(p.ideaId)}</div> : null}
                <div className="item-title">{p.parts[0]?.text.slice(0, 120)}</div>
                <div className="item-meta">
                  <PlatformTag platform={p.channel.platform} />
                  <span>{p.brandName}</span>
                  <span>{when(p.publishedAt ?? p.scheduledFor, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                {p.status === 'published' ? <MetricLine metrics={p.latest?.metrics} /> : <StatusPill status={p.status} />}
              </Link>
            ))}
            {stageIdeas.length + stagePosts.length === 0 && stage.key !== 'idea' ? <p className="muted small" style={{ padding: '0 4px' }}>{stage.hint}</p> : null}
          </section>
        );
      })}
    </div>
  );
}

function MoveButton({ id, to, label, here, title }: { id: string; to: IdeaStatus; label: string; here: string; title?: string }) {
  return (
    <form action={moveIdea} className="inline-form">
      <input type="hidden" name="ideaId" value={id} />
      <input type="hidden" name="status" value={to} />
      <input type="hidden" name="returnTo" value={here} />
      <button type="submit" title={title}>{label}</button>
    </form>
  );
}

function Table({ ideas, posts }: { ideas: IdeaView[]; posts: PostView[] }) {
  const rows = [
    ...ideas.filter((i) => i.status === 'idea' || i.status === 'drafting' || i.status === 'approved').map((i) => ({
      key: i.id, stage: i.status as string, title: i.title, brand: i.brandName, channel: null, at: i.updatedAt, post: null as PostView | null,
    })),
    ...posts.map((p) => ({
      key: p.id, stage: p.status === 'published' ? 'live' : 'scheduled', title: p.parts[0]?.text ?? '', brand: p.brandName, channel: p.channel, at: p.publishedAt ?? p.scheduledFor ?? p.createdAt, post: p,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (rows.length === 0) return <p className="muted">Nothing here yet. Add an idea on the board or write a post.</p>;
  return (
    <section className="scroll">
      <table>
        <thead><tr><th>Stage</th><th>Idea or post</th><th>Brand</th><th>Channel</th><th>When</th><th>Results</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.post ? <StatusPill status={r.post.status} /> : <span className={`pill s-${r.stage}`}>{r.stage}</span>}</td>
              <td style={{ maxWidth: 380 }}>{r.post ? <Link href={`/performance/${r.post.id}`}>{r.title.slice(0, 120)}</Link> : r.title}</td>
              <td>{r.brand}</td>
              <td>{r.channel ? <PlatformTag platform={r.channel.platform} handle={r.channel.handle} /> : <span className="muted">–</span>}</td>
              <td className="small">{when(r.at)}</td>
              <td>{r.post?.status === 'published' ? <MetricLine metrics={r.post.latest?.metrics} /> : <span className="muted">–</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Calendar({ posts, month, s }: { posts: PostView[]; month?: string; s: Search }) {
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(month ?? '') ? month!.split('-').map(Number) as [number, number] : [now.getFullYear(), now.getMonth() + 1];
  const first = new Date(y, m - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = new Map<string, PostView[]>();
  for (const p of posts) {
    const at = p.publishedAt ?? p.scheduledFor;
    if (!at) continue;
    const k = key(new Date(at));
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prev = ym(new Date(y, m - 2, 1));
  const next = ym(new Date(y, m, 1));
  // Show only as many weeks as the month needs (4–6).
  const lastInMonth = new Date(y, m, 0).getDate() + first.getDay();
  const visible = days.slice(0, Math.ceil(lastInMonth / 7) * 7);

  return (
    <section className="stack">
      <div className="row">
        <Link className="button" href={href(s, { month: prev })} aria-label="Previous month">←</Link>
        <h2 style={{ margin: 0 }}>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
        <Link className="button" href={href(s, { month: next })} aria-label="Next month">→</Link>
        <Link className="small" href={href(s, { month: undefined })}>Today</Link>
      </div>
      <div className="scroll">
        <div className="calendar" role="grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
          {visible.map((d) => {
            const items = byDay.get(key(d)) ?? [];
            const isToday = key(d) === key(now);
            return (
              <div key={key(d)} className={`cal-day${d.getMonth() !== m - 1 ? ' other' : ''}${isToday ? ' today' : ''}`} role="gridcell">
                <span className="cal-date">{d.getDate()}</span>
                {items.map((p) => (
                  <Link key={p.id} href={`/performance/${p.id}`} className={`cal-post s-${p.status}`} title={`${p.brandName}: ${p.parts[0]?.text ?? ''}`}>
                    {when(p.publishedAt ?? p.scheduledFor, { hour: 'numeric', minute: '2-digit' })} {p.channel.platform} · {p.parts[0]?.text.slice(0, 40)}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
