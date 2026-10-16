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

export const RUN_SOURCES = ['ui', 'mcp', 'automation', 'canvas', 'studio'] as const;
export type RunSource = (typeof RUN_SOURCES)[number];

/** Where a run came from. Model runs made inside an agent set parentRunId (and inherit the rest). */
export interface RunOpts {
  parentRunId?: string;
  source?: RunSource;
  apiKeyId?: string;
  agentId?: string;
  automationId?: string;
}

const sumUsage = (us: ModelUsage[]): ModelUsage => ({
  inputTokens: us.reduce((a, u) => a + u.inputTokens, 0),
  outputTokens: us.reduce((a, u) => a + u.outputTokens, 0),
});

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

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
  opts: RunOpts = {},
): Promise<{ value: T; run: RunInfo }> {
  const id = newId('agentRun');
  await db.query(
    `INSERT INTO agent_runs (id, workspace_id, brand_id, kind, status, model, input, source, parent_run_id, api_key_id, agent_id, automation_id)
     VALUES ($1, $2, $3, $4, 'running', $5, $6, $7, $8, $9, $10, $11)`,
    [
      id, brand.workspaceId, brand.id, kind, modelName, JSON.stringify(input), opts.source ?? 'ui', opts.parentRunId ?? null,
      opts.apiKeyId ?? null, opts.agentId ?? null, opts.automationId ?? null,
    ],
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
    await db.query(`UPDATE agent_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [id, errorText(err)]);
    throw err;
  }
}

// ---- Agent (parent) runs ----

export interface RunRef {
  kind: 'idea' | 'draft' | 'post' | 'digest' | 'approval' | 'run' | 'campaign';
  id: string;
  label?: string;
}

export interface RunStep {
  key: string;
  label: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt?: string;
  detail?: string;
  refs?: RunRef[];
}

/** What a step's body returns: a one-line result and the things it made. */
export interface StepResult<T> {
  value: T;
  detail?: string;
  refs?: RunRef[];
}

/**
 * A parent run of kind 'agent' with a step timeline. Each step is saved as it starts and ends, so a run in
 * progress can be watched. The parent's usage is the sum of its children's.
 */
export class AgentRunRecorder {
  readonly steps: RunStep[] = [];
  private constructor(
    private readonly db: Db,
    readonly id: string,
    readonly opts: RunOpts,
  ) {}

  static async start(
    db: Db,
    brand: Pick<Brand, 'id' | 'workspaceId'>,
    agentId: string,
    input: Record<string, unknown>,
    modelName: string,
    opts: RunOpts = {},
  ): Promise<AgentRunRecorder> {
    const id = newId('agentRun');
    await db.query(
      `INSERT INTO agent_runs (id, workspace_id, brand_id, kind, status, model, input, source, api_key_id, agent_id, automation_id)
       VALUES ($1, $2, $3, 'agent', 'running', $4, $5, $6, $7, $8, $9)`,
      [id, brand.workspaceId, brand.id, modelName, JSON.stringify(input), opts.source ?? 'ui', opts.apiKeyId ?? null, agentId, opts.automationId ?? null],
    );
    return new AgentRunRecorder(db, id, { ...opts, agentId });
  }

  /** RunOpts for model runs made inside this agent run. */
  get child(): RunOpts {
    return { parentRunId: this.id, source: this.opts.source, apiKeyId: this.opts.apiKeyId, agentId: this.opts.agentId, automationId: this.opts.automationId };
  }

  private save() {
    return this.db.query('UPDATE agent_runs SET steps = $2 WHERE id = $1', [this.id, JSON.stringify(this.steps)]);
  }

  async step<T>(key: string, label: string, fn: () => Promise<StepResult<T>>): Promise<T> {
    const step: RunStep = { key, label, status: 'running', startedAt: new Date().toISOString() };
    this.steps.push(step);
    await this.save();
    try {
      const { value, detail, refs } = await fn();
      Object.assign(step, { status: 'succeeded', finishedAt: new Date().toISOString(), ...(detail ? { detail } : {}), ...(refs?.length ? { refs } : {}) });
      await this.save();
      return value;
    } catch (err) {
      Object.assign(step, { status: 'failed', finishedAt: new Date().toISOString(), detail: errorText(err) });
      await this.save();
      throw err;
    }
  }

  async skip(key: string, label: string, detail: string): Promise<void> {
    const now = new Date().toISOString();
    this.steps.push({ key, label, status: 'skipped', startedAt: now, finishedAt: now, detail });
    await this.save();
  }

  /** Close the run. Usage is summed from the child runs; `simulated` is true unless a child used a real model. */
  async finish(result: { error?: unknown; summary?: string; output?: Record<string, unknown>; simulated: boolean }): Promise<void> {
    const children = await this.db.query<{ usage: ModelUsage | null; simulated: boolean | null }>(
      `SELECT usage, (output->>'simulated')::boolean AS simulated FROM agent_runs WHERE parent_run_id = $1`,
      [this.id],
    );
    const usage = sumUsage(children.map((c) => c.usage ?? { inputTokens: 0, outputTokens: 0 }));
    const simulated = children.length ? children.every((c) => c.simulated !== false) : result.simulated;
    await this.db.query(
      `UPDATE agent_runs SET status = $2, error = $3, summary = $4, usage = $5, output = $6, steps = $7, finished_at = now() WHERE id = $1`,
      [
        this.id, result.error === undefined ? 'succeeded' : 'failed', result.error === undefined ? null : errorText(result.error), result.summary ?? null,
        JSON.stringify(usage), JSON.stringify({ simulated, ...(result.output ?? {}) }), JSON.stringify(this.steps),
      ],
    );
  }
}

// ---- Reading runs ----

export interface AgentRunRow {
  id: string;
  brand_id: string | null;
  brand_name?: string | null;
  kind: string;
  status: string;
  model: string | null;
  usage: unknown;
  error: string | null;
  simulated: boolean | null;
  started_at: Date | string;
  finished_at: Date | string | null;
  agent_id?: string | null;
  source?: string | null;
  automation_id?: string | null;
  parent_run_id?: string | null;
  summary?: string | null;
  step_count?: number | null;
  approval_count?: number | null;
}

/** Runs with what AgentRunView needs. Add WHERE / ORDER BY after it. */
export const SELECT_RUNS = `
  SELECT r.id, r.brand_id, b.name AS brand_name, r.kind, r.status, r.model, r.usage, r.error,
    (r.output->>'simulated')::boolean AS simulated, r.started_at, r.finished_at, r.agent_id, r.source, r.automation_id,
    r.parent_run_id, r.summary, jsonb_array_length(r.steps) AS step_count,
    (SELECT count(*) FROM approvals a WHERE a.run_id = r.id)::int AS approval_count
  FROM agent_runs r LEFT JOIN brands b ON b.id = r.brand_id`;

export const toRunSummary = (r: AgentRunRow) => ({
  id: r.id,
  kind: r.kind,
  agentId: r.agent_id ?? undefined,
  brandId: r.brand_id ?? undefined,
  brandName: r.brand_name ?? undefined,
  status: r.status,
  source: r.source ?? 'ui',
  automationId: r.automation_id ?? undefined,
  parentRunId: r.parent_run_id ?? undefined,
  model: r.model ?? undefined,
  simulated: r.simulated ?? r.model === 'simulated-v1',
  usage: (r.usage as ModelUsage | null) ?? undefined,
  summary: r.summary ?? undefined,
  startedAt: iso(r.started_at),
  finishedAt: r.finished_at ? iso(r.finished_at) : undefined,
  error: r.error ?? undefined,
  stepCount: Number(r.step_count ?? 0),
  approvalCount: Number(r.approval_count ?? 0),
});
export type AgentRunView = ReturnType<typeof toRunSummary>;
