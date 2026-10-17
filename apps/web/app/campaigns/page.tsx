import Link from 'next/link';
import { createCampaign } from '../canvas-actions';
import { getBrands, getCampaigns, loadAll, type BrandView, type Campaign } from '../api';
import { Flash, LoadError, PageHeader, brandOptions } from '../ui';
import { Select } from '../components/select';

export const dynamic = 'force-dynamic';

const fmt = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ error?: string; brandId?: string }> }) {
  const s = await searchParams;
  const res = await loadAll<[BrandView[], Campaign[]]>([getBrands(), getCampaigns()]);
  if (!res.ok) return (<><PageHeader title="Campaigns" /><LoadError message={res.error} /></>);
  const [brands, campaigns] = res.data;

  return (
    <>
      <PageHeader
        eyebrow="Campaigns"
        title="A canvas for every push"
        sub="Each campaign is an open board: ideas, drafts, published posts, signals and notes, grouped into frames and linked together."
      />
      <Flash params={s} />
      <div className="grid-2">
        <section>
          <h2>Campaigns</h2>
          {campaigns.length === 0 ? (
            <div className="empty"><span className="muted">No campaigns yet. Start one for a launch, a series or a month of posts.</span></div>
          ) : (
            <ul className="list">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <div className="spread">
                    <Link href={`/campaigns/${c.id}`} style={{ fontWeight: 500, textDecoration: 'none' }}>{c.name}</Link>
                    <span className={`pill ${c.status === 'active' ? 's-scheduled' : 'plain'}`}>{c.status}</span>
                  </div>
                  <span className="row small dim">
                    <span>{c.brandName}</span>
                    {c.startsOn ? <span className="mono">{fmt(c.startsOn)}{c.endsOn ? ` – ${fmt(c.endsOn)}` : ''}</span> : null}
                    <span className="mono">{c.itemCount} cards</span>
                  </span>
                  {c.goal ? <span className="muted small">{c.goal}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <form action={createCampaign} className="card stack staging">
          <span className="label">New campaign</span>
          <div className="field">
            <label htmlFor="brandId">Brand</label>
            <Select id="brandId" name="brandId" defaultValue={s.brandId} options={brandOptions(brands)} />
          </div>
          <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" required placeholder="Launch week" /></div>
          <div className="field"><label htmlFor="goal">Goal</label><input id="goal" name="goal" placeholder="200 waitlist signups from builders" /></div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label htmlFor="startsOn">Starts</label><input id="startsOn" name="startsOn" type="date" /></div>
            <div className="field"><label htmlFor="endsOn">Ends</label><input id="endsOn" name="endsOn" type="date" /></div>
          </div>
          <div><button className="primary" type="submit">Create and open the canvas</button></div>
        </form>
      </div>
    </>
  );
}
