import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import sharp, { type Metadata } from 'sharp';
import {
  HarborError,
  MEDIA_CROPS,
  MEDIA_JPEG_QUALITY,
  MEDIA_VARIANTS,
  checkMedia,
  mimeFromUrl,
  newId,
  preferredVariant,
  type Brand,
  type MediaCheck,
  type MediaCheckItem,
  type MediaKind,
  type MediaRef,
  type MediaVariant,
  type Platform,
  type PostPart,
  type PostPartInput,
} from '@harbor/core';
import type { Db } from '../db/client.ts';
import { apiUrl, iso, isUniqueViolation } from '../lib/http.ts';
import { readAll, type MediaStore } from '../lib/media-store.ts';

/**
 * The media library (docs/design/media-library.md): a brand's images and videos, stored in the MediaStore and served
 * publicly from /media/:assetId/:variant.jpg, so platforms that download media (Instagram, Threads) get a URL.
 * Images get crops (variants) centered on their focal point, made on first request and cached; video is stored as is.
 */

export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 300 * 1024 * 1024;
export const FROM_URL_MAX_BYTES = 25 * 1024 * 1024;
export const FROM_URL_TIMEOUT_MS = 20_000;
const MAX_TAGS = 20;

export interface MediaDeps {
  db: Db;
  mediaStore: MediaStore;
}

export interface MediaAssetRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  kind: MediaKind;
  mime: string;
  bytes: number | string;
  width: number | null;
  height: number | null;
  storage_key: string;
  original_name: string | null;
  alt: string | null;
  tags: string[] | null;
  focal_x: number;
  focal_y: number;
  sha256: string;
  created_at: Date | string;
  deleted_at: Date | string | null;
}

export type MediaUsage = { kind: 'draft' | 'post' | 'approval'; id: string; status?: string; platform: Platform; text: string };

/** Changes when the focal point moves, so `?v=` busts caches of the crops. */
export const focalHash = (r: Pick<MediaAssetRow, 'focal_x' | 'focal_y'>) =>
  createHash('sha256').update(`${Number(r.focal_x).toFixed(4)},${Number(r.focal_y).toFixed(4)}`).digest('hex').slice(0, 10);

/** The public URL of one variant: `/media/:id/:variant.jpg` for images, `/media/:id/original` for video. */
export function variantUrl(r: MediaAssetRow, variant: MediaVariant = 'original'): string {
  const path = r.kind === 'video' ? 'original' : `${variant}.jpg`;
  return `${apiUrl()}/media/${r.id}/${path}?v=${focalHash(r)}`;
}

export const toMediaAsset = (r: MediaAssetRow, usageCount = 0) => ({
  id: r.id,
  brandId: r.brand_id,
  kind: r.kind,
  mime: r.mime,
  bytes: Number(r.bytes),
  width: r.width ?? undefined,
  height: r.height ?? undefined,
  originalName: r.original_name ?? undefined,
  alt: r.alt ?? undefined,
  tags: r.tags ?? [],
  focal: { x: Number(r.focal_x), y: Number(r.focal_y) },
  url: variantUrl(r),
  // Images only: video has no crops.
  variants: (r.kind === 'image' ? Object.fromEntries(MEDIA_VARIANTS.map((v) => [v, variantUrl(r, v)])) : {}) as Record<MediaVariant, string>,
  usageCount,
  createdAt: iso(r.created_at),
});
export type MediaAsset = ReturnType<typeof toMediaAsset>;

/** What a variant of an asset is, for checkMedia: crops are JPEGs of a fixed size; the original keeps its own. */
export function variantInfo(r: MediaAssetRow, variant: MediaVariant): MediaCheckItem {
  if (r.kind === 'video') return { kind: 'video', mime: r.mime, bytes: Number(r.bytes) };
  if (variant === 'original') {
    const jpeg = r.mime === 'image/jpeg';
    return { kind: 'image', mime: 'image/jpeg', ...(jpeg ? { bytes: Number(r.bytes) } : {}), width: r.width ?? undefined, height: r.height ?? undefined };
  }
  const crop = MEDIA_CROPS[variant];
  return { kind: 'image', mime: 'image/jpeg', width: crop.width, height: crop.height };
}

// ---- Tags ----

/** "Behind the scenes, Launch" → ['behind-the-scenes', 'launch']. Accepts a comma-separated string or a list. */
export function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : [];
  const out: string[] = [];
  for (const t of list) {
    const tag = t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, MAX_TAGS);
}

// ---- Loading ----

export async function loadAssetRow(db: Db, id: string): Promise<MediaAssetRow> {
  const [row] = await db.query<MediaAssetRow>('SELECT * FROM media_assets WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Media ${id} not found.`);
  return row;
}

export async function assetRows(db: Db, ids: string[]): Promise<Map<string, MediaAssetRow>> {
  if (!ids.length) return new Map();
  const rows = await db.query<MediaAssetRow>('SELECT * FROM media_assets WHERE id = ANY($1::text[])', [[...new Set(ids)]]);
  return new Map(rows.map((r) => [r.id, r]));
}

const assetIdsOf = (parts: { media: { assetId?: string }[] }[]) => parts.flatMap((p) => p.media.map((m) => m.assetId).filter((x): x is string => !!x));

/** Every asset the drafts reference (deleted ones included, so old drafts still check). */
export const mediaLookup = (db: Db, drafts: { parts: PostPart[] }[]) => assetRows(db, drafts.flatMap((d) => assetIdsOf(d.parts)));

// ---- Usage: drafts, approvals and posts that reference an asset ----

const preview = (t: string) => {
  const flat = t.replace(/\s+/g, ' ').trim();
  return flat.length <= 140 ? flat : `${flat.slice(0, 139).replace(/\s+\S*$/, '')}…`;
};

/**
 * Where each asset is used: posts (with their status), approvals not yet turned into a post, and latest-version
 * drafts used by neither. Newest first within each kind.
 */
export async function mediaUsage(db: Db, brandId: string, assetIds?: string[]): Promise<Map<string, MediaUsage[]>> {
  const refs = await db.query<{ draft_id: string; idea_id: string | null; platform: Platform; version: number; parts: unknown; created_at: Date | string; asset_id: string }>(
    `SELECT DISTINCT d.id AS draft_id, d.idea_id, d.platform, d.version, d.parts, d.created_at, m->>'assetId' AS asset_id
     FROM drafts d
     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.parts) = 'array' THEN d.parts ELSE '[]'::jsonb END) part
     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(part->'media') = 'array' THEN part->'media' ELSE '[]'::jsonb END) m
     WHERE d.brand_id = $1 AND m->>'assetId' IS NOT NULL AND ($2::text[] IS NULL OR m->>'assetId' = ANY($2::text[]))`,
    [brandId, assetIds ?? null],
  );
  const out = new Map<string, MediaUsage[]>();
  if (!refs.length) return out;
  const draftIds = [...new Set(refs.map((r) => r.draft_id))];
  const posts = await db.query<{ id: string; draft_id: string; status: string; platform: Platform; at: Date | string }>(
    `SELECT p.id, p.draft_id, p.status, ch.platform, COALESCE(p.published_at, p.scheduled_for, p.created_at) AS at
     FROM posts p JOIN channels ch ON ch.id = p.channel_id WHERE p.draft_id = ANY($1::text[])`,
    [draftIds],
  );
  const approvals = await db.query<{ id: string; draft_id: string; status: string; platform: Platform; created_at: Date | string }>(
    'SELECT id, draft_id, status, platform, created_at FROM approvals WHERE draft_id = ANY($1::text[]) AND post_id IS NULL',
    [draftIds],
  );
  const ideaIds = [...new Set(refs.map((r) => r.idea_id).filter((x): x is string => !!x))];
  const latest = await db.query<{ idea_id: string; platform: string; v: number }>(
    'SELECT idea_id, platform, max(version) AS v FROM drafts WHERE idea_id = ANY($1::text[]) GROUP BY idea_id, platform',
    [ideaIds],
  );
  const latestOf = new Map(latest.map((l) => [`${l.idea_id}:${l.platform}`, Number(l.v)]));
  const textOf = new Map(refs.map((r) => [r.draft_id, preview((Array.isArray(r.parts) ? (r.parts[0] as { text?: string })?.text : '') ?? '')]));

  const byAsset = new Map<string, typeof refs>();
  for (const r of refs) byAsset.set(r.asset_id, [...(byAsset.get(r.asset_id) ?? []), r]);
  const time = (v: Date | string) => new Date(v).getTime();
  for (const [assetId, rs] of byAsset) {
    const ids = new Set(rs.map((r) => r.draft_id));
    const ps = posts.filter((p) => ids.has(p.draft_id)).sort((a, b) => time(b.at) - time(a.at));
    const as = approvals.filter((a) => ids.has(a.draft_id)).sort((a, b) => time(b.created_at) - time(a.created_at));
    const used = new Set([...ps.map((p) => p.draft_id), ...as.map((a) => a.draft_id)]);
    const ds = rs
      .filter((r) => !used.has(r.draft_id) && (!r.idea_id || latestOf.get(`${r.idea_id}:${r.platform}`) === Number(r.version)))
      .sort((a, b) => time(b.created_at) - time(a.created_at));
    out.set(assetId, [
      ...ps.map((p): MediaUsage => ({ kind: 'post', id: p.id, status: p.status, platform: p.platform, text: textOf.get(p.draft_id) ?? '' })),
      ...as.map((a): MediaUsage => ({ kind: 'approval', id: a.id, status: a.status, platform: a.platform, text: textOf.get(a.draft_id) ?? '' })),
      ...ds.map((d): MediaUsage => ({ kind: 'draft', id: d.draft_id, platform: d.platform, text: textOf.get(d.draft_id) ?? '' })),
    ]);
  }
  return out;
}

export async function loadMediaAsset(db: Db, id: string): Promise<MediaAsset> {
  const row = await loadAssetRow(db, id);
  const usage = (await mediaUsage(db, row.brand_id, [row.id])).get(row.id) ?? [];
  return toMediaAsset(row, usage.length);
}

export async function loadMediaDetail(db: Db, id: string): Promise<MediaAsset & { usage: MediaUsage[] }> {
  const row = await loadAssetRow(db, id);
  const usage = (await mediaUsage(db, row.brand_id, [row.id])).get(row.id) ?? [];
  return { ...toMediaAsset(row, usage.length), usage };
}

/** GET /v1/brands/:id/media: newest first, with every tag in the brand's library and how many assets carry it. */
export async function listMedia(db: Db, brandId: string, f: { kind?: MediaKind; tag?: string; q?: string; limit?: number } = {}) {
  const q = f.q?.trim() ? `%${f.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const rows = await db.query<MediaAssetRow>(
    `SELECT * FROM media_assets
     WHERE brand_id = $1 AND deleted_at IS NULL AND ($2::text IS NULL OR kind = $2) AND ($3::text IS NULL OR $3 = ANY(tags))
       AND ($4::text IS NULL OR alt ILIKE $4 OR original_name ILIKE $4 OR array_to_string(tags, ' ') ILIKE $4)
     ORDER BY created_at DESC, id DESC LIMIT $5`,
    [brandId, f.kind ?? null, f.tag ? normalizeTags(f.tag)[0] ?? f.tag : null, q, Math.min(Math.max(f.limit ?? 100, 1), 500)],
  );
  const tags = await db.query<{ tag: string; count: number }>(
    `SELECT t AS tag, count(*)::int AS count FROM media_assets, unnest(tags) t
     WHERE brand_id = $1 AND deleted_at IS NULL GROUP BY t ORDER BY count(*) DESC, t`,
    [brandId],
  );
  const usage = await mediaUsage(db, brandId, rows.map((r) => r.id));
  return { data: rows.map((r) => toMediaAsset(r, usage.get(r.id)?.length ?? 0)), tags: tags.map((t) => ({ tag: t.tag, count: Number(t.count) })) };
}

// ---- Ingest (upload and from-url) ----

const IMAGE_FORMATS: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' },
  gif: { mime: 'image/gif', ext: 'gif' },
};
const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
const UNREADABLE = "Couldn't read this file. Upload a JPEG, PNG, WebP, GIF or HEIC image, or an MP4 or MOV video.";

const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;

/** MP4 and MOV both start with an ISO-BMFF `ftyp` box; its brand tells them apart. */
function sniffVideo(bytes: Uint8Array): string | undefined {
  if (bytes.length < 12 || Buffer.from(bytes.subarray(4, 8)).toString('latin1') !== 'ftyp') return undefined;
  return Buffer.from(bytes.subarray(8, 12)).toString('latin1') === 'qt  ' ? 'video/quicktime' : 'video/mp4';
}

interface Probed {
  kind: MediaKind;
  mime: string;
  ext: string;
  width?: number;
  height?: number;
}

/** Work out what a file really is (never trusting the declared type alone) and enforce the size limits. */
async function probe(bytes: Buffer, declared?: string): Promise<Probed> {
  const declaredVideo = !!declared && declared.startsWith('video/');
  const video = sniffVideo(bytes);
  if (video || declaredVideo) {
    if (!video) throw new HarborError('INVALID_REQUEST', 'Video must be MP4 or MOV.');
    if (bytes.length > VIDEO_MAX_BYTES) throw new HarborError('INVALID_REQUEST', `Video must be ${mb(VIDEO_MAX_BYTES)} or less (this one is ${mb(bytes.length)}).`);
    const mime = declared && VIDEO_EXT[declared] ? declared : video;
    return { kind: 'video', mime, ext: VIDEO_EXT[mime]! };
  }
  if (bytes.length > IMAGE_MAX_BYTES) throw new HarborError('INVALID_REQUEST', `Images must be ${mb(IMAGE_MAX_BYTES)} or less (this one is ${mb(bytes.length)}).`);
  let meta: Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    throw new HarborError('INVALID_REQUEST', UNREADABLE);
  }
  const format = meta.format === 'heif' ? { mime: meta.compression === 'av1' ? 'image/avif' : 'image/heic', ext: meta.compression === 'av1' ? 'avif' : 'heic' } : IMAGE_FORMATS[meta.format];
  if (!format || !meta.width || !meta.height) throw new HarborError('INVALID_REQUEST', UNREADABLE);
  return { kind: 'image', mime: format.mime, ext: format.ext, width: meta.autoOrient?.width ?? meta.width, height: meta.autoOrient?.height ?? meta.height };
}

export interface IngestInput {
  bytes: Buffer;
  /** The type the client declared (multipart file type or the response content-type). */
  mime?: string;
  name?: string;
  alt?: string;
  tags?: string[];
}

/** Store a new asset, or return the brand's existing one with the same bytes (`created: false`). */
export async function ingestMedia(deps: MediaDeps, brand: Brand, input: IngestInput): Promise<{ asset: MediaAsset; created: boolean }> {
  const { db, mediaStore } = deps;
  if (!input.bytes.length) throw new HarborError('INVALID_REQUEST', 'file: the file is empty.');
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const existing = async () => {
    const [row] = await db.query<{ id: string }>('SELECT id FROM media_assets WHERE brand_id = $1 AND sha256 = $2 AND deleted_at IS NULL', [brand.id, sha256]);
    return row ? loadMediaAsset(db, row.id) : undefined;
  };
  const dup = await existing();
  if (dup) return { asset: dup, created: false };

  const p = await probe(input.bytes, input.mime?.split(';')[0]?.trim().toLowerCase());
  const id = newId('mediaAsset');
  const key = `${brand.id}/${id}/original.${p.ext}`;
  await mediaStore.put(key, input.bytes, p.mime);
  const name = input.name?.trim().slice(0, 300) || null;
  try {
    await db.query(
      `INSERT INTO media_assets (id, workspace_id, brand_id, kind, mime, bytes, width, height, storage_key, original_name, alt, tags, sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [id, brand.workspaceId, brand.id, p.kind, p.mime, input.bytes.length, p.width ?? null, p.height ?? null, key, name, input.alt?.trim() || null, input.tags ?? [], sha256],
    );
  } catch (err) {
    await mediaStore.delete(key);
    // The same file uploaded twice at once: the other request won.
    const raced = isUniqueViolation(err) ? await existing() : undefined;
    if (raced) return { asset: raced, created: false };
    throw err;
  }
  return { asset: await loadMediaAsset(db, id), created: true };
}

const MAX_REDIRECTS = 3;

/** Throws unless the host resolves only to public addresses. */
export type HostResolver = (hostname: string) => Promise<void>;

/** Loopback, private (RFC 1918 / ULA), link-local (incl. cloud metadata), CGNAT, multicast and unspecified ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return isPrivateAddress(x.slice(7));
    return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff');
  }
  return true;
}

export const resolvePublicHost: HostResolver = async (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new HarborError('INVALID_REQUEST', `url: couldn't find ${hostname}.`);
  if (addresses.some(isPrivateAddress)) throw new HarborError('INVALID_REQUEST', `url: ${hostname} is a private or local address; only public URLs can be imported.`);
};

/** No DNS (for tests with an injected fetch): rejects `localhost` and private IP literals only. */
export const offlineResolveHost: HostResolver = async (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && isPrivateAddress(host))) {
    throw new HarborError('INVALID_REQUEST', `url: ${hostname} is a private or local address; only public URLs can be imported.`);
  }
};

/**
 * Download a file for the library: http(s) only, at most 25 MB, 20 s, and the response must say image/* or video/*.
 * `fetchImpl` is injected so tests never touch the network.
 */
export async function fetchRemoteMedia(
  fetchImpl: typeof fetch,
  raw: string,
  resolveHost: HostResolver = resolvePublicHost,
): Promise<{ bytes: Buffer; mime: string; name?: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HarborError('INVALID_REQUEST', 'url: must be an http(s) URL.');
  }
  const signal = AbortSignal.timeout(FROM_URL_TIMEOUT_MS);
  let res: Response | undefined;
  // Redirects are followed by hand so every hop is checked: the API can be reachable from the internet, and must
  // never be used to fetch localhost, the private network or cloud metadata addresses.
  for (let hop = 0; ; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HarborError('INVALID_REQUEST', 'url: must be an http(s) URL.');
    await resolveHost(url.hostname);
    try {
      res = await fetchImpl(url, { signal, redirect: 'manual', headers: { accept: 'image/*, video/*' } });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new HarborError('INVALID_REQUEST', timedOut ? `url: ${url.host} didn't answer within ${FROM_URL_TIMEOUT_MS / 1000} seconds.` : `url: couldn't reach ${url.host}.`);
    }
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) break;
    if (hop >= MAX_REDIRECTS) throw new HarborError('INVALID_REQUEST', `url: too many redirects from ${url.host}.`);
    url = new URL(location, url);
  }
  if (!res.ok) throw new HarborError('INVALID_REQUEST', `url: ${url.host} answered ${res.status}.`);
  const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
    throw new HarborError('INVALID_REQUEST', `url: expected an image or video, got ${mime || 'no content type'}.`);
  }
  const tooBig = () => new HarborError('INVALID_REQUEST', `url: the file is larger than ${mb(FROM_URL_MAX_BYTES)}.`);
  if (Number(res.headers.get('content-length') ?? 0) > FROM_URL_MAX_BYTES) throw tooBig();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body) {
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > FROM_URL_MAX_BYTES) {
          await reader.cancel().catch(() => {});
          throw tooBig();
        }
        chunks.push(value);
      }
    } catch (err) {
      if (err instanceof HarborError) throw err;
      throw new HarborError('INVALID_REQUEST', `url: the download from ${url.host} failed or took longer than ${FROM_URL_TIMEOUT_MS / 1000} seconds.`);
    }
  }
  const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '') || undefined;
  return { bytes: Buffer.concat(chunks), mime, name };
}

// ---- Edit and delete ----

export async function updateMedia(deps: MediaDeps, id: string, input: { alt?: string | null; tags?: string[]; focal?: { x: number; y: number } }): Promise<MediaAsset> {
  const { db } = deps;
  const row = await loadAssetRow(db, id);
  const focal = input.focal ?? { x: Number(row.focal_x), y: Number(row.focal_y) };
  await db.query(
    `UPDATE media_assets SET alt = CASE WHEN $2 THEN $3 ELSE alt END, tags = COALESCE($4::text[], tags), focal_x = $5, focal_y = $6 WHERE id = $1`,
    [id, input.alt !== undefined, input.alt?.trim() || null, input.tags ?? null, focal.x, focal.y],
  );
  // The old crops are stale now; drop them from the store (new ones are made on the next request).
  if (row.kind === 'image' && focalHash(row) !== focalHash({ focal_x: focal.x, focal_y: focal.y })) {
    for (const v of MEDIA_VARIANTS) if (v !== 'original') await deps.mediaStore.delete(variantKey(row, v));
  }
  return loadMediaAsset(db, id);
}

/** Posts in these states are about to be (or being) fetched by the platform, so their media must stay up. */
const LIVE_STATUSES = ['scheduled', 'publishing', 'pending'];

/** Soft delete. Refused while a scheduled or publishing post uses the asset. */
export async function deleteMedia(db: Db, id: string): Promise<void> {
  const row = await loadAssetRow(db, id);
  const usage = (await mediaUsage(db, row.brand_id, [id])).get(id) ?? [];
  const live = usage.filter((u) => u.kind === 'post' && LIVE_STATUSES.includes(u.status ?? ''));
  if (live.length) {
    throw new HarborError('CONFLICT', `Media ${id} is used by ${live.length === 1 ? 'a post that is' : `${live.length} posts that are`} scheduled or publishing (${live.map((u) => u.id).join(', ')}). Remove it from ${live.length === 1 ? 'that post' : 'those posts'} first.`);
  }
  await db.query('UPDATE media_assets SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
}

// ---- Variants ----

/** The largest rectangle of `aspect` (w / h) inside w × h, centered on the focal point and kept inside the image. */
export function cropRect(width: number, height: number, aspect: number, fx: number, fy: number) {
  let w = width;
  let h = Math.round(width / aspect);
  if (h > height) {
    h = height;
    w = Math.min(width, Math.round(height * aspect));
  }
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return { left: clamp(Math.round(fx * width - w / 2), width - w), top: clamp(Math.round(fy * height - h / 2), height - h), width: w, height: h };
}

const variantKey = (r: MediaAssetRow, v: MediaVariant) => `${r.brand_id}/${r.id}/variant-${v}${v === 'original' ? '' : `-${focalHash(r)}`}.jpg`;

/** Re-encode or crop the original to a variant: JPEG at quality 88 on white (for transparent sources). */
export async function renderVariant(source: Buffer, r: MediaAssetRow, v: MediaVariant): Promise<Buffer> {
  let img = sharp(source, { autoOrient: true, animated: false });
  if (v !== 'original') {
    const crop = MEDIA_CROPS[v];
    const rect = cropRect(r.width ?? crop.width, r.height ?? crop.height, crop.width / crop.height, Number(r.focal_x), Number(r.focal_y));
    img = img.extract(rect).resize(crop.width, crop.height, { fit: 'fill' });
  }
  return img.flatten({ background: '#ffffff' }).jpeg({ quality: MEDIA_JPEG_QUALITY }).toBuffer();
}

const inFlight = new Map<string, Promise<Buffer>>();

/**
 * The bytes for a public media URL. JPEG originals and video are served as stored; other variants are made on first
 * request and cached in the store (the key carries the focal hash). undefined when the variant doesn't apply.
 */
export async function openVariant(deps: MediaDeps, r: MediaAssetRow, v: MediaVariant | 'raw'): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | undefined> {
  const { mediaStore } = deps;
  if (v === 'raw' || (r.kind === 'image' && v === 'original' && r.mime === 'image/jpeg')) {
    const f = await mediaStore.get(r.storage_key);
    return f ? { body: f.stream, contentType: r.mime } : undefined;
  }
  if (r.kind !== 'image') return undefined;
  const key = variantKey(r, v);
  const cached = await mediaStore.get(key);
  if (cached) return { body: cached.stream, contentType: 'image/jpeg' };
  let job = inFlight.get(key);
  if (!job) {
    job = (async () => {
      const original = await mediaStore.get(r.storage_key);
      if (!original) throw new HarborError('NOT_FOUND', `Media ${r.id} has no stored file.`);
      const out = await renderVariant(await readAll(original.stream), r, v);
      await mediaStore.put(key, out, 'image/jpeg');
      return out;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return { body: await job, contentType: 'image/jpeg' };
}

// ---- Media on drafts and posts ----

/** A library asset as a MediaRef for a platform: its variant's public URL, and its alt text unless one is given. */
export function assetRef(r: MediaAssetRow, platform: Platform, opts: { variant?: MediaVariant; alt?: string } = {}): MediaRef {
  const variant = r.kind === 'video' ? 'original' : (opts.variant ?? preferredVariant(platform));
  const alt = opts.alt ?? r.alt ?? undefined;
  return { kind: r.kind, url: variantUrl(r, variant), ...(alt ? { alt } : {}), assetId: r.id, variant };
}

/**
 * Turn parts as clients send them into stored parts: every `{ assetId, variant? }` gets its URL (the platform's
 * preferred crop by default) and the asset's alt text. Assets must belong to the brand and not be deleted.
 */
export async function resolveParts(db: Db, brandId: string, platform: Platform, parts: PostPartInput[]): Promise<PostPart[]> {
  const rows = await assetRows(db, assetIdsOf(parts));
  return parts.map((p) => ({
    text: p.text,
    media: p.media.map((m): MediaRef => {
      if (!m.assetId) return { kind: m.kind!, url: m.url!, ...(m.alt ? { alt: m.alt } : {}) };
      const r = rows.get(m.assetId);
      if (!r || r.brand_id !== brandId || r.deleted_at) throw new HarborError('INVALID_REQUEST', `media: asset ${m.assetId} isn't in this brand's media library.`);
      return assetRef(r, platform, { variant: m.variant, alt: m.alt });
    }),
  }));
}

/** Before publishing: point library refs at the current URL (focal point changes) and fill alt text that was missing. */
export async function refreshParts(db: Db, platform: Platform, parts: PostPart[]): Promise<PostPart[]> {
  const rows = await assetRows(db, assetIdsOf(parts));
  if (!rows.size) return parts;
  return parts.map((p) => ({
    ...p,
    media: p.media.map((m) => {
      const r = m.assetId ? rows.get(m.assetId) : undefined;
      return r ? assetRef(r, platform, { variant: m.variant, alt: m.alt }) : m;
    }),
  }));
}

/** What checkMedia sees for one ref: the asset's variant when it's a library asset, else the URL's type. */
export function refItem(m: MediaRef, platform: Platform, assets: ReadonlyMap<string, MediaAssetRow>): MediaCheckItem {
  const r = m.assetId ? assets.get(m.assetId) : undefined;
  return r ? variantInfo(r, m.variant ?? preferredVariant(platform, r.kind)) : { kind: m.kind, mime: mimeFromUrl(m.url) };
}

/** checkMedia for every part that has media (and the first part always, where media can be required). */
export function checkPartsMedia(platform: Platform, parts: PostPart[], assets: ReadonlyMap<string, MediaAssetRow>): MediaCheck {
  const issues: MediaCheck['issues'] = [];
  parts.forEach((p, i) => {
    if (i > 0 && !p.media.length) return;
    const where = parts.length > 1 && i > 0 ? `Part ${i + 1}: ` : '';
    for (const issue of checkMedia(platform, p.media.map((m) => refItem(m, platform, assets))).issues) issues.push({ ...issue, message: `${where}${issue.message}` });
  });
  return { ok: !issues.some((x) => x.level === 'fail'), issues };
}

/** GET /v1/media/:id/fit: the platform's preferred variant of the asset, and how it checks. */
export function fitFor(r: MediaAssetRow, platform: Platform) {
  const variant = preferredVariant(platform, r.kind);
  const info = variantInfo(r, variant);
  return { variant, url: variantUrl(r, variant), width: info.width, height: info.height, check: checkMedia(platform, [info]) };
}

// ---- Weekly plan: an image for an Instagram idea ----

/** Words too common to say what an idea is about (after stemming). */
const STOP = new Set(['with', 'from', 'this', 'that', 'your', 'what', 'into', 'about', 'behind', 'scene', 'week', 'post', 'here', 'every']);
const stem = (w: string) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem);

/**
 * The brand's most recently used image tagged for the idea's topic: a tag that appears in the title as a phrase
 * ("behind the scenes"), or one of its words (4+ letters, not a filler word) that matches a word of the title.
 * Recently used first, then newest. undefined when no tag matches.
 */
export async function imageForIdea(db: Db, brandId: string, title: string): Promise<MediaAssetRow | undefined> {
  const rows = await db.query<MediaAssetRow>(
    "SELECT * FROM media_assets WHERE brand_id = $1 AND kind = 'image' AND deleted_at IS NULL AND cardinality(tags) > 0",
    [brandId],
  );
  const words = new Set(tokens(title));
  const phrase = ` ${tokens(title).join(' ')} `;
  const matches = rows.filter((r) =>
    (r.tags ?? []).some((tag) => {
      const t = tokens(tag.replace(/-/g, ' '));
      return (t.length > 1 && phrase.includes(` ${t.join(' ')} `)) || t.some((w) => w.length >= 4 && !STOP.has(w) && words.has(w));
    }),
  );
  if (!matches.length) return undefined;
  const used = await db.query<{ asset_id: string; at: Date | string }>(
    `SELECT m->>'assetId' AS asset_id, max(d.created_at) AS at
     FROM drafts d
     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.parts) = 'array' THEN d.parts ELSE '[]'::jsonb END) part
     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(part->'media') = 'array' THEN part->'media' ELSE '[]'::jsonb END) m
     WHERE d.brand_id = $1 AND m->>'assetId' = ANY($2::text[]) GROUP BY 1`,
    [brandId, matches.map((r) => r.id)],
  );
  const lastUsed = new Map(used.map((u) => [u.asset_id, new Date(u.at).getTime()]));
  return matches.sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id.localeCompare(a.id))[0];
}
