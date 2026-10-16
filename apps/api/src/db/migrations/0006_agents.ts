import type { Migration } from '../migrations.ts';

/**
 * Agents: parent runs with steps, approvals (agents never publish), automations on a schedule or an event, the
 * events they react to, and hashed API keys for the MCP server.
 */
export const agents0006: Migration = {
  id: '0006_agents',
  statements: [
    `ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check`,
    `ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_kind_check
       CHECK (kind IN ('insights', 'ideas', 'draft', 'outcome', 'voice', 'rewrite', 'agent'))`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS agent_id TEXT`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ui'`,
    `ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_source_check`,
    `ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_source_check CHECK (source IN ('ui', 'mcp', 'automation', 'canvas', 'studio'))`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS parent_run_id TEXT REFERENCES agent_runs(id) ON DELETE CASCADE`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS automation_id TEXT`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS api_key_id TEXT`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]'`,
    `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS summary TEXT`,
    `CREATE INDEX IF NOT EXISTS agent_runs_parent ON agent_runs (parent_run_id) WHERE parent_run_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS agent_runs_automation_started ON agent_runs (automation_id, started_at DESC) WHERE automation_id IS NOT NULL`,

    `CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      agent_id TEXT,
      draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      proposed_for TIMESTAMPTZ NOT NULL,
      slot_score REAL,
      reason TEXT NOT NULL DEFAULT '',
      checks JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      decided_at TIMESTAMPTZ,
      decided_note TEXT,
      post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'ui',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS approvals_status_proposed ON approvals (status, proposed_for)`,
    `CREATE INDEX IF NOT EXISTS approvals_channel_pending ON approvals (channel_id, proposed_for) WHERE status = 'pending'`,
    `CREATE INDEX IF NOT EXISTS approvals_run ON approvals (run_id) WHERE run_id IS NOT NULL`,

    // trigger = { type: 'schedule', weekday, hour } | { type: 'event', event }.
    `CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger JSONB NOT NULL,
      inputs JSONB NOT NULL DEFAULT '{}',
      enabled BOOLEAN NOT NULL DEFAULT true,
      max_runs_per_day INT NOT NULL DEFAULT 3,
      consecutive_failures INT NOT NULL DEFAULT 0,
      next_run_at TIMESTAMPTZ,
      last_run_at TIMESTAMPTZ,
      last_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS automations_due ON automations (next_run_at) WHERE enabled`,
    `CREATE INDEX IF NOT EXISTS automations_brand ON automations (brand_id, created_at)`,

    // One event per (type, post): a post is published once, and only its first 'outperformed' verdict counts.
    `CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('post_published', 'post_outperformed')),
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      ref_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS agent_events_type_ref ON agent_events (type, ref_id)`,
    `CREATE INDEX IF NOT EXISTS agent_events_unprocessed ON agent_events (created_at) WHERE processed_at IS NULL`,

    // Which ref (post) already triggered which automation, so the same post never triggers it twice.
    `CREATE TABLE IF NOT EXISTS automation_refs (
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      ref_id TEXT NOT NULL,
      run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (automation_id, ref_id)
    )`,

    // Only the SHA-256 of a key is stored; prefix (first 12 characters) is for display.
    `CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      scopes TEXT[] NOT NULL DEFAULT '{read}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )`,
  ],
};
