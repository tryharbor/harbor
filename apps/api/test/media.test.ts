import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MEDIA_CROPS } from '@harbor/core';
import { createApp, createDeps, type App, type AppDeps } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { LocalDiskStore } from '../src/lib/media-store.ts';
import { proposeDraft } from '../src/services/approvals.ts';
import { cropRect, imageForIdea, isPrivateAddress } from '../src/services/media.ts';
import { featureLifts, type LearningPost } from '../src/services/voice-learning.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
let deps: AppDeps;
let dir: string;
let brandId: string;
let otherBrandId: string;
let ig: { id: string };
const send = sender(() => app);
const json = async (method: string, path: string, body?: unknown, status?: number) => {
  const res = await send(method, path, body);
  const out = res.status === 204 ? undefined : await res.json();
  if (status !== undefined) expect(res.status, JSON.stringify(out)).toBe(status);
  return out;
};

/** What the from-url import downloads with (never the network). */
let fakeFetch: (url: URL) => Promise<Response> = async () => new Response('not set', { status: 500 });

const API = 'https://api.harbor.test';
const DAY = 86_400_000;

const png = (width: number, height: number, color = '#e05bb4') =>
  sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();
/** Left half red, right half blue: which half a crop lands on shows where its focal point was. */
const halves = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#ff0000' } })
    .composite([{ input: { create: { width: width / 2, height, channels: 3, background: '#0000ff' } }, left: width / 2, top: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();
const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(200, 1)]);

async function upload(brand: string, bytes: Buffer, name: string, type: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await app.request(`/v1/brands/${brand}/media`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}
const serve = (url: string) => {
  const u = new URL(url);
  return app.request(`${u.pathname}${u.search}`);
};
const bytesOf = async (res: Response) => Buffer.from(await res.arrayBuffer());

let wideImage: any;

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  vi.stubEnv('HARBOR_API_URL', API);
  dir = await mkdtemp(join(tmpdir(), 'harbor-media-'));
  db = await openDb('memory://');
  deps = createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated', mediaStore: new LocalDiskStore(dir), fetch: (input) => fakeFetch(new URL(String(input))) });
  app = createApp(db, {}, deps);
  brandId = (await json('POST', '/v1/brands', { name: 'Harbor', memory: RICH_MEMORY }, 201)).id;
  otherBrandId = (await json('POST', '/v1/brands', { name: 'Tidewater' }, 201)).id;
  ig = await json('POST', '/v1/sandbox/channels', { brandId, platform: 'instagram', handle: 'harborhq' }, 201);
  await json('POST', '/v1/sandbox/channels', { brandId, platform: 'x', handle: 'harborhq' }, 201);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('upload', () => {
  it('stores an image with its size, tags and public variant URLs', async () => {
    const { status, body } = await upload(brandId, await halves(2000, 1000), 'launch-shot.jpg', 'image/jpeg', { alt: 'Two colors', tags: 'Launch, behind the scenes' });
    expect(status).toBe(201);
    wideImage = body;
    expect(body).toMatchObject({
      id: expect.stringMatching(/^med_/), brandId, kind: 'image', mime: 'image/jpeg', width: 2000, height: 1000, originalName: 'launch-shot.jpg',
      alt: 'Two colors', tags: ['launch', 'behind-the-scenes'], focal: { x: 0.5, y: 0.5 }, usageCount: 0,
    });
    expect(body.url).toMatch(new RegExp(`^${API}/media/${body.id}/original\\.jpg\\?v=[0-9a-f]{10}$`));
    expect(Object.keys(body.variants).sort()).toEqual(['landscape', 'original', 'portrait', 'square', 'story', 'wide']);
    expect(body.variants.wide).toBe(`${API}/media/${body.id}/wide.jpg?v=${body.url.split('v=')[1]}`);
  });

  it('dedupes per brand on sha256: the same file returns the existing asset with 200', async () => {
    const again = await upload(brandId, await halves(2000, 1000), 'copy.jpg', 'image/jpeg');
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(wideImage.id);
    const elsewhere = await upload(otherBrandId, await halves(2000, 1000), 'copy.jpg', 'image/jpeg');
    expect(elsewhere.status).toBe(201);
    expect(elsewhere.body.id).not.toBe(wideImage.id);
  });

  it('enforces types and size limits', async () => {
    const text = await upload(brandId, Buffer.from('hello, not an image'), 'notes.txt', 'text/plain');
    expect(text.status).toBe(400);
    expect(text.body.error.message).toMatch(/Couldn't read this file/);
    const fakeVideo = await upload(brandId, Buffer.from('definitely not a movie'), 'clip.webm', 'video/webm');
    expect(fakeVideo.body.error.message).toBe('Video must be MP4 or MOV.');
    const huge = await upload(brandId, Buffer.alloc(25 * 1024 * 1024 + 1), 'huge.png', 'image/png');
    expect(huge.status).toBe(400);
    expect(huge.body.error.message).toMatch(/Images must be 25 MB or less/);
    const noFile = await app.request(`/v1/brands/${brandId}/media`, { method: 'POST', body: new FormData() });
    expect(noFile.status).toBe(400);
    expect((await json('POST', `/v1/brands/brd_nope/media`, {}, 404)).error.code).toBe('NOT_FOUND');
  });

  it('stores video as is, without crops', async () => {
    const { status, body } = await upload(brandId, mp4(), 'reel.mp4', 'video/mp4', { tags: 'roast' });
    expect(status).toBe(201);
    expect(body).toMatchObject({ kind: 'video', mime: 'video/mp4', variants: {} });
    expect(body.width).toBeUndefined();
    expect(body.url).toMatch(new RegExp(`/media/${body.id}/original\\?v=`));
    const res = await serve(body.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(await bytesOf(res)).toEqual(mp4());
    expect((await serve(body.url.replace('/original?', '/square.jpg?'))).status).toBe(404);
  });
});

describe('variants', () => {
  it('crops to each size, as JPEG', async () => {
    for (const [v, size] of Object.entries(MEDIA_CROPS)) {
      const res = await serve(wideImage.variants[v]);
      expect(res.status, v).toBe(200);
      const meta = await sharp(await bytesOf(res)).metadata();
      expect({ v, format: meta.format, width: meta.width, height: meta.height }).toEqual({ v, format: 'jpeg', width: size.width, height: size.height });
    }
  });

  it('re-encodes a PNG original to JPEG and serves a JPEG original as uploaded', async () => {
    const { body } = await upload(brandId, await png(800, 600), 'logo.png', 'image/png');
    expect(body.mime).toBe('image/png');
    const res = await serve(body.variants.original);
    expect((await sharp(await bytesOf(res)).metadata()).format).toBe('jpeg');
    expect((await sharp(await bytesOf(await serve(`${API}/media/${body.id}/original`))).metadata()).format).toBe('png');
    const jpeg = await serve(wideImage.variants.original);
    expect(await bytesOf(jpeg)).toEqual(await halves(2000, 1000));
  });

  it('centers every crop on the focal point, and moving it busts the cache', async () => {
    const mean = async (url: string) => (await sharp(await bytesOf(await serve(url))).stats()).channels.map((c) => c.mean);
    const before = await json('PATCH', `/v1/media/${wideImage.id}`, { focal: { x: 0.1, y: 0.5 } }, 200);
    const [r1, , b1] = await mean(before.variants.square);
    expect(r1).toBeGreaterThan(200);
    expect(b1).toBeLessThan(50);

    const after = await json('PATCH', `/v1/media/${wideImage.id}`, { focal: { x: 0.9, y: 0.5 } }, 200);
    expect(after.variants.square).not.toBe(before.variants.square);
    expect(after.focal).toEqual({ x: 0.9, y: 0.5 });
    const [r2, , b2] = await mean(after.variants.square);
    expect(r2).toBeLessThan(50);
    expect(b2).toBeGreaterThan(200);
    // Only the current focal point's crops stay on disk.
    const files = await readdir(join(dir, brandId, wideImage.id));
    expect(files.filter((f) => f.startsWith('variant-square-'))).toHaveLength(1);
    await json('PATCH', `/v1/media/${wideImage.id}`, { focal: { x: 0.5, y: 0.5 } }, 200);
  });

  it('computes the largest crop inside the image, clamped to its edges', () => {
    expect(cropRect(2000, 1000, 1, 0.5, 0.5)).toEqual({ left: 500, top: 0, width: 1000, height: 1000 });
    expect(cropRect(2000, 1000, 1, 0, 0.5)).toEqual({ left: 0, top: 0, width: 1000, height: 1000 });
    expect(cropRect(2000, 1000, 1, 1, 0.5)).toEqual({ left: 1000, top: 0, width: 1000, height: 1000 });
    expect(cropRect(1000, 2000, 16 / 9, 0.5, 0)).toEqual({ left: 0, top: 0, width: 1000, height: 563 });
  });
});

describe('serving', () => {
  it('sends long-lived immutable cache headers, outside the /v1 CORS rule', async () => {
    const res = await app.request(new URL(wideImage.variants.portrait).pathname, { headers: { origin: 'http://localhost:4801' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('404s unknown assets and variants', async () => {
    expect((await app.request('/media/med_nope/square.jpg')).status).toBe(404);
    expect((await app.request(`/media/${wideImage.id}/huge.jpg`)).status).toBe(404);
    expect((await app.request(`/media/${wideImage.id}/square.png`)).status).toBe(404);
    expect((await app.request(`/media/${wideImage.id}/square`)).status).toBe(404);
  });
});

describe('library', () => {
  it('lists newest first with tag counts, and filters by kind, tag and text', async () => {
    const all = await json('GET', `/v1/brands/${brandId}/media`, undefined, 200);
    expect(all.data.length).toBeGreaterThanOrEqual(3);
    expect(new Date(all.data[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(all.data.at(-1).createdAt).getTime());
    expect(all.tags).toEqual(expect.arrayContaining([{ tag: 'launch', count: 1 }, { tag: 'roast', count: 1 }]));
    expect((await json('GET', `/v1/brands/${brandId}/media?kind=video`, undefined, 200)).data.map((a: any) => a.kind)).toEqual(['video']);
    expect((await json('GET', `/v1/brands/${brandId}/media?tag=launch`, undefined, 200)).data.map((a: any) => a.id)).toEqual([wideImage.id]);
    expect((await json('GET', `/v1/brands/${brandId}/media?q=two%20col`, undefined, 200)).data.map((a: any) => a.id)).toEqual([wideImage.id]);
    expect((await json('GET', `/v1/brands/${brandId}/media?q=logo`, undefined, 200)).data).toHaveLength(1);
    expect((await json('GET', `/v1/brands/${brandId}/media?limit=1`, undefined, 200)).data).toHaveLength(1);
    expect((await json('GET', `/v1/brands/${brandId}/media?kind=gif`, undefined, 400)).error.code).toBe('INVALID_REQUEST');
  });

  it('edits alt text and tags', async () => {
    const a = await json('PATCH', `/v1/media/${wideImage.id}`, { alt: 'Red and blue', tags: ['launch', 'Product shot'] }, 200);
    expect(a).toMatchObject({ alt: 'Red and blue', tags: ['launch', 'product-shot'] });
    expect((await json('PATCH', `/v1/media/${wideImage.id}`, { focal: { x: 2, y: 0 } }, 400)).error.code).toBe('INVALID_REQUEST');
  });

  it("fits an asset to a platform's preferred crop", async () => {
    const fit = await json('GET', `/v1/media/${wideImage.id}/fit?platform=instagram`, undefined, 200);
    expect(fit).toEqual({ variant: 'portrait', url: wideImage.variants.portrait, width: 1080, height: 1350, check: { ok: true, issues: [] } });
    expect((await json('GET', `/v1/media/${wideImage.id}/fit?platform=x`, undefined, 200))).toMatchObject({ variant: 'wide', width: 1600, height: 900 });
    expect((await json('GET', `/v1/media/${wideImage.id}/fit?platform=myspace`, undefined, 400)).error.code).toBe('INVALID_REQUEST');
  });
});

describe('from-url', () => {
  it('imports an image over http(s) with a mocked fetch', async () => {
    const bytes = await png(1080, 1080, '#7c4ddb');
    let asked: URL | undefined;
    fakeFetch = async (url) => {
      asked = url;
      return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } });
    };
    const a = await json('POST', `/v1/brands/${brandId}/media/from-url`, { url: 'https://cdn.example/brand/violet%20square.png', alt: 'Violet', tags: 'product' }, 201);
    expect(asked?.href).toBe('https://cdn.example/brand/violet%20square.png');
    expect(a).toMatchObject({ kind: 'image', mime: 'image/png', width: 1080, height: 1080, originalName: 'violet square.png', alt: 'Violet', tags: ['product'] });
    expect((await json('POST', `/v1/brands/${brandId}/media/from-url`, { url: 'https://cdn.example/again.png' }, 200)).id).toBe(a.id);
  });

  it('refuses other schemes, non-media types, big files, errors and timeouts', async () => {
    const err = async (url: string) => (await json('POST', `/v1/brands/${brandId}/media/from-url`, { url }, 400)).error.message;
    expect(await err('ftp://cdn.example/a.png')).toMatch(/http\(s\)/);
    expect(await err('not a url')).toMatch(/http\(s\)/);
    fakeFetch = async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
    expect(await err('https://cdn.example/page')).toMatch(/expected an image or video, got text\/html/);
    fakeFetch = async () => new Response('x', { headers: { 'content-type': 'image/jpeg', 'content-length': String(26 * 1024 * 1024) } });
    expect(await err('https://cdn.example/big.jpg')).toMatch(/larger than 25 MB/);
    fakeFetch = async () => new Response(new Uint8Array(25 * 1024 * 1024 + 10), { headers: { 'content-type': 'image/jpeg' } });
    expect(await err('https://cdn.example/big-no-length.jpg')).toMatch(/larger than 25 MB/);
    fakeFetch = async () => new Response('gone', { status: 404 });
    expect(await err('https://cdn.example/missing.jpg')).toMatch(/answered 404/);
    fakeFetch = async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    };
    expect(await err('https://cdn.example/slow.jpg')).toMatch(/didn't answer within 20 seconds/);
  });

  it('never fetches local or private addresses, including through a redirect', async () => {
    const fetched: string[] = [];
    fakeFetch = async (url) => {
      fetched.push(url.href);
      return url.hostname === 'cdn.example'
        ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
        : new Response('secret', { headers: { 'content-type': 'image/png' } });
    };
    const err = async (url: string) => (await json('POST', `/v1/brands/${brandId}/media/from-url`, { url }, 400)).error.message;
    for (const url of ['http://localhost:4800/v1/brands', 'http://127.0.0.1/x.png', 'http://10.0.0.5/x.png', 'http://[::1]/x.png']) {
      expect(await err(url)).toMatch(/private or local address/);
    }
    expect(await err('https://cdn.example/redirects.png')).toMatch(/169\.254\.169\.254 is a private or local address/);
    expect(fetched).toEqual(['https://cdn.example/redirects.png']);
  });

  it('classifies private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe('drafts, approvals and posts', () => {
  let portraitApproval: any;

  it('fills the URL and alt text of library media on a draft, with the platform’s preferred crop', async () => {
    const d = await json('POST', '/v1/drafts', { brandId, platform: 'instagram', parts: [{ text: 'Launch day.', media: [{ assetId: wideImage.id }] }] }, 201);
    expect(d.parts[0].media).toEqual([{ kind: 'image', url: wideImage.variants.portrait, alt: 'Red and blue', assetId: wideImage.id, variant: 'portrait' }]);
    const x = await json('POST', '/v1/drafts', { brandId, platform: 'x', parts: [{ text: 'Launch day.', media: [{ assetId: wideImage.id, variant: 'square', alt: 'Mine' }] }] }, 201);
    expect(x.parts[0].media[0]).toMatchObject({ url: wideImage.variants.square, alt: 'Mine', variant: 'square' });
    const detail = await json('GET', `/v1/media/${wideImage.id}`, undefined, 200);
    expect(detail.usage).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'draft', id: d.id, platform: 'instagram', text: 'Launch day.' })]));
    expect(detail.usageCount).toBe(detail.usage.length);

    const other = await upload(otherBrandId, await png(500, 500, '#f2734f'), 'coral.png', 'image/png');
    const cross = await json('POST', '/v1/drafts', { brandId, platform: 'x', parts: [{ text: 'Nope.', media: [{ assetId: other.body.id }] }] }, 400);
    expect(cross.error.message).toMatch(/isn't in this brand's media library/);
  });

  it('runs the media check in the voice check', async () => {
    const check = async (platform: string, media: unknown[]) => {
      const d = await json('POST', '/v1/drafts', { brandId, platform, parts: [{ text: 'A hook that is long enough to count.', media }] }, 201);
      const run = await json('POST', '/v1/agents/voice_check/runs', { inputs: { draftId: d.id } }, 201);
      return run.output.report.checks.find((c: any) => c.key === 'media');
    };
    expect(await check('instagram', [])).toMatchObject({ ok: false, severity: 'fail', detail: 'Instagram needs an image or video. Attach one first.' });
    expect(await check('instagram', [{ assetId: wideImage.id, variant: 'story' }])).toMatchObject({ severity: 'fail', detail: expect.stringMatching(/aspect ratio between 4:5 and 1.91:1/) });
    expect(await check('x', [{ assetId: wideImage.id, variant: 'square' }])).toMatchObject({ ok: false, severity: 'warn', detail: 'Square crops get cut on X; use wide.' });
    expect(await check('x', [{ assetId: wideImage.id, variant: 'landscape' }])).toMatchObject({ severity: 'warn', detail: 'X works best with the wide crop; this uses landscape.' });
    expect(await check('x', [{ assetId: wideImage.id }])).toMatchObject({ ok: true, severity: 'info' });
    expect(await check('x', [])).toMatchObject({ ok: true, detail: expect.stringMatching(/No media/) });
  });

  it('approving an Instagram post without media is a clear 400; attaching media on approve saves a new version', async () => {
    const d = await json('POST', '/v1/drafts', { brandId, platform: 'instagram', parts: [{ text: 'Behind the scenes of launch week.' }] }, 201);
    const approval = await proposeDraft(deps, { draftId: d.id, proposedFor: new Date(Date.now() + 2 * DAY).toISOString(), source: 'ui' });
    expect(approval.checks.find((c) => c.key === 'media')).toMatchObject({ severity: 'fail' });
    const refused = await json('POST', `/v1/approvals/${approval.id}/approve`, {}, 400);
    expect(refused.error.message).toBe('Instagram needs an image or video. Attach one first.');
    expect((await json('GET', `/v1/approvals?status=pending`, undefined, 200)).data.map((a: any) => a.id)).toContain(approval.id);

    const { approval: done, post } = await json('POST', `/v1/approvals/${approval.id}/approve`, { media: [{ assetId: wideImage.id }] }, 200);
    portraitApproval = done;
    expect(done.status).toBe('approved');
    expect(done.draft).toMatchObject({ author: 'human', version: 1 });
    expect(done.draft.id).not.toBe(d.id);
    expect(done.draft.parts[0]).toMatchObject({ text: 'Behind the scenes of launch week.', media: [{ assetId: wideImage.id, variant: 'portrait', url: wideImage.variants.portrait }] });
    expect(post).toMatchObject({ status: 'scheduled', channel: { platform: 'instagram' } });
    expect(post.parts[0].media[0].assetId).toBe(wideImage.id);
  });

  it('rejects media that fails the platform rules when a post is written', async () => {
    const res = await json('POST', '/v1/posts', { channelId: ig.id, parts: [{ text: 'Story crop', media: [{ assetId: wideImage.id, variant: 'story' }] }], scheduledFor: new Date(Date.now() + DAY).toISOString() }, 400);
    expect(res.error.message).toMatch(/aspect ratio between 4:5 and 1.91:1/);
  });

  it('refuses to delete media a scheduled post uses (409), then soft-deletes it', async () => {
    const usage = (await json('GET', `/v1/media/${wideImage.id}`, undefined, 200)).usage;
    expect(usage[0]).toMatchObject({ kind: 'post', id: portraitApproval.postId, status: 'scheduled', platform: 'instagram' });
    const conflict = await json('DELETE', `/v1/media/${wideImage.id}`, undefined, 409);
    expect(conflict.error.message).toContain(portraitApproval.postId);

    await json('DELETE', `/v1/posts/${portraitApproval.postId}`, undefined, 204);
    await json('DELETE', `/v1/media/${wideImage.id}`, undefined, 204);
    await json('GET', `/v1/media/${wideImage.id}`, undefined, 404);
    expect((await serve(wideImage.variants.square)).status).toBe(404);
    expect((await json('GET', `/v1/brands/${brandId}/media`, undefined, 200)).data.map((a: any) => a.id)).not.toContain(wideImage.id);
    // Uploading the same file again makes a fresh asset.
    const again = await upload(brandId, await halves(2000, 1000), 'launch-shot.jpg', 'image/jpeg');
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(wideImage.id);
    wideImage = again.body;
  });
});

describe('agents', () => {
  it('picks the most recently used image tagged for an idea’s topic', async () => {
    const b = (await json('POST', '/v1/brands', { name: 'Tagged' }, 201)).id;
    const roast = (await upload(b, await png(1200, 900, '#9a5200'), 'roast.png', 'image/png', { tags: 'roast' })).body;
    const roast2 = (await upload(b, await png(1201, 900, '#9a5201'), 'roast2.png', 'image/png', { tags: 'roast,cupping' })).body;
    const bts = (await upload(b, await png(1202, 900, '#cfa600'), 'bts.png', 'image/png', { tags: 'behind-the-scenes' })).body;
    expect((await imageForIdea(db, b, 'Behind the scenes at the roastery'))?.id).toBe(bts.id);
    expect((await imageForIdea(db, b, 'What we learned from 3 roasts'))?.id).toBe(roast2.id); // newest of the two
    await json('POST', '/v1/drafts', { brandId: b, platform: 'x', parts: [{ text: 'Roast day', media: [{ assetId: roast.id }] }] }, 201);
    expect((await imageForIdea(db, b, 'Roast day notes'))?.id).toBe(roast.id); // most recently used wins
    expect(await imageForIdea(db, b, 'Pricing update')).toBeUndefined();
    expect(await imageForIdea(db, b, 'A week behind the counter')).toBeUndefined(); // filler words don't match
  });

  it('the weekly plan attaches a tagged image to Instagram drafts, or leaves them for the media check', async () => {
    await upload(brandId, await png(1080, 1350, '#cfa600'), 'harbor.png', 'image/png', { tags: 'harbor,brands' });
    const run = await json('POST', '/v1/agents/weekly_plan/runs', { inputs: { brandId, platforms: ['instagram'], postsPerPlatform: 3 } }, 201);
    expect(run.status).toBe('succeeded');
    expect(run.steps.find((s: any) => s.key === 'drafts').detail).toMatch(/Attached a library image to \d+ Instagram drafts?\./);
    const withMedia = run.approvals.filter((a: any) => a.draft.parts[0].media.length);
    expect(withMedia.length).toBeGreaterThan(0);
    for (const a of run.approvals) {
      const media = a.checks.find((c: any) => c.key === 'media');
      if (a.draft.parts[0].media.length) {
        expect(a.draft.parts[0].media[0]).toMatchObject({ kind: 'image', variant: 'portrait' });
        expect(media.severity).not.toBe('fail');
      } else expect(media.severity).toBe('fail');
    }
  });

  it('the voice refresh learns has_image, carousel and video only where media is optional', () => {
    const post = (id: string, platform: LearningPost['platform'], media: LearningPost['media'], ratio: number): LearningPost => ({
      id, platform, parts: ['Same opening.'], media, ratio, verdict: ratio >= 1.3 ? 'outperformed' : 'met',
    });
    const posts = [
      post('a', 'threads', ['image'], 2), post('b', 'threads', ['image', 'image'], 1.8), post('c', 'x', ['image'], 1.6), post('d', 'x', ['video'], 1.5),
      post('e', 'x', [], 1), post('f', 'threads', [], 0.9), post('g', 'x', [], 0.8),
      // Instagram always has media: these never count, either way.
      post('h', 'instagram', ['image'], 0.1), post('i', 'instagram', ['image', 'image'], 0.1), post('j', 'instagram', ['video'], 0.1),
    ];
    const lifts = featureLifts(posts);
    const img = lifts.find((l) => l.feature === 'has_image')!;
    expect(img).toMatchObject({ withCount: 3, withoutCount: 4 });
    expect(img.lift).toBeGreaterThan(1.25);
    expect(img.posts).not.toContain('h');
    expect(lifts.find((l) => l.feature === 'carousel')).toBeUndefined(); // only 1 carousel outside Instagram
    expect(lifts.find((l) => l.feature === 'video')).toBeUndefined();
  });
});

describe('MCP', () => {
  it('list_media and attach_media (a new draft version; pending approvals follow it)', async () => {
    const key = await json('POST', '/v1/api-keys', { name: 'Agent', scopes: ['read', 'write'] }, 201);
    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await app.request('/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${key.key}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      const body = await res.json();
      return body.result as { isError?: boolean; content: { text: string }[] };
    };
    const listed = await call('list_media', { brandId, tag: 'launch' });
    expect(listed.content[0]!.text).toMatch(/media items? for Harbor tagged "launch" \(sandbox · simulated model\)/);

    const d = await json('POST', '/v1/drafts', { brandId, platform: 'instagram', parts: [{ text: 'An Instagram draft with nothing to show yet.' }] }, 201);
    const approval = await proposeDraft(deps, { draftId: d.id, proposedFor: new Date(Date.now() + 3 * DAY).toISOString(), source: 'mcp' });
    const res = await call('attach_media', { draftId: d.id, assetId: wideImage.id });
    expect(res.isError).toBeFalsy();
    expect(res.content[0]!.text).toMatch(/Attached the portrait image to a new version .*1 pending approval updated/);
    const out = JSON.parse(res.content[1]!.text);
    expect(out.draft).toMatchObject({ author: 'agent', parts: [{ media: [{ assetId: wideImage.id, variant: 'portrait' }] }] });
    expect(out.draft.id).not.toBe(d.id);
    expect(out.approvalIds).toEqual([approval.id]);
    const moved = (await json('GET', `/v1/approvals?status=pending`, undefined, 200)).data.find((a: any) => a.id === approval.id);
    expect(moved.draft.id).toBe(out.draft.id);
    expect(moved.checks.find((c: any) => c.key === 'media').severity).not.toBe('fail');

    const story = await call('attach_media', { draftId: out.draft.id, assetId: wideImage.id, variant: 'story' });
    expect(story.isError).toBe(true);
    expect(story.content[0]!.text).toMatch(/aspect ratio/);
    const other = (await json('GET', `/v1/brands/${otherBrandId}/media`, undefined, 200)).data[0];
    expect((await call('attach_media', { draftId: d.id, assetId: other.id })).isError).toBe(true);
  });
});
