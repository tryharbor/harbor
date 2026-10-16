import Link from 'next/link';
import { deleteMedia, saveMediaDetails } from '../../media-actions';
import { getMediaAsset, loadAll, type MediaDetail } from '../../api';
import { Flash, LoadError, PageHeader, PlatformTag } from '../../ui';
import { FocalPicker } from './focal-picker';

export const dynamic = 'force-dynamic';

const size = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const USAGE_HREF = { draft: (_id: string) => '/studio', post: (id: string) => `/performance/${id}`, approval: (id: string) => `/approvals#${id}` };

export default async function MediaAssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const [{ id }, s] = await Promise.all([params, searchParams]);
  const res = await loadAll<[MediaDetail]>([getMediaAsset(id)]);
  if (!res.ok) return (<><Link href="/media">← Media</Link><LoadError message={res.error} /></>);
  const [a] = res.data;
  const live = a.usage.filter((u) => u.kind === 'post' && (u.status === 'scheduled' || u.status === 'publishing'));

  return (
    <>
      <Link href={`/media?brand=${a.brandId}`}>← Media</Link>
      <PageHeader title={a.alt || a.originalName || 'Untitled'} sub={<span className="mono small">{a.kind} · {a.mime}{a.width ? ` · ${a.width}×${a.height}` : ''} · {size(a.bytes)}</span>} />
      <Flash params={s} />
      <div className="grid-2">
        <section className="stack">
          {a.kind === 'image' ? <FocalPicker asset={a} /> : <video src={a.url} controls style={{ width: '100%', background: 'var(--sunken)' }} />}
        </section>
        <aside className="stack">
          <form action={saveMediaDetails} className="card stack">
            <input type="hidden" name="assetId" value={a.id} />
            <label className="field">
              <span className="label">Alt text</span>
              <textarea name="alt" defaultValue={a.alt} style={{ minHeight: 90 }} placeholder="What's in the image, for people who can't see it" />
              <span className="field-help">Sent to X, LinkedIn and Instagram with the post.</span>
            </label>
            <label className="field">
              <span className="label">Tags</span>
              <input name="tags" defaultValue={a.tags.join(', ')} placeholder="launch, product, behind-the-scenes" />
              <span className="field-help">The weekly plan matches tags to ideas when it picks an image.</span>
            </label>
            <div><button type="submit" className="inverse">Save</button></div>
          </form>
          <section className="stack">
            <span className="label">Used in · {a.usage.length}</span>
            {a.usage.length ? (
              <ul className="list small">
                {a.usage.map((u) => (
                  <li key={`${u.kind}${u.id}`} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                    <PlatformTag platform={u.platform} iconOnly />
                    <Link href={USAGE_HREF[u.kind](u.id)} className="evidence-text">{u.text}</Link>
                    <span className="dim mono">{u.kind}{u.status ? ` · ${u.status}` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : <span className="small dim">Not used yet.</span>}
          </section>
          <form action={deleteMedia}>
            <input type="hidden" name="assetId" value={a.id} />
            <input type="hidden" name="brandId" value={a.brandId} />
            <button type="submit" className="link-button" disabled={live.length > 0} title={live.length ? 'A scheduled post uses it' : undefined}>Delete</button>
            {live.length ? <span className="small dim"> A scheduled post uses this.</span> : null}
          </form>
        </aside>
      </div>
    </>
  );
}
