import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
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
import { registerMetaCallbacks, type MetaPlatform } from './routes/meta-callbacks.ts';
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
  /** Bearer token every /v1 request must carry (production). Defaults to HARBOR_INTERNAL_TOKEN; unset = local-only gate. */
  internalToken?: string;
  /** Secrets that sign Meta's deauthorize and data deletion callbacks. Defaults to INSTAGRAM_APP_SECRET / THREADS_APP_SECRET. */
  metaAppSecrets?: Partial<Record<MetaPlatform, string[]>>;
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
  /** Checks Meta's signed_request on the deauthorize and data deletion callbacks. */
  metaAppSecrets: Record<MetaPlatform, string[]>;
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
    metaAppSecrets: {
      instagram: opts.metaAppSecrets?.instagram ?? [process.env.INSTAGRAM_APP_SECRET ?? ''].filter(Boolean),
      threads: opts.metaAppSecrets?.threads ?? [process.env.THREADS_APP_SECRET ?? ''].filter(Boolean),
    },
  };
}

export function createApp(db: Db, opts: AppOptions = {}, deps: AppDeps = createDeps(db, opts)): App {
  const app: App = new Hono<{ Variables: Vars }>();

  app.use('*', async (c, next) => {
    c.set('requestId', newId('request'));
    await next();
    c.header('Harbor-Request-Id', c.get('requestId'));
  });
  // With HARBOR_INTERNAL_TOKEN set (production), every /v1 request needs it as a bearer token: only the web app's
  // server side holds it. Without it, /v1 is only for this machine. Requests that arrive through a tunnel or proxy
  // (a non-local Host, or X-Forwarded-For) only reach what the outside world needs: OAuth callbacks, Meta's
  // deauthorize and data deletion callbacks (signed) and their status pages, public media (platforms download it),
  // /mcp (API keys) and /health. HARBOR_PUBLIC_API=all turns that gate off.
  const internalToken = opts.internalToken ?? process.env.HARBOR_INTERNAL_TOKEN;
  if (!internalToken && process.env.HARBOR_PUBLIC_API !== 'all') app.use('*', publicGate);

  // /mcp is for agents, not browsers, so it stays out of the web app's CORS rule (and authenticates with API keys).
  // So do the public /media URLs, which platforms download. In production the browser never calls /v1 (the web app
  // proxies), so this only matters locally. It runs before the token check so preflights get their answer.
  app.use('/v1/*', cors({ origin: opts.corsOrigins ?? [deps.webUrl] }));
  if (internalToken) app.use('/v1/*', internalAuth(internalToken));

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
  registerMetaCallbacks(app, deps);
  return app;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const PUBLIC_ROUTES: { methods: string[]; path: RegExp }[] = [
  { methods: ['GET', 'HEAD'], path: /^\/health$/ },
  { methods: ['GET', 'HEAD'], path: /^\/media\/[^/]+\/[^/]+$/ },
  { methods: ['GET'], path: /^\/v1\/channels\/[a-z]+\/callback$/ },
  { methods: ['POST'], path: /^\/v1\/channels\/(instagram|threads)\/(deauthorize|data-deletion)$/ },
  { methods: ['GET', 'HEAD'], path: /^\/data-deletion\/[^/]+$/ },
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

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Uploads go from the browser straight to the API (a web-app proxy would cap them at the host's body limit, 4.5 MB on
 * Vercel). The web app signs a short-lived ticket for one brand with the internal token: `<exp ms>.<HMAC>`.
 */
const ticketMac = (token: string, brandId: string, exp: number) => createHmac('sha256', token).update(`upload:${brandId}:${exp}`).digest('base64url');
export const createUploadTicket = (token: string, brandId: string, now = Date.now(), ttlMs = 10 * 60_000) => {
  const exp = now + ttlMs;
  return `${exp}.${ticketMac(token, brandId, exp)}`;
};
export function hasUploadTicket(headers: Headers, token: string, brandId: string, now = Date.now()): boolean {
  const [expRaw, mac] = (headers.get('harbor-upload-ticket') ?? '').split('.');
  const exp = Number(expRaw);
  if (!mac || !Number.isFinite(exp) || exp <= now) return false;
  return timingSafeEqual(digest(mac), digest(ticketMac(token, brandId, exp)));
}
const UPLOAD_PATH = /^\/v1\/brands\/([^/]+)\/media$/;

/** True when `Authorization: Bearer <token>` carries `expected`. Compares digests, so neither length nor content leaks timing. */
export function hasBearerToken(headers: Headers, expected: string): boolean {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(headers.get('authorization') ?? '');
  return !!m && timingSafeEqual(digest(m[1]), digest(expected));
}

/**
 * /v1 behind HARBOR_INTERNAL_TOKEN. The public routes under /v1 stay open: OAuth callbacks (their state protects them)
 * and Meta's callbacks (Meta's signature does).
 */
const internalAuth = (token: string) =>
  createMiddleware<{ Variables: Vars }>(async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (PUBLIC_ROUTES.some((r) => r.methods.includes(c.req.method) && r.path.test(path))) return next();
    if (hasBearerToken(c.req.raw.headers, token)) return next();
    const upload = c.req.method === 'POST' ? UPLOAD_PATH.exec(path) : null;
    if (upload && hasUploadTicket(c.req.raw.headers, token, decodeURIComponent(upload[1]))) return next();
    return c.json({ error: new HarborError('UNAUTHORIZED', 'Send the internal API token: Authorization: Bearer <HARBOR_INTERNAL_TOKEN>.').toBody(c.get('requestId')) }, 401);
  });
