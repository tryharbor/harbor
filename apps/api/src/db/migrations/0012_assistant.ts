import type { Migration } from '../migrations.ts';

/**
 * The social assistant: one chat per thread, per brand. Messages (and the post options on assistant messages) live in
 * one JSONB array, since a chat is only ever read and written whole. Assistant turns are recorded as 'assistant' runs.
 */
export const assistant0012: Migration = {
  id: '0012_assistant',
  statements: [
    `ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check`,
    `ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_kind_check
       CHECK (kind IN ('insights', 'ideas', 'draft', 'outcome', 'voice', 'rewrite', 'agent', 'preview', 'assistant'))`,
    `CREATE TABLE IF NOT EXISTS assistant_chats (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS assistant_chats_brand ON assistant_chats (brand_id, updated_at DESC)`,
  ],
};
