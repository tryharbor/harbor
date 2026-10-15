import { advancePending, publishPost, sweepStalePublishing, takeSnapshot, type PublishDeps } from './services/publisher.ts';

/**
 * The background loop: publishes due posts, moves 'pending' posts forward and takes due growth-curve snapshots.
 * All state lives in Postgres rows (posts, snapshot_jobs), so the loop is durable across restarts and works the
 * same on PGlite and real Postgres. Each step claims its row with an UPDATE … RETURNING, so two processes never
 * act on the same post.
 */
export async function tick(deps: PublishDeps): Promise<void> {
  const { db } = deps;
  await sweepStalePublishing(db);

  const due = await db.query<{ id: string }>(
    `SELECT id FROM posts WHERE status = 'scheduled' AND (scheduled_for IS NULL OR scheduled_for <= now())
     ORDER BY scheduled_for NULLS FIRST LIMIT 10`,
  );
  for (const { id } of due) await safely('publish', id, () => publishPost(deps, id));

  const pending = await db.query<{ id: string }>(
    `SELECT id FROM posts WHERE status = 'pending' AND next_check_at <= now() ORDER BY next_check_at LIMIT 10`,
  );
  for (const { id } of pending) await safely('pending', id, () => advancePending(deps, id));

  const snaps = await db.query<{ post_id: string; age_hours: number }>(
    `SELECT post_id, age_hours FROM snapshot_jobs WHERE done_at IS NULL AND due_at <= now() ORDER BY due_at LIMIT 20`,
  );
  for (const s of snaps) await safely('snapshot', s.post_id, () => takeSnapshot(deps, s.post_id, Number(s.age_hours)));
}

async function safely(step: string, id: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[worker] ${step} ${id}:`, err instanceof Error ? err.message : err);
  }
}

/** Run tick() every `intervalMs` (never overlapping). Returns a stop function. */
export function startWorker(deps: PublishDeps, intervalMs = 15_000): () => Promise<void> {
  let running: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (running) return;
    running = tick(deps).finally(() => (running = undefined));
  }, intervalMs);
  return async () => {
    clearInterval(timer);
    await running;
  };
}
