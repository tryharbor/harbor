import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';

let db: Db;
let app: App;
let brandA: string;
let brandB: string;

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db, { registry: new Map() });
  brandA = (await (await send('POST', '/v1/brands', { name: 'Alpha' })).json()).id;
  brandB = (await (await send('POST', '/v1/brands', { name: 'Beta' })).json()).id;
});
afterAll(() => db.close());

describe('/v1/ideas', () => {
  let ideaId: string;

  it('creates ideas and lists them across brands', async () => {
    const res = await send('POST', '/v1/ideas', { brandId: brandA, title: 'Why we chose AGPL', angle: 'Founder story' });
    expect(res.status).toBe(201);
    const idea = await res.json();
    expect(idea).toMatchObject({ status: 'idea', brandName: 'Alpha', basis: [], postCount: 0 });
    ideaId = idea.id;
    await send('POST', '/v1/ideas', { brandId: brandB, title: 'Beta launch teaser' });

    const all = await (await send('GET', '/v1/ideas')).json();
    expect(all.data.map((i: { title: string }) => i.title).sort()).toEqual(['Beta launch teaser', 'Why we chose AGPL']);
    const one = await (await send('GET', `/v1/ideas?brandId=${brandB}`)).json();
    expect(one.data).toHaveLength(1);
  });

  it('moves forward one stage at a time and back for rework', async () => {
    expect((await send('PATCH', `/v1/ideas/${ideaId}`, { status: 'approved' })).status).toBe(400);
    expect((await (await send('PATCH', `/v1/ideas/${ideaId}`, { status: 'drafting' })).json()).status).toBe('drafting');
    expect((await (await send('PATCH', `/v1/ideas/${ideaId}`, { status: 'approved' })).json()).status).toBe('approved');
    expect((await (await send('PATCH', `/v1/ideas/${ideaId}`, { status: 'idea' })).json()).status).toBe('idea');
  });

  it('leaves Scheduled and Live to posts', async () => {
    const res = await send('PATCH', `/v1/ideas/${ideaId}`, { status: 'scheduled' });
    expect(res.status).toBe(400);
  });

  it('edits and deletes', async () => {
    const edited = await (await send('PATCH', `/v1/ideas/${ideaId}`, { title: 'Why Harbor is AGPL' })).json();
    expect(edited.title).toBe('Why Harbor is AGPL');
    expect((await send('DELETE', `/v1/ideas/${ideaId}`)).status).toBe(204);
    expect((await send('PATCH', `/v1/ideas/${ideaId}`, { title: 'x' })).status).toBe(404);
  });
});
