import { z } from 'zod';
import { HarborError, newId } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { agentInfo, recordFailedRun, runAgent, type AgentDeps } from './agents.ts';
import { loadBrand } from './brands.ts';
import { AGENT_EVENTS } from './events.ts';

/**
 * Automations run an agent on a schedule (weekday + hour, server local time) or when an event happens
 * (post_published, post_outperformed). The worker runs them; each run is an agent run with source 'automation'.
 * At most max_runs_per_day runs a day; after 3 consecutive failures the automation pauses itself.
 */

export const MAX_CONSECUTIVE_FAILURES = 3;

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('schedule'), weekday: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) }).strict(),
  z.object({ type: z.literal('event'), event: z.enum(AGENT_EVENTS) }).strict(),
]);
export type Trigger = z.infer<typeof triggerSchema>;

export interface AutomationRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  brand_name: string;
  agent_id: string;
  name: string;
  trigger: Trigger;
  inputs: Record<string, unknown>;
  enabled: boolean;
  max_runs_per_day: number;
  consecutive_failures: number;
  next_run_at: Date | string | null;
  last_run_at: Date | string | null;
  last_run_id: string | null;
  last_run_status: string | null;
  runs_today: number;
  created_at: Date | string;
}

/** Midnight today, server local time. */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const SELECT_AUTOMATIONS = `
  SELECT a.*, b.name AS brand_name, lr.status AS last_run_status,
    (SELECT count(*) FROM agent_runs r WHERE r.automation_id = a.id AND r.parent_run_id IS NULL AND r.started_at >= $1::timestamptz)::int AS runs_today
  FROM automations a JOIN brands b ON b.id = a.brand_id LEFT JOIN agent_runs lr ON lr.id = a.last_run_id`;

export const automationStatus = (r: Pick<AutomationRow, 'enabled' | 'consecutive_failures'>) =>
  r.consecutive_failures >= MAX_CONSECUTIVE_FAILURES ? 'failing' : r.enabled ? 'active' : 'paused';

export const toAutomation = (r: AutomationRow) => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  agentId: r.agent_id,
  name: r.name,
  trigger: r.trigger,
  inputs: r.inputs ?? {},
  enabled: r.enabled,
  status: automationStatus(r),
  maxRunsPerDay: Number(r.max_runs_per_day),
  runsToday: Number(r.runs_today),
  consecutiveFailures: Number(r.consecutive_failures),
  nextRunAt: r.next_run_at ? iso(r.next_run_at) : undefined,
  lastRunAt: r.last_run_at ? iso(r.last_run_at) : undefined,
  lastRunId: r.last_run_id ?? undefined,
  lastRunStatus: r.last_run_status ?? undefined,
  createdAt: iso(r.created_at),
});
export type Automation = ReturnType<typeof toAutomation>;

export async function loadAutomationRow(db: Db, id: string): Promise<AutomationRow> {
  const [row] = await db.query<AutomationRow>(`${SELECT_AUTOMATIONS} WHERE a.id = $2`, [startOfToday(), id]);
  if (!row) throw new HarborError('NOT_FOUND', `Automation ${id} not found.`);
  return row;
}

export const loadAutomation = async (db: Db, id: string) => toAutomation(await loadAutomationRow(db, id));

export async function listAutomations(db: Db, brandId?: string): Promise<Automation[]> {
  const rows = await db.query<AutomationRow>(`${SELECT_AUTOMATIONS} WHERE ($2::text IS NULL OR a.brand_id = $2) ORDER BY a.created_at, a.id`, [
    startOfToday(), brandId ?? null,
  ]);
  return rows.map(toAutomation);
}

/** The next time a schedule fires after `from` (server local time), or undefined for event triggers. */
export function nextRunAt(trigger: Trigger, from = new Date()): Date | undefined {
  if (trigger.type !== 'schedule') return undefined;
  const d = new Date(from);
  d.setHours(trigger.hour, 0, 0, 0);
  d.setDate(d.getDate() + ((trigger.weekday - d.getDay() + 7) % 7));
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

/** The trigger must be one the agent supports. */
export function checkTrigger(agentId: string, trigger: Trigger): void {
  const info = agentInfo(agentId);
  const kind = trigger.type === 'schedule' ? 'schedule' : trigger.event;
  if (!info.triggers.includes(kind)) {
    const supported = info.triggers.filter((t) => t !== 'manual');
    throw new HarborError('INVALID_REQUEST', `trigger: ${info.name} can't run on ${kind}${supported.length ? `; it supports ${supported.join(', ')}` : '; it only runs manually'}.`);
  }
}

const agentTakesBrand = (agentId: string) => agentInfo(agentId).inputs.some((i) => i.key === 'brandId');

export async function insertAutomation(
  db: Db,
  a: { workspaceId: string; brandId: string; agentId: string; name: string; trigger: Trigger; inputs: Record<string, unknown>; enabled: boolean; maxRunsPerDay: number },
): Promise<string> {
  checkTrigger(a.agentId, a.trigger);
  const id = newId('automation');
  await db.query(
    `INSERT INTO automations (id, workspace_id, brand_id, agent_id, name, trigger, inputs, enabled, max_runs_per_day, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, a.workspaceId, a.brandId, a.agentId, a.name, JSON.stringify(a.trigger), JSON.stringify(a.inputs), a.enabled, a.maxRunsPerDay, nextRunAt(a.trigger)?.toISOString() ?? null],
  );
  return id;
}

/**
 * Run an automation's agent now (source 'automation'), with `extra` inputs (the event's post) on top of its own.
 * Inputs that no longer work are recorded as a failed run. Updates the failure streak and pauses after 3.
 */
export async function runAutomation(deps: AgentDeps, a: AutomationRow, extra: Record<string, unknown> = {}): Promise<string> {
  const { db } = deps;
  const inputs = { ...(a.inputs ?? {}), ...(agentTakesBrand(a.agent_id) ? { brandId: a.brand_id } : {}), ...extra };
  const opts = { source: 'automation' as const, automationId: a.id };
  let runId: string;
  try {
    runId = await runAgent(deps, a.agent_id, inputs, opts);
  } catch (err) {
    if (!(err instanceof HarborError)) throw err;
    runId = await recordFailedRun(deps, await loadBrand(db, a.brand_id), a.agent_id, inputs, err, opts);
  }
  const [run] = await db.query<{ status: string }>('SELECT status FROM agent_runs WHERE id = $1', [runId]);
  const ok = run?.status === 'succeeded';
  await db.query(
    `UPDATE automations SET last_run_at = now(), last_run_id = $2,
       consecutive_failures = CASE WHEN $3::boolean THEN 0 ELSE consecutive_failures + 1 END,
       enabled = CASE WHEN NOT $3::boolean AND consecutive_failures + 1 >= $4 THEN false ELSE enabled END
     WHERE id = $1`,
    [a.id, runId, ok, MAX_CONSECUTIVE_FAILURES],
  );
  return runId;
}

const underDailyCap = (a: AutomationRow) => Number(a.runs_today) < Number(a.max_runs_per_day);

/** Run every enabled schedule automation that is due. Each is claimed by moving next_run_at forward first. */
export async function processDueSchedules(deps: AgentDeps): Promise<string[]> {
  const { db } = deps;
  const due = await db.query<AutomationRow>(
    `${SELECT_AUTOMATIONS} WHERE a.enabled AND a.trigger->>'type' = 'schedule' AND a.next_run_at <= now() ORDER BY a.next_run_at LIMIT 10`,
    [startOfToday()],
  );
  const runs: string[] = [];
  for (const a of due) {
    const next = nextRunAt(a.trigger)!;
    const [claimed] = await db.query('UPDATE automations SET next_run_at = $2 WHERE id = $1 AND next_run_at <= now() RETURNING id', [a.id, next.toISOString()]);
    if (!claimed || !underDailyCap(a)) continue;
    runs.push(await runAutomation(deps, a));
  }
  return runs;
}

/**
 * Hand new events to the event automations of their brand. An automation only reacts to events from after it was
 * created, and the same post never triggers the same automation twice (automation_refs).
 */
export async function processEvents(deps: AgentDeps): Promise<string[]> {
  const { db } = deps;
  const events = await db.query<{ id: string; type: string; brand_id: string; ref_id: string; created_at: Date | string }>(
    `UPDATE agent_events SET processed_at = now()
     WHERE id IN (SELECT id FROM agent_events WHERE processed_at IS NULL ORDER BY created_at, id LIMIT 20) RETURNING *`,
  );
  const runs: string[] = [];
  for (const e of events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())) {
    const autos = await db.query<AutomationRow>(
      `${SELECT_AUTOMATIONS} WHERE a.enabled AND a.brand_id = $2 AND a.trigger->>'type' = 'event' AND a.trigger->>'event' = $3 AND a.created_at <= $4
       ORDER BY a.created_at, a.id`,
      [startOfToday(), e.brand_id, e.type, iso(e.created_at)],
    );
    for (const a of autos) {
      if (!underDailyCap(a)) continue;
      const [claimed] = await db.query('INSERT INTO automation_refs (automation_id, ref_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING ref_id', [a.id, e.ref_id]);
      if (!claimed) continue;
      const runId = await runAutomation(deps, a, { postId: e.ref_id });
      await db.query('UPDATE automation_refs SET run_id = $3 WHERE automation_id = $1 AND ref_id = $2', [a.id, e.ref_id, runId]);
      runs.push(runId);
    }
  }
  return runs;
}
