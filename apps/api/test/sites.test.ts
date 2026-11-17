import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
let brandId: string;
let siteId: string;
const send = sender(() => app);
const form = (path: string, fields: Record<string, string>) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' });
  brandId = (await (await send('POST', '/v1/brands', {
    name: 'Tidewater Coffee <script>alert(1)</script>',
    memory: {
      ...RICH_MEMORY,
      business: { type: 'product', oneLiner: 'Small-batch coffee, roasted to order.', location: 'Chicago', differentiators: ['Roasted within 48 hours of shipping'] },
      branding: { tagline: 'Coffee worth waiting for.', colors: [{ hex: '#c0583a', role: 'primary' }, { hex: '#e8d5b5', role: 'secondary' }], fonts: { heading: 'Fraunces' } },
    },
  })).json()).id;
});
afterAll(() => db.close());

describe('Website mode', () => {
  it('writes a site from Business Memory, once per brand', async () => {
    expect(await (await send('GET', `/v1/brands/${brandId}/site`)).json()).toBeNull();
    const res = await send('POST', `/v1/brands/${brandId}/site`, {});
    expect(res.status).toBe(201);
    const site = await res.json();
    siteId = site.id;
    expect(site).toMatchObject({ id: expect.stringMatching(/^sit_/), slug: 'tidewater-coffee-script-alert-1-script', direction: 'bold', status: 'draft', runId: expect.stringMatching(/^run_/) });
    expect(site.copy.sections[0]).toMatchObject({ kind: 'hero', headline: 'Coffee worth waiting for.' });
    expect(site.copy.sections.find((s: { kind: string }) => s.kind === 'proof').points).toContain('Roasted within 48 hours of shipping.');
    expect((await send('POST', `/v1/brands/${brandId}/site`, {})).status).toBe(409);
    const runs = (await (await send('GET', `/v1/agent-runs?brandId=${brandId}`)).json()).data;
    expect(runs[0]).toMatchObject({ id: site.runId, kind: 'site', status: 'succeeded' });
  });

  it('previews each direction in the brand’s colours and fonts, with every text escaped', async () => {
    const html = await (await send('GET', `/v1/sites/${siteId}/preview`)).text();
    expect(html).toContain('<title>Tidewater Coffee &lt;script&gt;alert(1)&lt;/script&gt;: Small-batch coffee, roasted to order</title>');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('background:#c0583a');
    expect(html).toContain('family=Fraunces');
    expect(html).toContain('noindex');
    expect(html).toContain('Preview: only you can see this');
    const classic = await (await send('GET', `/v1/sites/${siteId}/preview?direction=classic`)).text();
    expect(classic).toContain('.hero{background:#e8d5b5');
  });

  it('saves edits, a direction and a button link, and checks them', async () => {
    const site = await (await send('GET', `/v1/brands/${brandId}/site`)).json();
    const copy = { ...site.copy, sections: site.copy.sections.map((s: { kind: string }) => (s.kind === 'hero' ? { ...s, headline: 'Fresh beans, every two weeks' } : s)) };
    const res = await send('PATCH', `/v1/sites/${siteId}`, { direction: 'minimal', copy, settings: { ctaUrl: 'https://buy.stripe.com/test_123' } });
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved).toMatchObject({ direction: 'minimal', settings: { ctaUrl: 'https://buy.stripe.com/test_123' } });
    expect(saved.copy.sections[0].headline).toBe('Fresh beans, every two weeks');
    expect((await send('PATCH', `/v1/sites/${siteId}`, { settings: { ctaUrl: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await send('PATCH', `/v1/sites/${siteId}`, { settings: { ctaUrl: 'http://insecure.example' } })).status).toBe(400);
    expect((await send('PATCH', `/v1/sites/${siteId}`, { direction: 'loud' })).status).toBe(400);
    expect((await send('PATCH', `/v1/sites/${siteId}`, { copy: { title: 't', description: '', sections: [] } })).status).toBe(400);
    const html = await (await send('GET', `/v1/sites/${siteId}/preview`)).text();
    expect(html).toContain('href="https://buy.stripe.com/test_123"');
  });

  it('serves the page publicly only once published', async () => {
    const slug = (await (await send('GET', `/v1/brands/${brandId}/site`)).json()).slug;
    expect((await app.request(`/sites/${slug}`)).status).toBe(404);
    const pub = await (await send('POST', `/v1/sites/${siteId}/publish`)).json();
    expect(pub).toMatchObject({ status: 'published', publishedAt: expect.any(String) });
    const res = await app.request(`/sites/${slug}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Fresh beans, every two weeks');
    expect(html).not.toContain('noindex');
    expect(html).toContain(`action="/sites/${slug}/contact"`);
  });

  it('collects contact messages, drops bots, and checks input', async () => {
    const slug = (await (await send('GET', `/v1/brands/${brandId}/site`)).json()).slug;
    const ok = await form(`/sites/${slug}/contact`, { name: 'Ana', email: 'ana@example.com', message: 'Do you ship to Canada?' });
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe(`/sites/${slug}?sent=1#contact`);
    expect(await (await app.request(`/sites/${slug}?sent=1`)).text()).toContain('Your message is on its way');
    expect((await form(`/sites/${slug}/contact`, { name: 'Bot', email: 'b@b.co', message: 'buy', website: 'spam.example' })).status).toBe(303);
    expect((await form(`/sites/${slug}/contact`, { name: 'Ana', email: 'not-an-email', message: 'hi' })).status).toBe(400);
    const leads = (await (await send('GET', `/v1/sites/${siteId}/leads`)).json()).data;
    expect(leads.map((l: { name: string; message: string }) => [l.name, l.message])).toEqual([['Ana', 'Do you ship to Canada?']]);
    for (let i = 0; i < 9; i++) await form(`/sites/${slug}/contact`, { name: 'N', email: 'n@example.com', message: `m${i}` });
    expect((await form(`/sites/${slug}/contact`, { name: 'N', email: 'n@example.com', message: 'too many' })).status).toBe(429);
  });

  it('rewrites the words, unpublishes and deletes', async () => {
    const before = await (await send('GET', `/v1/brands/${brandId}/site`)).json();
    const again = await (await send('POST', `/v1/sites/${siteId}/rewrite`)).json();
    expect(again.copy.sections[0].headline).toBe('Coffee worth waiting for.');
    expect(again.runId).not.toBe(before.runId);
    expect((await (await send('POST', `/v1/sites/${siteId}/unpublish`)).json()).status).toBe('draft');
    expect((await app.request(`/sites/${before.slug}`)).status).toBe(404);
    expect((await send('DELETE', `/v1/sites/${siteId}`)).status).toBe(204);
    expect(await (await send('GET', `/v1/brands/${brandId}/site`)).json()).toBeNull();
  });
});
