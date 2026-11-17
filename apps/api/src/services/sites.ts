import { HarborError, newId, type Brand } from '@harbor/core';
import type { SiteCopy } from '@harbor/ai';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { withRun } from './runs.ts';
import { DIRECTIONS, renderSite, type Direction, type SiteSettings } from './site-render.ts';

/** Website mode: one generated site per brand, its edits, publishing, and the messages its contact form collects. */

export interface Site {
  id: string;
  brandId: string;
  slug: string;
  direction: Direction;
  copy: SiteCopy;
  settings: SiteSettings;
  status: 'draft' | 'published';
  runId?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface SiteRow {
  id: string; brand_id: string; slug: string; direction: Direction; copy: SiteCopy; settings: SiteSettings | null; status: Site['status'];
  run_id: string | null; published_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
}

const toSite = (r: SiteRow): Site => ({
  id: r.id, brandId: r.brand_id, slug: r.slug, direction: r.direction, copy: r.copy, settings: r.settings ?? {}, status: r.status,
  ...(r.run_id ? { runId: r.run_id } : {}), ...(r.published_at ? { publishedAt: iso(r.published_at) } : {}),
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});

export async function loadSite(db: Db, id: string): Promise<Site> {
  const [r] = await db.query<SiteRow>('SELECT * FROM sites WHERE id = $1', [id]);
  if (!r) throw new HarborError('NOT_FOUND', `Site ${id} not found.`);
  return toSite(r);
}

export async function siteForBrand(db: Db, brandId: string): Promise<Site | undefined> {
  const [r] = await db.query<SiteRow>('SELECT * FROM sites WHERE brand_id = $1', [brandId]);
  return r ? toSite(r) : undefined;
}

/** A URL-safe, unique slug from the brand's name ("Tidewater Coffee (demo)" → "tidewater-coffee"). */
async function freeSlug(db: Db, name: string): Promise<string> {
  const base = name.replace(/\s*\(demo\)$/, '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site';
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [taken] = await db.query('SELECT 1 FROM sites WHERE slug = $1', [slug]);
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function writeCopy(deps: Pick<AppDeps, 'db' | 'model'>, brand: Brand): Promise<{ copy: SiteCopy; runId: string }> {
  const { value, run } = await withRun(deps.db, brand, 'site', { brandId: brand.id }, deps.model.name, async () => {
    const res = await deps.model.siteCopy({ brand });
    return { value: res.result, calls: [res], output: { sections: res.result.sections.length } };
  });
  return { copy: value, runId: run.id };
}

/** Write the site's words from Business Memory with the active model. One site per brand: 409 if it exists. */
export async function createSite(deps: Pick<AppDeps, 'db' | 'model'>, brand: Brand, input: { direction?: Direction }): Promise<Site> {
  if (await siteForBrand(deps.db, brand.id)) throw new HarborError('CONFLICT', `${brand.name} already has a website.`);
  const { copy, runId } = await writeCopy(deps, brand);
  const id = newId('site');
  await deps.db.query(
    'INSERT INTO sites (id, workspace_id, brand_id, slug, direction, copy, run_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, brand.workspaceId, brand.id, await freeSlug(deps.db, brand.name), input.direction ?? 'bold', JSON.stringify(copy), runId],
  );
  return loadSite(deps.db, id);
}

/** Write the words again from Business Memory (after it changed, or with another model). Edits are replaced. */
export async function rewriteSite(deps: Pick<AppDeps, 'db' | 'model'>, brand: Brand, site: Site): Promise<Site> {
  const { copy, runId } = await writeCopy(deps, brand);
  await deps.db.query('UPDATE sites SET copy = $2, run_id = $3, updated_at = now() WHERE id = $1', [site.id, JSON.stringify(copy), runId]);
  return loadSite(deps.db, site.id);
}

export async function updateSite(db: Db, site: Site, patch: { direction?: Direction; copy?: SiteCopy; settings?: SiteSettings }): Promise<Site> {
  if (patch.direction && !DIRECTIONS.includes(patch.direction)) throw new HarborError('INVALID_REQUEST', 'direction: bold, classic or minimal.');
  await db.query(
    'UPDATE sites SET direction = COALESCE($2, direction), copy = COALESCE($3::jsonb, copy), settings = COALESCE($4::jsonb, settings), updated_at = now() WHERE id = $1',
    [site.id, patch.direction ?? null, patch.copy ? JSON.stringify(patch.copy) : null, patch.settings ? JSON.stringify(patch.settings) : null],
  );
  return loadSite(db, site.id);
}

export async function setPublished(db: Db, site: Site, published: boolean): Promise<Site> {
  await db.query(
    `UPDATE sites SET status = $2, published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END, updated_at = now() WHERE id = $1`,
    [site.id, published ? 'published' : 'draft'],
  );
  return loadSite(db, site.id);
}

export async function deleteSite(db: Db, id: string): Promise<void> {
  const rows = await db.query('DELETE FROM sites WHERE id = $1 RETURNING id', [id]);
  if (!rows.length) throw new HarborError('NOT_FOUND', `Site ${id} not found.`);
}

// ---- Public: the page and its contact form ----

export async function publishedSite(db: Db, slug: string): Promise<Site | undefined> {
  const [r] = await db.query<SiteRow>("SELECT * FROM sites WHERE slug = $1 AND status = 'published'", [slug]);
  return r ? toSite(r) : undefined;
}

export const siteHtml = (brand: Brand, site: Site, opts: { preview?: boolean; sent?: boolean; direction?: Direction }) =>
  renderSite(brand, site.copy, { direction: opts.direction ?? site.direction, settings: site.settings, contactAction: `/sites/${site.slug}/contact`, ...(opts.preview ? { preview: true } : {}), ...(opts.sent ? { sent: true } : {}) });

export interface Lead { id: string; siteId: string; name: string; email: string; message: string; createdAt: string }

const RECENT = new Map<string, number[]>();
/** At most 10 messages per site per 10 minutes, so a bot can't flood the list. */
function allow(siteId: string, now = Date.now()): boolean {
  const recent = (RECENT.get(siteId) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 10) return false;
  recent.push(now);
  RECENT.set(siteId, recent);
  return true;
}

/**
 * A message from the site's contact form. Bots that fill the hidden field are accepted and dropped (so they learn
 * nothing); bad input is a 400; past the rate limit is a 429-style refusal.
 */
export async function receiveLead(db: Db, site: Site, input: { name?: string; email?: string; message?: string; website?: string }): Promise<void> {
  if (input.website?.trim()) return;
  const name = (input.name ?? '').trim().slice(0, 120);
  const email = (input.email ?? '').trim().slice(0, 200);
  const message = (input.message ?? '').trim().slice(0, 2000);
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HarborError('INVALID_REQUEST', 'Please fill in your name, a valid email and a message.');
  if (!allow(site.id)) throw new HarborError('CONFLICT', 'Too many messages right now. Please try again in a few minutes.');
  await db.query('INSERT INTO site_leads (id, site_id, brand_id, name, email, message) VALUES ($1, $2, $3, $4, $5, $6)', [newId('siteLead'), site.id, site.brandId, name, email, message]);
}

export async function listLeads(db: Db, siteId: string): Promise<Lead[]> {
  const rows = await db.query<{ id: string; site_id: string; name: string; email: string; message: string; created_at: Date | string }>(
    'SELECT * FROM site_leads WHERE site_id = $1 ORDER BY created_at DESC LIMIT 100', [siteId],
  );
  return rows.map((r) => ({ id: r.id, siteId: r.site_id, name: r.name, email: r.email, message: r.message, createdAt: iso(r.created_at) }));
}
