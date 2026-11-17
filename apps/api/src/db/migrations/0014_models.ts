import type { Migration } from '../migrations.ts';

/**
 * The workspace's chosen AI model: a provider (simulated, anthropic, openai, google) and a model id. Owners' own provider
 * keys live encrypted in `secrets` (ref `model-key:<provider>`), never here.
 */
export const models0014: Migration = {
  id: '0014_models',
  statements: [
    `CREATE TABLE IF NOT EXISTS model_settings (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('simulated', 'anthropic', 'openai', 'google')),
      model TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ],
};
