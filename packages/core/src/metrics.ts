import { z } from 'zod';

export const PLATFORMS = ['x', 'linkedin', 'instagram', 'threads'] as const;
export const platformSchema = z.enum(PLATFORMS);
export type Platform = z.infer<typeof platformSchema>;

/**
 * Platform-neutral metric keys. Every snapshot maps the platform's raw payload onto these; anything a platform
 * doesn't report is simply absent (never 0). `retention` is a 0..1 ratio, `watchTimeSec` is total seconds.
 */
export const METRIC_KEYS = [
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'reposts',
  'profileVisits',
  'followsGained',
  'linkClicks',
  'watchTimeSec',
  'retention',
] as const;
export const metricKeySchema = z.enum(METRIC_KEYS);
export type MetricKey = z.infer<typeof metricKeySchema>;

const count = z.number().nonnegative();
export const normalizedMetricsSchema = z
  .object({
    views: count.optional(),
    reach: count.optional(),
    likes: count.optional(),
    comments: count.optional(),
    shares: count.optional(),
    saves: count.optional(),
    reposts: count.optional(),
    profileVisits: count.optional(),
    followsGained: count.optional(),
    linkClicks: count.optional(),
    watchTimeSec: count.optional(),
    retention: z.number().min(0).max(1).optional(),
  })
  .strict();
export type NormalizedMetrics = z.infer<typeof normalizedMetricsSchema>;

export type MetricAvailability = 'available' | 'unavailable';
export type MetricAvailabilityMap = Record<MetricKey, MetricAvailability>;

const avail = (available: MetricKey[]): MetricAvailabilityMap =>
  Object.fromEntries(METRIC_KEYS.map((k) => [k, available.includes(k) ? 'available' : 'unavailable'])) as MetricAvailabilityMap;

/**
 * Which normalized metrics each platform can report per post, for the account types Harbor targets
 * (X user context, LinkedIn member, Instagram professional account via Instagram Login, Threads profile).
 *
 * - X: profileVisits and linkClicks come from non_public_metrics, only for the owner and only for posts < 30 days old.
 * - LinkedIn: member post analytics need Community Management API partner approval, which Harbor doesn't have yet,
 *   so nothing is available. Posts still publish.
 * - Instagram: media insights `views, reach, likes, comments, shares, saved`.
 * - Threads: media insights `views, likes, replies, reposts, quotes, shares` (quotes count toward reposts).
 */
export const PLATFORM_METRICS: Record<Platform, MetricAvailabilityMap> = {
  x: avail(['views', 'likes', 'comments', 'reposts', 'saves', 'profileVisits', 'linkClicks']),
  linkedin: avail([]),
  instagram: avail(['views', 'reach', 'likes', 'comments', 'shares', 'saves']),
  threads: avail(['views', 'likes', 'comments', 'shares', 'reposts']),
};

export function availableMetrics(platform: Platform): MetricKey[] {
  return METRIC_KEYS.filter((k) => PLATFORM_METRICS[platform][k] === 'available');
}

/** Growth-curve polling: a snapshot is taken at each of these post ages (hours): 1h, 6h, 24h, 72h, 7d. */
export const SNAPSHOT_SCHEDULE_HOURS = [1, 6, 24, 72, 168] as const;
