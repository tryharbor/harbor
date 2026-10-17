/**
 * Calendar math in the workspace's timezone, so best times, posting slots and schedule automations mean the same
 * wall clock the app shows (hosts run in UTC). The zone is HARBOR_TIMEZONE, else the web app's
 * NEXT_PUBLIC_HARBOR_TIMEZONE (one .env serves both), else the machine's own.
 */

const machineZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const formatters = new Map<string, Intl.DateTimeFormat>();
const warned = new Set<string>();

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The workspace's IANA zone, e.g. "America/Chicago". An unknown name falls back to the machine's zone (with a warning). */
export function workspaceTimeZone(): string {
  const zone = (process.env.HARBOR_TIMEZONE || process.env.NEXT_PUBLIC_HARBOR_TIMEZONE || '').trim();
  if (!zone) return machineZone();
  try {
    formatter(zone);
    return zone;
  } catch {
    if (!warned.has(zone)) {
      warned.add(zone);
      console.warn(`[tz] Unknown timezone "${zone}"; using ${machineZone()}.`);
    }
    return machineZone();
  }
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface WallClock {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  /** 0 = Sunday. */
  weekday: number;
  hour: number;
  minute: number;
}

/** The wall clock in `zone` at an instant. */
export function zoned(at: Date, zone = workspaceTimeZone()): WallClock {
  const p = Object.fromEntries(formatter(zone).formatToParts(at).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day), weekday: WEEKDAY[p.weekday!]!, hour: Number(p.hour) % 24, minute: Number(p.minute),
  };
}

/**
 * The instant when the wall clock in `zone` reads this date and time. `day` may run past the month (day + 7 is a week
 * later). In a DST gap the time lands an hour off, on the nearest real time.
 */
export function zonedToDate(year: number, month: number, day: number, hour = 0, minute = 0, zone = workspaceTimeZone()): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // The zone's offset around that time; checked twice so a DST change between guess and answer still lands right.
  const offsetAt = (t: number) => {
    const z = zoned(new Date(t), zone);
    return Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute) - Math.floor(t / 60_000) * 60_000;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}

/** Midnight today in `zone`. */
export function startOfZonedDay(at = new Date(), zone = workspaceTimeZone()): Date {
  const z = zoned(at, zone);
  return zonedToDate(z.year, z.month, z.day, 0, 0, zone);
}
