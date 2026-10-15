import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HarborError, newId } from '@harbor/core';
import { createProviderRegistry, type ProviderRegistry } from '@harbor/providers';
import type { Db } from './db/client.ts';
import { SecretStore } from './lib/secrets.ts';
import { registerBrands } from './routes/brands.ts';
import { registerChannels } from './routes/channels.ts';
import { registerPosts } from './routes/posts.ts';
import type { PublishDeps } from './services/publisher.ts';

export type Vars = { requestId: string };
export type App = Hono<{ Variables: Vars }>;

export interface AppOptions {
  /** Origins allowed to call the API from a browser (the web app). */
  corsOrigins?: string[];
  /** Platform adapters. Defaults to the real ones, configured from env. */
  registry?: ProviderRegistry;
  /** Token encryption key (base64, 32 bytes). Defaults to HARBOR_SECRET_KEY. */
  secretKey?: string;
  /** Where the browser goes back to after connecting a channel. */
  webUrl?: string;
}

/** What routes share. `secrets()` is lazy so brand routes work before HARBOR_SECRET_KEY is set. */
export interface AppDeps {
  db: Db;
  registry: ProviderRegistry;
  secrets: () => SecretStore;
  webUrl: string;
  publishDeps: () => PublishDeps;
}

export function createDeps(db: Db, opts: AppOptions = {}): AppDeps {
  const registry = opts.registry ?? createProviderRegistry();
  let store: SecretStore | undefined;
  const secrets = () => (store ??= new SecretStore(db, opts.secretKey ?? process.env.HARBOR_SECRET_KEY));
  return {
    db,
    registry,
    secrets,
    webUrl: opts.webUrl ?? process.env.HARBOR_WEB_URL ?? 'http://localhost:4801',
    publishDeps: () => ({ db, registry, secrets: secrets() }),
  };
}

export function createApp(db: Db, opts: AppOptions = {}, deps: AppDeps = createDeps(db, opts)): App {
  const app: App = new Hono<{ Variables: Vars }>();

  app.use('*', async (c, next) => {
    c.set('requestId', newId('request'));
    await next();
    c.header('Harbor-Request-Id', c.get('requestId'));
  });
  app.use('/v1/*', cors({ origin: opts.corsOrigins ?? [deps.webUrl] }));

  app.onError((err, c) => {
    const requestId = c.get('requestId');
    if (err instanceof HarborError) return c.json({ error: err.toBody(requestId) }, err.status as 400);
    console.error(requestId, err);
    return c.json({ error: new HarborError('INTERNAL_ERROR', 'Something went wrong on our side.').toBody(requestId) }, 500);
  });
  app.notFound((c) =>
    c.json({ error: new HarborError('NOT_FOUND', `No route for ${c.req.method} ${c.req.path}.`).toBody(c.get('requestId')) }, 404),
  );

  app.get('/health', async (c) => {
    await db.query('SELECT 1');
    return c.json({ ok: true, db: db.kind });
  });

  registerBrands(app, db);
  registerChannels(app, deps);
  registerPosts(app, deps);
  return app;
}
