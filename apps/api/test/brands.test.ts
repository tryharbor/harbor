import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { brandSchema, type Brand } from '@harbor/core';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';

let db: Db;
let app: App;

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db);
});
afterAll(() => db.close());

describe('/v1/brands', () => {
  let brand: Brand;

  it('creates a brand with Brand Memory v2 and gives list items ids', async () => {
    const res = await send('POST', '/v1/brands', {
      name: 'Harbor Labs',
      memory: {
        voice: { summary: 'Plain, specific, builder-to-builder.', values: [{ name: 'Direct', meaning: 'Says the thing.' }], do: ['Use numbers'] },
        products: [{ name: 'Harbor', summary: 'Open-source content strategist', url: 'https://example.com', cta: 'Star the repo' }],
        examplePosts: [{ platform: 'x', text: 'Shipped the snapshot poller today.' }],
      },
    });
    expect(res.status).toBe(201);
    brand = brandSchema.parse(await res.json());
    expect(brand).toMatchObject({ name: 'Harbor Labs', slug: 'harbor-labs', workspaceId: 'ws_default' });
    expect(brand.id).toMatch(/^brd_/);
    expect(brand.memory.voice.values).toEqual([{ name: 'Direct', meaning: 'Says the thing.' }]);
    expect(brand.memory.voice.avoid).toEqual([]);
    expect(brand.memory.audiences).toEqual([]);
    expect(brand.memory.styleRules).toEqual({ terms: [], formatting: [] });
    expect(brand.memory.products[0]).toMatchObject({ name: 'Harbor', proofPoints: [], id: expect.stringMatching(/^[0-9a-z]{10}$/) });
    expect(brand.memory.examplePosts[0]!.id).toMatch(/^[0-9a-z]{10}$/);
  });

  it('lists and fetches brands', async () => {
    const list = await (await send('GET', '/v1/brands')).json();
    expect(list.data.map((b: Brand) => b.id)).toEqual([brand.id]);
    const one = await send('GET', `/v1/brands/${brand.id}`);
    expect(await one.json()).toEqual(brand);
  });

  it('merges memory at the top level on update', async () => {
    const res = await send('PATCH', `/v1/brands/${brand.id}`, { name: 'Harbor', memory: { voice: { summary: 'New voice' } } });
    expect(res.status).toBe(200);
    const updated = brandSchema.parse(await res.json());
    expect(updated.name).toBe('Harbor');
    expect(updated.slug).toBe('harbor-labs');
    expect(updated.memory.voice.summary).toBe('New voice');
    expect(updated.memory.voice.values).toEqual([]); // voice replaced as a whole
    expect(updated.memory.products).toEqual(brand.memory.products); // other keys kept, ids stable
    expect(updated.memory.examplePosts).toEqual(brand.memory.examplePosts);

    const aud = brandSchema.parse(await (await send('PATCH', `/v1/brands/${brand.id}`, {
      memory: { audiences: [{ name: 'Indie hackers', painPoints: ['No time'] }], knowledge: [{ title: 'Pricing notes', kind: 'note', body: '$0 self-hosted' }] },
    })).json());
    expect(aud.memory.voice.summary).toBe('New voice');
    expect(aud.memory.audiences[0]).toMatchObject({ name: 'Indie hackers', painPoints: ['No time'], goals: [], description: '' });
    expect(aud.memory.knowledge[0]!.id).toBeTruthy();
    expect((await send('PATCH', `/v1/brands/${brand.id}`, { memory: { colour: 'red' } })).status).toBe(400);
  });

  it('reads v1 Brand Memory documents as v2', async () => {
    const v1 = {
      voice: { description: 'Candid and direct.', traits: ['Transparent'], do: ['Use real numbers'], dont: ['leverage'] },
      offer: { summary: 'Small-batch coffee', callToAction: 'Subscribe', url: 'https://coffee.example' },
      audience: { description: 'Home brewers', segments: ['Pour-over fans'], painPoints: ['Stale beans'] },
      examplePosts: [{ text: 'Batch #41 is roasting.' }],
    };
    await db.query(`INSERT INTO brands (id, workspace_id, name, slug, memory) VALUES ('brd_v1', 'ws_default', 'Old', 'old', $1)`, [JSON.stringify(v1)]);
    const b = brandSchema.parse(await (await send('GET', '/v1/brands/brd_v1')).json());
    expect(b.memory.voice).toMatchObject({ summary: 'Candid and direct.', values: [{ name: 'Transparent', meaning: '' }], avoid: ['leverage'] });
    expect(b.memory.products[0]).toMatchObject({ name: 'Main offer', summary: 'Small-batch coffee', cta: 'Subscribe', url: 'https://coffee.example' });
    expect(b.memory.audiences[0]).toMatchObject({ name: 'Primary audience', description: 'Home brewers', painPoints: ['Stale beans'], goals: [], segments: ['Pour-over fans'] });
    // Ids of migrated items are stable across reads, and survive a PATCH of another key.
    const again = brandSchema.parse(await (await send('GET', '/v1/brands/brd_v1')).json());
    expect(again.memory.products[0]!.id).toBe(b.memory.products[0]!.id);
    const patched = brandSchema.parse(await (await send('PATCH', '/v1/brands/brd_v1', { memory: { styleRules: { formatting: ['No hashtags'] } } })).json());
    expect(patched.memory.products[0]!.id).toBe(b.memory.products[0]!.id);
    const [row] = await db.query<{ memory: Record<string, unknown> }>(`SELECT memory FROM brands WHERE id = 'brd_v1'`);
    expect(row!.memory).not.toHaveProperty('offer');
    await send('DELETE', '/v1/brands/brd_v1');
  });

  it('rejects invalid input and duplicate slugs', async () => {
    const bad = await send('POST', '/v1/brands', { name: '' });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('INVALID_REQUEST');
    const dup = await send('POST', '/v1/brands', { name: 'Other', slug: 'harbor-labs' });
    expect(dup.status).toBe(409);
  });

  it('deletes a brand', async () => {
    expect((await send('DELETE', `/v1/brands/${brand.id}`)).status).toBe(204);
    expect((await send('GET', `/v1/brands/${brand.id}`)).status).toBe(404);
    expect((await send('DELETE', `/v1/brands/${brand.id}`)).status).toBe(404);
  });
});

describe('brand logos', () => {
  const PNG = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`;

  it('sets, replaces and removes a logo, and returns it on every brand response', async () => {
    const created = await (await send('POST', '/v1/brands', { name: 'Logo Co', logoUrl: 'https://cdn.example.com/logo.png' })).json();
    expect(created.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(brandSchema.safeParse(created).success).toBe(true);

    const replaced = await (await send('PATCH', `/v1/brands/${created.id}`, { logoUrl: PNG })).json();
    expect(replaced.logoUrl).toBe(PNG);
    expect((await (await send('GET', `/v1/brands/${created.id}`)).json()).logoUrl).toBe(PNG);
    const listed = (await (await send('GET', '/v1/brands')).json()).data.find((b: Brand) => b.id === created.id);
    expect(listed.logoUrl).toBe(PNG);

    // Other edits leave the logo alone.
    expect((await (await send('PATCH', `/v1/brands/${created.id}`, { name: 'Logo Co 2' })).json()).logoUrl).toBe(PNG);

    const removed = await (await send('PATCH', `/v1/brands/${created.id}`, { logoUrl: null })).json();
    expect(removed.logoUrl).toBeUndefined();
    expect((await (await send('GET', `/v1/brands/${created.id}`)).json()).logoUrl).toBeUndefined();
  });

  it('accepts only https URLs and small base64 image data URIs', async () => {
    const [{ id }] = (await (await send('GET', '/v1/brands')).json()).data;
    const bad = [
      'http://cdn.example.com/logo.png',
      'not a url',
      'data:text/html;base64,PGgxPg==',
      'data:image/png,rawbytes',
      'data:image/bmp;base64,AAAA',
      `data:image/jpeg;base64,${Buffer.alloc(300 * 1024 + 1).toString('base64')}`,
    ];
    for (const logoUrl of bad) {
      const res = await send('PATCH', `/v1/brands/${id}`, { logoUrl });
      expect(res.status, logoUrl.slice(0, 40)).toBe(400);
      expect((await res.json()).error.message).toMatch(/^logoUrl:/);
    }
    expect((await send('POST', '/v1/brands', { name: 'Bad logo', logoUrl: 'ftp://x.example/logo.png' })).status).toBe(400);
    for (const type of ['png', 'jpeg', 'webp', 'svg+xml', 'gif']) {
      const logoUrl = `data:image/${type};base64,${Buffer.alloc(300 * 1024).toString('base64')}`;
      expect((await send('PATCH', `/v1/brands/${id}`, { logoUrl })).status).toBe(200);
    }
  });
});
