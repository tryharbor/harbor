import { TZ } from './ui';

/**
 * Calendar math in the workspace's timezone (TZ, from NEXT_PUBLIC_HARBOR_TIMEZONE), so the server (UTC on hosts) and
 * the browser agree on which day and hour a post falls in. Days are plain 'YYYY-MM-DD' keys; instants are Dates.
 */

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** The wall clock in TZ at an instant. `month` is 1–12. */
export function zoned(at: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const p = Object.fromEntries(parts.formatToParts(at).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const split = (key: string) => key.split('-').map(Number) as [number, number, number];

/** The TZ day an instant falls on, as YYYY-MM-DD. */
export function dayKey(at: Date): string {
  const z = zoned(at);
  return keyOf(z.year, z.month, z.day);
}

/** A day key moved by `n` days (pure calendar math, no timezone involved). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = split(key);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return keyOf(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

/** 0 = Sunday. */
export const weekdayOf = (key: string) => {
  const [y, m, d] = split(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const dateOf = (key: string) => split(key)[2];

/** The Sunday on or before a day. */
export const sundayOf = (key: string) => addDays(key, -weekdayOf(key));

/** The instant when the TZ wall clock reads this day at hour:minute. */
export function zonedToDate(key: string, hour = 0, minute = 0): Date {
  const [y, m, d] = split(key);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  // Offset of TZ from UTC around that time; checked twice so a DST change between guess and answer still lands right.
  const offsetAt = (t: number) => {
    const z = zoned(new Date(t));
    return Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute) - Math.floor(t / 60_000) * 60_000;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}
