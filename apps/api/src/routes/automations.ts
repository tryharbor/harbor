import { z } from 'zod';
import { HarborError } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { agentInfo, loadRunDetail } from '../services/agents.ts';
import {
  checkTrigger,
  insertAutomation,
  listAutomations,
  loadAutomation,
  loadAutomationRow,
  nextRunAt,
  runAutomation,
  triggerSchema,
  type Trigger,
} from '../services/automations.ts';
import { loadBrand } from '../services/brands.ts';

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const EVENT_LABELS = { post_published: 'when a post is published', post_outperformed: 'when a post outperforms' };
const triggerLabel = (t: Trigger) => (t.type === 'schedule' ? `${WEEKDAYS[t.weekday]} ${t.hour}:00` : EVENT_LABELS[t.event]);

const fields = {
  brandId: z.string().min(1),
  agentId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  trigger: triggerSchema,
  inputs: z.record(z.unknown()),
  enabled: z.boolean(),
  maxRunsPerDay: z.number().int().min(1).max(24),
};

const createSchema = z
  .object({ ...fields, name: fields.name.optional(), inputs: fields.inputs.default({}), enabled: fields.enabled.default(true), maxRunsPerDay: fields.maxRunsPerDay.default(3) })
  .strict();
const patchSchema = z.object(fields).partial().strict();

/** Automations: an agent on a schedule or an event. The worker runs them; POST …/run runs one now. */
export function registerAutomations(app: App, deps: AppDeps) {
  const { db } = deps;

  app.get('/v1/automations', async (c) => c.json({ data: await listAutomations(db, c.req.query('brandId')) }));

  app.post('/v1/automations', async (c) => {
    const input = await body(c, createSchema);
    const brand = await loadBrand(db, input.brandId);
    const agent = agentInfo(input.agentId);
    const id = await insertAutomation(db, {
      workspaceId: brand.workspaceId, brandId: brand.id, agentId: agent.id, name: input.name ?? `${agent.name} · ${triggerLabel(input.trigger)}`,
      trigger: input.trigger, inputs: input.inputs, enabled: input.enabled, maxRunsPerDay: input.maxRunsPerDay,
    });
    return c.json(await loadAutomation(db, id), 201);
  });

  app.get('/v1/automations/:id', async (c) => c.json(await loadAutomation(db, c.req.param('id'))));

  /** Partial update. Re-enabling resets the failure streak; a new trigger moves the next run. */
  app.patch('/v1/automations/:id', async (c) => {
    const input = await body(c, patchSchema);
    const cur = await loadAutomationRow(db, c.req.param('id'));
    const brandId = input.brandId ? (await loadBrand(db, input.brandId)).id : cur.brand_id;
    const agentId = input.agentId ? agentInfo(input.agentId).id : cur.agent_id;
    const trigger = input.trigger ?? cur.trigger;
    if (input.trigger || input.agentId) checkTrigger(agentId, trigger);
    const enabled = input.enabled ?? cur.enabled;
    const reenabled = enabled && !cur.enabled;
    const reschedule = !!(input.trigger || reenabled);
    const next = reschedule ? nextRunAt(trigger) : undefined;
    await db.query(
      `UPDATE automations SET brand_id = $2, agent_id = $3, name = $4, trigger = $5, inputs = $6, enabled = $7, max_runs_per_day = $8,
         consecutive_failures = CASE WHEN $9::boolean THEN 0 ELSE consecutive_failures END,
         next_run_at = CASE WHEN $10::boolean THEN $11::timestamptz ELSE next_run_at END
       WHERE id = $1`,
      [
        cur.id, brandId, agentId, input.name ?? cur.name, JSON.stringify(trigger), JSON.stringify(input.inputs ?? cur.inputs), enabled,
        input.maxRunsPerDay ?? cur.max_runs_per_day, reenabled, reschedule, next?.toISOString() ?? null,
      ],
    );
    return c.json(await loadAutomation(db, cur.id));
  });

  app.delete('/v1/automations/:id', async (c) => {
    const rows = await db.query('DELETE FROM automations WHERE id = $1 RETURNING id', [c.req.param('id')]);
    if (rows.length === 0) throw new HarborError('NOT_FOUND', `Automation ${c.req.param('id')} not found.`);
    return c.body(null, 204);
  });

  /** Run it now, whatever its trigger (source 'automation'; counts toward the failure streak). */
  app.post('/v1/automations/:id/run', async (c) => {
    const row = await loadAutomationRow(db, c.req.param('id'));
    const runId = await runAutomation(deps, row);
    return c.json(await loadRunDetail(db, runId), 201);
  });
}
