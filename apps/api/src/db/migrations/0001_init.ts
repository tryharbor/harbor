import type { Migration } from '../migrations.ts';

const PLATFORM = `CHECK (platform IN ('x', 'linkedin', 'instagram', 'threads'))`;

/** Core tables. Raw SQL, Postgres dialect (runs on PGlite locally and Supabase/Postgres in production). */
export const init0001: Migration = {
  id: '0001_init',
  statements: [
    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `INSERT INTO workspaces (id, name) VALUES ('ws_default', 'My workspace') ON CONFLICT (id) DO NOTHING`,

    // Brand Memory (voice, offer, audience, example posts) lives in one JSONB document, validated by @harbor/core.
    `CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      memory JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, slug)
    )`,

    `CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('insights', 'ideas', 'draft', 'outcome')),
      status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
      model TEXT,
      input JSONB NOT NULL DEFAULT '{}',
      output JSONB,
      error TEXT,
      usage JSONB,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    )`,

    // Tokens live in a secret store; token_ref points at them.
    `CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      platform TEXT NOT NULL ${PLATFORM},
      platform_account_id TEXT NOT NULL,
      handle TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      token_ref TEXT NOT NULL,
      scopes JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'refresh_needed', 'disconnected')),
      token_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand_id, platform, platform_account_id)
    )`,

    `CREATE TABLE IF NOT EXISTS competitors (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT,
      handles JSONB NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('post_performance', 'competitor_post', 'comment', 'trend', 'manual')),
      summary TEXT NOT NULL,
      source JSONB NOT NULL DEFAULT '{}',
      data JSONB NOT NULL DEFAULT '{}',
      observed_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS signals_brand_observed ON signals (brand_id, observed_at DESC)`,

    // basis = [{ signalId, note? }]: the signals an insight or idea cites.
    `CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      basis JSONB NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      angle TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'drafting', 'approved', 'scheduled', 'live')),
      basis JSONB NOT NULL DEFAULT '[]',
      insight_ids JSONB NOT NULL DEFAULT '[]',
      agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ideas_brand_status ON ideas (brand_id, status)`,

    `CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
      platform TEXT NOT NULL ${PLATFORM},
      channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
      parts JSONB NOT NULL,
      version INT NOT NULL DEFAULT 1,
      author TEXT NOT NULL CHECK (author IN ('agent', 'human')),
      agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // status 'unknown' = publish sent, result unknown: never retried automatically.
    `CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      draft_id TEXT REFERENCES drafts(id) ON DELETE SET NULL,
      idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'publishing', 'pending', 'published', 'failed', 'unknown')),
      scheduled_for TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      platform_post_id TEXT,
      url TEXT,
      pending_data JSONB,
      error JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (channel_id, platform_post_id)
    )`,
    `CREATE INDEX IF NOT EXISTS posts_due ON posts (scheduled_for) WHERE status = 'scheduled'`,

    // One row per growth-curve poll (1h/6h/24h/72h/7d). raw is kept so metrics can be re-normalized later.
    `CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      taken_at TIMESTAMPTZ NOT NULL,
      age_hours REAL NOT NULL CHECK (age_hours >= 0),
      raw JSONB NOT NULL,
      metrics JSONB NOT NULL DEFAULT '{}',
      adapter_version TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS snapshots_post_taken ON snapshots (post_id, taken_at)`,

    `CREATE TABLE IF NOT EXISTS outcomes (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('outperformed', 'met', 'underperformed', 'inconclusive')),
      baseline JSONB NOT NULL DEFAULT '{}',
      actual JSONB NOT NULL DEFAULT '{}',
      at_age_hours REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ],
};
