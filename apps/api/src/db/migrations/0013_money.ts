import type { Migration } from '../migrations.ts';

/**
 * Money: a log of revenue and expenses per brand (manual or synced from Stripe) and each brand's money settings.
 * Synced entries carry the source's id, so a sync can run again without duplicating anything. The Stripe key itself
 * lives encrypted in `secrets` (ref `stripe:<brandId>`), never here.
 */
export const money0013: Migration = {
  id: '0013_money',
  statements: [
    `CREATE TABLE IF NOT EXISTS money_entries (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('revenue', 'expense')),
      amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
      currency TEXT NOT NULL,
      occurred_on DATE NOT NULL,
      category TEXT,
      note TEXT,
      source TEXT NOT NULL CHECK (source IN ('manual', 'stripe')),
      external_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS money_entries_brand ON money_entries (brand_id, occurred_on DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS money_entries_external ON money_entries (brand_id, source, external_id) WHERE external_id IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS money_settings (
      brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'USD',
      cash_cents BIGINT,
      cash_as_of DATE,
      stripe_label TEXT,
      stripe_connected_at TIMESTAMPTZ,
      stripe_synced_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ],
};
