import { PLATFORMS, type Platform } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { zoned } from '../lib/tz.ts';
import { loadHistory, median, platformPrimaryMetric, valueAt, type HistoryPost } from './outcomes.ts';

/**
 * Best posting times: a 7×24 grid (weekday 0 = Sunday, hour 0–23, in the workspace's timezone) scored 0..1.
 *
 * History: each post's primary metric at 24h, divided by the brand's median for that platform (so platforms mix),
 * credited to its publish slot and spread to neighbouring hours with a Gaussian kernel (σ 1.5h, ±3h); the same hour
 * on other weekdays counts at 25%. Prior: per-platform defaults (X and LinkedIn weekday mornings, Instagram
 * evenings, Threads mid-day). Each slot blends the two by how much history it has (shrinkage: λ = E / (E + k), E =
 * the kernel weight of the posts near it), so a brand with no posts sees the prior and history takes over slot by
 * slot. Scores are scaled so the best slot is 1.
 */

export interface BestTimeSlot {
  weekday: number;
  hour: number;
  score: number;
  basis: 'history' | 'prior';
  /** Posts published in exactly this slot. */
  posts: number;
}

export interface BestTimes {
  platform?: Platform;
  slots: BestTimeSlot[];
  top: { weekday: number; hour: number; score: number }[];
}

/** Shrinkage strength: a slot needs this much kernel weight of history for history and prior to count equally. */
export const SHRINKAGE_K = 1;
const HOUR_SIGMA = 1.5;
const HOUR_REACH = 3;
const OTHER_DAY_WEIGHT = 0.25;

const hourDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
};
const bump = (h: number, peak: number, width: number) => Math.exp(-(hourDistance(h, peak) ** 2) / (2 * width * width));

/** Default audience activity by platform, 0..1 (before any history). */
export function priorScore(platform: Platform, weekday: number, hour: number): number {
  const weekend = weekday === 0 || weekday === 6;
  let hourly: number;
  let day: number;
  switch (platform) {
    case 'x':
      hourly = Math.max(bump(hour, 9, 1.5), 0.75 * bump(hour, 12.5, 1.2), 0.5 * bump(hour, 17, 1.5));
      day = weekend ? 0.6 : 1;
      break;
    case 'linkedin':
      hourly = Math.max(bump(hour, 8, 1.5), 0.7 * bump(hour, 12, 1), 0.4 * bump(hour, 17, 1.2));
      day = weekend ? 0.3 : weekday === 1 || weekday === 5 ? 0.85 : 1;
      break;
    case 'instagram':
      hourly = Math.max(bump(hour, 19.5, 1.8), 0.6 * bump(hour, 12, 1.2), 0.4 * bump(hour, 8, 1.2));
      day = weekend ? 1 : 0.9;
      break;
    case 'threads':
      hourly = Math.max(bump(hour, 12.5, 1.8), 0.7 * bump(hour, 20, 1.5), 0.5 * bump(hour, 9, 1.3));
      day = weekend ? 0.8 : 1;
      break;
  }
  return 0.05 + 0.95 * hourly * day;
}

interface Scored {
  weekday: number;
  hour: number;
  /** Primary metric at 24h relative to the brand's platform median. */
  relative: number;
}

/** Each post's 24h primary metric relative to its platform's median (posts without a 24h value are left out). */
export function relativePerformance(posts: HistoryPost[]): Scored[] {
  const byPlatform = new Map<Platform, { post: HistoryPost; value: number }[]>();
  for (const post of posts) {
    const metric = platformPrimaryMetric(post.platform);
    const value = metric ? valueAt(post, 24, metric) : undefined;
    if (value === undefined) continue;
    const list = byPlatform.get(post.platform) ?? [];
    list.push({ post, value });
    byPlatform.set(post.platform, list);
  }
  const out: Scored[] = [];
  for (const list of byPlatform.values()) {
    const med = median(list.map((x) => x.value));
    if (!(med > 0)) continue;
    for (const { post, value } of list) {
      const { weekday, hour } = zoned(new Date(post.publishedAt));
      out.push({ weekday, hour, relative: Math.max(value, 1) / med });
    }
  }
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The grid from history and the platforms' priors (averaged when several platforms are mixed). */
export function computeBestTimes(posts: HistoryPost[], priorPlatforms: Platform[], platform?: Platform): BestTimes {
  const scored = relativePerformance(posts);
  const platforms = priorPlatforms.length ? priorPlatforms : [...PLATFORMS];
  const raw: { weekday: number; hour: number; value: number; history: boolean; posts: number }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      let weight = 0;
      let logSum = 0;
      let exact = 0;
      for (const s of scored) {
        const dh = hourDistance(s.hour, hour);
        if (dh > HOUR_REACH) continue;
        const w = Math.exp(-(dh * dh) / (2 * HOUR_SIGMA * HOUR_SIGMA)) * (s.weekday === weekday ? 1 : OTHER_DAY_WEIGHT);
        weight += w;
        logSum += w * Math.log(s.relative);
        if (dh === 0 && s.weekday === weekday) exact++;
      }
      const prior = platforms.reduce((a, p) => a + priorScore(p, weekday, hour), 0) / platforms.length;
      // Both on one scale: history 0.5 = the median, prior 0.23..0.8.
      const priorValue = 0.2 + 0.6 * prior;
      const lambda = weight / (weight + SHRINKAGE_K);
      const historyValue = weight > 0 ? 1 / (1 + Math.exp(-1.5 * (logSum / weight))) : 0;
      raw.push({ weekday, hour, value: lambda * historyValue + (1 - lambda) * priorValue, history: lambda >= 0.5, posts: exact });
    }
  }
  const max = Math.max(...raw.map((r) => r.value)) || 1;
  const slots: BestTimeSlot[] = raw.map((r) => ({
    weekday: r.weekday,
    hour: r.hour,
    score: round3(r.value / max),
    basis: r.history ? 'history' : 'prior',
    posts: r.posts,
  }));
  const top = [...slots]
    .sort((a, b) => b.score - a.score || a.weekday - b.weekday || a.hour - b.hour)
    .slice(0, 5)
    .map(({ weekday, hour, score }) => ({ weekday, hour, score }));
  return { ...(platform ? { platform } : {}), slots, top };
}

/** Best times for one brand, for one platform or all of its platforms. */
export async function bestTimesForBrand(db: Db, brandId: string, platform?: Platform): Promise<BestTimes> {
  const posts = await loadHistory(db, brandId, { platform });
  let priorPlatforms: Platform[];
  if (platform) priorPlatforms = [platform];
  else {
    const rows = await db.query<{ platform: Platform }>(
      "SELECT DISTINCT platform FROM channels WHERE brand_id = $1 AND status <> 'disconnected' ORDER BY platform",
      [brandId],
    );
    priorPlatforms = rows.map((r) => r.platform);
  }
  return computeBestTimes(posts, priorPlatforms, platform);
}
