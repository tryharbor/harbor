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

  it('creates a brand with Brand Memory', async () => {
    const res = await send('POST', '/v1/brands', {
      name: 'Harbor Labs',
      memory: {
        voice: { description: 'Plain, specific, builder-to-builder.', traits: ['direct'] },
        offer: { summary: 'Open-source content strategist', url: 'https://example.com' },
        examplePosts: [{ platform: 'x', text: 'Shipped the snapshot poller today.' }],
      },
    });
    expect(res.status).toBe(201);
    brand = brandSchema.parse(await res.json());
    expect(brand).toMatchObject({ name: 'Harbor Labs', slug: 'harbor-labs', workspaceId: 'ws_default' });
    expect(brand.id).toMatch(/^brd_/);
    expect(brand.memory.voice.traits).toEqual(['direct']);
    expect(brand.memory.audience.segments).toEqual([]);
  });

  it('lists and fetches brands', async () => {
    const list = await (await send('GET', '/v1/brands')).json();
    expect(list.data.map((b: Brand) => b.id)).toEqual([brand.id]);
    const one = await send('GET', `/v1/brands/${brand.id}`);
    expect(await one.json()).toEqual(brand);
  });

  it('updates a brand', async () => {
    const res = await send('PATCH', `/v1/brands/${brand.id}`, { name: 'Harbor', memory: { offer: { summary: 'New offer' } } });
    expect(res.status).toBe(200);
    const updated = brandSchema.parse(await res.json());
    expect(updated.name).toBe('Harbor');
    expect(updated.slug).toBe('harbor-labs');
    expect(updated.memory.offer.summary).toBe('New offer');
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
