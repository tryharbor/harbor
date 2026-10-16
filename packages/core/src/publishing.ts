import type { ChannelAccount, PostPart } from './domain.ts';
import type { MetricAvailabilityMap, NormalizedMetrics, Platform } from './metrics.ts';

/**
 * The contract every social platform adapter implements. The shape (OAuth helpers, validate, publish →
 * checkStatus → finalize for async platforms, typed failures) was informed by studying how Postiz publishes.
 * This is original code; no Postiz source is used.
 */

export type JsonObject = Record<string, unknown>;

/** OAuth app credentials for a provider, from env (X_CLIENT_ID etc.). */
export interface ProviderAppConfig {
  clientId?: string;
  clientSecret?: string;
  /** Where the platform redirects after consent, e.g. http://localhost:4800/v1/channels/x/callback */
  redirectUri?: string;
}

export interface AuthUrl {
  url: string;
  /** PKCE verifier to keep server-side until the callback. */
  codeVerifier: string;
  state: string;
}

export interface AuthCallback {
  code: string;
  codeVerifier: string;
  state?: string;
}

export interface TokenSet {
  accessToken: string;
  /**
   * What to pass to refreshToken() later. Absent = the token can't be refreshed (LinkedIn without partner access):
   * the owner reconnects when it expires. Instagram and Threads refresh long-lived tokens with the access token
   * itself, so their providers set this to the access token.
   */
  refreshToken?: string;
  /** ISO timestamp; absent when the token doesn't expire. */
  expiresAt?: string;
  scopes: string[];
  account: ChannelAccount;
}

/** What a provider call needs about the channel it acts for. */
export interface ProviderContext {
  accessToken: string;
  account: ChannelAccount;
  /** Per-platform publish options (e.g. Instagram post type), validated by the provider. */
  settings?: JsonObject;
}

export type ValidationResult = { ok: true } | { ok: false; issues: string[] };

export interface PublishRequest {
  /** First part is the post; further parts are thread replies / first comments. */
  parts: PostPart[];
  /** Harbor post id, for idempotency keys and logs. */
  postId: string;
}

/**
 * `published`: live on the platform. `pending`: the platform accepted it but is still processing (e.g. Instagram
 * containers); poll checkStatus() with `pendingData`, then finalize().
 */
export type PublishResult =
  | { status: 'published'; platformPostId: string; url?: string; pendingData?: undefined }
  | { status: 'pending'; platformPostId?: string; url?: undefined; pendingData: JsonObject };

export type StatusCheck =
  | { status: 'pending'; pendingData: JsonObject }
  | { status: 'ready'; pendingData: JsonObject }
  | { status: 'published'; platformPostId: string; url?: string };

export interface CommentRequest {
  /** The platform id of the post (or previous reply) to answer. */
  replyToPlatformPostId: string;
  part: PostPart;
}

export interface PostMetrics {
  raw: unknown;
  metrics: NormalizedMetrics;
  adapterVersion: string;
}

/** One reply (comment) on a published post, as the platform reports it. */
export interface Reply {
  platformReplyId: string;
  author: { handle: string; displayName?: string };
  text: string;
  /** ISO timestamp. */
  createdAt: string;
  likes?: number;
}

/** One post from the account's own history (import past posts). */
export interface PastPost {
  platformPostId: string;
  /** The first part's text. */
  text: string;
  /** Every part's text, when the platform returns a thread. */
  parts?: string[];
  /** ISO timestamp. */
  publishedAt: string;
  url?: string;
  /** What the platform reports now, at the post's true age. */
  metrics?: NormalizedMetrics;
}

export interface PlatformProvider {
  readonly identifier: Platform;
  readonly name: string;
  /** OAuth scopes requested at connect time. */
  readonly scopes: readonly string[];
  /** Which normalized metrics fetchPostMetrics() can fill. */
  readonly metrics: MetricAvailabilityMap;
  /** Bumped whenever raw → normalized mapping changes; stored on every snapshot. */
  readonly adapterVersion: string;
  /** Max publishes in flight for this platform (queue concurrency). */
  readonly maxConcurrentJobs: number;
  /** Whether fetchReplies() returns the post's replies (X only with HARBOR_X_READ_REPLIES=true, since X bills reads). */
  readonly reportsReplies: boolean;

  maxLength(settings?: JsonObject): number;
  validate(parts: PostPart[], settings?: JsonObject): ValidationResult;

  generateAuthUrl(): Promise<AuthUrl>;
  authenticate(callback: AuthCallback): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;

  publish(ctx: ProviderContext, req: PublishRequest): Promise<PublishResult>;
  checkStatus(ctx: ProviderContext, pendingData: JsonObject): Promise<StatusCheck>;
  finalize(ctx: ProviderContext, pendingData: JsonObject): Promise<Extract<PublishResult, { status: 'published' }>>;

  comment?(ctx: ProviderContext, req: CommentRequest): Promise<{ platformPostId: string; url?: string }>;
  fetchPostMetrics?(ctx: ProviderContext, platformPostId: string): Promise<PostMetrics>;
  /** Replies to a published post, newest first where the platform orders them. */
  fetchReplies?(ctx: ProviderContext, platformPostId: string, opts: { limit?: number }): Promise<Reply[]>;
  /** The account's own recent posts, newest first. */
  listRecentPosts?(ctx: ProviderContext, opts: { limit: number }): Promise<PastPost[]>;
}

// ---- Typed provider failures ----

export type ProviderFailureKind =
  | 'refresh_needed'
  | 'disconnect'
  | 'bad_request'
  | 'published_with_error'
  | 'rate_limited'
  | 'outcome_unknown';

export abstract class ProviderError extends Error {
  abstract readonly kind: ProviderFailureKind;
  constructor(readonly platform: Platform, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Token expired or revoked; refresh it (or ask the owner to reconnect) and try again. */
export class RefreshNeeded extends ProviderError {
  readonly kind = 'refresh_needed' as const;
}

/** The platform refuses this channel permanently (app removed, account banned). Mark it disconnected. */
export class Disconnect extends ProviderError {
  readonly kind = 'disconnect' as const;
}

/** The platform rejected the content or request. Retrying the same request won't help. */
export class BadRequest extends ProviderError {
  readonly kind = 'bad_request' as const;
  constructor(platform: Platform, message: string, readonly details?: unknown) {
    super(platform, message);
  }
}

/** The post is live but a secondary step failed (thumbnail, first comment). Never republish. */
export class PublishedWithError extends ProviderError {
  readonly kind = 'published_with_error' as const;
  constructor(platform: Platform, message: string, readonly platformPostId: string, readonly url?: string) {
    super(platform, message);
  }
}

/** The platform said "slow down" before accepting anything. Safe to retry after `retryAfterSec`. */
export class RateLimited extends ProviderError {
  readonly kind = 'rate_limited' as const;
  constructor(platform: Platform, message: string, readonly retryAfterSec?: number) {
    super(platform, message);
  }
}

/** The request may or may not have created a post (timeout, 5xx, dropped connection). */
export class PublishOutcomeUnknown extends ProviderError {
  readonly kind = 'outcome_unknown' as const;
}

export type PublishFailureAction =
  /** Nothing was published; retry later (after a delay). */
  | { action: 'retry'; afterSec?: number }
  /** Nothing was published; refresh the token, then retry. */
  | { action: 'refresh_then_retry' }
  /** Nothing was published and retrying won't help. */
  | { action: 'fail'; disconnect: boolean }
  /** The post is live; record it and surface the secondary error. */
  | { action: 'mark_published'; platformPostId: string; url?: string }
  /** We don't know whether it went out. Stop and ask a human. */
  | { action: 'needs_human' };

/**
 * Decide what to do after a publish() call throws.
 *
 * The rule: **never auto-retry a publish whose outcome is unknown.** A retry is only allowed when the failure proves
 * the platform did not accept the post (rate limit, expired token). Anything we can't classify, including plain
 * network errors and timeouts, is treated as "may have published" and handed to a human, because a duplicate post
 * is worse than a late one.
 */
export function classifyPublishFailure(err: unknown): PublishFailureAction {
  if (err instanceof RateLimited) return { action: 'retry', afterSec: err.retryAfterSec };
  if (err instanceof RefreshNeeded) return { action: 'refresh_then_retry' };
  if (err instanceof BadRequest) return { action: 'fail', disconnect: false };
  if (err instanceof Disconnect) return { action: 'fail', disconnect: true };
  if (err instanceof PublishedWithError) return { action: 'mark_published', platformPostId: err.platformPostId, url: err.url };
  return { action: 'needs_human' };
}

export function canAutoRetryPublish(err: unknown): boolean {
  const { action } = classifyPublishFailure(err);
  return action === 'retry' || action === 'refresh_then_retry';
}
