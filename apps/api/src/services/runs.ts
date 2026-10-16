import { type AgentRunKind, type Brand } from '@harbor/core';
import { newId } from '@harbor/core';
import type { ModelResult, ModelUsage } from '@harbor/ai';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';

/** What every AI route returns next to its result, so the UI can show the model and cost (and a "Simulated" badge). */
export interface RunInfo {
  id: string;
  model: string;
  simulated: boolean;
  usage: ModelUsage;
}

const sumUsage = (us: ModelUsage[]): ModelUsage => ({
  inputTokens: us.reduce((a, u) => a + u.inputTokens, 0),
  outputTokens: us.reduce((a, u) => a + u.outputTokens, 0),
});

/**
 * Record one model-driven job in agent_runs: a 'running' row first, then 'succeeded' with usage or 'failed' with
 * the error. `fn` may make several model calls; their usage is summed.
 */
export async function withRun<T>(
  db: Db,
  brand: Pick<Brand, 'id' | 'workspaceId'>,
  kind: AgentRunKind,
  input: Record<string, unknown>,
  modelName: string,
  fn: (runId: string) => Promise<{ value: T; calls: ModelResult<unknown>[]; output?: unknown }>,
): Promise<{ value: T; run: RunInfo }> {
  const id = newId('agentRun');
  await db.query(
    `INSERT INTO agent_runs (id, workspace_id, brand_id, kind, status, model, input) VALUES ($1, $2, $3, $4, 'running', $5, $6)`,
    [id, brand.workspaceId, brand.id, kind, modelName, JSON.stringify(input)],
  );
  try {
    const { value, calls, output } = await fn(id);
    const usage = sumUsage(calls.map((c) => c.usage));
    const model = calls[0]?.model ?? modelName;
    const simulated = calls.length > 0 && calls.every((c) => c.simulated);
    await db.query(
      `UPDATE agent_runs SET status = 'succeeded', model = $2, usage = $3, output = $4, finished_at = now() WHERE id = $1`,
      [id, model, JSON.stringify(usage), JSON.stringify({ simulated, ...(output && typeof output === 'object' ? output : { result: output ?? null }) })],
    );
    return { value, run: { id, model, simulated, usage } };
  } catch (err) {
    await db.query(`UPDATE agent_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [
      id, err instanceof Error ? err.message : String(err),
    ]);
    throw err;
  }
}

export interface AgentRunRow {
  id: string;
  brand_id: string | null;
  kind: string;
  status: string;
  model: string | null;
  usage: unknown;
  error: string | null;
  simulated: boolean | null;
  started_at: Date | string;
  finished_at: Date | string | null;
}

export const toRunSummary = (r: AgentRunRow) => ({
  id: r.id,
  brandId: r.brand_id ?? undefined,
  kind: r.kind,
  status: r.status,
  model: r.model ?? undefined,
  simulated: r.simulated ?? r.model === 'simulated-v1',
  usage: (r.usage as ModelUsage | null) ?? undefined,
  startedAt: iso(r.started_at),
  finishedAt: r.finished_at ? iso(r.finished_at) : undefined,
  error: r.error ?? undefined,
});
