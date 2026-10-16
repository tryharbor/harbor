import type { Migration } from '../migrations.ts';

/** Voice learning and rewrites as agent runs; one performance signal per post; draft version lookups. */
export const studio0003: Migration = {
  id: '0003_studio',
  statements: [
    `ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check`,
    `ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_kind_check
       CHECK (kind IN ('insights', 'ideas', 'draft', 'outcome', 'voice', 'rewrite'))`,
    `CREATE INDEX IF NOT EXISTS agent_runs_brand_started ON agent_runs (brand_id, started_at DESC)`,

    // post_performance signals are upserted per post (re-running idea generation updates them).
    `CREATE UNIQUE INDEX IF NOT EXISTS signals_post_performance_post
       ON signals (brand_id, (source->>'postId')) WHERE kind = 'post_performance'`,

    `CREATE INDEX IF NOT EXISTS drafts_idea_platform_version ON drafts (idea_id, platform, version DESC)`,
    `CREATE INDEX IF NOT EXISTS drafts_brand_created ON drafts (brand_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS competitors_brand ON competitors (brand_id, created_at)`,
  ],
};
