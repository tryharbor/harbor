import {
  BadRequest,
  PublishOutcomeUnknown,
  type AuthCallback,
  type AuthUrl,
  type ChannelAccount,
  type CommentRequest,
  type JsonObject,
  type MediaRef,
  type NormalizedMetrics,
  type PostMetrics,
  type PostPart,
  type ProviderContext,
  type PublishRequest,
  type PublishResult,
  type StatusCheck,
  type TokenSet,
} from '@harbor/core';
import { asRecord, expiresAtFrom, optionalString, optionalUrl, randomState } from './base.ts';
import { MetaGraphProvider, readInsights } from './meta.ts';

export const THREADS_GRAPH_VERSION = 'v1.0';
const AUTHORIZE_URL = 'https://threads.net/oauth/authorize';
const GRAPH = 'https://graph.threads.net';
const API = `${GRAPH}/${THREADS_GRAPH_VERSION}`;

/** Status polls for a reply before giving up (2s apart). */
const REPLY_STATUS_TRIES = 10;

/** Threads API (graph.threads.net). Container → poll → threads_publish, like Instagram; replies via reply_to_id. */
export class ThreadsProvider extends MetaGraphProvider {
  readonly identifier = 'threads' as const;
  readonly name = 'Threads';
  /** threads_manage_replies: Meta's reply docs list it for POSTing replies (reply_to_id), which comment() does. */
  readonly scopes = ['threads_basic', 'threads_content_publish', 'threads_manage_insights', 'threads_manage_replies'] as const;
  protected override readonly maxMedia = 10;
  protected readonly envNames = ['THREADS_APP_ID', 'THREADS_APP_SECRET'] as const;

  maxLength(): number {
    return 500;
  }

  // ---- OAuth ----

  async generateAuthUrl(): Promise<AuthUrl> {
    const { clientId, redirectUri } = this.requireApp();
    const state = randomState();
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: this.scopes.join(','), response_type: 'code', state }).toString();
    return { url: url.toString(), codeVerifier: '', state };
  }

  async authenticate(callback: AuthCallback): Promise<TokenSet> {
    const { clientId, clientSecret, redirectUri } = this.requireApp();
    const { data } = await this.request({
      method: 'POST',
      url: `${GRAPH}/oauth/access_token`,
      form: { client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code: callback.code },
    });
    const shortToken = optionalString(asRecord(data).access_token);
    if (!shortToken) throw new BadRequest('threads', 'Threads token response had no access_token.');
    const { data: long } = await this.request({
      url: `${GRAPH}/access_token`,
      query: { grant_type: 'th_exchange_token', client_secret: clientSecret, access_token: shortToken },
    });
    return this.tokenSet(asRecord(long));
  }

  async refreshToken(refreshToken: string): Promise<TokenSet> {
    const { data } = await this.request({ url: `${GRAPH}/refresh_access_token`, query: { grant_type: 'th_refresh_token', access_token: refreshToken } });
    return this.tokenSet(asRecord(data));
  }

  private async tokenSet(long: Record<string, any>): Promise<TokenSet> {
    const accessToken = optionalString(long.access_token);
    if (!accessToken) throw new BadRequest('threads', 'Threads long-lived token response had no access_token.');
    return { accessToken, refreshToken: accessToken, expiresAt: expiresAtFrom(long.expires_in), scopes: [...this.scopes], account: await this.me(accessToken) };
  }

  private async me(accessToken: string): Promise<ChannelAccount> {
    const { data } = await this.request({ url: `${API}/me`, query: { fields: 'id,username,name,threads_profile_picture_url', access_token: accessToken } });
    const u = asRecord(data);
    if (!u.id || !u.username) throw new BadRequest('threads', 'Threads /me returned no profile.');
    return { platformAccountId: String(u.id), handle: String(u.username), displayName: optionalString(u.name), avatarUrl: optionalUrl(u.threads_profile_picture_url) };
  }

  // ---- Publishing ----

  private async createContainer(ctx: ProviderContext, params: Record<string, string | undefined>): Promise<string> {
    const { data } = await this.request({ method: 'POST', url: `${API}/me/threads`, form: { ...params, access_token: ctx.accessToken } });
    const id = asRecord(data).id;
    if (!id) throw new BadRequest('threads', 'Threads returned no container id.', data);
    return String(id);
  }

  /** Build the container for one part (text, single media or carousel). Not a mutation: nothing is live yet. */
  private async containerFor(ctx: ProviderContext, part: PostPart, extra: Record<string, string> = {}): Promise<string> {
    const text = part.text || undefined;
    if (part.media.length > this.maxMedia) throw new BadRequest('threads', `Threads allows ${this.maxMedia} media items.`);
    if (part.media.length === 0) return this.createContainer(ctx, { media_type: 'TEXT', text, ...extra });
    if (part.media.length === 1) return this.createContainer(ctx, { ...mediaParams(part.media[0]!), text, ...extra });

    const children: string[] = [];
    for (const m of part.media) children.push(await this.createContainer(ctx, { ...mediaParams(m), is_carousel_item: 'true' }));
    const videos = children.filter((_, i) => part.media[i]!.kind === 'video');
    if (videos.length) await this.waitForContainers(videos, (id) => this.checkStatus(ctx, { containerId: id }), 30);
    return this.createContainer(ctx, { media_type: 'CAROUSEL', children: children.join(','), text, ...extra });
  }

  async publish(ctx: ProviderContext, req: PublishRequest): Promise<PublishResult> {
    const part = req.parts[0];
    if (!part) throw new BadRequest('threads', 'Nothing to publish.');
    const containerId = await this.containerFor(ctx, part);
    return { status: 'pending', pendingData: { containerId } };
  }

  async checkStatus(ctx: ProviderContext, pendingData: JsonObject): Promise<StatusCheck> {
    const containerId = String(pendingData.containerId ?? '');
    if (!containerId) throw new BadRequest('threads', 'Missing Threads container id.');
    const { data } = await this.request({ url: `${API}/${containerId}`, query: { fields: 'status,error_message', access_token: ctx.accessToken } });
    const d = asRecord(data);
    return this.containerStatus(containerId, d.status, d.error_message, pendingData);
  }

  async finalize(ctx: ProviderContext, pendingData: JsonObject): Promise<Extract<PublishResult, { status: 'published' }>> {
    const containerId = String(pendingData.containerId ?? '');
    if (!containerId) throw new BadRequest('threads', 'Missing Threads container id.');
    const platformPostId = await this.publishContainer(ctx, containerId);
    return { status: 'published', platformPostId, url: await this.permalink(ctx, platformPostId) };
  }

  private async publishContainer(ctx: ProviderContext, containerId: string): Promise<string> {
    const { data } = await this.request({
      method: 'POST',
      url: `${API}/me/threads_publish`,
      form: { creation_id: containerId, access_token: ctx.accessToken },
      mutating: true,
    });
    const id = asRecord(data).id;
    if (!id) throw new PublishOutcomeUnknown('threads', 'Threads accepted threads_publish but returned no id; check the profile before retrying.');
    return String(id);
  }

  private async permalink(ctx: ProviderContext, mediaId: string): Promise<string | undefined> {
    try {
      const { data } = await this.request({ url: `${API}/${mediaId}`, query: { fields: 'permalink', access_token: ctx.accessToken } });
      return optionalUrl(asRecord(data).permalink);
    } catch {
      return undefined;
    }
  }

  /** Thread replies: container with reply_to_id → wait until FINISHED → threads_publish. */
  async comment(ctx: ProviderContext, req: CommentRequest): Promise<{ platformPostId: string; url?: string }> {
    const containerId = await this.containerFor(ctx, req.part, { reply_to_id: req.replyToPlatformPostId });
    await this.waitForContainers([containerId], (id) => this.checkStatus(ctx, { containerId: id }), REPLY_STATUS_TRIES);
    const platformPostId = await this.publishContainer(ctx, containerId);
    return { platformPostId, url: await this.permalink(ctx, platformPostId) };
  }

  // ---- Metrics ----

  async fetchPostMetrics(ctx: ProviderContext, platformPostId: string): Promise<PostMetrics> {
    const { data: raw } = await this.request({
      url: `${API}/${encodeURIComponent(platformPostId)}/insights`,
      query: { metric: 'views,likes,replies,reposts,quotes,shares', access_token: ctx.accessToken },
    });
    return { raw, metrics: mapThreadsInsights(raw), adapterVersion: this.adapterVersion };
  }
}

function mediaParams(m: MediaRef): Record<string, string> {
  return m.kind === 'video' ? { media_type: 'VIDEO', video_url: m.url } : { media_type: 'IMAGE', image_url: m.url };
}

export function mapThreadsInsights(raw: unknown): NormalizedMetrics {
  const v = readInsights(raw);
  const out: NormalizedMetrics = {};
  if (v.views !== undefined) out.views = v.views;
  if (v.likes !== undefined) out.likes = v.likes;
  if (v.replies !== undefined) out.comments = v.replies;
  if (v.reposts !== undefined || v.quotes !== undefined) out.reposts = (v.reposts ?? 0) + (v.quotes ?? 0);
  if (v.shares !== undefined) out.shares = v.shares;
  return out;
}
