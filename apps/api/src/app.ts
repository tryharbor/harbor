import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HarborError, newId } from '@harbor/core';
import { createModel, modelModeFromEnv, type ContentModel, type ModelMode } from '@harbor/ai';
import { createProviderRegistry, createSandboxRegistry, type ProviderRegistry } from '@harbor/providers';
import type { Db } from './db/client.ts';
import { publishModeFromEnv, sandboxSecretKey, type PublishMode } from './lib/modes.ts';
import { SecretStore } from './lib/secrets.ts';
import { registerAgentRuns } from './routes/agent-runs.ts';
import { registerBrands } from './routes/brands.ts';
import { registerCampaigns } from './routes/campaigns.ts';
import { registerChannels } from './routes/channels.ts';
import { registerCompetitors } from './routes/competitors.ts';
import { registerDrafts } from './routes/drafts.ts';
import { registerIdeas } from './routes/ideas.ts';
import { registerInsights } from './routes/insights.ts';
import { registerPosts } from './routes/posts.ts';
import { registerSandbox } from './routes/sandbox.ts';
import type { PublishDeps } from './services/publisher.ts';

export type Vars = { requestId: string };
export type App = Hono<{ Variables: Vars }>;

export interface AppOptions {
  /** Origins allowed to call the API from a browser (the web app). */
  corsOrigins?: string[];
  /** 'sandbox' (default, from HARBOR_PUBLISH_MODE) or 'live'. */
  publishMode?: PublishMode;
  /** Platform adapters. Defaults to sandbox providers in sandbox mode, the real ones (configured from env) in live mode. */
  registry?: ProviderRegistry;
  /** 'simulated' (default, from HARBOR_MODEL) or 'anthropic'. */
  modelMode?: ModelMode;
  /** The content model. Defaults to createModel(env). */
  model?: ContentModel;
  /** Token encryption key (base64, 32 bytes). Defaults to HARBOR_SECRET_KEY (or a dev key in sandbox mode). */
  secretKey?: string;
  /** Where the browser goes back to after connecting a channel. */
  webUrl?: string;
}

/** What routes share. `secrets()` is lazy so brand routes work before HARBOR_SECRET_KEY is set. */
export interface AppDeps {
  db: Db;
  publishMode: PublishMode;
  registry: ProviderRegistry;
  modelMode: ModelMode;
  model: ContentModel;
  secrets: () => SecretStore;
  webUrl: string;
  publishDeps: () => PublishDeps;
}

export function createDeps(db: Db, opts: AppOptions = {}): AppDeps {
  const publishMode = opts.publishMode ?? publishModeFromEnv();
  const registry = opts.registry ?? (publishMode === 'sandbox' ? createSandboxRegistry() : createProviderRegistry());
  const modelMode = opts.modelMode ?? (opts.model ? (opts.model.simulated ? 'simulated' : 'anthropic') : modelModeFromEnv());
  const model = opts.model ?? createModel({ HARBOR_MODEL: modelMode });
  let store: SecretStore | undefined;
  const key = () => opts.secretKey || process.env.HARBOR_SECRET_KEY || (publishMode === 'sandbox' ? sandboxSecretKey() : undefined);
  const secrets = () => (store ??= new SecretStore(db, key()));
  return {
    db,
    publishMode,
    registry,
    modelMode,
    model,
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

  /** Which publishing mode and model are active, so the UI can label sandbox / simulated output. */
  app.get('/v1/mode', (c) => c.json({ publish: deps.publishMode, model: deps.modelMode }));

  registerBrands(app, deps);
  registerCompetitors(app, deps);
  registerChannels(app, deps);
  registerSandbox(app, deps);
  registerPosts(app, deps);
  registerIdeas(app, deps);
  registerDrafts(app, deps);
  registerAgentRuns(app, deps);
  registerCampaigns(app, deps);
  registerInsights(app, deps);
  return app;
}
