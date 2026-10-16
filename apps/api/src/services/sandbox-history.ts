import { createHash, randomBytes } from 'node:crypto';
import { SNAPSHOT_SCHEDULE_HOURS, newId, type NormalizedMetrics, type Platform, type PostPart } from '@harbor/core';
import { SANDBOX_URL_BASE, SandboxProvider } from '@harbor/providers';
import type { Db } from '../db/client.ts';
import { insertDraft } from './drafts.ts';

export interface HistoricalPost {
  brandId: string;
  channelId: string;
  platform: Platform;
  parts: PostPart[];
  publishedAt: Date;
  /** Makes the sandbox post id (and so its random curve) reproducible. */
  key?: string;
  /** Replace the sandbox curve with fixed metrics (tests). */
  metricsAt?: (ageHours: number) => NormalizedMetrics;
  now?: number;
}

/**
 * Put a sandbox post into the past as if it had been published at `publishedAt` and polled on schedule since:
 * a published post with a `sbx_` id, a snapshot at every schedule age already reached (metrics from the sandbox
 * provider's curve, so they match what the worker would have taken) and snapshot jobs for the rest. Used by the
 * demo seed and tests; never by the live publishing path.
 */
export async function insertHistoricalPost(db: Db, h: HistoricalPost): Promise<string> {
  const now = h.now ?? Date.now();
  const t = h.publishedAt.getTime();
  const suffix = h.key ? createHash('sha1').update(h.key).digest('hex').slice(0, 8) : randomBytes(4).toString('hex');
  const platformPostId = `sbx_${t.toString(36)}_${suffix}`;
  const draftId = await insertDraft(db, { brandId: h.brandId, platform: h.platform, channelId: h.channelId, parts: h.parts, author: 'human' });
  const postId = newId('post');
  await db.query(
    `INSERT INTO posts (id, brand_id, channel_id, draft_id, status, scheduled_for, published_at, platform_post_id, url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'published', $5, $5, $6, $7, $5, $5)`,
    [postId, h.brandId, h.channelId, draftId, h.publishedAt.toISOString(), platformPostId, `${SANDBOX_URL_BASE}/${h.platform}/${platformPostId}`],
  );
  const provider = new SandboxProvider(h.platform);
  if (!provider.fetchPostMetrics && !h.metricsAt) return postId;
  for (const age of SNAPSHOT_SCHEDULE_HOURS) {
    const due = t + age * 3_600_000;
    if (due > now) {
      await db.query('INSERT INTO snapshot_jobs (post_id, age_hours, due_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [postId, age, new Date(due).toISOString()]);
      continue;
    }
    let raw: unknown;
    let metrics: NormalizedMetrics;
    let adapterVersion = provider.adapterVersion;
    if (h.metricsAt) {
      metrics = h.metricsAt(age);
      raw = { fixture: true, ageHours: age, metrics };
      adapterVersion = 'fixture-1';
    } else {
      const at = new SandboxProvider(h.platform, { now: () => due });
      const m = await at.fetchPostMetrics!(
        { accessToken: 'sbx', account: { platformAccountId: 'sbx', handle: 'sbx' }, settings: { publishedAt: h.publishedAt.toISOString(), parts: h.parts } },
        platformPostId,
      );
      raw = m.raw;
      metrics = m.metrics;
    }
    await db.query(
      'INSERT INTO snapshots (id, post_id, taken_at, age_hours, raw, metrics, adapter_version) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [newId('snapshot'), postId, new Date(due).toISOString(), age, JSON.stringify(raw), JSON.stringify(metrics), adapterVersion],
    );
    await db.query(
      'INSERT INTO snapshot_jobs (post_id, age_hours, due_at, done_at, attempts) VALUES ($1, $2, $3, $3, 1) ON CONFLICT DO NOTHING',
      [postId, age, new Date(due).toISOString()],
    );
  }
  return postId;
}
