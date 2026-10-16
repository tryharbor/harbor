import Link from 'next/link';
import { API_BROWSER_URL, getBrands, getMedia, loadAll, type BrandView, type MediaAsset } from '../api';
import { MediaUploader } from '../components/media-uploader';
import { BrandMark, Flash, LoadError, PageHeader } from '../ui';

export const dynamic = 'force-dynamic';

const size = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ brand?: string; tag?: string; q?: string; kind?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const res = await loadAll<[BrandView[]]>([getBrands()]);
  if (!res.ok) return (<><PageHeader title="Media" /><LoadError message={res.error} /></>);
  const [brands] = res.data;
  const brand = brands.find((b) => b.id === s.brand) ?? brands[0];
  if (!brand) return (<><PageHeader title="Media" /><div className="empty"><span className="muted">Add a brand first; media belongs to a brand.</span></div></>);
  const lib = await loadAll<[{ data: MediaAsset[]; tags: { tag: string; count: number }[] }]>([getMedia(brand.id, { tag: s.tag, q: s.q, kind: s.kind, limit: '200' })]);
  if (!lib.ok) return (<><PageHeader title="Media" /><LoadError message={lib.error} /></>);
  const [{ data: assets, tags }] = lib.data;
  const link = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ brand: brand.id, tag: s.tag, q: s.q, kind: s.kind, ...p }).filter((e): e is [string, string] => !!e[1]));
    return `/media?${q}`;
  };

  return (
    <>
      <PageHeader eyebrow="Media" title="Media library" sub="Every image and video a brand posts with. Set a focal point once and Harbor crops for each platform: 4:5 for Instagram, 16:9 for X, 1.91:1 for LinkedIn." />
      <Flash params={s} />
      <nav className="segmented" aria-label="Brand">
        {brands.map((b) => (
          <Link key={b.id} href={`/media?brand=${b.id}`} aria-current={b.id === brand.id ? 'page' : undefined} className="row" style={{ gap: 6 }}>
            <BrandMark name={b.name} logoUrl={b.logoUrl} size={14} />{b.name}
          </Link>
        ))}
      </nav>
      <MediaUploader apiUrl={API_BROWSER_URL} brandId={brand.id} />

      <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="chips">
          <Link href={link({ tag: undefined })} className={`chip${!s.tag ? ' on' : ''}`}>All</Link>
          {tags.map((t) => <Link key={t.tag} href={link({ tag: t.tag })} className={`chip${s.tag === t.tag ? ' on' : ''}`}>{t.tag} · {t.count}</Link>)}
        </div>
        <form className="row" style={{ gap: 6 }} action="/media">
          <input type="hidden" name="brand" value={brand.id} />
          {s.tag ? <input type="hidden" name="tag" value={s.tag} /> : null}
          <input name="q" defaultValue={s.q} placeholder="Search alt text, names, tags" style={{ width: 240 }} />
          <select name="kind" defaultValue={s.kind ?? ''} style={{ width: 120 }}><option value="">All kinds</option><option value="image">Images</option><option value="video">Video</option></select>
          <button type="submit">Filter</button>
        </form>
      </div>

      {assets.length ? (
        <div className="media-grid">
          {assets.map((a) => (
            <Link key={a.id} href={`/media/${a.id}`} className="media-tile">
              <span className="media-thumb">
                {a.kind === 'image' ? <img src={a.variants.square ?? a.url} alt={a.alt ?? ''} loading="lazy" /> : <span className="media-video mono">▶ video</span>}
              </span>
              <span className="media-meta">
                <span className="evidence-text small">{a.alt || a.originalName || 'No alt text'}</span>
                <span className="mono dim small">{a.width && a.height ? `${a.width}×${a.height} · ` : ''}{size(a.bytes)}{a.usageCount ? ` · used ${a.usageCount}×` : ''}</span>
              </span>
              {!a.alt ? <span className="media-flag" title="Add alt text so screen readers can describe it">No alt</span> : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty"><span className="muted">{s.tag || s.q || s.kind ? 'Nothing matches these filters.' : `No media for ${brand.name} yet. Drop a few images above.`}</span></div>
      )}
    </>
  );
}
