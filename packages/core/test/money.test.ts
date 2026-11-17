import { describe, expect, it } from 'vitest';
import { addMonths, median, moneyEntryInputSchema, summarizeMoney, weekStart, type MoneyEntry } from '../src/index.ts';

type E = Pick<MoneyEntry, 'kind' | 'amountCents' | 'currency' | 'occurredOn'>;
const rev = (occurredOn: string, dollars: number, currency = 'USD'): E => ({ kind: 'revenue', amountCents: dollars * 100, currency, occurredOn });
const exp = (occurredOn: string, dollars: number): E => ({ kind: 'expense', amountCents: dollars * 100, currency: 'USD', occurredOn });

describe('money dates', () => {
  it('starts weeks on Monday and steps months across years', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // a Monday
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(addMonths('2026-01', -2)).toBe('2025-11');
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeUndefined();
  });
});

describe('money entries', () => {
  it('stores amounts as cents and checks dates', () => {
    expect(moneyEntryInputSchema.parse({ kind: 'expense', amount: '12.505', occurredOn: '2026-11-02', category: ' ', currency: 'usd' })).toEqual({ kind: 'expense', amount: 1251, occurredOn: '2026-11-02', currency: 'USD' });
    expect(moneyEntryInputSchema.safeParse({ kind: 'expense', amount: 0, occurredOn: '2026-11-02' }).success).toBe(false);
    expect(moneyEntryInputSchema.safeParse({ kind: 'expense', amount: 5, occurredOn: '2026-13-40' }).success).toBe(false);
    expect(moneyEntryInputSchema.safeParse({ kind: 'gift', amount: 5, occurredOn: '2026-11-02' }).success).toBe(false);
  });
});

describe('summarizeMoney', () => {
  const today = '2026-11-18'; // Wednesday: 3 days into the week
  // 8 prior weeks of $700 revenue on Mondays; this week's $450 so far is added per test.
  const history: E[] = [];
  for (let i = 1; i <= 8; i++) {
    const d = new Date(Date.UTC(2026, 10, 16 - 7 * i));
    history.push(rev(d.toISOString().slice(0, 10), 700));
  }

  it('compares this week with a normal week, paced to the days so far', () => {
    const s = summarizeMoney({ entries: [...history, rev('2026-11-17', 450)], currency: 'USD', today });
    expect(s.revenueThisWeekCents).toBe(45_000);
    expect(s.normalWeekCents).toBe(70_000);
    // A normal week paced to 3 of 7 days is $300; $450 is 1.5× that.
    expect(s.paceVsNormal).toBe(1.5);
    expect(s.weeks).toHaveLength(12);
    expect(s.weeks.at(-1)).toEqual({ start: '2026-11-16', revenueCents: 45_000, expenseCents: 0 });
  });

  it('needs three weeks of history for a normal week', () => {
    const s = summarizeMoney({ entries: [rev('2026-11-10', 100), rev('2026-11-17', 50)], currency: 'USD', today });
    expect(s.normalWeekCents).toBeUndefined();
    expect(s.paceVsNormal).toBeUndefined();
  });

  it('works out this month, burn and runway', () => {
    const entries = [
      rev('2026-08-05', 1000), exp('2026-08-10', 3000), // net -2000
      rev('2026-09-05', 1000), exp('2026-09-10', 3000), // net -2000
      rev('2026-10-05', 2000), exp('2026-10-10', 3000), // net -1000
      rev('2026-11-03', 500), exp('2026-11-04', 1200), exp('2026-11-30', 999), // the last one is in the future
    ];
    const s = summarizeMoney({ entries, currency: 'USD', today, cashCents: 1_000_000 });
    expect([s.revenueThisMonthCents, s.spendThisMonthCents, s.netThisMonthCents]).toEqual([50_000, 120_000, -70_000]);
    expect(s.monthlyNetCents).toBe(-166_667);
    expect(s.runwayMonths).toBe(6);
  });

  it('has no runway when the business makes money or cash is unknown, and skips other currencies', () => {
    const entries = [rev('2026-10-05', 5000), exp('2026-10-10', 1000), rev('2026-10-06', 99, 'EUR')];
    expect(summarizeMoney({ entries, currency: 'USD', today, cashCents: 100 }).runwayMonths).toBeUndefined();
    const s = summarizeMoney({ entries, currency: 'USD', today });
    expect(s.runwayMonths).toBeUndefined();
    expect(s.otherCurrencyEntries).toBe(1);
    expect(s.monthlyNetCents).toBe(400_000);
  });
});
