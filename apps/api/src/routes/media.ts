import { z } from 'zod';
import { HarborError, MEDIA_VARIANTS, mediaVariantSchema, platformSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body, check } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import {
  deleteMedia,
  fetchRemoteMedia,
  fitFor,
  ingestMedia,
  listMedia,
  loadAssetRow,
  loadMediaDetail,
  normalizeTags,
  openVariant,
  updateMedia,
  VIDEO_MAX_BYTES,
} from '../services/media.ts';

/** `brd_…/med_…/<file>`: the only shape the media store writes. */
const MEDIA_FILE_KEY = /^brd_[a-z0-9]+\/med_[a-z0-9]+\/[a-z0-9][a-z0-9._-]*$/i;

const tagsInput = z.union([z.string().max(2000), z.array(z.string().max(100)).max(50)]).transform(normalizeTags);

const fromUrlSchema = z
  .object({
    url: z.string().min(1).max(4096),
    alt: z.string().max(1000).optional(),
    tags: tagsInput.optional(),
  })
  .strict();

const patchSchema = z
  .object({
    /** An empty string clears the alt text. */
    alt: z.string().max(1000).nullable().optional(),
    tags: tagsInput.optional(),
    focal: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict().optional(),
  })
  .strict();

const listSchema = z.object({
  kind: z.enum(['image', 'video']).optional(),
  tag: z.string().max(100).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Public media URLs are capabilities (unguessable ids) and never change for a given ?v=, so caches can keep them. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * The media library: uploads per brand, edits (alt text, tags, focal point), soft delete, the platform fit of an
 * asset, and the public, unauthenticated /media URLs that platforms download from (outside the /v1 CORS rule).
 */
export function registerMedia(app: App, deps: AppDeps) {
  const { db } = deps;

  /**
   * Raw body → the media store at `<brandId>/<assetId>/<file>`, for moving a library between servers (media:copy).
   * The database rows travel separately (db:copy). Same guard as the rest of /v1: the internal token, or this machine.
   */
  app.put('/v1/media-files/*', async (c) => {
    const key = decodeURIComponent(c.req.path.slice('/v1/media-files/'.length));
    if (!MEDIA_FILE_KEY.test(key)) throw new HarborError('INVALID_REQUEST', `Not a media file path: ${key}. Expected brd_…/med_…/<file>.`);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (!bytes.length) throw new HarborError('INVALID_REQUEST', 'Send the file bytes as the request body.');
    if (bytes.length > VIDEO_MAX_BYTES) throw new HarborError('INVALID_REQUEST', `Files must be ${VIDEO_MAX_BYTES / (1024 * 1024)} MB or less.`);
    await deps.mediaStore.put(key, bytes, c.req.header('content-type') ?? 'application/octet-stream');
    return c.json({ key, bytes: bytes.length }, 201);
  });

  /** Multipart: `file`, `alt?`, `tags?` (comma-separated). 201 with a new asset; 200 with the existing one for the same file. */
  app.post('/v1/brands/:id/media', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const form = await c.req.parseBody().catch(() => {
      throw new HarborError('INVALID_REQUEST', 'Send the file as multipart/form-data with a "file" field.');
    });
    const file = form.file;
    if (!(file instanceof File)) throw new HarborError('INVALID_REQUEST', 'file: attach the image or video as the "file" field.');
    const alt = typeof form.alt === 'string' ? form.alt.slice(0, 1000) : undefined;
    const tags = typeof form.tags === 'string' ? normalizeTags(form.tags) : undefined;
    const { asset, created } = await ingestMedia(deps, brand, { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, name: file.name, alt, tags });
    return c.json(asset, created ? 201 : 200);
  });

  /** Import from a URL: http(s), ≤ 25 MB, 20 s, image/* or video/*. */
  app.post('/v1/brands/:id/media/from-url', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const input = await body(c, fromUrlSchema);
    const remote = await fetchRemoteMedia(deps.fetch, input.url, deps.resolveHost);
    const { asset, created } = await ingestMedia(deps, brand, { ...remote, alt: input.alt, tags: input.tags });
    return c.json(asset, created ? 201 : 200);
  });

  /** ?kind ?tag ?q (alt, name, tags) ?limit. Newest first, plus every tag of the brand's library with its count. */
  app.get('/v1/brands/:id/media', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const f = check(listSchema, c.req.query());
    return c.json(await listMedia(db, brand.id, f));
  });

  app.get('/v1/media/:id', async (c) => c.json(await loadMediaDetail(db, c.req.param('id'))));

  app.patch('/v1/media/:id', async (c) => {
    const input = await body(c, patchSchema);
    return c.json(await updateMedia(deps, c.req.param('id'), input));
  });

  /** Soft delete; 409 while a scheduled or publishing post uses it. */
  app.delete('/v1/media/:id', async (c) => {
    await deleteMedia(db, c.req.param('id'));
    return c.body(null, 204);
  });

  /** ?platform=: the platform's preferred variant of the asset, checked against its rules. */
  app.get('/v1/media/:id/fit', async (c) => {
    const platform = check(platformSchema, c.req.query('platform'));
    return c.json(fitFor(await loadAssetRow(db, c.req.param('id')), platform));
  });

  /**
   * Public: `/media/:assetId/:variant.jpg` (images) and `/media/:assetId/original` (the file as uploaded; video).
   * No auth: the id is the capability. The `?v=` query only busts caches when the focal point moves.
   */
  app.get('/media/:assetId/:file', async (c) => {
    const file = c.req.param('file');
    const m = /^([a-z]+)\.jpg$/.exec(file);
    const variant = file === 'original' ? 'raw' : m && (MEDIA_VARIANTS as readonly string[]).includes(m[1]!) ? mediaVariantSchema.parse(m[1]) : undefined;
    if (!variant) throw new HarborError('NOT_FOUND', `No media variant "${file}". Variants: ${MEDIA_VARIANTS.map((v) => `${v}.jpg`).join(', ')}, original.`);
    const row = await loadAssetRow(db, c.req.param('assetId'));
    const out = await openVariant(deps, row, variant);
    if (!out) throw new HarborError('NOT_FOUND', `Media ${row.id} is a ${row.kind}; it is served at /media/${row.id}/original.`);
    c.header('Content-Type', out.contentType);
    c.header('Cache-Control', IMMUTABLE);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(out.body instanceof Buffer ? new Uint8Array(out.body) : (out.body as ReadableStream<Uint8Array<ArrayBuffer>>));
  });
}
