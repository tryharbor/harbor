import type { Platform } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { zoned, zonedToDate } from '../lib/tz.ts';
import { bestTimesForBrand } from './best-times.ts';

/**
 * Open posting slots on one channel: the next 7 days starting tomorrow, on the workspace's clock, best-time score first.
 * A slot is at least 1h away, at least 3h from any scheduled post or pending approval on the channel (and from the
 * other slots picked), and at most one per day while the week has room.
 */

export const SLOT_DAYS = 7;
export const SLOT_GAP_HOURS = 3;
export const SLOT_MIN_LEAD_HOURS = 1;
const HOUR_MS = 3_600_000;

export interface Slot {
  at: Date;
  score: number;
  weekday: number;
  hour: number;
}

/** Times already taken on a channel: scheduled (or in-flight) posts and pending approvals. */
export async function busyTimes(db: Db, channelId: string): Promise<Date[]> {
  const rows = await db.query<{ at: Date | string }>(
    `SELECT scheduled_for AS at FROM posts WHERE channel_id = $1 AND status IN ('scheduled', 'publishing', 'pending') AND scheduled_for IS NOT NULL
     UNION ALL SELECT proposed_for AS at FROM approvals WHERE channel_id = $1 AND status = 'pending'`,
    [channelId],
  );
  return rows.map((r) => new Date(r.at));
}

export async function openSlots(
  db: Db,
  brandId: string,
  channel: { id: string; platform: Platform },
  count: number,
  opts: { now?: number; taken?: Date[] } = {},
): Promise<Slot[]> {
  if (count <= 0) return [];
  const now = opts.now ?? Date.now();
  const grid = await bestTimesForBrand(db, brandId, channel.platform);
  const busy = [...(await busyTimes(db, channel.id)), ...(opts.taken ?? [])].map((d) => d.getTime());

  const today = zoned(new Date(now));
  const candidates: (Slot & { day: number })[] = [];
  for (let day = 1; day <= SLOT_DAYS; day++) {
    for (let h = 0; h < 24; h++) {
      const at = zonedToDate(today.year, today.month, today.day + day, h);
      if (at.getTime() < now + SLOT_MIN_LEAD_HOURS * HOUR_MS) continue;
      // Read back from the instant: in a DST gap the hour asked for doesn't exist.
      const { weekday, hour } = zoned(at);
      if (candidates.some((c) => c.at.getTime() === at.getTime())) continue;
      candidates.push({ at, weekday, hour, day, score: grid.slots[weekday * 24 + hour]?.score ?? 0 });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.at.getTime() - b.at.getTime());

  const picked: (Slot & { day: number })[] = [];
  const clear = (t: number) => [...busy, ...picked.map((p) => p.at.getTime())].every((b) => Math.abs(b - t) >= SLOT_GAP_HOURS * HOUR_MS);
  // First one per day, then (only if the week is full) more on the same days.
  for (const onePerDay of [true, false]) {
    for (const c of candidates) {
      if (picked.length >= count) break;
      if (picked.includes(c) || (onePerDay && picked.some((p) => p.day === c.day)) || !clear(c.at.getTime())) continue;
      picked.push(c);
    }
  }
  return picked.sort((a, b) => a.at.getTime() - b.at.getTime()).map(({ at, score, weekday, hour }) => ({ at, score, weekday, hour }));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Tuesday 9:00". */
export const slotLabel = (s: Pick<Slot, 'weekday' | 'hour'>) => `${WEEKDAYS[s.weekday]} ${s.hour % 12 === 0 ? 12 : s.hour % 12}${s.hour < 12 ? 'am' : 'pm'}`;
