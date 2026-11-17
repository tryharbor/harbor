import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { todayLocal } from '../src/services/money.ts';
import { liveStripe } from '../src/services/stripe-source.ts';
import { sender } from './helpers.ts';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('money in sandbox mode', () => {
  let db: Db;
  let app: App;
  let brandId: string;
  const send = sender(() => app);

  beforeAll(async () => {
    db = await openDb('memory://');
    app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated', secretKey: KEY });
    brandId = (await (await send('POST', '/v1/brands', { name: 'Tidewater' })).json()).id;
  });
  afterAll(() => db.close());

  it('starts empty, in USD', async () => {
    const m = await (await send('GET', `/v1/brands/${brandId}/money`)).json();
    expect(m.settings).toEqual({ brandId, currency: 'USD' });
    expect(m.entries).toEqual([]);
    expect(m.summary).toMatchObject({ currency: 'USD', revenueThisWeekCents: 0, spendThisMonthCents: 0 });
    expect(m.summary.weeks).toHaveLength(12);
  });

  it('logs entries by hand and deletes them', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await send('POST', `/v1/brands/${brandId}/money/entries`, { kind: 'expense', amount: '49.99', occurredOn: today, category: 'Software', note: 'Harbor' });
    expect(res.status).toBe(201);
    const entry = await res.json();
    expect(entry).toMatchObject({ id: expect.stringMatching(/^mny_/), kind: 'expense', amountCents: 4999, currency: 'USD', category: 'Software', source: 'manual' });
    expect((await send('POST', `/v1/brands/${brandId}/money/entries`, { kind: 'expense', amount: -3, occurredOn: today })).status).toBe(400);
    expect((await send('DELETE', `/v1/money/entries/${entry.id}`)).status).toBe(204);
    expect((await send('DELETE', `/v1/money/entries/${entry.id}`)).status).toBe(404);
  });

  it('connects sample Stripe data and syncs it without duplicates', async () => {
    expect((await send('POST', `/v1/brands/${brandId}/money/stripe/sync`)).status).toBe(409);
    const settings = await (await send('POST', `/v1/brands/${brandId}/money/stripe`, {})).json();
    expect(settings.stripe).toMatchObject({ label: 'Sample data (sandbox)' });
    const first = await (await send('POST', `/v1/brands/${brandId}/money/stripe/sync`)).json();
    expect(first.revenue).toBeGreaterThan(100);
    const count = async () => Number((await db.query<{ n: number }>("SELECT count(*) AS n FROM money_entries WHERE source = 'stripe'"))[0]!.n);
    const n = await count();
    const second = await (await send('POST', `/v1/brands/${brandId}/money/stripe/sync`)).json();
    expect(second.settings.stripe.syncedAt).toBeTruthy();
    expect(await count()).toBe(n);
    const m = await (await send('GET', `/v1/brands/${brandId}/money`)).json();
    expect(m.summary.normalWeekCents).toBeGreaterThan(0);
    expect(m.entries.some((e: { category?: string }) => e.category === 'Fees')).toBe(true);
    const synced = m.entries.find((e: { source: string }) => e.source === 'stripe');
    expect((await send('DELETE', `/v1/money/entries/${synced.id}`)).status).toBe(409);
  });

  it('works out runway from cash on hand', async () => {
    const s = await (await send('PATCH', `/v1/brands/${brandId}/money/settings`, { cash: 12000, currency: 'usd' })).json();
    expect(s).toMatchObject({ currency: 'USD', cashCents: 1_200_000, cashAsOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    const m = await (await send('GET', `/v1/brands/${brandId}/money`)).json();
    expect(m.summary.cashCents).toBe(1_200_000);
    // Sample sales make money, so there's no burn and no runway.
    expect(m.summary.runwayMonths).toBeUndefined();
    const cleared = await (await send('PATCH', `/v1/brands/${brandId}/money/settings`, { cash: null })).json();
    expect(cleared.cashCents).toBeUndefined();
    expect((await send('PATCH', `/v1/brands/${brandId}/money/settings`, { currency: 'dollars' })).status).toBe(400);
  });

  it('disconnects but keeps the synced history', async () => {
    const s = await (await send('DELETE', `/v1/brands/${brandId}/money/stripe`)).json();
    expect(s.stripe).toBeUndefined();
    const m = await (await send('GET', `/v1/brands/${brandId}/money`)).json();
    expect(m.entries.length).toBeGreaterThan(0);
  });
});

describe('money with live Stripe', () => {
  let db: Db;
  let app: App;
  let brandId: string;
  const send = sender(() => app);
  const calls: { url: string; auth: string | null }[] = [];
  const day = (n: number) => Math.floor(Date.now() / 1000) - n * 86_400;

  const fakeStripe: typeof fetch = async (input, init) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('authorization');
    calls.push({ url, auth });
    if (auth !== 'Bearer rk_test_good') return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 });
    if (url.endsWith('/balance')) return Response.json({ object: 'balance' });
    if (url.includes('/balance_transactions')) {
      const page2 = url.includes('starting_after=txn_2');
      return Response.json({
        has_more: !page2,
        data: page2
          ? [{ id: 'txn_3', type: 'refund', amount: -1500, fee: 0, currency: 'usd', created: day(5) }]
          : [
              { id: 'txn_1', type: 'charge', amount: 5000, fee: 175, currency: 'usd', created: day(2), description: 'Order 1' },
              { id: 'txn_2', type: 'payout', amount: -4000, fee: 0, currency: 'usd', created: day(3) },
            ],
      });
    }
    return new Response('{}', { status: 404 });
  };

  beforeAll(async () => {
    db = await openDb('memory://');
    app = createApp(db, { publishMode: 'live', modelMode: 'simulated', secretKey: KEY, fetch: fakeStripe });
    brandId = (await (await send('POST', '/v1/brands', { name: 'Live Co' })).json()).id;
  });
  afterAll(() => db.close());

  it('needs a real restricted key', async () => {
    expect((await send('POST', `/v1/brands/${brandId}/money/stripe`, {})).status).toBe(400);
    expect((await send('POST', `/v1/brands/${brandId}/money/stripe`, { key: 'hello' })).status).toBe(400);
    const bad = await send('POST', `/v1/brands/${brandId}/money/stripe`, { key: 'rk_test_wrong' });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message).toMatch(/rejected/);
  });

  it('stores the key encrypted, never returns it, and maps charges, refunds and fees', async () => {
    const settings = await (await send('POST', `/v1/brands/${brandId}/money/stripe`, { key: 'rk_test_good' })).json();
    expect(settings.stripe.label).toBe('Stripe · test mode');
    expect(JSON.stringify(settings)).not.toContain('rk_test_good');
    const [secret] = await db.query<{ ciphertext: string }>('SELECT ciphertext FROM secrets WHERE ref = $1', [`stripe:${brandId}`]);
    expect(secret!.ciphertext).not.toContain('rk_test_good');

    const sync = await (await send('POST', `/v1/brands/${brandId}/money/stripe/sync`)).json();
    expect([sync.revenue, sync.expenses]).toEqual([1, 2]);
    const { entries } = await (await send('GET', `/v1/brands/${brandId}/money`)).json();
    const brief = entries.map((e: { kind: string; amountCents: number; category: string }) => [e.kind, e.amountCents, e.category]).sort();
    expect(brief).toEqual([['expense', 1500, 'Refunds'], ['expense', 175, 'Fees'], ['revenue', 5000, 'Sales']]);
    expect(calls.some((c) => c.url.includes('starting_after=txn_2'))).toBe(true);
    expect(JSON.stringify(await (await send('GET', `/v1/brands/${brandId}/money`)).json())).not.toContain('rk_test_good');
  });

  it('forgets the key on disconnect', async () => {
    await send('DELETE', `/v1/brands/${brandId}/money/stripe`);
    expect(await db.query('SELECT ref FROM secrets WHERE ref = $1', [`stripe:${brandId}`])).toEqual([]);
  });
});

describe('money dates follow the workspace time zone', () => {
  it("dates a Stripe charge by the owner's calendar, not UTC", async () => {
    // 9pm in Chicago on Nov 16 is 03:00 UTC on Nov 17.
    const created = Date.UTC(2026, 10, 17, 3, 0) / 1000;
    const fake: typeof fetch = async () => Response.json({ has_more: false, data: [{ id: 'txn_x', type: 'charge', amount: 100, fee: 0, currency: 'usd', created }] });
    const chicago = (s: number) => todayLocal(new Date(s * 1000), 'America/Chicago');
    const [t] = await liveStripe(fake, chicago).transactions('rk_test_x', 0);
    expect(t!.day).toBe('2026-11-16');
    expect(todayLocal(new Date(created * 1000), 'UTC')).toBe('2026-11-17');
  });
});
