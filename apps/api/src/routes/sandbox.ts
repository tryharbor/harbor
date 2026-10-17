import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HarborError, platformSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { upsertChannel } from '../services/channels.ts';
import { loadBrand, personAccountConflict, personAccountTaken } from '../services/brands.ts';
import { tick } from '../worker.ts';

const channelSchema = z
  .object({
    brandId: z.string().min(1),
    platform: platformSchema,
    handle: z
      .string()
      .trim()
      .transform((h) => h.replace(/^@+/, ''))
      .pipe(z.string().min(1).max(100).regex(/^[\p{L}\p{N}._ -]+$/u, 'letters, digits, dots, dashes, underscores and spaces')),
  })
  .strict();

const advanceSchema = z.object({ hours: z.number().positive().max(24 * 60) }).strict();

/** Only sandbox posts (platform ids `sbx_…`) are ever moved in time. */
const SANDBOX_POST = `p.platform_post_id LIKE 'sbx\\_%'`;

/** Sandbox-only routes: fake channels and a time machine for growth curves. 404 in live mode. */
export function registerSandbox(app: App, deps: AppDeps) {
  const { db } = deps;
  const requireSandbox = () => {
    if (deps.publishMode !== 'sandbox') throw new HarborError('NOT_FOUND', 'Sandbox routes are only available when HARBOR_PUBLISH_MODE=sandbox.');
  };

  /** Connect a fake account. Its (fake) tokens are stored encrypted like real ones, so publishing works end to end. */
  app.post('/v1/sandbox/channels', async (c) => {
    requireSandbox();
    const input = await body(c, channelSchema);
    const brand = await loadBrand(db, input.brandId);
    const provider = deps.registry.get(input.platform);
    if (!provider) throw new HarborError('NOT_FOUND', `Unknown platform ${input.platform}.`);
    const platformAccountId = `sbx_${input.platform}_${input.handle.toLowerCase().replace(/\s+/g, '_')}`;
    const taken = await personAccountConflict(db, brand.id, input.platform, platformAccountId);
    if (taken) throw new HarborError('INVALID_REQUEST', personAccountTaken(input.handle, taken, provider.name));
    const channel = await upsertChannel(db, deps.secrets(), brand.id, input.platform, {
      accessToken: `sbx_access_${randomBytes(12).toString('hex')}`,
      refreshToken: `sbx_refresh_${randomBytes(12).toString('hex')}`,
      scopes: [...provider.scopes],
      account: { platformAccountId, handle: input.handle, displayName: input.handle },
    });
    return c.json(channel, 201);
  });

  /**
   * Move sandbox time forward by `hours`: published sandbox posts (and their snapshots) and pending snapshot jobs
   * are shifted into the past, then the worker runs. Time moves in steps that stop at each due snapshot, so every
   * snapshot is taken at its real age (1h, 6h, 24h …) and the growth curve looks like it would in real time.
   * Automations fire along the way, as they would in real time.
   */
  app.post('/v1/sandbox/advance', async (c) => {
    requireSandbox();
    const { hours } = await body(c, advanceSchema);
    const workerDeps = deps.workerDeps();
    const [{ n: snapsBefore } = { n: 0 }] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM snapshots');
    const [{ n: posts } = { n: 0 }] = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM posts p WHERE p.status = 'published' AND p.published_at IS NOT NULL AND ${SANDBOX_POST}`,
    );

    const shift = async (sec: number) => {
      if (sec <= 0) return;
      await db.query(
        `UPDATE posts p SET published_at = published_at - make_interval(secs => $1)
         WHERE p.status = 'published' AND p.published_at IS NOT NULL AND ${SANDBOX_POST}`,
        [sec],
      );
      await db.query(
        `UPDATE snapshots s SET taken_at = taken_at - make_interval(secs => $1)
         FROM posts p WHERE p.id = s.post_id AND ${SANDBOX_POST}`,
        [sec],
      );
      await db.query(
        `UPDATE snapshot_jobs j SET due_at = due_at - make_interval(secs => $1)
         FROM posts p WHERE p.id = j.post_id AND j.done_at IS NULL AND ${SANDBOX_POST}`,
        [sec],
      );
      // Instagram/Threads posts still processing: let the next check happen now.
      await db.query(
        `UPDATE posts SET next_check_at = next_check_at - make_interval(secs => $1) WHERE status = 'pending' AND next_check_at IS NOT NULL`,
        [sec],
      );
    };

    // Instagram/Threads posts still processing go live before the clock moves, so their curves start now.
    await db.query(`UPDATE posts SET next_check_at = now() WHERE status = 'pending' AND next_check_at > now()`);
    await tick(workerDeps);

    let remaining = hours * 3600;
    for (let step = 0; step < 500 && remaining > 0; step++) {
      const [next] = await db.query<{ wait: number | null }>(
        `SELECT EXTRACT(EPOCH FROM (min(j.due_at) - now()))::float8 AS wait
         FROM snapshot_jobs j JOIN posts p ON p.id = j.post_id WHERE j.done_at IS NULL AND ${SANDBOX_POST}`,
      );
      const wait = next?.wait == null ? Infinity : Math.max(0, Number(next.wait));
      const sec = Math.min(remaining, wait + 1);
      await shift(sec);
      remaining -= sec;
      await tick(workerDeps);
    }
    // Catch any jobs that became due in the last step.
    for (let i = 0; i < 20; i++) {
      const [due] = await db.query(`SELECT 1 FROM snapshot_jobs WHERE done_at IS NULL AND due_at <= now() LIMIT 1`);
      if (!due) break;
      await tick(workerDeps);
    }
    const [{ n: snapsAfter } = { n: 0 }] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM snapshots');
    return c.json({ hours, shiftedPosts: Number(posts), snapshotsTaken: Number(snapsAfter) - Number(snapsBefore) });
  });
}
