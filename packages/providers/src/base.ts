import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequest,
  HarborError,
  PLATFORM_METRICS,
  PublishOutcomeUnknown,
  RateLimited,
  RefreshNeeded,
  checkMedia,
  mimeFromUrl,
  platformTextLength,
  type AuthCallback,
  type AuthUrl,
  type JsonObject,
  type MetricAvailabilityMap,
  type Platform,
  type PlatformProvider,
  type PostPart,
  type ProviderAppConfig,
  type ProviderContext,
  type ProviderError,
  type PublishRequest,
  type PublishResult,
  type StatusCheck,
  type TokenSet,
  type ValidationResult,
} from '@harbor/core';

export type FetchLike = typeof fetch;

/** App credentials plus adapter knobs that don't belong in core (test hooks, API version pins). */
export interface ProviderOptions extends ProviderAppConfig {
  /** Used between status polls (Threads replies, carousel children). Tests inject a no-op. */
  sleep?: (ms: number) => Promise<void>;
  /** X only: read replies and the account's past posts. Off unless HARBOR_X_READ_REPLIES=true, since X bills per read. */
  readReplies?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  /** Appended to the URL. Values that are undefined are skipped. */
  query?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  /** Sent as `Authorization: Bearer …`. */
  bearer?: string;
  json?: unknown;
  form?: Record<string, string | undefined>;
  body?: BodyInit;
  /**
   * True only for the call that actually makes a post live (X/LinkedIn create, Meta *_publish). A 5xx, timeout or
   * dropped connection on such a call becomes PublishOutcomeUnknown instead of a retryable Error.
   */
  mutating?: boolean;
  timeoutMs?: number;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

/** A transient, non-publishing failure (5xx or network error on a read). Callers may retry it. */
export class ProviderHttpError extends Error {
  constructor(message: string, readonly status?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderHttpError';
  }
}

// ---- small helpers ----

const b64url = (buf: Buffer) => buf.toString('base64url');

/** PKCE (RFC 7636) S256 verifier/challenge pair. */
export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = b64url(randomBytes(32));
  const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function randomState(): string {
  return b64url(randomBytes(24));
}

export function expiresAtFrom(expiresIn: unknown, now = Date.now()): string | undefined {
  const sec = typeof expiresIn === 'string' ? Number(expiresIn) : expiresIn;
  return typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? new Date(now + sec * 1000).toISOString() : undefined;
}

export function splitScopes(scope: unknown, fallback: readonly string[]): string[] {
  if (Array.isArray(scope)) return scope.map(String).filter(Boolean);
  if (typeof scope === 'string' && scope.trim()) return scope.split(/[\s,]+/).filter(Boolean);
  return [...fallback];
}

export const asRecord = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? (v as Record<string, any>) : {});

export const optionalString = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/** A platform timestamp (ISO, or Meta's "+0000" offset form) as ISO; `fallback` when it doesn't parse. */
export function isoTime(v: unknown, fallback = new Date().toISOString()): string {
  if (typeof v !== 'string' && typeof v !== 'number') return fallback;
  const t = typeof v === 'number' ? v : Date.parse(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

/** A non-negative finite number, else undefined. */
export const optionalCount = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Only keeps a URL that core's channelAccountSchema would accept. */
export function optionalUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    new URL(v);
    return v;
  } catch {
    return undefined;
  }
}

/** Pull a human-readable message out of the various platform error bodies. */
export function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body.trim().slice(0, 300) || undefined;
  const b = asRecord(body);
  const err = asRecord(b.error);
  const firstX = Array.isArray(b.errors) ? asRecord(b.errors[0]) : {};
  const candidates = [
    err.error_user_msg,
    err.message, // Meta Graph
    b.error_message, // Instagram OAuth
    b.error_description, // OAuth 2.0
    b.detail, // X problem+json
    firstX.message ?? firstX.detail,
    b.message, // LinkedIn
    b.title,
    typeof b.error === 'string' ? b.error : undefined,
  ];
  return candidates.find((c): c is string => typeof c === 'string' && c.length > 0);
}

/** Seconds to wait, from Retry-After (seconds or HTTP date) or x-rate-limit-reset (epoch seconds). */
export function parseRetryAfter(headers: Headers, now = Date.now()): number | undefined {
  const ra = headers.get('retry-after');
  if (ra) {
    const n = Number(ra);
    if (Number.isFinite(n)) return Math.max(0, Math.ceil(n));
    const at = Date.parse(ra);
    if (!Number.isNaN(at)) return Math.max(0, Math.ceil((at - now) / 1000));
  }
  const reset = headers.get('x-rate-limit-reset');
  if (reset && Number.isFinite(Number(reset))) return Math.max(0, Math.ceil(Number(reset) - now / 1000));
  return undefined;
}

/** "POST graph.instagram.com/v23.0/123/media" — never includes the query string (tokens live there on Meta). */
function describe(method: string, url: string): string {
  try {
    const u = new URL(url);
    return `${method} ${u.host}${u.pathname}`;
  } catch {
    return method;
  }
}

/**
 * Shared scaffolding for the platform adapters: local validation, OAuth helpers and an HTTP client that maps
 * platform responses onto the typed failures in @harbor/core.
 */
export abstract class BaseProvider implements PlatformProvider {
  abstract readonly identifier: Platform;
  abstract readonly name: string;
  abstract readonly scopes: readonly string[];
  readonly adapterVersion: string = '1.0.0';
  readonly maxConcurrentJobs: number = 1;
  /** Platforms that let Harbor read replies override this. */
  readonly reportsReplies: boolean = false;
  /** Max media items per part the adapter can publish; validate() checks core MEDIA_RULES. */
  protected readonly maxMedia: number = 4;
  /** Platforms like Instagram can't publish text alone. */
  protected readonly requiresMedia: boolean = false;
  /** Env var names shown when credentials are missing, e.g. ['X_CLIENT_ID', 'X_CLIENT_SECRET']. */
  protected abstract readonly envNames: readonly [string, string];
  protected readonly sleep: (ms: number) => Promise<void>;

  constructor(
    protected readonly config: ProviderOptions = {},
    protected readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    this.sleep = config.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get metrics(): MetricAvailabilityMap {
    return PLATFORM_METRICS[this.identifier];
  }

  abstract maxLength(settings?: JsonObject): number;

  validate(parts: PostPart[], settings?: JsonObject): ValidationResult {
    const issues: string[] = [];
    const max = this.maxLength(settings);
    if (parts.length === 0) issues.push('A post needs at least one part.');
    parts.forEach((p, i) => {
      const where = parts.length > 1 ? `Part ${i + 1}: ` : '';
      const length = platformTextLength(this.identifier, p.text);
      if (length > max) issues.push(`${where}${this.name} allows ${max} characters, got ${length}.`);
      if (!p.text.trim() && p.media.length === 0) issues.push(`${where}empty.`);
      // The platform's media rules (core MEDIA_RULES). A bare URL only tells us the kind and, from its extension,
      // the type; the API checks library assets' sizes and dimensions before it gets here.
      if (p.media.length) {
        const items = p.media.map((m) => ({ kind: m.kind, mime: mimeFromUrl(m.url) }));
        for (const issue of checkMedia(this.identifier, items).issues) if (issue.level === 'fail') issues.push(`${where}${issue.message}`);
      }
    });
    if (this.requiresMedia && (parts[0]?.media.length ?? 0) === 0) issues.push(`${this.name} posts need an image or video.`);
    return issues.length ? { ok: false, issues } : { ok: true };
  }

  abstract generateAuthUrl(): Promise<AuthUrl>;
  abstract authenticate(callback: AuthCallback): Promise<TokenSet>;
  abstract refreshToken(refreshToken: string): Promise<TokenSet>;
  abstract publish(ctx: ProviderContext, req: PublishRequest): Promise<PublishResult>;

  /** Synchronous platforms never return `pending`, so the async steps are errors there. */
  async checkStatus(_ctx: ProviderContext, _pendingData: JsonObject): Promise<StatusCheck> {
    throw new Error(`${this.name} publishes synchronously; there is no pending status to check.`);
  }
  async finalize(_ctx: ProviderContext, _pendingData: JsonObject): Promise<Extract<PublishResult, { status: 'published' }>> {
    throw new Error(`${this.name} publishes synchronously; there is nothing to finalize.`);
  }

  // ---- OAuth helpers ----

  protected requireApp(): { clientId: string; clientSecret: string; redirectUri: string } {
    const { clientId, clientSecret, redirectUri } = this.config;
    if (!clientId || !clientSecret) {
      throw new HarborError('INVALID_REQUEST', `${this.name} isn't configured. Set ${this.envNames[0]} and ${this.envNames[1]} in .env.`);
    }
    if (!redirectUri) {
      throw new HarborError('INVALID_REQUEST', `${this.name} has no OAuth redirect URI. Set HARBOR_API_URL in .env.`);
    }
    return { clientId, clientSecret, redirectUri };
  }

  // ---- HTTP ----

  /** Hook for platform-specific error codes that don't line up with HTTP status (e.g. Meta code 190). */
  protected mapPlatformError(_status: number, _body: unknown, _message: string): ProviderError | undefined {
    return undefined;
  }

  protected async request<T = any>(req: HttpRequest): Promise<HttpResponse<T>> {
    const method = req.method ?? (req.json !== undefined || req.form || req.body ? 'POST' : 'GET');
    const url = new URL(req.url);
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
    const headers: Record<string, string> = { accept: 'application/json', ...req.headers };
    if (req.bearer) headers.authorization = `Bearer ${req.bearer}`;
    let body: BodyInit | undefined = req.body;
    if (req.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(req.json);
    } else if (req.form) {
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(req.form)) if (v !== undefined) form.set(k, v);
      body = form;
    }
    const what = describe(method, url.toString());

    let res: Response;
    let text: string;
    try {
      const doFetch = this.fetchImpl;
      res = await doFetch(url, { method, headers, body, signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS) });
      text = await res.text();
    } catch (cause) {
      const timedOut = cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
      const msg = `${this.name} ${what} ${timedOut ? 'timed out' : 'failed (network error)'}`;
      if (req.mutating) throw new PublishOutcomeUnknown(this.identifier, `${msg}; the post may or may not have been published.`, { cause });
      throw new ProviderHttpError(msg, undefined, { cause });
    }

    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (res.ok) return { status: res.status, headers: res.headers, data: data as T };
    throw this.toError(res.status, res.headers, data, what, !!req.mutating);
  }

  protected toError(status: number, headers: Headers, body: unknown, what: string, mutating: boolean): Error {
    const platformMessage = extractErrorMessage(body) ?? 'no error message';
    const message = `${this.name} ${what} failed (${status}): ${platformMessage}`;
    const specific = this.mapPlatformError(status, body, message);
    if (specific) return specific;
    if (status === 401) return new RefreshNeeded(this.identifier, message);
    if (status === 429) return new RateLimited(this.identifier, message, parseRetryAfter(headers));
    if (status >= 400 && status < 500) return new BadRequest(this.identifier, message, { status, response: body });
    if (mutating) return new PublishOutcomeUnknown(this.identifier, `${message}; the post may or may not have been published.`);
    return new ProviderHttpError(message, status);
  }

  /** Download media from its public URL (X and LinkedIn need the bytes). Not a platform call: no token mapping. */
  protected async fetchMedia(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    let res: Response;
    let bytes: ArrayBuffer;
    try {
      const doFetch = this.fetchImpl;
      res = await doFetch(url, { signal: AbortSignal.timeout(60_000) });
      bytes = await res.arrayBuffer();
    } catch (cause) {
      throw new ProviderHttpError(`Couldn't download media from ${describe('GET', url)}`, undefined, { cause });
    }
    if (res.status >= 400 && res.status < 500) {
      throw new BadRequest(this.identifier, `Couldn't download media from ${describe('GET', url)} (${res.status}).`, { status: res.status });
    }
    if (!res.ok) throw new ProviderHttpError(`Couldn't download media from ${describe('GET', url)} (${res.status}).`, res.status);
    return { bytes, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }
}
