import type { Migration } from '../migrations.ts';

/**
 * Full app projects and their build runs. A project's files live on disk (HARBOR_PROJECTS_DIR/<id>) with their own git
 * history; a run records one request to the builder: its steps as they happen, what it cost and the commit it made.
 */
export const projects0016: Migration = {
  id: '0016_projects',
  statements: [
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      budget_cents INTEGER NOT NULL DEFAULT 500 CHECK (budget_cents BETWEEN 50 AND 10000),
      spent_cents NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS projects_brand ON projects (brand_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS build_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      request TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'budget', 'stopped', 'steps')),
      steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      summary TEXT,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_cents NUMERIC NOT NULL DEFAULT 0,
      commit_sha TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS build_runs_project ON build_runs (project_id, created_at DESC)`,
  ],
};
