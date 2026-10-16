import { z } from 'zod';
import type { App, AppDeps } from '../app.ts';
import { body, check } from '../lib/http.ts';
import { agentInfo, listAgentDefs, loadRunDetail, runAgent } from '../services/agents.ts';
import { RUN_SOURCES, SELECT_RUNS, toRunSummary, type AgentRunRow } from '../services/runs.ts';

const runSchema = z.object({ inputs: z.record(z.unknown()).default({}) });
const sourceSchema = z.enum(RUN_SOURCES);

/** Built-in agents, running them, and the run log (model runs and agent runs with their steps). */
export function registerAgentRuns(app: App, deps: AppDeps) {
  const { db } = deps;

  /** Every agent with its latest run and automation count (optionally for ?brandId=). */
  app.get('/v1/agents', async (c) => c.json({ data: await listAgentDefs(db, c.req.query('brandId')) }));

  app.get('/v1/agents/:id', async (c) => {
    const id = agentInfo(c.req.param('id')).id; // 404 for unknown agents
    const defs = await listAgentDefs(db, c.req.query('brandId'));
    return c.json(defs.find((d) => d.id === id));
  });

  /** Run an agent synchronously. A run that fails partway still comes back (201, status 'failed'); input errors are 400. */
  app.post('/v1/agents/:id/runs', async (c) => {
    const input = await body(c, runSchema);
    const runId = await runAgent(deps, c.req.param('id'), input.inputs, { source: 'ui' });
    return c.json(await loadRunDetail(db, runId), 201);
  });

  /**
   * Recent runs (voice, ideas, draft, rewrite, agent …), newest first. Filters: ?brandId= ?agentId= ?source=
   * ?topLevel=true (no child runs) and ?limit= (≤ 200).
   */
  app.get('/v1/agent-runs', async (c) => {
    const q = (k: string) => c.req.query(k) ?? null;
    const limit = Math.min(Number(q('limit') ?? 50) || 50, 200);
    const source = q('source') ? check(sourceSchema, q('source')) : null;
    const topLevel = ['1', 'true'].includes(q('topLevel') ?? '');
    const rows = await db.query<AgentRunRow>(
      `${SELECT_RUNS}
       WHERE ($1::text IS NULL OR r.brand_id = $1) AND ($3::text IS NULL OR r.agent_id = $3) AND ($4::text IS NULL OR r.source = $4)
         AND (NOT $5::boolean OR r.parent_run_id IS NULL)
       ORDER BY r.started_at DESC, r.id DESC LIMIT $2`,
      [q('brandId'), limit, q('agentId'), source, topLevel],
    );
    return c.json({ data: rows.map(toRunSummary) });
  });

  /** One run with its inputs, steps, child runs and approvals. */
  app.get('/v1/agent-runs/:id', async (c) => c.json(await loadRunDetail(db, c.req.param('id'))));
}
