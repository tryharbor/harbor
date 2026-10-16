import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { cors } from 'hono/cors';
import { HarborError, newId } from '@harbor/core';
import { createModel, modelModeFromEnv, type ContentModel, type ModelMode } from '@harbor/ai';
import { createProviderRegistry, createSandboxRegistry, type ProviderRegistry } from '@harbor/providers';
import type { Db } from './db/client.ts';
import { LocalDiskStore, type MediaStore } from './lib/media-store.ts';
import { publishModeFromEnv, sandboxSecretKey, type PublishMode } from './lib/modes.ts';
import { SecretStore } from './lib/secrets.ts';
import { registerAgentRuns } from './routes/agent-runs.ts';
import { registerApiKeys } from './routes/api-keys.ts';
import { registerApprovals } from './routes/approvals.ts';
import { registerAutomations } from './routes/automations.ts';
import { registerBrands } from './routes/brands.ts';
import { registerCampaigns } from './routes/campaigns.ts';
import { registerChannels } from './routes/channels.ts';
import { registerCompetitors } from './routes/competitors.ts';
import { registerDrafts } from './routes/drafts.ts';
import { registerIdeas } from './routes/ideas.ts';
import { registerInsights } from './routes/insights.ts';
import { registerMedia } from './routes/media.ts';
import { registerMcp } from './routes/mcp.ts';
import { registerMemory } from './routes/memory.ts';
import { registerPosts } from './routes/posts.ts';
import { registerReplies } from './routes/replies.ts';
import { registerSandbox } from './routes/sandbox.ts';
import { offlineResolveHost, resolvePublicHost, type HostResolver } from './services/media.ts';
import type { PublishDeps } from './services/publisher.ts';
import type { WorkerDeps } from './worker.ts';

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
  /** Media library files. Defaults to the local disk under HARBOR_MEDIA_DIR (apps/api/.media). */
  mediaStore?: MediaStore;
  /** Used to import media from a URL. Tests inject a fake; defaults to the global fetch. */
  fetch?: typeof fetch;
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
  mediaStore: MediaStore;
  fetch: typeof fetch;
  /** Checks a from-url host is public. Tests that inject `fetch` get a stand-in that only rejects private literals. */
  resolveHost: HostResolver;
  publishDeps: () => PublishDeps;
  /** What the worker needs: publishing plus the model for automations. */
  workerDeps: () => WorkerDeps;
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
    mediaStore: opts.mediaStore ?? new LocalDiskStore(),
    fetch: opts.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    resolveHost: opts.fetch ? offlineResolveHost : resolvePublicHost,
    publishDeps: () => ({ db, registry, secrets: secrets() }),
    workerDeps: () => ({ db, registry, secrets: secrets(), agents: { db, model, registry, publishMode, modelMode } }),
  };
}

export function createApp(db: Db, opts: AppOptions = {}, deps: AppDeps = createDeps(db, opts)): App {
  const app: App = new Hono<{ Variables: Vars }>();

  app.use('*', async (c, next) => {
    c.set('requestId', newId('request'));
    await next();
    c.header('Harbor-Request-Id', c.get('requestId'));
  });
  // Until Harbor has user auth, /v1 is only for this machine. Requests that arrive through a tunnel or proxy (a
  // non-local Host, or X-Forwarded-For) only reach what the outside world needs: OAuth callbacks, public media
  // (platforms download it), /mcp (API keys) and /health. HARBOR_PUBLIC_API=all turns this off (behind real auth).
  if (process.env.HARBOR_PUBLIC_API !== 'all') app.use('*', publicGate);

  // /mcp is for agents, not browsers, so it stays out of the web app's CORS rule (and authenticates with API keys).
  // So do the public /media URLs, which platforms download.
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
  registerApprovals(app, deps);
  registerAutomations(app, deps);
  registerApiKeys(app, deps);
  registerMemory(app, deps);
  registerReplies(app, deps);
  registerMedia(app, deps);
  registerMcp(app, deps);
  return app;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const PUBLIC_ROUTES: { methods: string[]; path: RegExp }[] = [
  { methods: ['GET', 'HEAD'], path: /^\/health$/ },
  { methods: ['GET', 'HEAD'], path: /^\/media\/[^/]+\/[^/]+$/ },
  { methods: ['GET'], path: /^\/v1\/channels\/[a-z]+\/callback$/ },
  { methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], path: /^\/mcp$/ },
];

/** True when a request came from outside this machine (through ngrok, a proxy or a public hostname). */
export function isPublicRequest(headers: Headers): boolean {
  if (headers.get('x-forwarded-for') || headers.get('forwarded')) return true;
  const host = (headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  return host !== '' && !LOCAL_HOSTS.has(host);
}

const publicGate = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  if (!isPublicRequest(c.req.raw.headers)) return next();
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_ROUTES.some((r) => r.methods.includes(c.req.method) && r.path.test(path))) return next();
  return c.json({ error: new HarborError('NOT_FOUND', 'Not available on the public address. Use Harbor from this machine.').toBody(c.get('requestId')) }, 404);
});
