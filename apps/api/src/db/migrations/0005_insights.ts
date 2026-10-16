import type { Migration } from '../migrations.ts';

/**
 * The insight engine: one outcome (verdict) per post, weekly digests, and insights tied to the digest that wrote
 * them.
 */
export const insights0005: Migration = {
  id: '0005_insights',
  statements: [
    // One outcome per post, refreshed in place.
    `DELETE FROM outcomes o USING outcomes newer
       WHERE o.post_id = newer.post_id AND (o.evaluated_at, o.id) < (newer.evaluated_at, newer.id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS outcomes_post ON outcomes (post_id)`,
    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS metric TEXT`,
    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS ratio REAL`,
    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS comparable_posts INT NOT NULL DEFAULT 0`,

    // data = the whole digest as returned by the API (headline, stats, findings).
    `CREATE TABLE IF NOT EXISTS digests (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      period_from TIMESTAMPTZ NOT NULL,
      period_to TIMESTAMPTZ NOT NULL,
      data JSONB NOT NULL,
      agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS digests_brand_created ON digests (brand_id, created_at DESC)`,

    `ALTER TABLE insights ADD COLUMN IF NOT EXISTS digest_id TEXT REFERENCES digests(id) ON DELETE CASCADE`,
    `ALTER TABLE insights ADD COLUMN IF NOT EXISTS kind TEXT`,
    `CREATE INDEX IF NOT EXISTS insights_brand_created ON insights (brand_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS posts_brand_published ON posts (brand_id, published_at) WHERE status = 'published'`,
  ],
};
