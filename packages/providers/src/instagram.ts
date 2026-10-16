import {
  BadRequest,
  PublishOutcomeUnknown,
  type AuthCallback,
  type AuthUrl,
  type ChannelAccount,
  type JsonObject,
  type MediaRef,
  type NormalizedMetrics,
  type PastPost,
  type PostMetrics,
  type ProviderContext,
  type PublishRequest,
  type PublishResult,
  type Reply,
  type StatusCheck,
  type TokenSet,
} from '@harbor/core';
import { asRecord, expiresAtFrom, isoTime, optionalCount, optionalString, optionalUrl, randomState, splitScopes } from './base.ts';
import { MetaGraphProvider, readInsights } from './meta.ts';

export const INSTAGRAM_GRAPH_VERSION = 'v23.0';
const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const SHORT_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';
const API = `${GRAPH}/${INSTAGRAM_GRAPH_VERSION}`;

/**
 * Instagram professional accounts via the Instagram API with Instagram Login (graph.instagram.com).
 * Async: create a media container (media at public URLs) → poll status_code → media_publish.
 */
export class InstagramProvider extends MetaGraphProvider {
  readonly identifier = 'instagram' as const;
  readonly name = 'Instagram';
  readonly scopes = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'] as const;
  override readonly reportsReplies = true;
  protected override readonly maxMedia = 10;
  protected override readonly requiresMedia = true;
  protected readonly envNames = ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'] as const;

  maxLength(): number {
    return 2200;
  }

  // ---- OAuth ----

  async generateAuthUrl(): Promise<AuthUrl> {
    const { clientId, redirectUri } = this.requireApp();
    const state = randomState();
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: this.scopes.join(','), state }).toString();
    return { url: url.toString(), codeVerifier: '', state };
  }

  async authenticate(callback: AuthCallback): Promise<TokenSet> {
    const { clientId, clientSecret, redirectUri } = this.requireApp();
    const { data } = await this.request({
      method: 'POST',
      url: SHORT_TOKEN_URL,
      form: { client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code: callback.code },
    });
    // The response is either flat or wrapped as { data: [ {...} ] }.
    const d = asRecord(data);
    const short = Array.isArray(d.data) ? asRecord(d.data[0]) : d;
    const shortToken = optionalString(short.access_token);
    if (!shortToken) throw new BadRequest('instagram', 'Instagram token response had no access_token.');

    const { data: long } = await this.request({
      url: `${GRAPH}/access_token`,
      query: { grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: shortToken },
    });
    return this.tokenSet(asRecord(long), splitScopes(short.permissions, this.scopes));
  }

  async refreshToken(refreshToken: string): Promise<TokenSet> {
    const { data } = await this.request({ url: `${GRAPH}/refresh_access_token`, query: { grant_type: 'ig_refresh_token', access_token: refreshToken } });
    return this.tokenSet(asRecord(data), [...this.scopes]);
  }

  private async tokenSet(long: Record<string, any>, scopes: string[]): Promise<TokenSet> {
    const accessToken = optionalString(long.access_token);
    if (!accessToken) throw new BadRequest('instagram', 'Instagram long-lived token response had no access_token.');
    // Long-lived Instagram tokens are refreshed with themselves.
    return { accessToken, refreshToken: accessToken, expiresAt: expiresAtFrom(long.expires_in), scopes, account: await this.me(accessToken) };
  }

  private async me(accessToken: string): Promise<ChannelAccount> {
    const { data } = await this.request({ url: `${API}/me`, query: { fields: 'user_id,username,name,profile_picture_url', access_token: accessToken } });
    const u = asRecord(data);
    // user_id is the professional account id the content publishing endpoints expect; id is app-scoped.
    const id = u.user_id ?? u.id;
    if (!id || !u.username) throw new BadRequest('instagram', 'Instagram /me returned no account.');
    return { platformAccountId: String(id), handle: String(u.username), displayName: optionalString(u.name), avatarUrl: optionalUrl(u.profile_picture_url) };
  }

  // ---- Publishing ----

  private async createContainer(ctx: ProviderContext, igUserId: string, params: Record<string, string | undefined>): Promise<string> {
    const { data } = await this.request({ method: 'POST', url: `${API}/${igUserId}/media`, form: { ...params, access_token: ctx.accessToken } });
    const id = asRecord(data).id;
    if (!id) throw new BadRequest('instagram', 'Instagram returned no container id.', data);
    return String(id);
  }

  async publish(ctx: ProviderContext, req: PublishRequest): Promise<PublishResult> {
    const part = req.parts[0];
    if (!part || part.media.length === 0) throw new BadRequest('instagram', 'Instagram posts need an image or video.');
    if (part.media.length > this.maxMedia) throw new BadRequest('instagram', `Instagram allows ${this.maxMedia} media items.`);
    const igUserId = ctx.account.platformAccountId;
    const caption = part.text || undefined;

    let containerId: string;
    if (part.media.length === 1) {
      const m = part.media[0]!;
      containerId = await this.createContainer(
        ctx,
        igUserId,
        m.kind === 'video' ? { media_type: 'REELS', video_url: m.url, caption } : { image_url: m.url, caption },
      );
    } else {
      const children: string[] = [];
      for (const m of part.media) children.push(await this.createContainer(ctx, igUserId, childParams(m)));
      const videos = children.filter((_, i) => part.media[i]!.kind === 'video');
      // Video children must finish processing before the carousel container can reference them.
      if (videos.length) await this.waitForContainers(videos, (id) => this.checkStatus(ctx, { containerId: id }), 30);
      containerId = await this.createContainer(ctx, igUserId, { media_type: 'CAROUSEL', children: children.join(','), caption });
    }
    return { status: 'pending', pendingData: { containerId, igUserId } };
  }

  async checkStatus(ctx: ProviderContext, pendingData: JsonObject): Promise<StatusCheck> {
    const containerId = String(pendingData.containerId ?? '');
    if (!containerId) throw new BadRequest('instagram', 'Missing Instagram container id.');
    const { data } = await this.request({ url: `${API}/${containerId}`, query: { fields: 'status_code,status', access_token: ctx.accessToken } });
    const d = asRecord(data);
    return this.containerStatus(containerId, d.status_code, d.status, pendingData);
  }

  async finalize(ctx: ProviderContext, pendingData: JsonObject): Promise<Extract<PublishResult, { status: 'published' }>> {
    const containerId = String(pendingData.containerId ?? '');
    const igUserId = String(pendingData.igUserId ?? ctx.account.platformAccountId);
    if (!containerId) throw new BadRequest('instagram', 'Missing Instagram container id.');
    const { data } = await this.request({
      method: 'POST',
      url: `${API}/${igUserId}/media_publish`,
      form: { creation_id: containerId, access_token: ctx.accessToken },
      mutating: true,
    });
    const id = asRecord(data).id;
    if (!id) throw new PublishOutcomeUnknown('instagram', 'Instagram accepted media_publish but returned no id; check the account before retrying.');
    const platformPostId = String(id);
    return { status: 'published', platformPostId, url: await this.permalink(ctx, platformPostId) };
  }

  private async permalink(ctx: ProviderContext, mediaId: string): Promise<string | undefined> {
    try {
      const { data } = await this.request({ url: `${API}/${mediaId}`, query: { fields: 'permalink', access_token: ctx.accessToken } });
      return optionalUrl(asRecord(data).permalink);
    } catch {
      return undefined; // the post is live; a missing link isn't worth failing over
    }
  }

  // ---- Metrics ----

  async fetchPostMetrics(ctx: ProviderContext, platformPostId: string): Promise<PostMetrics> {
    const { data: raw } = await this.request({
      url: `${API}/${encodeURIComponent(platformPostId)}/insights`,
      query: { metric: 'views,reach,likes,comments,shares,saved', access_token: ctx.accessToken },
    });
    return { raw, metrics: mapInstagramInsights(raw), adapterVersion: this.adapterVersion };
  }

  // ---- Replies and history ----

  /** Comments on a post. The account's own comments are left out. */
  async fetchReplies(ctx: ProviderContext, platformPostId: string, opts: { limit?: number } = {}): Promise<Reply[]> {
    const { data } = await this.request({
      url: `${API}/${encodeURIComponent(platformPostId)}/comments`,
      query: { fields: 'id,text,username,timestamp,like_count', limit: String(Math.min(100, opts.limit ?? 50)), access_token: ctx.accessToken },
    });
    const list = asRecord(data).data;
    return (Array.isArray(list) ? list : [])
      .map(asRecord)
      .filter((r) => r.id && typeof r.text === 'string' && r.text.trim() && r.username !== ctx.account.handle)
      .map((r) => ({
        platformReplyId: String(r.id),
        author: { handle: String(r.username ?? 'unknown') },
        text: String(r.text),
        createdAt: isoTime(r.timestamp),
        ...(optionalCount(r.like_count) !== undefined ? { likes: optionalCount(r.like_count) } : {}),
      }));
  }

  /** The account's recent media with captions, each with its insights (or the like and comment counts when insights fail). */
  async listRecentPosts(ctx: ProviderContext, opts: { limit: number }): Promise<PastPost[]> {
    const { data } = await this.request({
      url: `${API}/me/media`,
      query: { fields: 'id,caption,permalink,timestamp,media_type,like_count,comments_count', limit: String(Math.min(100, Math.max(1, opts.limit))), access_token: ctx.accessToken },
    });
    const list = asRecord(data).data;
    const out: PastPost[] = [];
    for (const r of (Array.isArray(list) ? list : []).map(asRecord).slice(0, opts.limit)) {
      if (!r.id) continue;
      const counts: NormalizedMetrics = {};
      if (optionalCount(r.like_count) !== undefined) counts.likes = optionalCount(r.like_count);
      if (optionalCount(r.comments_count) !== undefined) counts.comments = optionalCount(r.comments_count);
      const metrics = await this.fetchPostMetrics(ctx, String(r.id)).then((m) => ({ ...counts, ...m.metrics }), () => (Object.keys(counts).length ? counts : undefined));
      out.push({ platformPostId: String(r.id), text: typeof r.caption === 'string' ? r.caption : '', publishedAt: isoTime(r.timestamp), url: optionalUrl(r.permalink), metrics });
    }
    return out;
  }
}

function childParams(m: MediaRef): Record<string, string> {
  return m.kind === 'video' ? { is_carousel_item: 'true', media_type: 'VIDEO', video_url: m.url } : { is_carousel_item: 'true', image_url: m.url };
}

export function mapInstagramInsights(raw: unknown): NormalizedMetrics {
  const v = readInsights(raw);
  const out: NormalizedMetrics = {};
  const pairs: [string, keyof NormalizedMetrics][] = [
    ['views', 'views'],
    ['reach', 'reach'],
    ['likes', 'likes'],
    ['comments', 'comments'],
    ['shares', 'shares'],
    ['saved', 'saves'],
  ];
  for (const [from, to] of pairs) if (v[from] !== undefined) out[to] = v[from];
  return out;
}
