import { newId, normalizedMetricsSchema, postPartSchema, type Brand, type NormalizedMetrics, type Platform, type Signal } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';

export interface SignalRow {
  id: string;
  brand_id: string;
  kind: Signal['kind'];
  summary: string;
  source: Signal['source'] | null;
  data: Record<string, unknown> | null;
  observed_at: Date | string;
  created_at: Date | string;
}

export const toSignal = (r: SignalRow): Signal => ({
  id: r.id,
  brandId: r.brand_id,
  kind: r.kind,
  summary: r.summary,
  source: r.source ?? {},
  data: r.data ?? {},
  observedAt: iso(r.observed_at),
  createdAt: iso(r.created_at),
});

export async function latestSignals(db: Db, brandId: string, limit = 100): Promise<Signal[]> {
  const rows = await db.query<SignalRow>('SELECT * FROM signals WHERE brand_id = $1 ORDER BY observed_at DESC, id LIMIT $2', [brandId, limit]);
  return rows.map(toSignal);
}

const PLATFORM_NAMES: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const RANKED_METRICS = ['views', 'reach', 'likes', 'comments'] as const;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const preview = (t: string, max = 70) => {
  const flat = t.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

export interface PublishedPostMetrics {
  postId: string;
  platform: Platform;
  text: string;
  url?: string;
  snapshotId: string;
  metrics: NormalizedMetrics;
  ageHours: number;
  takenAt: string;
}

/** Every published post of a brand that has at least one snapshot, with its latest metrics. */
export async function publishedPostsWithMetrics(db: Db, brandId: string, limit = 200): Promise<PublishedPostMetrics[]> {
  const rows = await db.query<{
    id: string; platform: Platform; parts: unknown; url: string | null; snapshot_id: string; metrics: unknown; age_hours: number; taken_at: string;
  }>(
    `SELECT p.id, ch.platform, d.parts, p.url, s.id AS snapshot_id, s.metrics, s.age_hours, s.taken_at
     FROM posts p
     JOIN channels ch ON ch.id = p.channel_id
     LEFT JOIN drafts d ON d.id = p.draft_id
     JOIN LATERAL (SELECT id, metrics, age_hours, taken_at FROM snapshots WHERE post_id = p.id ORDER BY taken_at DESC LIMIT 1) s ON true
     WHERE p.brand_id = $1 AND p.status = 'published'
     ORDER BY p.published_at DESC NULLS LAST LIMIT $2`,
    [brandId, limit],
  );
  return rows.map((r) => ({
    postId: r.id,
    platform: r.platform,
    text: postPartSchema.array().catch([]).parse(r.parts ?? [])[0]?.text ?? '',
    url: r.url ?? undefined,
    snapshotId: r.snapshot_id,
    metrics: normalizedMetricsSchema.catch({}).parse(r.metrics ?? {}),
    ageHours: Number(r.age_hours),
    takenAt: iso(r.taken_at),
  }));
}

/**
 * One post_performance signal per published post with snapshots: its latest metrics against the brand median for
 * the brand's main metric (views where reported, else the next metric posts have). Re-running updates the rows.
 */
export async function derivePerformanceSignals(db: Db, brandId: string): Promise<number> {
  const posts = await publishedPostsWithMetrics(db, brandId);
  if (posts.length === 0) return 0;
  const metric = RANKED_METRICS.find((k) => posts.some((p) => p.metrics[k] !== undefined));
  const values = metric ? posts.map((p) => p.metrics[metric]).filter((v): v is number => v !== undefined) : [];
  const med = median(values);
  for (const p of posts) {
    const value = metric ? p.metrics[metric] : undefined;
    const ratio = value !== undefined && med > 0 ? Math.round((value / med) * 100) / 100 : undefined;
    const head = `${PLATFORM_NAMES[p.platform]} post "${preview(p.text || '(no text)', 60)}"`;
    const extras = (['likes', 'comments', 'reposts', 'saves'] as const)
      .filter((k) => k !== metric && p.metrics[k] !== undefined)
      .map((k) => `${fmt(p.metrics[k]!)} ${k}`);
    const summary =
      value !== undefined && ratio !== undefined
        ? `${head}: ${fmt(value)} ${metric} at ${Math.round(p.ageHours)}h, ${ratio}x the brand median (${fmt(med)}).${extras.length ? ` ${extras.join(', ')}.` : ''}`
        : `${head}: no comparable metrics yet (${PLATFORM_NAMES[p.platform]} reports ${Object.keys(p.metrics).join(', ') || 'none'}).`;
    const source = { postId: p.postId, snapshotId: p.snapshotId, ...(p.url ? { url: p.url } : {}) };
    const data = { postId: p.postId, platform: p.platform, text: p.text, metric, value, median: med, ratio, ageHours: p.ageHours, metrics: p.metrics };
    await db.query(
      `INSERT INTO signals (id, brand_id, kind, summary, source, data, observed_at) VALUES ($1, $2, 'post_performance', $3, $4, $5, $6)
       ON CONFLICT (brand_id, (source->>'postId')) WHERE kind = 'post_performance'
       DO UPDATE SET summary = EXCLUDED.summary, source = EXCLUDED.source, data = EXCLUDED.data, observed_at = EXCLUDED.observed_at`,
      [newId('signal'), brandId, summary, JSON.stringify(source), JSON.stringify(data), p.takenAt],
    );
  }
  return posts.length;
}

async function ensureManual(db: Db, brandId: string, summary: string, data: Record<string, unknown>): Promise<void> {
  const [existing] = await db.query("SELECT id FROM signals WHERE brand_id = $1 AND kind = 'manual' AND summary = $2", [brandId, summary]);
  if (existing) return;
  await db.query(`INSERT INTO signals (id, brand_id, kind, summary, source, data, observed_at) VALUES ($1, $2, 'manual', $3, '{}', $4, now())`, [
    newId('signal'), brandId, summary, JSON.stringify(data),
  ]);
}

/**
 * Manual signals from Brand Memory, so ideas about the audience can cite something: one per audience pain point
 * ("Audience pain point: …"). A brand with no pain points and no other signals gets one "Brand focus" signal.
 */
export async function ensureMemorySignals(db: Db, brand: Brand): Promise<void> {
  for (const a of brand.memory.audiences) {
    for (const p of a.painPoints.slice(0, 6)) {
      await ensureManual(db, brand.id, `Audience pain point: ${p.trim()} (${a.name})`, { from: 'brand_memory', audienceId: a.id, painPoint: p });
    }
  }
  const [any] = await db.query('SELECT id FROM signals WHERE brand_id = $1 LIMIT 1', [brand.id]);
  if (!any) {
    const focus = brand.memory.products[0]?.summary || brand.memory.voice.summary || brand.name;
    await ensureManual(db, brand.id, `Brand focus: ${preview(focus, 200)}`, { from: 'brand_memory' });
  }
}
