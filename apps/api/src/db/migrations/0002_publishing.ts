import type { Migration } from '../migrations.ts';

/** Connecting channels, encrypted tokens, publish retries and the growth-curve snapshot schedule. */
export const publishing0002: Migration = {
  id: '0002_publishing',
  statements: [
    // One row per OAuth handshake in flight. Deleted on callback; stale rows are ignored after 15 minutes.
    `CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      code_verifier TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // Channel tokens, AES-256-GCM encrypted with HARBOR_SECRET_KEY. channels.token_ref points here.
    `CREATE TABLE IF NOT EXISTS secrets (
      ref TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // attempts: publish tries that proved nothing went out (rate limit, expired token). next_check_at: when the
    // worker next looks at a 'pending' post (platform still processing the media container).
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS posts_pending ON posts (next_check_at) WHERE status = 'pending'`,

    // The growth curve: one row per (post, age). The worker fills due rows by calling the provider for metrics.
    `CREATE TABLE IF NOT EXISTS snapshot_jobs (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      age_hours REAL NOT NULL,
      due_at TIMESTAMPTZ NOT NULL,
      done_at TIMESTAMPTZ,
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT,
      PRIMARY KEY (post_id, age_hours)
    )`,
    `CREATE INDEX IF NOT EXISTS snapshot_jobs_due ON snapshot_jobs (due_at) WHERE done_at IS NULL`,
  ],
};
