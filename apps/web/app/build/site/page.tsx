import Link from 'next/link';
import { redirect } from 'next/navigation';
import { saveWebsite, setSiteDirection, siteAction } from '../../actions';
import { API_BROWSER_URL, getBrands, getSite, getSiteDirections, getSiteLeads, loadAll, type BrandView, type Site, type SiteDirection, type SiteSection } from '../../api';
import { SubmitButton } from '../../components/submit-button';
import { LoadError, when } from '../../ui';

export const dynamic = 'force-dynamic';

/**
 * A website, in the same layout as a Full app: a slim panel on the left (Design, Words, Messages) and the site filling the
 * rest of the screen, with Publish where Replit keeps it, top right.
 */

const TABS = { design: 'Design', words: 'Words', messages: 'Messages' } as const;
type Tab = keyof typeof TABS;

const Hidden = ({ brandId, siteId, tab }: { brandId: string; siteId: string; tab: Tab }) => (
  <><input type="hidden" name="brandId" value={brandId} /><input type="hidden" name="siteId" value={siteId} /><input type="hidden" name="tab" value={tab} /></>
);

function SectionFields({ s, i }: { s: SiteSection; i: number }) {
  const n = (k: string) => `s${i}_${k}`;
  const head = { hero: 'Top of the page', offers: 'What you offer', proof: 'Why customers pick you', about: 'About', contact: 'Contact' }[s.kind];
  return (
    <details className="site-section" open={i === 0}>
      <summary>{head}</summary>
      <input type="hidden" name={n('kind')} value={s.kind} />
      {s.kind === 'hero' ? (
        <>
          <div className="field"><label htmlFor={n('headline')}>Headline</label><input id={n('headline')} name={n('headline')} defaultValue={s.headline} maxLength={120} required /></div>
          <div className="field"><label htmlFor={n('sub')}>Under the headline</label><textarea id={n('sub')} name={n('sub')} defaultValue={s.sub} maxLength={400} style={{ minHeight: 70 }} /></div>
          <div className="field"><label htmlFor={n('cta')}>Button text</label><input id={n('cta')} name={n('cta')} defaultValue={s.cta} maxLength={40} required /></div>
        </>
      ) : null}
      {s.kind === 'offers' ? (
        <>
          <div className="field"><label htmlFor={n('title')}>Section title</label><input id={n('title')} name={n('title')} defaultValue={s.title} maxLength={80} /></div>
          {[...s.items, { name: '', summary: '', price: '' }].map((it, j) => (
            <div key={j} className="offer-row">
              <input name={`s${i}_${j}_name`} defaultValue={it.name} placeholder={j === s.items.length ? 'Add another (name)' : 'Name'} aria-label="Offer name" maxLength={80} />
              <input name={`s${i}_${j}_price`} defaultValue={it.price ?? ''} placeholder="Price" aria-label="Price" maxLength={80} />
              <input name={`s${i}_${j}_summary`} defaultValue={it.summary} placeholder="One line about it" aria-label="Offer summary" maxLength={400} />
            </div>
          ))}
          <span className="small dim">Clear a name to remove that offer.</span>
        </>
      ) : null}
      {s.kind === 'proof' ? (
        <>
          <div className="field"><label htmlFor={n('title')}>Section title</label><input id={n('title')} name={n('title')} defaultValue={s.title} maxLength={80} /></div>
          <div className="field"><label htmlFor={n('points')}>Points (one per line)</label><textarea id={n('points')} name={n('points')} defaultValue={s.points.join('\n')} style={{ minHeight: 90 }} /></div>
          <span className="small dim">Only claims that are true.</span>
        </>
      ) : null}
      {s.kind === 'about' || s.kind === 'contact' ? (
        <>
          <div className="field"><label htmlFor={n('title')}>Section title</label><input id={n('title')} name={n('title')} defaultValue={s.title} maxLength={80} /></div>
          <div className="field"><label htmlFor={n('body')}>Text</label><textarea id={n('body')} name={n('body')} defaultValue={s.body} maxLength={s.kind === 'about' ? 1500 : 400} style={{ minHeight: s.kind === 'about' ? 110 : 60 }} /></div>
        </>
      ) : null}
    </details>
  );
}

export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ brand?: string; tab?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const tab: Tab = s.tab === 'words' || s.tab === 'messages' ? s.tab : 'design';
  const base = await loadAll<[BrandView[], { id: SiteDirection; name: string; note: string }[]]>([getBrands(), getSiteDirections()]);
  if (!base.ok) return <LoadError message={base.error} />;
  const [brands, directions] = base.data;
  const brand = brands.find((b) => b.id === s.brand && b.kind === 'brand');
  if (!brand) redirect('/build');
  const res = await loadAll<[Site | null]>([getSite(brand.id)]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [site] = res.data;
  if (!site) redirect(`/build?brand=${brand.id}`);
  const leads = await getSiteLeads(site.id).catch(() => []);

  const live = site.status === 'published';
  const url = `${API_BROWSER_URL}/sites/${site.slug}`;
  const v = encodeURIComponent(site.updatedAt + brand.updatedAt);
  const h = { brandId: brand.id, siteId: site.id, tab };
  const tabHref = (t: Tab) => `/build/site?brand=${brand.id}&tab=${t}`;

  return (
    <div className="ide">
      <aside className="ide-chat with-tabs">
        <header className="ide-head">
          <Link href={`/build?brand=${brand.id}`} className="ide-back" aria-label="Back to Build">←</Link>
          <strong className="ide-name">{brand.name.replace(/\s*\(demo\)$/, '')} website</strong>
          <details className="ide-menu">
            <summary aria-label="Website settings">⋯</summary>
            <div className="ide-pop">
              <form action={siteAction}><Hidden {...h} /><input type="hidden" name="what" value="rewrite" /><SubmitButton pending="Rewriting…">Rewrite from Business Memory</SubmitButton></form>
              <span className="small dim">Replaces the words with a fresh draft from Business Memory.</span>
              {live ? <form action={siteAction}><Hidden {...h} /><input type="hidden" name="what" value="unpublish" /><button type="submit" className="link-button small">Unpublish</button></form> : null}
              <form action={siteAction}><Hidden {...h} /><input type="hidden" name="what" value="delete" /><button type="submit" className="link-button small">Delete this website</button></form>
            </div>
          </details>
        </header>

        <nav className="segmented ide-tabs" aria-label="Edit">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link key={t} href={tabHref(t)} aria-current={tab === t ? 'page' : undefined}>{TABS[t]}{t === 'messages' && leads.length ? ` ${leads.length}` : ''}</Link>
          ))}
        </nav>

        {tab === 'words' ? (
          <form action={saveWebsite} className="ide-form">
            <Hidden {...h} />
            <input type="hidden" name="sectionCount" value={site.copy.sections.length} />
            <div className="ide-thread stack">
              {s.error ? <p className="ide-note err" role="alert">{s.error}</p> : s.notice ? <p className="ide-note" role="status">{s.notice}</p> : null}
              {site.copy.sections.map((x, i) => <SectionFields key={`${site.updatedAt}-${i}`} s={x} i={i} />)}
              <details className="site-section">
                <summary>Main button and search</summary>
                <div className="field"><label htmlFor="ctaUrl">Where the main button goes</label><input id="ctaUrl" name="ctaUrl" type="url" defaultValue={site.settings.ctaUrl ?? ''} placeholder="https://buy.stripe.com/… or a booking page" /><span className="small dim">Leave empty to scroll to the contact form.</span></div>
                <div className="field"><label htmlFor="title">Page title (browser tab and Google)</label><input id="title" name="title" defaultValue={site.copy.title} maxLength={120} required /></div>
                <div className="field"><label htmlFor="description">Search description</label><textarea id="description" name="description" defaultValue={site.copy.description} maxLength={200} style={{ minHeight: 60 }} /></div>
              </details>
            </div>
            <div className="ide-compose ide-compose-bar">
              <span className="small dim">Changes show in the preview once saved.</span>
              <SubmitButton className="primary" pending="Saving…">Save</SubmitButton>
            </div>
          </form>
        ) : (
          <div className="ide-thread">
            {s.error ? <p className="ide-note err" role="alert">{s.error}</p> : s.notice ? <p className="ide-note" role="status">{s.notice}</p> : null}
            {tab === 'design' ? (
              <div className="stack">
                <span className="small muted">Three directions from your Branding. Pick one; the words stay the same.</span>
                {directions.map((d) => (
                  <form key={d.id} action={setSiteDirection} className={`direction-card${site.direction === d.id ? ' active' : ''}`}>
                    <Hidden {...h} />
                    <input type="hidden" name="direction" value={d.id} />
                    <div className="direction-thumb" aria-hidden="true">
                      <iframe src={`/build/preview/${site.id}?direction=${d.id}&v=${v}`} title={`${d.name} preview`} tabIndex={-1} loading="lazy" />
                    </div>
                    <div className="spread">
                      <span className="stack" style={{ gap: 0 }}><strong>{d.name}</strong><span className="small muted">{d.note}</span></span>
                      {site.direction === d.id ? <span className="pill s-connected">In use</span> : <SubmitButton pending="…">Use</SubmitButton>}
                    </div>
                  </form>
                ))}
              </div>
            ) : leads.length ? (
              <ul className="ide-leads">
                {leads.map((l) => (
                  <li key={l.id}>
                    <span className="spread"><strong style={{ fontWeight: 500 }}>{l.name}</strong><span className="small dim">{when(l.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
                    <a className="small" href={`mailto:${l.email}`}>{l.email}</a>
                    <span className="muted">{l.message}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="small muted">Messages from your site’s contact form show up here.</p>}
          </div>
        )}
      </aside>

      <section className="ide-main">
        <div className="ide-bar">
          <span className={`pill ${live ? 's-published' : 'plain'}`}>{live ? 'Live' : 'Draft'}</span>
          {live ? (
            <a className="ide-url" href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, '')}</a>
          ) : <span className="ide-url">Only you can see it until you publish.</span>}
          {live ? <a className="button mono-button" href={url} target="_blank" rel="noreferrer">Open ↗</a> : (
            <form action={siteAction}><Hidden {...h} /><input type="hidden" name="what" value="publish" /><SubmitButton className="primary" pending="Publishing…">Publish</SubmitButton></form>
          )}
        </div>
        <div className="ide-body">
          <iframe key={v} src={`/build/preview/${site.id}?v=${v}`} title="Website preview" />
        </div>
      </section>
    </div>
  );
}
