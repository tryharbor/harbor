import type { Migration } from '../migrations.ts';

/**
 * Brand Memory that learns: memory proposals from the voice refresh, replies grouped into themes (comment signals),
 * import scans of a channel's past posts, imported posts, and preview runs.
 */
export const learning0007: Migration = {
  id: '0007_learning',
  statements: [
    `ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check`,
    `ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_kind_check
       CHECK (kind IN ('insights', 'ideas', 'draft', 'outcome', 'voice', 'rewrite', 'agent', 'preview'))`,

    // changes = MemoryChange[] (docs/design/memory-that-learns.md §2), each with its own status.
    `CREATE TABLE IF NOT EXISTS memory_proposals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      agent_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
      changes JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS memory_proposals_status_created ON memory_proposals (status, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS memory_proposals_brand ON memory_proposals (brand_id, created_at DESC)`,

    // theme_signal_id: the 'comment' signal of the theme the reply is grouped into (no FK: themes are regrouped).
    `CREATE TABLE IF NOT EXISTS post_replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      platform_reply_id TEXT NOT NULL,
      author_handle TEXT NOT NULL,
      author_name TEXT,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      likes INT,
      kind TEXT NOT NULL CHECK (kind IN ('question', 'objection', 'praise', 'request', 'other')),
      theme_signal_id TEXT,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (post_id, platform_reply_id)
    )`,
    `CREATE INDEX IF NOT EXISTS post_replies_brand_created ON post_replies (brand_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS post_replies_theme ON post_replies (theme_signal_id) WHERE theme_signal_id IS NOT NULL`,

    // One comment signal per reply theme (source.theme = "<kind>:<keyword or *>"), upserted on every regroup.
    `CREATE UNIQUE INDEX IF NOT EXISTS signals_comment_theme ON signals (brand_id, (source->>'theme')) WHERE kind = 'comment'`,

    // A channel scan for import: what the platform returned, kept for an hour so the owner can review it.
    `CREATE TABLE IF NOT EXISTS import_scans (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'harbor'`,
    `ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_origin_check`,
    `ALTER TABLE posts ADD CONSTRAINT posts_origin_check CHECK (origin IN ('harbor', 'imported'))`,
  ],
};
