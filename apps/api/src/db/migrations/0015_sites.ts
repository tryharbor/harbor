import type { Migration } from '../migrations.ts';

/**
 * Website mode: one generated site per brand (copy from Business Memory, look from Branding and the chosen direction),
 * published at /sites/<slug>, and the messages its contact form collects. Writing a site's copy is a 'site' run.
 */
export const sites0015: Migration = {
  id: '0015_sites',
  statements: [
    `ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check`,
    `ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_kind_check
       CHECK (kind IN ('insights', 'ideas', 'draft', 'outcome', 'voice', 'rewrite', 'agent', 'preview', 'assistant', 'site'))`,
    `CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL UNIQUE REFERENCES brands(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      direction TEXT NOT NULL DEFAULT 'bold' CHECK (direction IN ('bold', 'classic', 'minimal')),
      copy JSONB NOT NULL,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS site_leads (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS site_leads_site ON site_leads (site_id, created_at DESC)`,
  ],
};
