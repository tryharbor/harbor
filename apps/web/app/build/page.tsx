import Link from 'next/link';
import { createProject, createWebsite, saveWebsite, setSiteDirection, siteAction } from '../actions';
import { API_BROWSER_URL, getBrands, getMode, getProjects, getSite, getSiteDirections, getSiteLeads, loadAll, type BrandView, type Mode, type Project, type Site, type SiteDirection, type SiteLead, type SiteSection } from '../api';
import { BrandFilter } from '../components/brand-filter';
import { SubmitButton } from '../components/submit-button';
import { Flash, LoadError, PageHeader, when } from '../ui';

export const dynamic = 'force-dynamic';

const MODES = [
  { key: 'website', name: 'Website', line: 'Get online and get booked.', uses: 'For service businesses and small shops: a finished site with your offer, proof and a contact form, in minutes. No code.' },
  { key: 'app', name: 'Full app', line: 'Build the product itself.', uses: 'For when the product is software, or you need what a site can’t do: accounts, a database, your own features. An agent writes real code you own.' },
] as const;

function Mode({ m, active, href }: { m: (typeof MODES)[number]; active: boolean; href: string }) {
  return (
    <Link href={href} className={`build-mode${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
      <div className="spread"><strong>{m.name}</strong>{active ? <span className="pill s-connected">Selected</span> : null}</div>
      <span className="build-line">{m.line}</span>
      <span className="small muted">{m.uses}</span>
    </Link>
  );
}

function Apps({ brand, projects }: { brand: BrandView; projects: Project[] }) {
  return (
    <section className="stack">
      <h2 style={{ margin: 0 }}>Your apps</h2>
      {projects.length ? (
        <ul className="list">
          {projects.map((p) => (
            <li key={p.id} style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
              <Link href={`/build/apps/${p.id}`}><strong style={{ fontWeight: 500 }}>{p.name}</strong></Link>
              <span className="small dim">${(p.spentCents / 100).toFixed(2)} spent</span>
            </li>
          ))}
        </ul>
      ) : <p className="small muted">No apps yet. Start one; Harbor sets it up with a starter in your brand’s colours, then builds what you ask for.</p>}
      <form action={createProject} className="row" style={{ gap: 6 }}>
        <input type="hidden" name="brandId" value={brand.id} />
        <input name="name" required maxLength={80} placeholder="Name it, e.g. Order tracker" aria-label="App name" style={{ maxWidth: 320 }} />
        <SubmitButton className="primary" pending="Setting up…">New app</SubmitButton>
      </form>
      <span className="small dim">Keep the first builds small and basic. Each build stops at its cost cap ($5 by default).</span>
    </section>
  );
}

const Hidden = ({ brandId, siteId }: { brandId: string; siteId?: string }) => (
  <><input type="hidden" name="brandId" value={brandId} />{siteId ? <input type="hidden" name="siteId" value={siteId} /> : null}</>
);

function SectionFields({ s, i }: { s: SiteSection; i: number }) {
  const n = (k: string) => `s${i}_${k}`;
  const head = { hero: 'Top of the page', offers: 'What you offer', proof: 'Why customers pick you', about: 'About', contact: 'Contact' }[s.kind];
  return (
    <fieldset className="site-section">
      <legend>{head}</legend>
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
              <input name={`s${i}_${j}_summary`} defaultValue={it.summary} placeholder="One line about it" aria-label="Offer summary" maxLength={400} />
              <input name={`s${i}_${j}_price`} defaultValue={it.price ?? ''} placeholder="Price (optional)" aria-label="Price" maxLength={80} />
            </div>
          ))}
          <span className="small dim">Clear a name to remove that offer.</span>
        </>
      ) : null}
      {s.kind === 'proof' ? (
        <>
          <div className="field"><label htmlFor={n('title')}>Section title</label><input id={n('title')} name={n('title')} defaultValue={s.title} maxLength={80} /></div>
          <div className="field"><label htmlFor={n('points')}>Points (one per line)</label><textarea id={n('points')} name={n('points')} defaultValue={s.points.join('\n')} style={{ minHeight: 90 }} /></div>
          <span className="small dim">Only claims that are true. Harbor wrote these from Business Memory’s “why customers pick it”.</span>
        </>
      ) : null}
      {s.kind === 'about' || s.kind === 'contact' ? (
        <>
          <div className="field"><label htmlFor={n('title')}>Section title</label><input id={n('title')} name={n('title')} defaultValue={s.title} maxLength={80} /></div>
          <div className="field"><label htmlFor={n('body')}>Text</label><textarea id={n('body')} name={n('body')} defaultValue={s.body} maxLength={s.kind === 'about' ? 1500 : 400} style={{ minHeight: s.kind === 'about' ? 110 : 60 }} /></div>
        </>
      ) : null}
    </fieldset>
  );
}

function WebsiteEditor({ brand, site, directions, leads }: { brand: BrandView; site: Site; directions: { id: SiteDirection; name: string; note: string }[]; leads: SiteLead[] }) {
  const live = site.status === 'published';
  const url = `${API_BROWSER_URL}/sites/${site.slug}`;
  const v = encodeURIComponent(site.updatedAt + brand.updatedAt);
  return (
    <div className="stack-lg">
      <section className="site-bar">
        <div className="row" style={{ gap: 10 }}>
          <span className={`pill ${live ? 's-published' : 'plain'}`}>{live ? 'Live' : 'Draft'}</span>
          {live ? <a href={url} target="_blank" rel="noreferrer" className="small">{url.replace(/^https?:\/\//, '')} ↗</a> : <span className="small muted">Only you can see it until you publish.</span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <form action={siteAction}><Hidden brandId={brand.id} siteId={site.id} /><input type="hidden" name="what" value="rewrite" /><SubmitButton pending="Rewriting…">Rewrite from Business Memory</SubmitButton></form>
          <form action={siteAction}><Hidden brandId={brand.id} siteId={site.id} /><input type="hidden" name="what" value={live ? 'unpublish' : 'publish'} /><SubmitButton className={live ? undefined : 'primary'} pending={live ? 'Unpublishing…' : 'Publishing…'}>{live ? 'Unpublish' : 'Publish'}</SubmitButton></form>
        </div>
      </section>

      <section className="stack">
        <h2 style={{ margin: 0 }}>Pick a direction</h2>
        <div className="direction-grid">
          {directions.map((d) => (
            <form key={d.id} action={setSiteDirection} className={`direction-card${site.direction === d.id ? ' active' : ''}`}>
              <Hidden brandId={brand.id} siteId={site.id} />
              <input type="hidden" name="direction" value={d.id} />
              <div className="direction-thumb" aria-hidden="true">
                <iframe src={`/build/preview/${site.id}?direction=${d.id}&v=${v}`} title={`${d.name} preview`} tabIndex={-1} loading="lazy" />
              </div>
              <div className="spread"><strong>{d.name}</strong>{site.direction === d.id ? <span className="pill s-connected">In use</span> : <SubmitButton pending="…">Use this</SubmitButton>}</div>
              <span className="small muted">{d.note}</span>
            </form>
          ))}
        </div>
      </section>

      <div className="site-work">
        <form action={saveWebsite} className="stack site-edit">
          <Hidden brandId={brand.id} siteId={site.id} />
          <input type="hidden" name="sectionCount" value={site.copy.sections.length} />
          <div className="spread"><h2 style={{ margin: 0 }}>Edit the words</h2><SubmitButton className="primary" pending="Saving…">Save</SubmitButton></div>
          {site.copy.sections.map((s, i) => <SectionFields key={`${site.updatedAt}-${i}`} s={s} i={i} />)}
          <fieldset className="site-section">
            <legend>Main button and search</legend>
            <div className="field"><label htmlFor="ctaUrl">Where the main button goes</label><input id="ctaUrl" name="ctaUrl" type="url" defaultValue={site.settings.ctaUrl ?? ''} placeholder="https://buy.stripe.com/… or a booking page" /><span className="small dim">Leave empty to scroll to the contact form.</span></div>
            <div className="field"><label htmlFor="title">Page title (browser tab and Google)</label><input id="title" name="title" defaultValue={site.copy.title} maxLength={120} required /></div>
            <div className="field"><label htmlFor="description">Search description</label><textarea id="description" name="description" defaultValue={site.copy.description} maxLength={200} style={{ minHeight: 60 }} /></div>
          </fieldset>
          <div><SubmitButton className="primary" pending="Saving…">Save</SubmitButton></div>
        </form>
        <div className="stack site-preview-col">
          <span className="label">Preview</span>
          <div className="site-preview"><iframe src={`/build/preview/${site.id}?v=${v}`} title="Website preview" /></div>
          <section className="stack">
            <div className="spread"><h2 style={{ margin: 0 }}>Messages</h2><span className="small dim">{leads.length}</span></div>
            {leads.length ? (
              <ul className="list small">
                {leads.map((l) => (
                  <li key={l.id}>
                    <span className="spread"><strong style={{ fontWeight: 500 }}>{l.name} · <a href={`mailto:${l.email}`}>{l.email}</a></strong><span className="dim">{when(l.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
                    <span className="muted">{l.message}</span>
                  </li>
                ))}
              </ul>
            ) : <span className="small muted">Messages from your site’s contact form show up here.</span>}
          </section>
          <form action={siteAction}><Hidden brandId={brand.id} siteId={site.id} /><input type="hidden" name="what" value="delete" /><button type="submit" className="link-button small">Delete this website</button></form>
        </div>
      </div>
    </div>
  );
}

export default async function BuildPage({ searchParams }: { searchParams: Promise<{ brand?: string; mode?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const base = await loadAll<[BrandView[], Mode, { id: SiteDirection; name: string; note: string }[]]>([getBrands(), getMode(), getSiteDirections()]);
  if (!base.ok) return <LoadError message={base.error} />;
  const [brands, mode, directions] = base.data;
  const businesses = brands.filter((b) => b.kind === 'brand');
  const brand = businesses.find((b) => b.id === s.brand) ?? businesses[0];
  if (!brand) {
    return (
      <>
        <PageHeader title="Build" sub="Websites and apps for your business." />
        <div className="empty"><span>Add a business first.</span><Link className="button primary" href="/brands/new">Add a business</Link></div>
      </>
    );
  }
  const mode2 = s.mode === 'app' ? 'app' : 'website';
  const res = await loadAll<[Site | null, Project[]]>([getSite(brand.id), mode2 === 'app' ? getProjects(brand.id) : Promise.resolve([])]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [site, projects] = res.data;
  const leads = site ? await getSiteLeads(site.id).catch(() => []) : [];
  const hrefs = Object.fromEntries(businesses.map((b) => [b.id, `/build?brand=${b.id}${mode2 === 'app' ? '&mode=app' : ''}`]));
  const thin = !brand.memory.business.oneLiner;

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title={mode2 === 'app' ? `${brand.name.replace(/\s*\(demo\)$/, '')}'s apps` : site ? `${brand.name.replace(/\s*\(demo\)$/, '')}'s website` : 'What do you want to build?'}
        sub="Everything starts from Business Memory, so it already knows your offer, customers and brand."
        actions={<BrandFilter brands={businesses} current={brand.id} hrefs={hrefs} allHref={`/build?brand=${brand.id}`} width={220} />}
      />
      <Flash params={s} />
      <div className="build-modes">{MODES.map((m) => <Mode key={m.key} m={m} active={m.key === mode2} href={`/build?brand=${brand.id}${m.key === 'app' ? '&mode=app' : ''}`} />)}</div>

      {mode2 === 'app' ? <Apps brand={brand} projects={projects} /> : site ? (
        <WebsiteEditor brand={brand} site={site} directions={directions} leads={leads} />
      ) : (
        <section className="stack">
          <h2 style={{ margin: 0 }}>Create your website</h2>
          <p className="small muted" style={{ maxWidth: '68ch' }}>
            Harbor writes the page from Business Memory and styles it with your Branding. You’ll pick from three directions and can change any word before publishing. Writing it uses <strong>{mode.modelLabel}</strong>{mode.model === 'simulated' ? ' (no cost)' : ''}.
          </p>
          {thin ? <p className="notice small">Business Memory is thin, so the page will be too. <Link href={`/brands/${brand.id}/memory?section=business`}>Describe the business</Link> first for a better site.</p> : null}
          <form action={createWebsite}>
            <Hidden brandId={brand.id} />
            <SubmitButton className="primary" pending="Writing your website…">Create my website</SubmitButton>
          </form>
        </section>
      )}
    </>
  );
}
