import { serve } from '@hono/node-server';
import { createApp, createDeps } from './app.ts';
import { openDb } from './db/client.ts';
import { startWorker } from './worker.ts';

// HARBOR_API_PORT wins; hosts like Railway set PORT.
const port = Number(process.env.HARBOR_API_PORT || process.env.PORT || 4800);
// openDb applies pending migrations before anything listens (idempotent; HARBOR_AUTO_MIGRATE=0 skips them).
const db = await openDb();
const deps = createDeps(db);
const app = createApp(db, { corsOrigins: [deps.webUrl] }, deps);

// The worker publishes scheduled posts, takes growth-curve snapshots and runs automations. It needs the token key.
let stopWorker: (() => Promise<void>) | undefined;
try {
  stopWorker = startWorker(deps.workerDeps());
} catch (err) {
  console.warn(`Background worker off: ${err instanceof Error ? err.message : err}`);
}

const server = serve({ fetch: app.fetch, port }, () => console.log(`Harbor API on http://localhost:${port} (${db.kind}; publishing: ${deps.publishMode}; model: ${deps.modelMode})`));

const shutdown = async () => {
  server.close();
  await stopWorker?.();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
