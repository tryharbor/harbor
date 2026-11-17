import { HarborError, newId, summarizeMoney, type Brand, type MoneyEntry, type MoneyEntryInput, type MoneySummary } from '@harbor/core';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { workspaceTimeZone, zoned } from '../lib/tz.ts';
import { liveStripe, sandboxStripe, type MoneySourceClient } from './stripe-source.ts';

/** Money: the log, settings, Stripe sync and the summary on the Money page. */

interface EntryRow {
  id: string;
  brand_id: string;
  kind: MoneyEntry['kind'];
  amount_cents: number | string;
  currency: string;
  occurred_on: Date | string;
  category: string | null;
  note: string | null;
  source: MoneyEntry['source'];
  created_at: Date | string;
}

const dayOf = (v: Date | string) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

const toEntry = (r: EntryRow): MoneyEntry => ({
  id: r.id,
  brandId: r.brand_id,
  kind: r.kind,
  amountCents: Number(r.amount_cents),
  currency: r.currency,
  occurredOn: dayOf(r.occurred_on),
  ...(r.category ? { category: r.category } : {}),
  ...(r.note ? { note: r.note } : {}),
  source: r.source,
  createdAt: iso(r.created_at),
});

export interface MoneySettings {
  brandId: string;
  currency: string;
  cashCents?: number;
  cashAsOf?: string;
  stripe?: { label: string; connectedAt: string; syncedAt?: string };
}

interface SettingsRow {
  brand_id: string;
  currency: string;
  cash_cents: number | string | null;
  cash_as_of: Date | string | null;
  stripe_label: string | null;
  stripe_connected_at: Date | string | null;
  stripe_synced_at: Date | string | null;
}

export async function loadSettings(db: Db, brandId: string): Promise<MoneySettings> {
  const [r] = await db.query<SettingsRow>('SELECT * FROM money_settings WHERE brand_id = $1', [brandId]);
  if (!r) return { brandId, currency: 'USD' };
  return {
    brandId,
    currency: r.currency,
    ...(r.cash_cents !== null ? { cashCents: Number(r.cash_cents) } : {}),
    ...(r.cash_as_of ? { cashAsOf: dayOf(r.cash_as_of) } : {}),
    ...(r.stripe_label && r.stripe_connected_at
      ? { stripe: { label: r.stripe_label, connectedAt: iso(r.stripe_connected_at), ...(r.stripe_synced_at ? { syncedAt: iso(r.stripe_synced_at) } : {}) } }
      : {}),
  };
}

const ensureSettings = (db: Db, brandId: string) => db.query('INSERT INTO money_settings (brand_id) VALUES ($1) ON CONFLICT (brand_id) DO NOTHING', [brandId]);

export async function updateSettings(db: Db, brandId: string, patch: { currency?: string; cash?: number | null; cashAsOf?: string }, today: string): Promise<MoneySettings> {
  await ensureSettings(db, brandId);
  if (patch.currency) await db.query('UPDATE money_settings SET currency = $2, updated_at = now() WHERE brand_id = $1', [brandId, patch.currency]);
  if (patch.cash === null) await db.query('UPDATE money_settings SET cash_cents = NULL, cash_as_of = NULL, updated_at = now() WHERE brand_id = $1', [brandId]);
  else if (patch.cash !== undefined) {
    await db.query('UPDATE money_settings SET cash_cents = $2, cash_as_of = $3, updated_at = now() WHERE brand_id = $1', [brandId, Math.round(patch.cash * 100), patch.cashAsOf ?? today]);
  }
  return loadSettings(db, brandId);
}

/** Today in the workspace's time zone, as YYYY-MM-DD. */
export function todayLocal(at = new Date(), zone = workspaceTimeZone()): string {
  const c = zoned(at, zone);
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
}

export async function listEntries(db: Db, brandId: string, limit = 50): Promise<MoneyEntry[]> {
  const rows = await db.query<EntryRow>('SELECT * FROM money_entries WHERE brand_id = $1 ORDER BY occurred_on DESC, created_at DESC LIMIT $2', [brandId, limit]);
  return rows.map(toEntry);
}

export async function addEntry(db: Db, brand: Brand, input: MoneyEntryInput): Promise<MoneyEntry> {
  const settings = await loadSettings(db, brand.id);
  const id = newId('moneyEntry');
  const [row] = await db.query<EntryRow>(
    `INSERT INTO money_entries (id, workspace_id, brand_id, kind, amount_cents, currency, occurred_on, category, note, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual') RETURNING *`,
    [id, brand.workspaceId, brand.id, input.kind, input.amount, input.currency ?? settings.currency, input.occurredOn, input.category ?? null, input.note ?? null],
  );
  return toEntry(row!);
}

/** Only hand-entered rows can be deleted: a synced one would come back on the next sync. */
export async function deleteEntry(db: Db, id: string): Promise<void> {
  const [row] = await db.query<{ source: string }>('SELECT source FROM money_entries WHERE id = $1', [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Entry ${id} not found.`);
  if (row.source !== 'manual') throw new HarborError('CONFLICT', 'Entries synced from Stripe change in Stripe, not here.');
  await db.query('DELETE FROM money_entries WHERE id = $1', [id]);
}

export async function moneySummary(db: Db, brandId: string, today: string): Promise<MoneySummary> {
  const settings = await loadSettings(db, brandId);
  // Enough history for 12 weeks on the chart, 8 weeks for "normal" and 3 full months for burn.
  const rows = await db.query<EntryRow>("SELECT * FROM money_entries WHERE brand_id = $1 AND occurred_on >= ($2::date - INTERVAL '140 days')", [brandId, today]);
  return summarizeMoney({ entries: rows.map(toEntry), currency: settings.currency, today, cashCents: settings.cashCents, cashAsOf: settings.cashAsOf });
}

// ---- Stripe ----

const secretRef = (brandId: string) => `stripe:${brandId}`;

/** The live client in live mode; sample data in sandbox mode (a key is then optional and never stored). */
export const sourceFor = (deps: Pick<AppDeps, 'publishMode' | 'fetch'>, brandId: string): MoneySourceClient => {
  // Days in the workspace's time zone, the same clock the summary's "today" uses.
  const dayOf = (s: number) => todayLocal(new Date(s * 1000));
  return deps.publishMode === 'live' ? liveStripe(deps.fetch, dayOf) : sandboxStripe(brandId, () => todayLocal(), dayOf);
};

export async function connectStripe(deps: Pick<AppDeps, 'db' | 'publishMode' | 'fetch' | 'secrets'>, brand: Brand, key: string | undefined): Promise<MoneySettings> {
  const { db } = deps;
  if (deps.publishMode === 'live' && !key) throw new HarborError('INVALID_REQUEST', 'key: paste a Stripe restricted key.');
  const { label } = await sourceFor(deps, brand.id).verify(key ?? '');
  if (deps.publishMode === 'live') await deps.secrets().put(secretRef(brand.id), { key });
  await ensureSettings(db, brand.id);
  await db.query('UPDATE money_settings SET stripe_label = $2, stripe_connected_at = now(), stripe_synced_at = NULL, updated_at = now() WHERE brand_id = $1', [brand.id, label]);
  return loadSettings(db, brand.id);
}

export async function disconnectStripe(deps: Pick<AppDeps, 'db' | 'secrets' | 'publishMode'>, brandId: string): Promise<MoneySettings> {
  if (deps.publishMode === 'live') await deps.secrets().delete(secretRef(brandId));
  await deps.db.query('UPDATE money_settings SET stripe_label = NULL, stripe_connected_at = NULL, stripe_synced_at = NULL, updated_at = now() WHERE brand_id = $1', [brandId]);
  return loadSettings(deps.db, brandId);
}

/**
 * Pull Stripe's charges and refunds into the log: charges as revenue, refunds as "Refunds" expenses and each day's
 * Stripe fees as one "Fees" expense. Rows are keyed by Stripe's ids, so syncing again only updates. The first sync
 * reads 180 days; later ones go back 3 days before the last sync, to catch late changes.
 */
export async function syncStripe(deps: Pick<AppDeps, 'db' | 'publishMode' | 'fetch' | 'secrets'>, brand: Brand): Promise<{ revenue: number; expenses: number; settings: MoneySettings }> {
  const { db } = deps;
  const settings = await loadSettings(db, brand.id);
  if (!settings.stripe) throw new HarborError('CONFLICT', 'Connect Stripe first.');
  const key = deps.publishMode === 'live' ? (await deps.secrets().get<{ key: string }>(secretRef(brand.id)))?.key : '';
  if (deps.publishMode === 'live' && !key) throw new HarborError('CONFLICT', 'The Stripe key is missing. Connect Stripe again.');
  const since = settings.stripe.syncedAt ? Date.parse(settings.stripe.syncedAt) / 1000 - 3 * 86_400 : Date.now() / 1000 - 180 * 86_400;
  const txns = await sourceFor(deps, brand.id).transactions(key ?? '', Math.floor(since));

  const upsert = (kind: 'revenue' | 'expense', externalId: string, cents: number, currency: string, day: string, category: string, note?: string) =>
    db.query(
      `INSERT INTO money_entries (id, workspace_id, brand_id, kind, amount_cents, currency, occurred_on, category, note, source, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'stripe', $10)
       ON CONFLICT (brand_id, source, external_id) WHERE external_id IS NOT NULL
       DO UPDATE SET amount_cents = EXCLUDED.amount_cents, occurred_on = EXCLUDED.occurred_on, category = EXCLUDED.category, note = EXCLUDED.note`,
      [newId('moneyEntry'), brand.workspaceId, brand.id, kind, cents, currency, day, category, note ?? null, externalId],
    );

  let revenue = 0;
  let expenses = 0;
  const fees = new Map<string, { cents: number; currency: string; day: string }>();
  for (const t of txns) {
    if (t.kind === 'revenue') {
      await upsert('revenue', t.id, t.amountCents, t.currency, t.day, t.description === 'Subscription' ? 'Subscriptions' : 'Sales', t.description);
      revenue++;
    } else {
      await upsert('expense', t.id, t.amountCents, t.currency, t.day, 'Refunds', t.description);
      expenses++;
    }
    if (t.feeCents > 0) {
      const k = `${t.day}:${t.currency}`;
      const f = fees.get(k) ?? { cents: 0, currency: t.currency, day: t.day };
      f.cents += t.feeCents;
      fees.set(k, f);
    }
  }
  // A day's fees are only complete when the whole day was read, so days at the edge of this sync are skipped
  // unless the sync went back past them.
  const firstFullDay = todayLocal(new Date((since + 86_400) * 1000));
  for (const [k, f] of fees) {
    if (f.day < firstFullDay) continue;
    await upsert('expense', `fees:${k}`, f.cents, f.currency, f.day, 'Fees', 'Stripe fees');
    expenses++;
  }
  await db.query('UPDATE money_settings SET stripe_synced_at = now(), updated_at = now() WHERE brand_id = $1', [brand.id]);
  return { revenue, expenses, settings: await loadSettings(db, brand.id) };
}
