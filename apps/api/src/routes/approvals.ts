import { z } from 'zod';
import { HarborError, mediaRefInputSchema, postPartInputSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body, check } from '../lib/http.ts';
import { approve, listApprovals, reject } from '../services/approvals.ts';

const statusSchema = z.enum(['pending', 'approved', 'rejected']);

const approveSchema = z
  .object({
    /** Overrides the proposed time. Must be in the future. */
    scheduledFor: z.string().datetime({ offset: true }).optional(),
    /** Edited text: saved as a new draft version (author 'human') before scheduling. */
    parts: z.array(postPartInputSchema).min(1).max(25).optional(),
    /** Media for part 1 (`{ assetId, variant? }`), saved as a new draft version the same way. */
    media: z.array(mediaRefInputSchema).max(10).optional(),
  })
  .strict();

const rejectSchema = z.object({ note: z.string().max(2000).optional() }).strict();

const bulkSchema = z.object({ action: z.enum(['approve', 'reject']), ids: z.array(z.string().min(1)).min(1).max(100) }).strict();

/** The approval queue. Approving schedules a post; nothing an agent proposes goes out without it. */
export function registerApprovals(app: App, deps: AppDeps) {
  const { db } = deps;

  /** ?status= ?brandId= ?runId=. Pending first (soonest slot first); counts cover every status. */
  app.get('/v1/approvals', async (c) => {
    const raw = c.req.query('status');
    const status = raw ? check(statusSchema, raw) : undefined;
    return c.json(await listApprovals(db, { status, brandId: c.req.query('brandId'), runId: c.req.query('runId') }));
  });

  app.post('/v1/approvals/bulk', async (c) => {
    const input = await body(c, bulkSchema);
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of [...new Set(input.ids)]) {
      try {
        if (input.action === 'approve') await approve(deps, id);
        else await reject(db, id);
        results.push({ id, ok: true });
      } catch (err) {
        if (!(err instanceof HarborError)) throw err;
        results.push({ id, ok: false, error: err.message });
      }
    }
    return c.json({ results });
  });

  app.post('/v1/approvals/:id/approve', async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const input = check(approveSchema, raw ?? {});
    return c.json(await approve(deps, c.req.param('id'), input));
  });

  app.post('/v1/approvals/:id/reject', async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const input = check(rejectSchema, raw ?? {});
    return c.json(await reject(db, c.req.param('id'), input.note));
  });
}
