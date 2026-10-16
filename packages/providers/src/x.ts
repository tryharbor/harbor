import {
  BadRequest,
  PublishOutcomeUnknown,
  RefreshNeeded,
  type AuthCallback,
  type AuthUrl,
  type CommentRequest,
  type JsonObject,
  type NormalizedMetrics,
  type PastPost,
  type PostMetrics,
  type PostPart,
  type ProviderContext,
  type PublishRequest,
  type PublishResult,
  type Reply,
  type TokenSet,
} from '@harbor/core';
import { BaseProvider, asRecord, type FetchLike, type ProviderOptions, createPkcePair, expiresAtFrom, isoTime, optionalString, optionalUrl, randomState, splitScopes } from './base.ts';

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const API = 'https://api.x.com/2';

/** X (Twitter) API v2, OAuth 2.0 Authorization Code with PKCE (confidential client). */
export class XProvider extends BaseProvider {
  readonly identifier = 'x' as const;
  readonly name = 'X';
  readonly scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'] as const;
  protected readonly envNames = ['X_CLIENT_ID', 'X_CLIENT_SECRET'] as const;

  /** X bills per read, so replies and past posts are only read with HARBOR_X_READ_REPLIES=true. */
  override readonly reportsReplies: boolean;

  constructor(config: ProviderOptions = {}, fetchImpl: FetchLike = globalThis.fetch) {
    super(config, fetchImpl);
    this.reportsReplies = config.readReplies === true;
  }

  /** 280 for standard accounts; Premium accounts can post longer. */
  maxLength(settings?: JsonObject): number {
    return settings?.premium === true ? 25_000 : 280;
  }

  // ---- OAuth ----

  async generateAuthUrl(): Promise<AuthUrl> {
    const { clientId, redirectUri } = this.requireApp();
    const { codeVerifier, codeChallenge } = createPkcePair();
    const state = randomState();
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: this.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), codeVerifier, state };
  }

  async authenticate(callback: AuthCallback): Promise<TokenSet> {
    const { redirectUri } = this.requireApp();
    return this.tokenRequest({ grant_type: 'authorization_code', code: callback.code, redirect_uri: redirectUri, code_verifier: callback.codeVerifier });
  }

  async refreshToken(refreshToken: string): Promise<TokenSet> {
    this.requireApp();
    try {
      return await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    } catch (err) {
      // invalid_grant: the refresh token was revoked or already used. Only a reconnect fixes that.
      if (err instanceof BadRequest) throw new RefreshNeeded('x', `X refresh token rejected; reconnect the channel. (${err.message})`);
      throw err;
    }
  }

  private async tokenRequest(form: Record<string, string>): Promise<TokenSet> {
    const { clientId, clientSecret } = this.requireApp();
    const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64');
    const { data } = await this.request<Record<string, unknown>>({
      method: 'POST',
      url: `${API}/oauth2/token`,
      headers: { authorization: `Basic ${basic}` },
      form: { ...form, client_id: clientId },
    });
    const accessToken = optionalString(data.access_token);
    if (!accessToken) throw new BadRequest('x', 'X token response had no access_token.');
    const account = await this.me(accessToken);
    return {
      accessToken,
      refreshToken: optionalString(data.refresh_token),
      expiresAt: expiresAtFrom(data.expires_in),
      scopes: splitScopes(data.scope, this.scopes),
      account,
    };
  }

  private async me(accessToken: string) {
    const { data } = await this.request({ url: `${API}/users/me`, query: { 'user.fields': 'profile_image_url,name,username' }, bearer: accessToken });
    const u = asRecord(asRecord(data).data);
    if (!u.id || !u.username) throw new BadRequest('x', 'X /users/me returned no user.');
    return { platformAccountId: String(u.id), handle: String(u.username), displayName: optionalString(u.name), avatarUrl: optionalUrl(u.profile_image_url) };
  }

  // ---- Publishing ----

  async publish(ctx: ProviderContext, req: PublishRequest): Promise<PublishResult> {
    const part = req.parts[0];
    if (!part) throw new BadRequest('x', 'Nothing to publish.');
    const id = await this.createTweet(ctx, part);
    return { status: 'published', platformPostId: id, url: this.tweetUrl(ctx, id) };
  }

  async comment(ctx: ProviderContext, req: CommentRequest): Promise<{ platformPostId: string; url?: string }> {
    const id = await this.createTweet(ctx, req.part, req.replyToPlatformPostId);
    return { platformPostId: id, url: this.tweetUrl(ctx, id) };
  }

  private tweetUrl(ctx: ProviderContext, id: string): string {
    return `https://x.com/${encodeURIComponent(ctx.account.handle)}/status/${id}`;
  }

  private async createTweet(ctx: ProviderContext, part: PostPart, inReplyTo?: string): Promise<string> {
    // Upload first: these calls don't create a post, so their failures are ordinary (retry-safe) errors.
    const mediaIds: string[] = [];
    for (const m of part.media) {
      if (m.kind === 'video') throw new BadRequest('x', "Video on X isn't supported yet.");
      mediaIds.push(await this.uploadImage(ctx, m.url));
    }
    const body: Record<string, unknown> = { text: part.text };
    if (mediaIds.length) body.media = { media_ids: mediaIds };
    if (inReplyTo) body.reply = { in_reply_to_tweet_id: inReplyTo };
    const { data } = await this.request({ method: 'POST', url: `${API}/tweets`, bearer: ctx.accessToken, json: body, mutating: true });
    const id = asRecord(asRecord(data).data).id;
    if (!id) throw new PublishOutcomeUnknown('x', 'X accepted the post but returned no id; check the account before retrying.');
    return String(id);
  }

  private async uploadImage(ctx: ProviderContext, url: string): Promise<string> {
    const { bytes, contentType } = await this.fetchMedia(url);
    const form = new FormData();
    form.set('media', new Blob([bytes], { type: contentType }), 'media');
    form.set('media_category', 'tweet_image');
    const { data } = await this.request({ method: 'POST', url: `${API}/media/upload`, bearer: ctx.accessToken, body: form, timeoutMs: 60_000 });
    const id = asRecord(asRecord(data).data).id;
    if (!id) throw new BadRequest('x', 'X media upload returned no media id.', data);
    return String(id);
  }

  // ---- Metrics ----

  async fetchPostMetrics(ctx: ProviderContext, platformPostId: string): Promise<PostMetrics> {
    const get = (fields: string) =>
      this.request({ url: `${API}/tweets/${encodeURIComponent(platformPostId)}`, query: { 'tweet.fields': fields }, bearer: ctx.accessToken });
    let raw: unknown;
    try {
      raw = (await get('public_metrics,non_public_metrics,created_at')).data;
      // Over 30 days, X may answer 200 with only an `errors` entry for the non-public field.
      if (!asRecord(raw).data) raw = (await get('public_metrics,created_at')).data;
    } catch (err) {
      const status = err instanceof BadRequest ? asRecord(err.details).status : undefined;
      if (status !== 400 && status !== 403) throw err;
      raw = (await get('public_metrics,created_at')).data;
    }
    const tweet = asRecord(asRecord(raw).data);
    if (!tweet.id) throw new BadRequest('x', `X post ${platformPostId} not found.`, raw);
    return { raw, metrics: mapXMetrics(tweet), adapterVersion: this.adapterVersion };
  }

  // ---- Replies and history (billed reads: only with HARBOR_X_READ_REPLIES=true) ----

  /** Replies in the post's conversation from the last 7 days (recent search), without the account's own thread parts. */
  async fetchReplies(ctx: ProviderContext, platformPostId: string, opts: { limit?: number } = {}): Promise<Reply[]> {
    if (!this.reportsReplies) return [];
    const { data } = await this.request({
      url: `${API}/tweets/search/recent`,
      query: {
        query: `conversation_id:${platformPostId}`,
        'tweet.fields': 'author_id,created_at,public_metrics',
        expansions: 'author_id',
        'user.fields': 'username,name',
        max_results: String(Math.min(100, Math.max(10, opts.limit ?? 50))),
      },
      bearer: ctx.accessToken,
    });
    const d = asRecord(data);
    const users = new Map((Array.isArray(asRecord(d.includes).users) ? asRecord(d.includes).users : []).map((u: any) => [String(u.id), asRecord(u)]));
    return (Array.isArray(d.data) ? d.data : [])
      .map(asRecord)
      .filter((t) => t.id && typeof t.text === 'string' && String(t.author_id) !== ctx.account.platformAccountId)
      .map((t) => {
        const u = asRecord(users.get(String(t.author_id)));
        const likes = asRecord(t.public_metrics).like_count;
        return {
          platformReplyId: String(t.id),
          author: { handle: String(u.username ?? t.author_id ?? 'unknown'), ...(optionalString(u.name) ? { displayName: String(u.name) } : {}) },
          text: String(t.text),
          createdAt: isoTime(t.created_at),
          ...(typeof likes === 'number' ? { likes } : {}),
        };
      });
  }

  /** The account's recent posts (no replies or reposts) with their public metrics. */
  async listRecentPosts(ctx: ProviderContext, opts: { limit: number }): Promise<PastPost[]> {
    if (!this.reportsReplies) return [];
    const { data } = await this.request({
      url: `${API}/users/${encodeURIComponent(ctx.account.platformAccountId)}/tweets`,
      query: { 'tweet.fields': 'created_at,public_metrics', exclude: 'replies,retweets', max_results: String(Math.min(100, Math.max(5, opts.limit))) },
      bearer: ctx.accessToken,
    });
    const list = asRecord(data).data;
    return (Array.isArray(list) ? list : [])
      .map(asRecord)
      .filter((t) => t.id)
      .slice(0, opts.limit)
      .map((t) => ({
        platformPostId: String(t.id),
        text: typeof t.text === 'string' ? t.text : '',
        publishedAt: isoTime(t.created_at),
        url: this.tweetUrl(ctx, String(t.id)),
        metrics: mapXMetrics(t),
      }));
  }
}

export function mapXMetrics(tweet: Record<string, any>): NormalizedMetrics {
  const pub = asRecord(tweet.public_metrics);
  const priv = asRecord(tweet.non_public_metrics);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const out: NormalizedMetrics = {};
  const set = (k: keyof NormalizedMetrics, v: number | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  set('views', num(pub.impression_count) ?? num(priv.impression_count));
  set('likes', num(pub.like_count));
  set('comments', num(pub.reply_count));
  const rt = num(pub.retweet_count);
  const qt = num(pub.quote_count);
  set('reposts', rt === undefined && qt === undefined ? undefined : (rt ?? 0) + (qt ?? 0));
  set('saves', num(pub.bookmark_count));
  set('profileVisits', num(priv.user_profile_clicks));
  set('linkClicks', num(priv.url_link_clicks));
  return out;
}
