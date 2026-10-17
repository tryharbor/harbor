import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, createDeps, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { startOfZonedDay, workspaceTimeZone, zoned, zonedToDate } from '../src/lib/tz.ts';
import { computeBestTimes } from '../src/services/best-times.ts';
import { nextRunAt, realignSchedules } from '../src/services/automations.ts';
import type { HistoryPost } from '../src/services/outcomes.ts';
import { openSlots } from '../src/services/slots.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

// Hosts run in UTC; the workspace is in Chicago (CDT until Nov 1, 2026, then CST).
const CHI = 'America/Chicago';

let db: Db;
let app: App;
const send = sender(() => app);
const json = async (method: string, path: string, body?: unknown) => (await send(method, path, body)).json();

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  vi.stubEnv('HARBOR_TIMEZONE', CHI);
  db = await openDb('memory://');
  app = createApp(db, {}, createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated' }));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.close();
});

describe('timezone helpers', () => {
  it('maps wall clock times to instants, across DST', () => {
    expect(zonedToDate(2026, 10, 19, 9, 0, CHI).toISOString()).toBe('2026-10-19T14:00:00.000Z');
    expect(zonedToDate(2026, 11, 2, 9, 0, CHI).toISOString()).toBe('2026-11-02T15:00:00.000Z');
    // Day overflow: October 32 is November 1, after the clocks go back.
    expect(zonedToDate(2026, 10, 32, 9, 0, CHI).toISOString()).toBe('2026-11-01T15:00:00.000Z');
    expect(zoned(new Date('2026-10-19T04:30:00Z'), CHI)).toEqual({ year: 2026, month: 10, day: 18, weekday: 0, hour: 23, minute: 30 });
    // 2:30 on March 8 doesn't exist in Chicago; it lands on a real time next to it.
    expect([1, 3]).toContain(zoned(zonedToDate(2026, 3, 8, 2, 30, CHI), CHI).hour);
    expect(startOfZonedDay(new Date('2026-10-19T03:00:00Z'), CHI).toISOString()).toBe('2026-10-18T05:00:00.000Z');
  });

  it('reads HARBOR_TIMEZONE, then the web app zone, and ignores unknown names', () => {
    expect(workspaceTimeZone()).toBe(CHI);
    vi.stubEnv('HARBOR_TIMEZONE', '');
    vi.stubEnv('NEXT_PUBLIC_HARBOR_TIMEZONE', 'Europe/Berlin');
    expect(workspaceTimeZone()).toBe('Europe/Berlin');
    vi.stubEnv('HARBOR_TIMEZONE', 'Mars/Olympus');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(workspaceTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    warn.mockRestore();
    vi.stubEnv('NEXT_PUBLIC_HARBOR_TIMEZONE', '');
    vi.stubEnv('HARBOR_TIMEZONE', CHI);
  });
});

describe('scheduling on the workspace clock', () => {
  it('fires "Mondays at 8" at 8:00 in the workspace zone', () => {
    const monday8 = { type: 'schedule' as const, weekday: 1, hour: 8 };
    // Saturday 3pm CDT.
    expect(nextRunAt(monday8, new Date('2026-10-17T20:00:00Z'))!.toISOString()).toBe('2026-10-19T13:00:00.000Z');
    // Monday 9am CDT, just after: a week later.
    expect(nextRunAt(monday8, new Date('2026-10-19T14:00:00Z'))!.toISOString()).toBe('2026-10-26T13:00:00.000Z');
    // Over the DST change: still 8:00, now CST.
    expect(nextRunAt(monday8, new Date('2026-10-31T20:00:00Z'))!.toISOString()).toBe('2026-11-02T14:00:00.000Z');
    // Late Sunday night in Chicago is already Monday in UTC; Monday's run is still a day away.
    expect(nextRunAt(monday8, new Date('2026-10-19T03:00:00Z'))!.toISOString()).toBe('2026-10-19T13:00:00.000Z');
  });

  it('moves upcoming runs that were scheduled on another clock', async () => {
    const brandId = (await json('POST', '/v1/brands', { name: 'Realign', memory: RICH_MEMORY })).id;
    vi.stubEnv('HARBOR_TIMEZONE', 'UTC');
    const a = await json('POST', '/v1/automations', { brandId, agentId: 'weekly_plan', trigger: { type: 'schedule', weekday: 1, hour: 8 }, inputs: { postsPerPlatform: 1 } });
    expect(new Date(a.nextRunAt).getUTCHours()).toBe(8);
    vi.stubEnv('HARBOR_TIMEZONE', CHI);
    expect(await realignSchedules(db)).toBe(1);
    const moved = await json('GET', `/v1/automations/${a.id}`);
    expect(zoned(new Date(moved.nextRunAt), CHI)).toMatchObject({ weekday: 1, hour: 8 });
    expect(await realignSchedules(db)).toBe(0);
  });

  it('proposes slots at the best hours in the workspace zone', async () => {
    const brandId = (await json('POST', '/v1/brands', { name: 'Slots' })).id;
    const channel = await json('POST', '/v1/sandbox/channels', { brandId, platform: 'x', handle: 'slots' });
    // Sunday noon CDT; with no history X's prior peaks at 9:00 on weekdays.
    const slots = await openSlots(db, brandId, channel, 3, { now: Date.parse('2026-10-18T17:00:00Z') });
    expect(slots).toHaveLength(3);
    for (const s of slots) {
      expect(s.hour).toBe(9);
      expect(zoned(s.at, CHI)).toMatchObject({ weekday: s.weekday, hour: 9, minute: 0 });
      expect(s.at.getUTCHours()).toBe(14);
    }
  });
});

describe('best times on the workspace clock', () => {
  it('credits a post to the hour it went out in the workspace zone', () => {
    // Four Tuesdays at 9:00 CDT (14:00 UTC), each well above the median of the rest.
    const post = (id: string, iso: string, views: number): HistoryPost => ({
      id, brandId: 'brd_1', platform: 'x', publishedAt: Date.parse(iso), parts: [], snapshots: [{ ageHours: 24, metrics: { views } }],
    });
    const posts = [
      ...['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'].map((d, i) => post(`t${i}`, `${d}T14:00:00Z`, 5000)),
      ...['2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'].map((d, i) => post(`h${i}`, `${d}T22:00:00Z`, 500)),
    ];
    const bt = computeBestTimes(posts, ['x']);
    const at = (weekday: number, hour: number) => bt.slots[weekday * 24 + hour]!;
    expect(at(2, 9).posts).toBe(4);
    expect(at(2, 14).posts).toBe(0);
    expect(at(4, 17).posts).toBe(4);
    expect(at(2, 9).score).toBeGreaterThan(at(4, 17).score);
  });
});
