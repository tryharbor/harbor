import { z } from 'zod';
import { HarborError } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import { DIRECTIONS, DIRECTION_INFO } from '../services/site-render.ts';
import { createSite, deleteSite, listLeads, loadSite, publishedSite, receiveLead, rewriteSite, setPublished, siteForBrand, siteHtml, updateSite } from '../services/sites.ts';

const text = (max: number) => z.string().trim().max(max);
const sectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hero'), headline: text(120).min(1), sub: text(400), cta: text(40).min(1) }),
  z.object({ kind: z.literal('offers'), title: text(80), items: z.array(z.object({ name: text(80).min(1), summary: text(400), price: text(80).optional() })).max(12) }),
  z.object({ kind: z.literal('proof'), title: text(80), points: z.array(text(200).min(1)).max(8) }),
  z.object({ kind: z.literal('about'), title: text(80), body: text(1500) }),
  z.object({ kind: z.literal('contact'), title: text(80), body: text(400) }),
]);
const copySchema = z.object({ title: text(120).min(1), description: text(200), sections: z.array(sectionSchema).min(1).max(12) });
const patchSchema = z
  .object({
    direction: z.enum(DIRECTIONS).optional(),
    copy: copySchema.optional(),
    settings: z.object({ ctaUrl: z.union([z.string().trim().url().startsWith('https://', 'Use an https:// link.'), z.literal('')]).optional().transform((u) => u || undefined) }).strict().optional(),
  })
  .strict();

/** Website mode. Owner routes under /v1; the published page and its contact form are public, at /sites/<slug>. */
export function registerSites(app: App, deps: AppDeps) {
  const { db } = deps;

  app.get('/v1/sites/directions', (c) => c.json({ data: DIRECTIONS.map((id) => ({ id, ...DIRECTION_INFO[id] })) }));

  /** The brand's site, or null. */
  app.get('/v1/brands/:id/site', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json((await siteForBrand(db, brand.id)) ?? null);
  });

  app.post('/v1/brands/:id/site', async (c) => {
    const input = await body(c, z.object({ direction: z.enum(DIRECTIONS).optional() }).strict());
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await createSite(deps, brand, input), 201);
  });

  app.patch('/v1/sites/:id', async (c) => {
    const input = await body(c, patchSchema);
    return c.json(await updateSite(db, await loadSite(db, c.req.param('id')), input));
  });

  app.post('/v1/sites/:id/rewrite', async (c) => {
    const site = await loadSite(db, c.req.param('id'));
    return c.json(await rewriteSite(deps, await loadBrand(db, site.brandId), site));
  });

  app.post('/v1/sites/:id/publish', async (c) => c.json(await setPublished(db, await loadSite(db, c.req.param('id')), true)));
  app.post('/v1/sites/:id/unpublish', async (c) => c.json(await setPublished(db, await loadSite(db, c.req.param('id')), false)));

  app.delete('/v1/sites/:id', async (c) => {
    await deleteSite(db, c.req.param('id'));
    return c.body(null, 204);
  });

  /** A draft preview, in the saved direction or ?direction= to compare. */
  app.get('/v1/sites/:id/preview', async (c) => {
    const site = await loadSite(db, c.req.param('id'));
    const d = c.req.query('direction');
    const direction = d && (DIRECTIONS as readonly string[]).includes(d) ? (d as (typeof DIRECTIONS)[number]) : undefined;
    return c.html(siteHtml(await loadBrand(db, site.brandId), site, { preview: true, ...(direction ? { direction } : {}) }));
  });

  app.get('/v1/sites/:id/leads', async (c) => c.json({ data: await listLeads(db, (await loadSite(db, c.req.param('id'))).id) }));

  // ---- Public ----

  app.get('/sites/:slug', async (c) => {
    const site = await publishedSite(db, c.req.param('slug'));
    if (!site) return c.html('<!doctype html><title>Not found</title><p style="font:16px system-ui;padding:40px">This site isn’t published.</p>', 404);
    return c.html(siteHtml(await loadBrand(db, site.brandId), site, { sent: c.req.query('sent') === '1' }));
  });

  app.post('/sites/:slug/contact', async (c) => {
    const site = await publishedSite(db, c.req.param('slug'));
    if (!site) return c.html('<!doctype html><p>This site isn’t published.</p>', 404);
    const form = await c.req.parseBody();
    const get = (k: string) => (typeof form[k] === 'string' ? (form[k] as string) : undefined);
    try {
      await receiveLead(db, site, { name: get('name'), email: get('email'), message: get('message'), website: get('website') });
    } catch (err) {
      const msg = err instanceof HarborError ? err.message : 'Something went wrong. Please try again.';
      return c.html(`<!doctype html><meta name="viewport" content="width=device-width"><p style="font:16px system-ui;padding:40px">${msg.replace(/</g, '&lt;')} <a href="/sites/${site.slug}#contact">Back</a></p>`, err instanceof HarborError && err.code === 'INVALID_REQUEST' ? 400 : 429);
    }
    return c.redirect(`/sites/${site.slug}?sent=1#contact`, 303);
  });
}
