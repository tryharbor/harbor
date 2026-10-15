import {
  BadRequest,
  PublishOutcomeUnknown,
  RefreshNeeded,
  type AuthCallback,
  type AuthUrl,
  type CommentRequest,
  type ProviderContext,
  type PublishRequest,
  type PublishResult,
  type TokenSet,
} from '@harbor/core';
import { BaseProvider, asRecord, expiresAtFrom, optionalString, optionalUrl, randomState, splitScopes, type FetchLike, type ProviderOptions } from './base.ts';

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const API = 'https://api.linkedin.com';
export const DEFAULT_LINKEDIN_VERSION = '202601';

export interface LinkedInOptions extends ProviderOptions {
  /** `Linkedin-Version` header (YYYYMM). LinkedIn sunsets versions after about a year. */
  apiVersion?: string;
}

/** Escape LinkedIn "little text" reserved characters so commentary renders literally. */
export function escapeLittleText(text: string): string {
  return text.replace(/[|{}@[\]()<>#\\*_~]/g, '\\$&');
}

/** Commentary for the Posts API: everything escaped, except `#tags`, which become real LinkedIn hashtags. */
export function toCommentary(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(/(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu)) {
    const start = m.index! + m[1]!.length;
    out += escapeLittleText(text.slice(last, start)) + `{hashtag|\\#|${escapeLittleText(m[2]!)}}`;
    last = start + 1 + m[2]!.length;
  }
  return out + escapeLittleText(text.slice(last));
}

/**
 * LinkedIn member posting (REST Posts API) via the self-serve "Share on LinkedIn" and "Sign In with LinkedIn using
 * OpenID Connect" products. No refresh tokens and no post analytics without partner approval. Company pages will be a
 * separate provider.
 */
export class LinkedInProvider extends BaseProvider {
  readonly identifier = 'linkedin' as const;
  readonly name = 'LinkedIn';
  readonly scopes = ['openid', 'profile', 'w_member_social'] as const;
  protected override readonly maxMedia = 20;
  protected readonly envNames = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'] as const;
  readonly apiVersion: string;

  constructor(config: LinkedInOptions = {}, fetchImpl?: FetchLike) {
    super(config, fetchImpl);
    this.apiVersion = config.apiVersion || DEFAULT_LINKEDIN_VERSION;
  }

  maxLength(): number {
    return 3000;
  }

  // ---- OAuth ----

  async generateAuthUrl(): Promise<AuthUrl> {
    const { clientId, redirectUri } = this.requireApp();
    const state = randomState();
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: this.scopes.join(' '), state }).toString();
    return { url: url.toString(), codeVerifier: '', state };
  }

  async authenticate(callback: AuthCallback): Promise<TokenSet> {
    const { clientId, clientSecret, redirectUri } = this.requireApp();
    const { data } = await this.request<Record<string, unknown>>({
      method: 'POST',
      url: TOKEN_URL,
      form: { grant_type: 'authorization_code', code: callback.code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret },
    });
    const accessToken = optionalString(data.access_token);
    if (!accessToken) throw new BadRequest('linkedin', 'LinkedIn token response had no access_token.');
    const { data: me } = await this.request({ url: `${API}/v2/userinfo`, bearer: accessToken });
    const u = asRecord(me);
    if (!u.sub) throw new BadRequest('linkedin', 'LinkedIn /v2/userinfo returned no member id.');
    const sub = String(u.sub);
    return {
      accessToken,
      // Refresh tokens are only issued to partner apps; the owner reconnects when this one expires (~60 days).
      refreshToken: undefined,
      expiresAt: expiresAtFrom(data.expires_in),
      scopes: splitScopes(data.scope, this.scopes),
      account: { platformAccountId: sub, handle: optionalString(u.name) ?? sub, displayName: optionalString(u.name), avatarUrl: optionalUrl(u.picture) },
    };
  }

  async refreshToken(_refreshToken: string): Promise<TokenSet> {
    throw new RefreshNeeded('linkedin', "LinkedIn tokens can't be refreshed; reconnect the channel.");
  }

  // ---- Publishing ----

  private authorUrn(ctx: ProviderContext): string {
    return `urn:li:person:${ctx.account.platformAccountId}`;
  }

  private restHeaders(): Record<string, string> {
    return { 'Linkedin-Version': this.apiVersion, 'X-Restli-Protocol-Version': '2.0.0' };
  }

  async publish(ctx: ProviderContext, req: PublishRequest): Promise<PublishResult> {
    const part = req.parts[0];
    if (!part) throw new BadRequest('linkedin', 'Nothing to publish.');
    if (part.media.length > 1) throw new BadRequest('linkedin', "Multiple images on LinkedIn aren't supported yet.");
    if (part.media.some((m) => m.kind === 'video')) throw new BadRequest('linkedin', "Video on LinkedIn isn't supported yet.");

    const author = this.authorUrn(ctx);
    const body: Record<string, unknown> = {
      author,
      commentary: toCommentary(part.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    const image = part.media[0];
    if (image) {
      const imageUrn = await this.uploadImage(ctx, author, image.url);
      body.content = { media: { id: imageUrn, ...(image.alt ? { altText: image.alt } : {}) } };
    }

    const res = await this.request({ method: 'POST', url: `${API}/rest/posts`, bearer: ctx.accessToken, headers: this.restHeaders(), json: body, mutating: true });
    const urn = res.headers.get('x-restli-id') ?? optionalString(asRecord(res.data).id);
    if (!urn) throw new PublishOutcomeUnknown('linkedin', 'LinkedIn accepted the post but returned no id; check the profile before retrying.');
    return { status: 'published', platformPostId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
  }

  private async uploadImage(ctx: ProviderContext, owner: string, mediaUrl: string): Promise<string> {
    const { data } = await this.request({
      method: 'POST',
      url: `${API}/rest/images`,
      query: { action: 'initializeUpload' },
      bearer: ctx.accessToken,
      headers: this.restHeaders(),
      json: { initializeUploadRequest: { owner } },
    });
    const value = asRecord(asRecord(data).value);
    const uploadUrl = optionalString(value.uploadUrl);
    const imageUrn = optionalString(value.image);
    if (!uploadUrl || !imageUrn) throw new BadRequest('linkedin', 'LinkedIn image upload init returned no upload URL.', data);
    const { bytes, contentType } = await this.fetchMedia(mediaUrl);
    await this.request({
      method: 'PUT',
      url: uploadUrl,
      bearer: ctx.accessToken,
      headers: { 'content-type': contentType },
      body: bytes,
      timeoutMs: 60_000,
    });
    return imageUrn;
  }

  async comment(ctx: ProviderContext, req: CommentRequest): Promise<{ platformPostId: string; url?: string }> {
    const target = req.replyToPlatformPostId;
    const actor = this.authorUrn(ctx);
    const res = await this.request({
      method: 'POST',
      url: `${API}/rest/socialActions/${encodeURIComponent(target)}/comments`,
      bearer: ctx.accessToken,
      headers: this.restHeaders(),
      json: { actor, object: target, message: { text: req.part.text } },
      mutating: true,
    });
    const d = asRecord(res.data);
    const id = res.headers.get('x-restli-id') ?? optionalString(d.commentUrn) ?? optionalString(d.$URN) ?? optionalString(d.id);
    if (!id) throw new PublishOutcomeUnknown('linkedin', 'LinkedIn accepted the comment but returned no id.');
    // Replying to a comment needs a different request shape (parentComment), so every thread part is a top-level
    // comment on the original post, in order. Returning the post URN keeps the chain pointed there.
    return { platformPostId: target };
  }

  // No fetchPostMetrics: member post analytics need Community Management API partner approval.
}
