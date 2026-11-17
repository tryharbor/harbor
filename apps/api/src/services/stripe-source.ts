import { HarborError, addDays } from '@harbor/core';

/** A unix time as a YYYY-MM-DD calendar day. Callers pass the workspace's time zone; UTC is the fallback. */
export type DayOf = (unixSeconds: number) => string;
const utcDay: DayOf = (s) => new Date(s * 1000).toISOString().slice(0, 10);

/**
 * Where synced revenue comes from. Live: Stripe's balance transactions, read with a restricted key the owner
 * creates (read access to Balance is enough). Sandbox: a deterministic, realistic history, so the Money page can be
 * tried with no Stripe account. Either way Harbor only reads; it never moves money.
 */

export interface SourceTxn {
  id: string;
  kind: 'revenue' | 'refund';
  /** Gross amount in cents, positive. */
  amountCents: number;
  feeCents: number;
  currency: string;
  /** YYYY-MM-DD in the workspace's time zone. */
  day: string;
  description?: string;
}

export interface MoneySourceClient {
  /** Checks the key works; returns a label to show ("Stripe · live", "Sample data"). */
  verify(key: string): Promise<{ label: string }>;
  /** Transactions created on or after `since` (unix seconds), oldest first. */
  transactions(key: string, since: number): Promise<SourceTxn[]>;
}

const STRIPE = 'https://api.stripe.com/v1';
const REVENUE_TYPES = new Set(['charge', 'payment']);
const REFUND_TYPES = new Set(['refund', 'payment_refund']);

export function liveStripe(fetchFn: typeof fetch, dayOf: DayOf = utcDay): MoneySourceClient {
  const get = async (key: string, path: string) => {
    let res: Response;
    try {
      res = await fetchFn(`${STRIPE}${path}`, { headers: { authorization: `Bearer ${key}`, 'stripe-version': '2024-06-20' } });
    } catch {
      throw new HarborError('UPSTREAM_ERROR', "Couldn't reach Stripe. Try again in a minute.");
    }
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
    if (res.status === 401) throw new HarborError('INVALID_REQUEST', 'Stripe rejected that key. Check it was copied in full.');
    if (res.status === 403) throw new HarborError('INVALID_REQUEST', 'That key can\'t read your balance. Give the restricted key "Read" access to Balance.');
    if (!res.ok) throw new HarborError('UPSTREAM_ERROR', `Stripe answered ${res.status}: ${body.error?.message ?? 'unknown error'}.`);
    return body;
  };
  return {
    async verify(key) {
      if (!/^(rk|sk)_(live|test)_[A-Za-z0-9]+$/.test(key)) throw new HarborError('INVALID_REQUEST', 'key: paste a Stripe restricted key (it starts with rk_live_ or rk_test_).');
      await get(key, '/balance');
      return { label: key.includes('_test_') ? 'Stripe · test mode' : 'Stripe' };
    },
    async transactions(key, since) {
      const out: SourceTxn[] = [];
      let after: string | undefined;
      for (let page = 0; page < 50; page++) {
        const q = new URLSearchParams({ limit: '100', 'created[gte]': String(since) });
        if (after) q.set('starting_after', after);
        const body = (await get(key, `/balance_transactions?${q}`)) as { data?: { id: string; type: string; amount: number; fee: number; currency: string; created: number; description?: string | null }[]; has_more?: boolean };
        for (const t of body.data ?? []) {
          const kind = REVENUE_TYPES.has(t.type) ? 'revenue' : REFUND_TYPES.has(t.type) ? 'refund' : undefined;
          if (!kind || t.amount === 0) continue;
          out.push({ id: t.id, kind, amountCents: Math.abs(t.amount), feeCents: Math.max(0, t.fee), currency: t.currency.toUpperCase(), day: dayOf(t.created), ...(t.description ? { description: t.description } : {}) });
        }
        if (!body.has_more || !body.data?.length) break;
        after = body.data[body.data.length - 1]!.id;
      }
      return out.reverse();
    },
  };
}

/** Small seeded PRNG (mulberry32), so a brand's sample history is the same every sync. */
function rng(seed: string) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample data: ~120 days of orders that grow slowly, busier on weekends, with the odd refund. */
export function sandboxStripe(seed: string, today: () => string = () => utcDay(Date.now() / 1000), dayOf: DayOf = utcDay): MoneySourceClient {
  return {
    async verify() {
      return { label: 'Sample data (sandbox)' };
    },
    async transactions(_key, since) {
      const rand = rng(seed);
      const last = today();
      const out: SourceTxn[] = [];
      for (let d = 119; d >= 0; d--) {
        const day = addDays(last, -d);
        const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
        const orders = Math.round((2 + (119 - d) / 40) * (weekday === 0 || weekday === 6 ? 1.6 : 1) * (0.6 + rand() * 0.8));
        for (let i = 0; i < orders; i++) {
          const amount = [1800, 1800, 3200, 3600, 5400][Math.floor(rand() * 5)]!;
          const id = `txn_sample_${seed.slice(-6)}_${day}_${i}`;
          out.push({ id, kind: 'revenue', amountCents: amount, feeCents: Math.round(amount * 0.029 + 30), currency: 'USD', day, description: amount >= 3200 ? 'Subscription' : 'Order' });
          if (rand() < 0.03) out.push({ id: `${id}_refund`, kind: 'refund', amountCents: amount, feeCents: 0, currency: 'USD', day });
        }
      }
      // Filter last: the random sequence must be the same on every sync, whatever the window, so ids stay stable.
      const from = dayOf(since);
      return out.filter((x) => x.day >= from);
    },
  };
}
