import { z } from 'zod';

/**
 * Money: a business's revenue and spending, entered by hand or synced from Stripe, and the few numbers a new owner
 * needs from it: this week against a normal week, this month's spend and net, burn and runway. Amounts are integer
 * cents in one currency per business; entries in another currency are kept but left out of the numbers.
 */

export const MONEY_KINDS = ['revenue', 'expense'] as const;
export const MONEY_SOURCES = ['manual', 'stripe'] as const;
export type MoneyKind = (typeof MONEY_KINDS)[number];
export type MoneySource = (typeof MONEY_SOURCES)[number];

/** Categories the app suggests; any short label is allowed. */
export const EXPENSE_CATEGORIES = ['Software', 'Marketing', 'Supplies', 'Inventory', 'Contractors', 'Rent', 'Fees', 'Refunds', 'Other'] as const;
export const REVENUE_CATEGORIES = ['Sales', 'Subscriptions', 'Services', 'Other'] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-16.').refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Not a real date.');
export const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code like USD.').transform((c) => c.toUpperCase());

/** A new entry, in major units ("12.50"), as people type it. Stored as cents. */
export const moneyEntryInputSchema = z
  .object({
    kind: z.enum(MONEY_KINDS),
    amount: z.coerce.number().positive('The amount must be more than zero.').max(100_000_000).transform((n) => Math.round(n * 100)),
    occurredOn: day,
    category: z.string().trim().max(60).optional().transform((c) => c || undefined),
    note: z.string().trim().max(500).optional().transform((n) => n || undefined),
    currency: currencySchema.optional(),
  })
  .strict();
export type MoneyEntryInput = z.infer<typeof moneyEntryInputSchema>;

export const moneySettingsPatchSchema = z
  .object({
    currency: currencySchema.optional(),
    /** Cash on hand in major units; null clears it. */
    cash: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
    cashAsOf: day.optional(),
  })
  .strict();

export interface MoneyEntry {
  id: string;
  brandId: string;
  kind: MoneyKind;
  amountCents: number;
  currency: string;
  occurredOn: string;
  category?: string;
  note?: string;
  source: MoneySource;
  createdAt: string;
}

// ---- Dates (UTC calendar days, as YYYY-MM-DD) ----

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fmt(new Date(toDate(d).getTime() + n * 86_400_000));
/** The Monday that starts the week holding `d`. */
export const weekStart = (d: string) => addDays(d, -((toDate(d).getUTCDay() + 6) % 7));
export const monthOf = (d: string) => d.slice(0, 7);
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return fmt(t).slice(0, 7);
};

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export interface WeekTotal { start: string; revenueCents: number; expenseCents: number }

export interface MoneySummary {
  currency: string;
  today: string;
  /** Revenue so far this week (Monday to today). */
  revenueThisWeekCents: number;
  /** Median weekly revenue over the 8 full weeks before this one; undefined with fewer than 3 weeks of history. */
  normalWeekCents?: number;
  /** This week so far against a normal week, scaled to the days elapsed (1.2 = 20% ahead). */
  paceVsNormal?: number;
  revenueThisMonthCents: number;
  spendThisMonthCents: number;
  netThisMonthCents: number;
  /** Average monthly net over the last 3 full months with any entries; negative means the business is burning cash. */
  monthlyNetCents?: number;
  cashCents?: number;
  cashAsOf?: string;
  /** Months of cash left at the current burn; undefined when there's no cash figure or the business isn't burning. */
  runwayMonths?: number;
  /** The last 12 weeks, oldest first, this week last. */
  weeks: WeekTotal[];
  /** Entries left out because they're in another currency. */
  otherCurrencyEntries: number;
}

/** The numbers on the Money page. `today` is a YYYY-MM-DD in the owner's time zone. */
export function summarizeMoney(input: { entries: Pick<MoneyEntry, 'kind' | 'amountCents' | 'currency' | 'occurredOn'>[]; currency: string; today: string; cashCents?: number; cashAsOf?: string }): MoneySummary {
  const { currency, today } = input;
  const entries = input.entries.filter((e) => e.currency === currency && e.occurredOn <= today);
  const otherCurrencyEntries = input.entries.length - input.entries.filter((e) => e.currency === currency).length;
  const thisWeek = weekStart(today);

  const byWeek = new Map<string, WeekTotal>();
  const week = (start: string) => byWeek.get(start) ?? byWeek.set(start, { start, revenueCents: 0, expenseCents: 0 }).get(start)!;
  for (let i = 19; i >= 0; i--) week(addDays(thisWeek, -7 * i));
  for (const e of entries) {
    const w = byWeek.get(weekStart(e.occurredOn));
    if (!w) continue;
    if (e.kind === 'revenue') w.revenueCents += e.amountCents;
    else w.expenseCents += e.amountCents;
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.start.localeCompare(b.start));
  const revenueThisWeekCents = byWeek.get(thisWeek)!.revenueCents;

  // A normal week: the median of the 8 full weeks before this one, counting only weeks since the first entry.
  const first = entries.reduce<string | undefined>((m, e) => (!m || e.occurredOn < m ? e.occurredOn : m), undefined);
  const prior = weeks.filter((w) => w.start < thisWeek && (!first || addDays(w.start, 6) >= first)).slice(-8);
  const normalWeekCents = prior.length >= 3 ? median(prior.map((w) => w.revenueCents)) : undefined;
  const daysIn = Math.round((toDate(today).getTime() - toDate(thisWeek).getTime()) / 86_400_000) + 1;
  const paceVsNormal = normalWeekCents ? revenueThisWeekCents / ((normalWeekCents * daysIn) / 7) : undefined;

  const month = monthOf(today);
  const inMonth = (m: string, kind: MoneyKind) => entries.filter((e) => e.kind === kind && monthOf(e.occurredOn) === m).reduce((n, e) => n + e.amountCents, 0);
  const revenueThisMonthCents = inMonth(month, 'revenue');
  const spendThisMonthCents = inMonth(month, 'expense');

  const fullMonths = [1, 2, 3].map((n) => addMonths(month, -n)).filter((m) => entries.some((e) => monthOf(e.occurredOn) === m));
  const monthlyNetCents = fullMonths.length ? Math.round(fullMonths.reduce((n, m) => n + inMonth(m, 'revenue') - inMonth(m, 'expense'), 0) / fullMonths.length) : undefined;
  const runwayMonths = input.cashCents !== undefined && monthlyNetCents !== undefined && monthlyNetCents < 0 ? Math.round((input.cashCents / -monthlyNetCents) * 10) / 10 : undefined;

  return {
    currency,
    today,
    revenueThisWeekCents,
    ...(normalWeekCents !== undefined ? { normalWeekCents } : {}),
    ...(paceVsNormal !== undefined ? { paceVsNormal: Math.round(paceVsNormal * 100) / 100 } : {}),
    revenueThisMonthCents,
    spendThisMonthCents,
    netThisMonthCents: revenueThisMonthCents - spendThisMonthCents,
    ...(monthlyNetCents !== undefined ? { monthlyNetCents } : {}),
    ...(input.cashCents !== undefined ? { cashCents: input.cashCents } : {}),
    ...(input.cashAsOf ? { cashAsOf: input.cashAsOf } : {}),
    ...(runwayMonths !== undefined ? { runwayMonths } : {}),
    weeks: weeks.slice(-12),
    otherCurrencyEntries,
  };
}
