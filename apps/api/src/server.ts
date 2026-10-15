import { serve } from '@hono/node-server';
import { createApp, createDeps } from './app.ts';
import { openDb } from './db/client.ts';
import { startWorker } from './worker.ts';

const port = Number(process.env.HARBOR_API_PORT ?? 4800);
const db = await openDb();
const deps = createDeps(db);
const app = createApp(db, { corsOrigins: [deps.webUrl] }, deps);

// The worker publishes scheduled posts and takes growth-curve snapshots. It needs the token key.
let stopWorker: (() => Promise<void>) | undefined;
try {
  stopWorker = startWorker(deps.publishDeps());
} catch (err) {
  console.warn(`Background worker off: ${err instanceof Error ? err.message : err}`);
}

const server = serve({ fetch: app.fetch, port }, () => console.log(`Harbor API on http://localhost:${port} (${db.kind})`));

const shutdown = async () => {
  server.close();
  await stopWorker?.();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
