import Link from 'next/link';
import { createProject, createWebsite } from '../actions';
import { getBrands, getMode, getProjects, getSite, loadAll, type BrandView, type Mode, type Project, type Site } from '../api';
import { BrandFilter } from '../components/brand-filter';
import { SubmitButton } from '../components/submit-button';
import { Flash, LoadError, when } from '../ui';

export const dynamic = 'force-dynamic';

/**
 * Build's home, like Replit's: one question, two ways to answer it (each with a line on when to use it), and the things
 * you've already made underneath. Editing happens on each project's own page.
 */

export default async function BuildPage({ searchParams }: { searchParams: Promise<{ brand?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const base = await loadAll<[BrandView[], Mode]>([getBrands(), getMode()]);
  if (!base.ok) return <LoadError message={base.error} />;
  const [brands, mode] = base.data;
  const businesses = brands.filter((b) => b.kind === 'brand');
  const brand = businesses.find((b) => b.id === s.brand) ?? businesses[0];
  if (!brand) {
    return (
      <div className="build-home">
        <h1>What do you want to build?</h1>
        <div className="empty"><span>Add a business first; everything you build starts from it.</span><Link className="button primary" href="/brands/new">Add a business</Link></div>
      </div>
    );
  }
  const res = await loadAll<[Site | null, Project[]]>([getSite(brand.id), getProjects(brand.id)]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [site, projects] = res.data;
  const hrefs = Object.fromEntries(businesses.map((b) => [b.id, `/build?brand=${b.id}`]));
  const name = brand.name.replace(/\s*\(demo\)$/, '');
  const thin = !brand.memory.business.oneLiner;
  const short = { month: 'short', day: 'numeric' } as const;

  return (
    <div className="build-home">
      <div className="build-top">
        {businesses.length > 1 ? <BrandFilter brands={businesses} current={brand.id} hrefs={hrefs} allHref={`/build?brand=${brand.id}`} width={220} /> : <span />}
      </div>
      <h1>What do you want to build?</h1>
      <p className="muted">Harbor starts from {name}’s Business Memory, so it already knows the offer, customers and brand.</p>
      <Flash params={s} />

      <div className="build-choices">
        <section className="build-choice">
          <strong>Website</strong>
          <span className="build-line">Get online and get booked.</span>
          <span className="small muted">A finished site with your offer, proof and a contact form, in minutes. No code. For service businesses and small shops.</span>
          {site ? (
            <Link className="button" href={`/build/site?brand=${brand.id}`}>Open your website</Link>
          ) : (
            <form action={createWebsite}>
              <input type="hidden" name="brandId" value={brand.id} />
              <SubmitButton className="primary" pending="Writing your website…">Create my website</SubmitButton>
            </form>
          )}
          {!site && thin ? <span className="small dim">Business Memory is thin. <Link href={`/brands/${brand.id}/memory?section=business`}>Describe the business</Link> first for a better site.</span> : null}
        </section>
        <section className="build-choice">
          <strong>Full app</strong>
          <span className="build-line">Build the product itself.</span>
          <span className="small muted">Accounts, a database, your own features. An agent writes real code you own. For when the product is software.</span>
          <form action={createProject} className="build-new">
            <input type="hidden" name="brandId" value={brand.id} />
            <input name="name" required maxLength={80} placeholder="Name it, e.g. Order tracker" aria-label="App name" />
            <SubmitButton className="primary" pending="Setting up…">Start</SubmitButton>
          </form>
        </section>
      </div>

      {site || projects.length ? (
        <section className="stack">
          <span className="label">Your projects</span>
          <ul className="build-projects">
            {site ? (
              <li>
                <Link href={`/build/site?brand=${brand.id}`}>
                  <span className="build-icon" aria-hidden="true">◱</span>
                  <span className="build-pname">{name} website</span>
                  <span className={`pill ${site.status === 'published' ? 's-published' : 'plain'}`}>{site.status === 'published' ? 'Live' : 'Draft'}</span>
                  <span className="small dim">Edited {when(site.updatedAt, short)}</span>
                </Link>
              </li>
            ) : null}
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/build/apps/${p.id}`}>
                  <span className="build-icon" aria-hidden="true">{'</>'}</span>
                  <span className="build-pname">{p.name}</span>
                  <span className="small dim">${(p.spentCents / 100).toFixed(2)} spent</span>
                  <span className="small dim">Edited {when(p.updatedAt, short)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <span className="small dim">Builds use {mode.modelLabel}{mode.model === 'simulated' ? ' (free)' : ''}. Keep the first apps small; each build stops at its cost cap.</span>
    </div>
  );
}
