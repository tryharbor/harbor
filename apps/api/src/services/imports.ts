import { HarborError, SNAPSHOT_SCHEDULE_HOURS, newId, normalizedMetricsSchema, type NormalizedMetrics, type PastPost, type PlatformProvider } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { loadBrand } from './brands.ts';
import { getChannelRow, providerContext } from './channels.ts';
import { insertDraft } from './drafts.ts';
import { refreshBrandOutcomes } from './outcomes.ts';
import type { PublishDeps } from './publisher.ts';

/**
 * Import past posts: scan a channel's recent posts, let the owner review the list (uncheck to exclude), then import
 * them as published posts with origin 'imported', so a new brand has history (and verdicts) on day one.
 */

export const SCAN_TTL_MIN = 60;
export const SCAN_MAX = 50;
export const SCAN_DEFAULT = 30;
/** Stored on the one snapshot an imported post gets. */
export const IMPORT_ADAPTER_VERSION = 'import';

export interface ScannedPost {
  platformPostId: string;
  text: string;
  publishedAt: string;
  url?: string;
  metrics?: NormalizedMetrics;
  alreadyImported: boolean;
}

/** X reads are billed, so X lists past posts only with HARBOR_X_READ_REPLIES=true (the same switch as replies). */
const canList = (p: PlatformProvider | undefined): p is PlatformProvider & Required<Pick<PlatformProvider, 'listRecentPosts'>> =>
  !!p && typeof p.listRecentPosts === 'function' && (p.identifier !== 'x' || p.reportsReplies);

const view = (p: PastPost, alreadyImported: boolean): ScannedPost => ({
  platformPostId: p.platformPostId,
  text: p.text,
  publishedAt: p.publishedAt,
  ...(p.url ? { url: p.url } : {}),
  ...(p.metrics && Object.keys(p.metrics).length ? { metrics: p.metrics } : {}),
  alreadyImported,
});

async function importedIds(db: Db, channelId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.query<{ platform_post_id: string }>('SELECT platform_post_id FROM posts WHERE channel_id = $1 AND platform_post_id = ANY($2::text[])', [channelId, ids]);
  return new Set(rows.map((r) => r.platform_post_id));
}

/** POST /v1/channels/:id/import/scan. The scan is kept for an hour. */
export async function scanChannel(deps: PublishDeps, channelId: string, limit = SCAN_DEFAULT): Promise<{ scanId: string; channelId: string; supported: boolean; found: ScannedPost[] }> {
  const { db } = deps;
  const channel = await getChannelRow(db, channelId);
  const provider = deps.registry.get(channel.platform);
  let found: PastPost[] = [];
  const supported = canList(provider);
  if (supported) {
    const brand = await loadBrand(db, channel.brand_id);
    // The sandbox writes its history in the brand's voice from these; real providers ignore them.
    const examples = [...brand.memory.examplePosts.map((e) => e.text), ...brand.memory.voice.excerpts.map((e) => e.text)];
    const ctx = await providerContext(db, deps.secrets, provider, channel, { settings: { examples, brandName: brand.name } });
    found = (await provider.listRecentPosts(ctx, { limit: Math.min(SCAN_MAX, Math.max(1, limit)) })).filter((p) => p.platformPostId);
  }
  const scanId = newId('importScan');
  await db.query(`INSERT INTO import_scans (id, channel_id, brand_id, data, expires_at) VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`, [
    scanId, channel.id, channel.brand_id, JSON.stringify(found), SCAN_TTL_MIN,
  ]);
  const done = await importedIds(db, channel.id, found.map((p) => p.platformPostId));
  return { scanId, channelId: channel.id, supported, found: found.map((p) => view(p, done.has(p.platformPostId))) };
}

/**
 * POST /v1/channels/:id/import. Each included post becomes a published post (origin 'imported', published_at from
 * the platform) with one snapshot of the scanned metrics at its true age (adapter_version 'import'). Snapshot jobs
 * are only created for schedule ages still ahead. Posts already in Harbor are skipped. Verdicts are refreshed.
 */
export async function importScanned(deps: PublishDeps, channelId: string, input: { scanId: string; include: string[] }): Promise<{ imported: number; skipped: number; postIds: string[] }> {
  const { db } = deps;
  const channel = await getChannelRow(db, channelId);
  const [scan] = await db.query<{ data: PastPost[]; expired: boolean }>('SELECT data, expires_at < now() AS expired FROM import_scans WHERE id = $1 AND channel_id = $2', [
    input.scanId, channel.id,
  ]);
  if (!scan) throw new HarborError('NOT_FOUND', `Scan ${input.scanId} not found for this channel.`);
  if (scan.expired) throw new HarborError('INVALID_REQUEST', 'This scan has expired. Scan the channel again.');
  const provider = deps.registry.get(channel.platform);
  const wanted = new Set(input.include);
  const picked = (scan.data ?? []).filter((p) => wanted.has(p.platformPostId));
  const done = await importedIds(db, channel.id, picked.map((p) => p.platformPostId));
  const postIds: string[] = [];
  const now = Date.now();
  for (const p of picked) {
    if (done.has(p.platformPostId)) continue;
    const publishedAt = new Date(p.publishedAt);
    const texts = p.parts?.length ? p.parts : [p.text];
    const draftId = await insertDraft(db, { brandId: channel.brand_id, platform: channel.platform, channelId: channel.id, parts: texts.map((text) => ({ text, media: [] })), author: 'human' });
    const postId = newId('post');
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO posts (id, brand_id, channel_id, draft_id, status, origin, scheduled_for, published_at, platform_post_id, url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'published', 'imported', $5, $5, $6, $7, $5, now())
       ON CONFLICT (channel_id, platform_post_id) DO NOTHING RETURNING id`,
      [postId, channel.brand_id, channel.id, draftId, iso(publishedAt), p.platformPostId, p.url ?? null],
    );
    if (!row) {
      await db.query('DELETE FROM drafts WHERE id = $1', [draftId]);
      continue;
    }
    postIds.push(postId);
    const age = Math.max(0, (now - publishedAt.getTime()) / 3_600_000);
    const metrics = normalizedMetricsSchema.catch({}).parse(p.metrics ?? {});
    if (Object.keys(metrics).length) {
      await db.query('INSERT INTO snapshots (id, post_id, taken_at, age_hours, raw, metrics, adapter_version) VALUES ($1, $2, now(), $3, $4, $5, $6)', [
        newId('snapshot'), postId, age, JSON.stringify({ imported: true, scanId: input.scanId, metrics: p.metrics ?? null }), JSON.stringify(metrics), IMPORT_ADAPTER_VERSION,
      ]);
    }
    if (provider?.fetchPostMetrics) {
      for (const h of SNAPSHOT_SCHEDULE_HOURS.filter((h) => h > age)) {
        await db.query('INSERT INTO snapshot_jobs (post_id, age_hours, due_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
          postId, h, new Date(publishedAt.getTime() + h * 3_600_000).toISOString(),
        ]);
      }
    }
  }
  if (postIds.length) await refreshBrandOutcomes(db, channel.brand_id);
  return { imported: postIds.length, skipped: input.include.length - postIds.length, postIds };
}
