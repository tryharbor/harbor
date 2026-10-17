import { DEFAULT_WORKSPACE_ID, HarborError, PLATFORMS, newId, type Brand, type Platform } from '@harbor/core';
import type { DigestFinding, DigestInput, DigestPost, DigestStats } from '@harbor/ai';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { bestTimesForBrand } from './best-times.ts';
import { zoned } from '../lib/tz.ts';
import { loadHistory, median, refreshBrandOutcomes, valueAt, type HistoryPost, type OutcomeView } from './outcomes.ts';
import { withRun, type RunInfo, type RunOpts } from './runs.ts';
import { derivePerformanceSignals } from './signals.ts';

export interface Digest {
  brandId: string;
  period: { from: string; to: string };
  generatedAt: string;
  model: string;
  simulated: boolean;
  headline: string;
  stats: DigestStats;
  wins: DigestFinding[];
  misses: DigestFinding[];
  patterns: DigestFinding[];
  recommendations: DigestFinding[];
}

/** Patterns look at this much history; wins and misses only at the digest period. */
export const DIGEST_HISTORY_DAYS = 90;
const DAY_MS = 86_400_000;

/** Median views at ~24h of the posts published in [from, to). */
function medianViews24h(posts: HistoryPost[], from: number, to: number): number | undefined {
  const values = posts
    .filter((p) => p.publishedAt >= from && p.publishedAt < to)
    .map((p) => valueAt(p, 24, 'views'))
    .filter((v): v is number => v !== undefined);
  return values.length ? Math.round(median(values)) : undefined;
}

/** Posts, published posts and median 24h views for a period, with the change against the period before it. */
export async function periodStats(db: Db, brandId: string, history: HistoryPost[], from: number, to: number): Promise<DigestStats> {
  const [counts] = await db.query<{ posts: number; published: number }>(
    `SELECT count(*)::int AS posts, count(*) FILTER (WHERE status = 'published')::int AS published FROM posts
     WHERE brand_id = $1 AND COALESCE(published_at, scheduled_for, created_at) >= $2 AND COALESCE(published_at, scheduled_for, created_at) < $3`,
    [brandId, new Date(from).toISOString(), new Date(to).toISOString()],
  );
  const current = medianViews24h(history, from, to);
  const previous = medianViews24h(history, from - (to - from), from);
  return {
    posts: Number(counts?.posts ?? 0),
    published: Number(counts?.published ?? 0),
    ...(current !== undefined ? { medianViews24h: current } : {}),
    ...(current !== undefined && previous ? { change: Math.round((current / previous) * 100) / 100 } : {}),
  };
}

async function performanceSignalIds(db: Db, brandId: string): Promise<Map<string, string>> {
  const rows = await db.query<{ id: string; post_id: string }>(
    "SELECT id, source->>'postId' AS post_id FROM signals WHERE brand_id = $1 AND kind = 'post_performance'",
    [brandId],
  );
  return new Map(rows.map((r) => [r.post_id, r.id]));
}

function toDigestPost(p: HistoryPost, outcome: OutcomeView | undefined, signalId: string | undefined, inPeriod: boolean): DigestPost {
  const d = new Date(p.publishedAt);
  const wall = zoned(d);
  const views24h = valueAt(p, 24, 'views');
  return {
    id: p.id,
    platform: p.platform,
    parts: p.parts.map((x) => x.text),
    hasMedia: p.parts.some((x) => x.media.length > 0),
    publishedAt: d.toISOString(),
    weekday: wall.weekday,
    hour: wall.hour,
    inPeriod,
    ...(p.url ? { url: p.url } : {}),
    ...(signalId ? { signalId } : {}),
    ...(outcome ? { outcome } : {}),
    ...(views24h !== undefined ? { views24h } : {}),
  };
}

const KIND_OF: Record<'wins' | 'misses' | 'patterns' | 'recommendations', string> = { wins: 'win', misses: 'miss', patterns: 'pattern', recommendations: 'recommendation' };

/**
 * Write a brand's digest for the last `days` days: refresh outcomes and post_performance signals (so every
 * citation resolves), ask the model, then store the digest and one insight per finding that cites a signal.
 * Recorded as an 'insights' agent run.
 */
export async function generateDigest(
  deps: Pick<AppDeps, 'db' | 'model'>,
  brand: Brand,
  days = 7,
  opts: { run?: RunOpts } = {},
): Promise<{ digest: Digest; run: RunInfo }> {
  const { db, model } = deps;
  const to = Date.now();
  const from = to - days * DAY_MS;
  const outcomes = await refreshBrandOutcomes(db, brand.id);
  await derivePerformanceSignals(db, brand.id);
  const signalIds = await performanceSignalIds(db, brand.id);
  const history = await loadHistory(db, brand.id, { since: new Date(to - Math.max(DIGEST_HISTORY_DAYS, days * 2) * DAY_MS) });
  const posts = history.map((p) => toDigestPost(p, outcomes.get(p.id), signalIds.get(p.id), p.publishedAt >= from));
  const stats = await periodStats(db, brand.id, history, from, to);

  const platforms = new Set<Platform>(history.map((p) => p.platform));
  for (const r of await db.query<{ platform: Platform }>("SELECT DISTINCT platform FROM channels WHERE brand_id = $1 AND status <> 'disconnected'", [brand.id])) {
    platforms.add(r.platform);
  }
  const bestTimes: DigestInput['bestTimes'] = [];
  for (const platform of PLATFORMS.filter((p) => platforms.has(p))) {
    const bt = await bestTimesForBrand(db, brand.id, platform);
    // The top slots' own basis: history when most of them are backed by the brand's posts.
    const fromHistory = bt.top.filter((t) => bt.slots[t.weekday * 24 + t.hour]?.basis === 'history').length;
    bestTimes.push({ platform, basis: fromHistory * 2 > bt.top.length ? 'history' : 'prior', top: bt.top });
  }

  const period = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  const input: DigestInput = { brandName: brand.name, period, stats, posts, bestTimes };
  const { value: digest, run } = await withRun(db, brand, 'insights', { days, posts: posts.length, inPeriod: posts.filter((p) => p.inPeriod).length }, model.name, async (runId) => {
    const res = await model.digest(input);
    const digest: Digest = { brandId: brand.id, period, generatedAt: new Date().toISOString(), model: res.model, simulated: res.simulated, stats, ...res.result };
    const digestId = newId('digest');
    await db.query(
      'INSERT INTO digests (id, brand_id, period_from, period_to, data, agent_run_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [digestId, brand.id, period.from, period.to, JSON.stringify(digest), runId],
    );
    const known = new Set(signalIds.values());
    const insightIds: string[] = [];
    for (const key of ['wins', 'misses', 'patterns', 'recommendations'] as const) {
      for (const f of digest[key]) {
        const basis = f.signalIds.filter((id) => known.has(id)).map((signalId) => ({ signalId }));
        if (!basis.length) continue;
        const id = newId('insight');
        await db.query(
          'INSERT INTO insights (id, brand_id, summary, detail, basis, confidence, agent_run_id, digest_id, kind) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [id, brand.id, f.title.slice(0, 500), f.detail, JSON.stringify(basis), f.confidence, runId, digestId, KIND_OF[key]],
        );
        insightIds.push(id);
      }
    }
    return { value: digest, calls: [res], output: { digestId, insightIds } };
  }, opts.run);
  return { digest, run };
}

export async function latestDigest(db: Db, brandId: string): Promise<Digest | undefined> {
  return (await latestDigestRow(db, brandId))?.data;
}

/** The latest digest with its id and when it was written. */
export async function latestDigestRow(db: Db, brandId: string): Promise<{ id: string; data: Digest; created_at: Date | string } | undefined> {
  const [row] = await db.query<{ id: string; data: Digest; created_at: Date | string }>(
    'SELECT id, data, created_at FROM digests WHERE brand_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [brandId],
  );
  return row;
}

export interface OverviewBrand {
  brandId: string;
  brandName: string;
  posts7d: number;
  published7d: number;
  medianViews24h?: number;
  change?: number;
  outperformed: number;
  underperformed: number;
  topPost?: { id: string; text: string; platform: Platform; views?: number; url?: string };
  digestHeadline?: string;
}

/** Every brand's last 7 days, side by side. */
export async function insightsOverview(db: Db, workspaceId = DEFAULT_WORKSPACE_ID): Promise<OverviewBrand[]> {
  const brands = await db.query<{ id: string; name: string }>('SELECT id, name FROM brands WHERE workspace_id = $1 ORDER BY created_at, id', [workspaceId]);
  const to = Date.now();
  const from = to - 7 * DAY_MS;
  const out: OverviewBrand[] = [];
  for (const b of brands) {
    const history = await loadHistory(db, b.id, { since: new Date(from - 7 * DAY_MS) });
    const stats = await periodStats(db, b.id, history, from, to);
    const recent = history.filter((p) => p.publishedAt >= from);
    const verdicts = await db.query<{ post_id: string; verdict: string; ratio: number | null }>(
      'SELECT post_id, verdict, ratio FROM outcomes WHERE post_id = ANY($1::text[])',
      [recent.map((p) => p.id)],
    );
    const byPost = new Map(verdicts.map((v) => [v.post_id, v]));
    const ranked = [...recent].sort((a, c) => {
      const ra = Number(byPost.get(a.id)?.ratio ?? 0);
      const rc = Number(byPost.get(c.id)?.ratio ?? 0);
      const va = a.snapshots.at(-1)?.metrics.views ?? -1;
      const vc = c.snapshots.at(-1)?.metrics.views ?? -1;
      return rc - ra || vc - va || a.id.localeCompare(c.id);
    });
    const top = ranked.find((p) => p.snapshots.length > 0);
    const digest = await latestDigest(db, b.id);
    out.push({
      brandId: b.id,
      brandName: b.name,
      posts7d: stats.posts,
      published7d: stats.published,
      ...(stats.medianViews24h !== undefined ? { medianViews24h: stats.medianViews24h } : {}),
      ...(stats.change !== undefined ? { change: stats.change } : {}),
      outperformed: verdicts.filter((v) => v.verdict === 'outperformed').length,
      underperformed: verdicts.filter((v) => v.verdict === 'underperformed').length,
      ...(top
        ? {
            topPost: {
              id: top.id,
              text: top.parts[0]?.text ?? '',
              platform: top.platform,
              ...(top.snapshots.at(-1)?.metrics.views !== undefined ? { views: top.snapshots.at(-1)!.metrics.views } : {}),
              ...(top.url ? { url: top.url } : {}),
            },
          }
        : {}),
      ...(digest ? { digestHeadline: digest.headline } : {}),
    });
  }
  return out;
}

export const requireDigest = async (db: Db, brandId: string): Promise<Digest> => {
  const d = await latestDigest(db, brandId);
  if (!d) throw new HarborError('NOT_FOUND', `No digest for brand ${brandId} yet. Generate one with POST /v1/brands/${brandId}/digest.`);
  return d;
};
