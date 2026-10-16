import {
  PLATFORM_METRICS,
  SNAPSHOT_SCHEDULE_HOURS,
  newId,
  normalizedMetricsSchema,
  postPartSchema,
  type NormalizedMetrics,
  type Platform,
  type PostPart,
} from '@harbor/core';
import type { Db } from '../db/client.ts';

/**
 * Outcomes: how a published post did against the brand's median for the same platform at the same post age.
 *
 * - Primary metric: views; likes where the platform (or the snapshot) has no views.
 * - Comparable posts: the brand's other published posts on the same platform, published before this one or in the
 *   last 90 days, that have a snapshot within ±25% of the age being compared (the nearest one is used).
 * - Verdict: outperformed ≥ 1.3× the median, met 0.7–1.3×, underperformed < 0.7×; inconclusive with fewer than 3
 *   comparable posts or no metric.
 */

export const VERDICTS = ['outperformed', 'met', 'underperformed', 'inconclusive'] as const;
export type Verdict = (typeof VERDICTS)[number];
export type PrimaryMetric = 'views' | 'likes';

export const OUTPERFORM_RATIO = 1.3;
export const UNDERPERFORM_RATIO = 0.7;
export const MIN_COMPARABLE_POSTS = 3;
/** A snapshot counts for an age when it was taken within this fraction of that age. */
export const AGE_TOLERANCE = 0.25;
export const COMPARABLE_WINDOW_DAYS = 90;

export interface OutcomeView {
  verdict: Verdict;
  ratio: number;
  metric: PrimaryMetric;
  atAgeHours: number;
  baseline: number;
  actual: number;
  comparablePosts: number;
}

export interface HistorySnapshot {
  ageHours: number;
  metrics: NormalizedMetrics;
}

export interface HistoryPost {
  id: string;
  brandId: string;
  platform: Platform;
  /** ms since epoch. */
  publishedAt: number;
  parts: PostPart[];
  url?: string;
  ideaId?: string;
  snapshots: HistorySnapshot[];
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function verdictFor(ratio: number, comparablePosts: number): Verdict {
  if (comparablePosts < MIN_COMPARABLE_POSTS || !(ratio > 0)) return 'inconclusive';
  if (ratio >= OUTPERFORM_RATIO) return 'outperformed';
  if (ratio >= UNDERPERFORM_RATIO) return 'met';
  return 'underperformed';
}

/** views when the metrics have them, else likes. */
export const primaryMetricOf = (m: NormalizedMetrics): PrimaryMetric | undefined =>
  m.views !== undefined ? 'views' : m.likes !== undefined ? 'likes' : undefined;

/** The metric a platform's posts are compared on. */
export const platformPrimaryMetric = (platform: Platform): PrimaryMetric | undefined =>
  PLATFORM_METRICS[platform].views === 'available' ? 'views' : PLATFORM_METRICS[platform].likes === 'available' ? 'likes' : undefined;

/** The snapshot nearest to `age` within ±25% of it. */
export function snapshotNear(post: Pick<HistoryPost, 'snapshots'>, age: number, metric?: PrimaryMetric): HistorySnapshot | undefined {
  let best: HistorySnapshot | undefined;
  for (const s of post.snapshots) {
    if (Math.abs(s.ageHours - age) > age * AGE_TOLERANCE) continue;
    if (metric && s.metrics[metric] === undefined) continue;
    if (!best || Math.abs(s.ageHours - age) < Math.abs(best.ageHours - age)) best = s;
  }
  return best;
}

export const valueAt = (post: Pick<HistoryPost, 'snapshots'>, age: number, metric: PrimaryMetric): number | undefined =>
  snapshotNear(post, age, metric)?.metrics[metric];

/** The other posts a post is compared with (same platform, published before it or in the last 90 days). */
export function comparablePool(target: HistoryPost, all: HistoryPost[], now = Date.now()): HistoryPost[] {
  const since = now - COMPARABLE_WINDOW_DAYS * 86_400_000;
  return all.filter(
    (p) => p.id !== target.id && p.brandId === target.brandId && p.platform === target.platform && (p.publishedAt < target.publishedAt || p.publishedAt >= since),
  );
}

/** The latest schedule age (1, 6, 24, 72, 168h) the post has a snapshot for. */
export function latestScheduleAge(post: Pick<HistoryPost, 'snapshots'>): number | undefined {
  for (const age of [...SNAPSHOT_SCHEDULE_HOURS].reverse()) if (snapshotNear(post, age)) return age;
  return undefined;
}

/** The post's outcome at its latest schedule age, or undefined when it has no snapshot at a schedule age yet. */
export function evaluateOutcome(target: HistoryPost, all: HistoryPost[], now = Date.now()): OutcomeView | undefined {
  const age = latestScheduleAge(target);
  if (age === undefined) return undefined;
  const snap = snapshotNear(target, age)!;
  const metric = primaryMetricOf(snap.metrics);
  if (!metric) return { verdict: 'inconclusive', ratio: 0, metric: platformPrimaryMetric(target.platform) ?? 'views', atAgeHours: age, baseline: 0, actual: 0, comparablePosts: 0 };
  const actual = snapshotNear(target, age, metric)?.metrics[metric] ?? 0;
  const values = comparablePool(target, all, now)
    .map((p) => valueAt(p, age, metric))
    .filter((v): v is number => v !== undefined);
  const baseline = median(values);
  const ratio = baseline > 0 ? round2(actual / baseline) : 0;
  return { verdict: verdictFor(ratio, values.length), ratio, metric, atAgeHours: age, baseline: round2(baseline), actual, comparablePosts: values.length };
}

/** Brand + platform median of the post's primary metric at each schedule age with ≥ 3 comparable posts. */
export function baselineCurveFor(target: HistoryPost, all: HistoryPost[], now = Date.now(), metric?: PrimaryMetric): { ageHours: number; value: number }[] {
  const m = metric ?? platformPrimaryMetric(target.platform);
  if (!m) return [];
  const pool = comparablePool(target, all, now);
  const out: { ageHours: number; value: number }[] = [];
  for (const age of SNAPSHOT_SCHEDULE_HOURS) {
    const values = pool.map((p) => valueAt(p, age, m)).filter((v): v is number => v !== undefined);
    if (values.length >= MIN_COMPARABLE_POSTS) out.push({ ageHours: age, value: round2(median(values)) });
  }
  return out;
}

// ---- Loading ----

interface HistoryRow {
  id: string;
  brand_id: string;
  platform: Platform;
  published_at: Date | string;
  parts: unknown;
  url: string | null;
  idea_id: string | null;
}

/** Every published post of a brand (optionally one platform) with its whole snapshot history. */
export async function loadHistory(db: Db, brandId: string, opts: { platform?: Platform; since?: Date } = {}): Promise<HistoryPost[]> {
  const rows = await db.query<HistoryRow>(
    `SELECT p.id, p.brand_id, ch.platform, p.published_at, d.parts, p.url, p.idea_id
     FROM posts p JOIN channels ch ON ch.id = p.channel_id LEFT JOIN drafts d ON d.id = p.draft_id
     WHERE p.brand_id = $1 AND p.status = 'published' AND p.published_at IS NOT NULL
       AND ($2::text IS NULL OR ch.platform = $2) AND ($3::timestamptz IS NULL OR p.published_at >= $3)
     ORDER BY p.published_at, p.id`,
    [brandId, opts.platform ?? null, opts.since?.toISOString() ?? null],
  );
  if (rows.length === 0) return [];
  const snaps = await db.query<{ post_id: string; age_hours: number; metrics: unknown }>(
    'SELECT post_id, age_hours, metrics FROM snapshots WHERE post_id = ANY($1::text[]) ORDER BY taken_at',
    [rows.map((r) => r.id)],
  );
  const byPost = new Map<string, HistorySnapshot[]>();
  for (const s of snaps) {
    const list = byPost.get(s.post_id) ?? [];
    list.push({ ageHours: Number(s.age_hours), metrics: normalizedMetricsSchema.catch({}).parse(s.metrics ?? {}) });
    byPost.set(s.post_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    brandId: r.brand_id,
    platform: r.platform,
    publishedAt: new Date(r.published_at).getTime(),
    parts: postPartSchema.array().catch([]).parse(r.parts ?? []),
    url: r.url ?? undefined,
    ideaId: r.idea_id ?? undefined,
    snapshots: byPost.get(r.id) ?? [],
  }));
}

// ---- Storage ----

const PLATFORM_NAMES: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };

async function upsertOutcome(db: Db, post: HistoryPost, o: OutcomeView): Promise<void> {
  const notes =
    o.comparablePosts > 0
      ? `${o.ratio}x the ${PLATFORM_NAMES[post.platform]} median ${o.metric} (${o.baseline}) of ${o.comparablePosts} comparable posts at ${o.atAgeHours}h.`
      : `No comparable ${PLATFORM_NAMES[post.platform]} posts at ${o.atAgeHours}h yet.`;
  await db.query(
    `INSERT INTO outcomes (id, post_id, idea_id, verdict, baseline, actual, at_age_hours, notes, metric, ratio, comparable_posts, evaluated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (post_id) DO UPDATE SET idea_id = EXCLUDED.idea_id, verdict = EXCLUDED.verdict, baseline = EXCLUDED.baseline,
       actual = EXCLUDED.actual, at_age_hours = EXCLUDED.at_age_hours, notes = EXCLUDED.notes, metric = EXCLUDED.metric,
       ratio = EXCLUDED.ratio, comparable_posts = EXCLUDED.comparable_posts, evaluated_at = now()`,
    [
      newId('outcome'), post.id, post.ideaId ?? null, o.verdict, JSON.stringify({ [o.metric]: o.baseline }), JSON.stringify({ [o.metric]: o.actual }),
      o.atAgeHours, notes, o.metric, o.ratio, o.comparablePosts,
    ],
  );
}

/** Re-evaluate one post (e.g. right after a snapshot). */
export async function refreshOutcome(db: Db, postId: string): Promise<OutcomeView | undefined> {
  const [row] = await db.query<{ brand_id: string; platform: Platform }>(
    'SELECT p.brand_id, ch.platform FROM posts p JOIN channels ch ON ch.id = p.channel_id WHERE p.id = $1',
    [postId],
  );
  if (!row) return undefined;
  const all = await loadHistory(db, row.brand_id, { platform: row.platform });
  const target = all.find((p) => p.id === postId);
  if (!target) return undefined;
  const o = evaluateOutcome(target, all);
  if (o) await upsertOutcome(db, target, o);
  return o;
}

/** Re-evaluate every published post of a brand. Returns the outcomes by post id. */
export async function refreshBrandOutcomes(db: Db, brandId: string): Promise<Map<string, OutcomeView>> {
  const all = await loadHistory(db, brandId);
  const now = Date.now();
  const out = new Map<string, OutcomeView>();
  for (const post of all) {
    const o = evaluateOutcome(post, all, now);
    if (!o) continue;
    await upsertOutcome(db, post, o);
    out.set(post.id, o);
  }
  return out;
}

/** The baselineCurve of GET /v1/posts/:id. */
export async function postBaselineCurve(db: Db, postId: string, metric?: PrimaryMetric): Promise<{ ageHours: number; value: number }[]> {
  const [row] = await db.query<{ brand_id: string; platform: Platform; status: string }>(
    'SELECT p.brand_id, ch.platform, p.status FROM posts p JOIN channels ch ON ch.id = p.channel_id WHERE p.id = $1',
    [postId],
  );
  if (!row) return [];
  const all = await loadHistory(db, row.brand_id, { platform: row.platform });
  // A post that isn't published yet is compared as if it went out now.
  const target = all.find((p) => p.id === postId) ?? { id: postId, brandId: row.brand_id, platform: row.platform, publishedAt: Date.now(), parts: [], snapshots: [] };
  return baselineCurveFor(target, all, Date.now(), metric);
}

export interface OutcomeColumns {
  outcome_verdict: Verdict | null;
  outcome_ratio: number | null;
  outcome_metric: PrimaryMetric | null;
  outcome_at_age_hours: number | null;
  outcome_baseline: Record<string, number> | null;
  outcome_actual: Record<string, number> | null;
  outcome_comparable_posts: number | null;
}

export const OUTCOME_SELECT = `o.verdict AS outcome_verdict, o.ratio AS outcome_ratio, o.metric AS outcome_metric,
    o.at_age_hours AS outcome_at_age_hours, o.baseline AS outcome_baseline, o.actual AS outcome_actual,
    o.comparable_posts AS outcome_comparable_posts`;

export function toOutcomeView(r: OutcomeColumns): OutcomeView | undefined {
  if (!r.outcome_verdict) return undefined;
  const metric: PrimaryMetric = r.outcome_metric ?? 'views';
  return {
    verdict: r.outcome_verdict,
    ratio: round2(Number(r.outcome_ratio ?? 0)),
    metric,
    atAgeHours: Number(r.outcome_at_age_hours ?? 0),
    baseline: Number(r.outcome_baseline?.[metric] ?? 0),
    actual: Number(r.outcome_actual?.[metric] ?? 0),
    comparablePosts: Number(r.outcome_comparable_posts ?? 0),
  };
}
