import Link from 'next/link';
import { generateDigest } from '../actions';
import { getBestTimes, getBrands, getDigest, getOverview, getPosts, loadAll, type BestTimes, type BrandView, type Digest, type Finding, type OverviewBrand, type PostView } from '../api';
import { BrandMark, Flash, LoadError, PageHeader, PlatformTag, VerdictTag, compact } from '../ui';

export const dynamic = 'force-dynamic';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
const pct = (ratio?: number) => (ratio === undefined ? undefined : `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`);
const confidence = (c: number) => (c >= 0.7 ? 'High confidence' : c >= 0.4 ? 'Medium confidence' : 'Low confidence');

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ brand?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const res = await loadAll<[BrandView[], OverviewBrand[]]>([getBrands(), getOverview()]);
  if (!res.ok) return (<><PageHeader title="Insights" /><LoadError message={res.error} /></>);
  const [brands, overview] = res.data;
  // Default to the most active brand (one with a digest first), not simply the first one created.
  const busiest = [...overview].sort((a, b) => Number(!!b.digestHeadline) - Number(!!a.digestHeadline) || b.published7d - a.published7d)[0];
  const brand = brands.find((b) => b.id === s.brand) ?? brands.find((b) => b.id === busiest?.brandId) ?? brands[0];

  let detail: { digest?: Digest; best?: BestTimes; posts: PostView[] } = { posts: [] };
  if (brand) {
    const d = await loadAll<[Digest | undefined, BestTimes, PostView[]]>([getDigest(brand.id), getBestTimes(brand.id), getPosts({ brandId: brand.id, limit: '200' })]);
    if (!d.ok) return (<><PageHeader title="Insights" /><LoadError message={d.error} /></>);
    detail = { digest: d.data[0], best: d.data[1], posts: d.data[2] };
  }
  const postById = new Map(detail.posts.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader eyebrow="Insights" title="What's working, and why" sub="Every published post is compared with its brand's median on the same platform at the same age. The digest turns that into what to do next." />
      <Flash params={s} />

      {brands.length === 0 ? <div className="empty"><span className="muted">Add a brand and publish a few posts; insights start from there.</span></div> : null}

      {overview.length ? (
        <section className="scroll">
          <h2>Across your brands · last 7 days</h2>
          <table>
            <thead><tr><th>Brand</th><th className="num">Published</th><th className="num">Median views at 24h</th><th className="num">Vs. previous week</th><th className="num">Above median</th><th className="num">Below median</th><th>Headline</th></tr></thead>
            <tbody>
              {overview.map((o) => (
                <tr key={o.brandId}>
                  <td><Link href={`/insights?brand=${o.brandId}`} className="row" style={{ gap: 8, textDecoration: 'none' }}><BrandMark name={o.brandName} logoUrl={brands.find((b) => b.id === o.brandId)?.logoUrl} size={20} />{o.brandName}</Link></td>
                  <td className="num">{o.published7d}</td>
                  <td className="num">{o.medianViews24h !== undefined ? compact(o.medianViews24h) : '–'}</td>
                  <td className="num"><Change ratio={o.change} /></td>
                  <td className="num">{o.outperformed}</td>
                  <td className="num">{o.underperformed}</td>
                  <td className="small muted" style={{ maxWidth: 360 }}>{o.digestHeadline ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {brand ? (
        <>
          <nav className="row small" aria-label="Brand">
            <span className="label">Brand</span>
            {brands.map((b) => (
              <Link key={b.id} href={`/insights?brand=${b.id}`} className={b.id === brand.id ? 'pill plain' : undefined} aria-current={b.id === brand.id ? 'page' : undefined}>{b.name}</Link>
            ))}
          </nav>

          <div className="grid-2">
            <section className="stack-lg">
              <div className="spread">
                <div className="stack" style={{ gap: 4 }}>
                  <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />Weekly digest · {brand.name}</span>
                  {detail.digest ? (
                    <span className="dim small">
                      {new Date(detail.digest.period.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(detail.digest.period.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {detail.digest.model}
                    </span>
                  ) : null}
                </div>
                <form action={generateDigest}>
                  <input type="hidden" name="brandId" value={brand.id} />
                  <input type="hidden" name="returnTo" value={`/insights?brand=${brand.id}`} />
                  <button type="submit" className={detail.digest ? undefined : 'primary'}>{detail.digest ? 'Rewrite digest' : 'Write the digest'}</button>
                </form>
              </div>
              {detail.digest ? (
                <>
                  <h2 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.025em' }}>{detail.digest.headline}</h2>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                    <div className="stat"><span className="label">Published</span><strong>{detail.digest.stats.published}</strong></div>
                    <div className="stat"><span className="label">Median views · 24h</span><strong>{detail.digest.stats.medianViews24h !== undefined ? compact(detail.digest.stats.medianViews24h) : '–'}</strong></div>
                    <div className="stat"><span className="label">Vs. last period</span><strong>{detail.digest.stats.change === undefined ? '–' : Math.abs(detail.digest.stats.change - 1) < 0.05 ? 'Flat' : pct(detail.digest.stats.change)}</strong></div>
                  </div>
                  <Findings title="What worked" items={detail.digest.wins} posts={postById} />
                  <Findings title="What didn't" items={detail.digest.misses} posts={postById} />
                  <Findings title="Patterns" items={detail.digest.patterns} posts={postById} />
                  <Findings title="Do next" items={detail.digest.recommendations} posts={postById} />
                </>
              ) : (
                <div className="empty"><span className="muted">No digest yet for {brand.name}. Harbor reads every post's growth curve and writes what worked, what didn't and what to do next.</span></div>
              )}
            </section>

            <section className="stack">
              <span className="label">Best times to post · {brand.name}</span>
              {detail.best ? <Heatmap best={detail.best} /> : <span className="dim small">Not enough data yet.</span>}
              {detail.best?.top.length ? (
                <ul className="list small">
                  {detail.best.top.map((t) => (
                    <li key={`${t.weekday}${t.hour}`} style={{ gridTemplateColumns: '1fr auto' }}>
                      <span>{DAYS[t.weekday]} {hourLabel(t.hour)}</span>
                      <span className="mono dim">{Math.round(t.score * 100)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link className="small" href={`/hub?view=calendar&brand=${brand.id}`}>See these slots on the calendar →</Link>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}

function Findings({ title, items, posts }: { title: string; items: Finding[]; posts: Map<string, PostView> }) {
  if (!items.length) return null;
  return (
    <div className="stack" style={{ gap: 0 }}>
      <span className="label" style={{ marginBottom: 10 }}>{title}</span>
      {items.map((f, i) => (
        <div key={i} className="finding">
          <div className="spread" style={{ alignItems: 'baseline' }}>
            <strong style={{ fontWeight: 500 }}>{f.title}</strong>
            <span className="dim small">{confidence(f.confidence)}</span>
          </div>
          <p className="muted small" style={{ maxWidth: '72ch' }}>{f.detail}</p>
          {f.posts.length ? (
            <div className="stack" style={{ gap: 4 }}>
              {f.posts.slice(0, 3).map((id) => {
                const p = posts.get(id);
                return p ? (
                  <Link key={id} href={`/performance/${id}`} className="row small" style={{ gap: 8, textDecoration: 'none' }}>
                    <PlatformTag platform={p.channel.platform} iconOnly />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{p.parts[0]?.text}</span>
                    <VerdictTag outcome={p.outcome} />
                  </Link>
                ) : null;
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** 7 × 24 grid, one hue (violet) light → dark = better. Top slots outlined. Hover a cell for its score and basis. */
function Heatmap({ best }: { best: BestTimes }) {
  const score = new Map(best.slots.map((s) => [`${s.weekday}:${s.hour}`, s]));
  const top = new Set(best.top.map((t) => `${t.weekday}:${t.hour}`));
  const xs = best.slots.map((s) => s.score);
  const min = Math.min(...xs), max = Math.max(...xs);
  // Relative to this brand's own range, so the best hours stand out even when every score is high.
  const rel = (v: number) => (max > min ? (v - min) / (max - min) : 0);
  const heat = (v: number) => `color-mix(in oklab, var(--stage-drafting) ${Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1.4) * 80)}%, var(--sunken))`;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="scroll">
        <div className="heatmap" role="img" aria-label="Best posting times by weekday and hour">
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="hm-hour">{h % 6 === 0 ? hourLabel(h) : ''}</span>)}
          {DAYS.map((d, wd) => (
            <div key={d} style={{ display: 'contents' }}>
              <span className="hm-label">{d}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const s = score.get(`${wd}:${h}`);
                return (
                  <span
                    key={h}
                    className={`hm-cell${top.has(`${wd}:${h}`) ? ' top' : ''}`}
                    style={s ? { background: heat(rel(s.score)) } : undefined}
                    title={s ? `${d} ${hourLabel(h)} · score ${Math.round(s.score * 100)} · ${s.basis === 'history' ? `${s.posts} past posts` : 'platform norm'}` : `${d} ${hourLabel(h)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="row small dim">
        <span className="heat-legend" aria-hidden="true">{[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => <i key={v} style={{ background: heat(v) }} />)}</span>
        better → · outlined = top 5 · {best.slots.some((s) => s.basis === 'history') ? 'from this brand’s posts, blended with platform norms' : 'platform norms until there are more posts'}
      </div>
    </div>
  );
}

/** Period-over-period change: within ±5% reads as flat (neutral); otherwise an arrow and a signed percent. */
function Change({ ratio }: { ratio?: number }) {
  if (ratio === undefined) return <span className="dim">–</span>;
  if (Math.abs(ratio - 1) < 0.05) return <span className="verdict met">flat</span>;
  return <span className={`verdict ${ratio > 1 ? 'outperformed' : 'underperformed'}`}>{ratio > 1 ? '↑' : '↓'} {pct(ratio)}</span>;
}
