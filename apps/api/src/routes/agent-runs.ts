import type { App, AppDeps } from '../app.ts';
import { toRunSummary, type AgentRunRow } from '../services/runs.ts';

export function registerAgentRuns(app: App, deps: AppDeps) {
  const { db } = deps;
  /** Recent model runs (voice, ideas, draft, rewrite …), newest first. Optional ?brandId= and ?limit= (≤ 200). */
  app.get('/v1/agent-runs', async (c) => {
    const brandId = c.req.query('brandId') ?? null;
    const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200);
    const rows = await db.query<AgentRunRow>(
      `SELECT id, brand_id, kind, status, model, usage, error, (output->>'simulated')::boolean AS simulated, started_at, finished_at FROM agent_runs
       WHERE ($1::text IS NULL OR brand_id = $1) ORDER BY started_at DESC, id DESC LIMIT $2`,
      [brandId, limit],
    );
    return c.json({ data: rows.map(toRunSummary) });
  });
}
