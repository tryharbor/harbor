import Link from 'next/link';
import { createIdea } from '../actions';
import { getBrands, getDrafts, getIdeas, loadAll, type BrandView, type DraftView, type IdeaView } from '../api';
import { Flash, LoadError, PageHeader, brandOptions } from '../ui';
import { Select } from '../components/select';

export const dynamic = 'force-dynamic';

export default async function StudioIndex({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const flash = await searchParams;
  const res = await loadAll<[BrandView[], IdeaView[], DraftView[]]>([getBrands(), getIdeas(), getDrafts()]);
  if (!res.ok) return (<><PageHeader title="Studio" /><LoadError message={res.error} /></>);
  const [brands, ideas, drafts] = res.data;
  const open = ideas.filter((i) => i.status === 'drafting' || i.status === 'approved' || i.status === 'idea');
  const draftsFor = (id: string) => drafts.filter((d) => d.ideaId === id);
  const order = { drafting: 0, approved: 1, idea: 2, scheduled: 3, live: 4 } as const;

  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Write once, shape it for every platform"
        sub="Pick an idea. Harbor drafts a version per platform in the brand's voice; you edit, preview, compare versions and schedule."
      />
      <Flash params={flash} />
      <div className="grid-2">
        <section>
          <h2>Ideas to work on</h2>
          {open.length === 0 ? (
            <div className="empty"><span className="muted">No open ideas. Add one, or let Harbor suggest some in the <Link href="/hub">hub</Link>.</span></div>
          ) : (
            <ul className="list">
              {[...open].sort((a, b) => order[a.status] - order[b.status]).map((i) => {
                const ds = draftsFor(i.id);
                return (
                  <li key={i.id}>
                    <div className="spread">
                      <Link href={`/studio/${i.id}`} style={{ fontWeight: 500, textDecoration: 'none' }}>{i.title}</Link>
                      <span className={`pill s-${i.status}`}>{i.status}</span>
                    </div>
                    <span className="row small dim">
                      <span>{i.brandName}</span>
                      {ds.length ? <span className="mono">{[...new Set(ds.map((d) => d.platform))].join(' · ')}</span> : <span>no drafts yet</span>}
                      {i.basis.length ? <span className="cite">{i.basis[0]?.note ?? 'cited signal'}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <form action={createIdea} className="card stack staging">
          <span className="label">Start from your own idea</span>
          <input type="hidden" name="returnTo" value="/studio" />
          <div className="field">
            <label htmlFor="brandId">Brand</label>
            <Select id="brandId" name="brandId" options={brandOptions(brands)} />
          </div>
          <div className="field"><label htmlFor="title">Idea</label><input id="title" name="title" required placeholder="Why we chose AGPL" /></div>
          <div className="field"><label htmlFor="angle">Angle (optional)</label><textarea id="angle" name="angle" style={{ minHeight: 80 }} placeholder="Founder story, with the trade-offs" /></div>
          <div><button className="primary" type="submit">Add idea</button></div>
        </form>
      </div>
    </>
  );
}
