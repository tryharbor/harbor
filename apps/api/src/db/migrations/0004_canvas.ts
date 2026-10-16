import type { Migration } from '../migrations.ts';

/**
 * Campaigns and their canvas: cards (ideas, drafts, posts, signals, notes, frames) and the connectors between them.
 * Also brand logos (an https URL or a small image data URI).
 */
export const canvas0004: Migration = {
  id: '0004_canvas',
  statements: [
    `CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'done')),
      starts_on DATE,
      ends_on DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS campaigns_brand_created ON campaigns (brand_id, created_at DESC)`,

    // x/y are relative to the parent frame when parent_id is set (React Flow). ref_id points at the idea, draft,
    // post or signal the card shows; it is not a foreign key, so a deleted entity leaves a "removed" card behind.
    `CREATE TABLE IF NOT EXISTS canvas_items (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('idea', 'draft', 'post', 'signal', 'note', 'frame')),
      ref_id TEXT,
      parent_id TEXT REFERENCES canvas_items(id) ON DELETE SET NULL,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      width REAL,
      height REAL,
      data JSONB NOT NULL DEFAULT '{}',
      -- Insertion order (timestamps can tie), so the canvas always reads back in the same order.
      seq BIGINT GENERATED ALWAYS AS IDENTITY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS canvas_items_campaign ON canvas_items (campaign_id, seq)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS canvas_items_campaign_ref ON canvas_items (campaign_id, kind, ref_id) WHERE ref_id IS NOT NULL`,

    `CREATE TABLE IF NOT EXISTS canvas_edges (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      source TEXT NOT NULL REFERENCES canvas_items(id) ON DELETE CASCADE,
      target TEXT NOT NULL REFERENCES canvas_items(id) ON DELETE CASCADE,
      label TEXT,
      seq BIGINT GENERATED ALWAYS AS IDENTITY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source, target)
    )`,
    `CREATE INDEX IF NOT EXISTS canvas_edges_campaign ON canvas_edges (campaign_id)`,

    `ALTER TABLE ideas ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL`,
    `CREATE INDEX IF NOT EXISTS ideas_campaign ON ideas (campaign_id) WHERE campaign_id IS NOT NULL`,
    `ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url TEXT`,
    `CREATE INDEX IF NOT EXISTS posts_campaign ON posts (campaign_id) WHERE campaign_id IS NOT NULL`,
  ],
};
