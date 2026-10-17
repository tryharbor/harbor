import type { Migration } from '../migrations.ts';

/**
 * Founder accounts (docs/design/founder-accounts.md): a brand row can be a person. At most one person per
 * workspace; a person lists the brands they speak for. Connecting an account can return to where it started.
 */
export const people0009: Migration = {
  id: '0009_people',
  statements: [
    `ALTER TABLE brands ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'brand' CHECK (kind IN ('brand', 'person'))`,
    `ALTER TABLE brands ADD COLUMN IF NOT EXISTS speaks_for JSONB NOT NULL DEFAULT '[]'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS brands_one_person_per_workspace ON brands (workspace_id) WHERE kind = 'person'`,
    `ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS return_to TEXT`,
  ],
};
