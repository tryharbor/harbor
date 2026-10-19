import type { Migration } from '../migrations.ts';

/**
 * Meta's deauthorize and data deletion callbacks (docs/setup/meta-app-review.md). They name the user by an app-scoped
 * id; Instagram's publishing id (platform_account_id) is a different number, so channels keep both. A deletion
 * request keeps only its confirmation code, platform, outcome and times: nothing that identifies the account.
 */
export const metaCallbacks0010: Migration = {
  id: '0010_meta_callbacks',
  statements: [
    `ALTER TABLE channels ADD COLUMN IF NOT EXISTS app_scoped_id TEXT`,
    `CREATE INDEX IF NOT EXISTS channels_app_scoped ON channels (platform, app_scoped_id) WHERE app_scoped_id IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS data_deletion_requests (
      code TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      channels_deleted INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('received', 'completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    )`,
  ],
};
