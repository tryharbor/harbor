import { describe, expect, it } from 'vitest';
import { BadRequest, PublishOutcomeUnknown, RateLimited, RefreshNeeded } from '@harbor/core';
import { ThreadsProvider } from '../src/index.ts';
import { app, fakeFetch, json } from './fake-fetch.ts';

const ctx = { accessToken: 'tok', account: { platformAccountId: '77', handle: 'harbor' } };
const G = 'graph.threads.net/v1.0';

describe('ThreadsProvider', () => {
  it('builds a Threads authorize URL', async () => {
    const { url, codeVerifier } = await new ThreadsProvider(app('threads')).generateAuthUrl();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://threads.net/oauth/authorize');
    expect(u.searchParams.get('scope')).toContain('threads_basic,threads_content_publish,threads_manage_insights');
    expect(u.searchParams.get('redirect_uri')).toBe('https://harbor.test/v1/channels/threads/callback');
    expect(codeVerifier).toBe('');
  });

  it('asks for THREADS_APP_* env when unconfigured', async () => {
    await expect(new ThreadsProvider({}).generateAuthUrl()).rejects.toThrow(/THREADS_APP_ID and THREADS_APP_SECRET/);
  });

  it('exchanges code → short → long-lived token and loads the profile', async () => {
    const f = fakeFetch({
      'POST graph.threads.net/oauth/access_token': json(200, { access_token: 'short', user_id: 77 }),
      'GET graph.threads.net/access_token': json(200, { access_token: 'long', token_type: 'bearer', expires_in: 5183944 }),
      [`GET ${G}/me`]: json(200, { id: '77', username: 'harbor', name: 'Harbor', threads_profile_picture_url: 'https://scontent.test/t.jpg' }),
    });
    const t = await new ThreadsProvider(app('threads'), f.impl).authenticate({ code: 'c', codeVerifier: '' });
    expect(t).toMatchObject({ accessToken: 'long', refreshToken: 'long' });
    expect(t.account).toEqual({ platformAccountId: '77', handle: 'harbor', displayName: 'Harbor', avatarUrl: 'https://scontent.test/t.jpg' });
    expect(f.calls[1]!.url.searchParams.get('grant_type')).toBe('th_exchange_token');
    expect(f.calls[2]!.url.searchParams.get('fields')).toBe('id,username,name,threads_profile_picture_url');
  });

  it('refreshes with th_refresh_token', async () => {
    const f = fakeFetch({
      'GET graph.threads.net/refresh_access_token': json(200, { access_token: 'long2', expires_in: 5184000 }),
      [`GET ${G}/me`]: json(200, { id: '77', username: 'harbor' }),
    });
    const t = await new ThreadsProvider(app('threads'), f.impl).refreshToken('long');
    expect(t.accessToken).toBe('long2');
    expect(f.calls[0]!.url.searchParams.get('grant_type')).toBe('th_refresh_token');
  });

  it.each([
    ['text', [], { media_type: 'TEXT', text: 'hi' }],
    ['image', [{ kind: 'image', url: 'https://cdn.test/a.jpg' }], { media_type: 'IMAGE', image_url: 'https://cdn.test/a.jpg', text: 'hi' }],
    ['video', [{ kind: 'video', url: 'https://cdn.test/v.mp4' }], { media_type: 'VIDEO', video_url: 'https://cdn.test/v.mp4', text: 'hi' }],
  ] as const)('creates a %s container and returns pending', async (_l, media, expected) => {
    const f = fakeFetch({ [`POST ${G}/me/threads`]: json(200, { id: 'c1' }) });
    const r = await new ThreadsProvider(app('threads'), f.impl).publish(ctx, { postId: 'p', parts: [{ text: 'hi', media: [...media] }, { text: 'later', media: [] }] });
    expect(r).toEqual({ status: 'pending', pendingData: { containerId: 'c1' } });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.body).toEqual({ ...expected, access_token: 'tok' });
  });

  it('creates a carousel', async () => {
    const f = fakeFetch({ [`POST ${G}/me/threads`]: [json(200, { id: 'k1' }), json(200, { id: 'k2' }), json(200, { id: 'parent' })] });
    const media = [1, 2].map((n) => ({ kind: 'image' as const, url: `https://cdn.test/${n}.jpg` }));
    const r = await new ThreadsProvider(app('threads'), f.impl).publish(ctx, { postId: 'p', parts: [{ text: 'two', media }] });
    expect(r.pendingData).toEqual({ containerId: 'parent' });
    expect(f.calls[0]!.body).toMatchObject({ media_type: 'IMAGE', is_carousel_item: 'true' });
    expect(f.calls[2]!.body).toMatchObject({ media_type: 'CAROUSEL', children: 'k1,k2', text: 'two' });
  });

  it('maps container status', async () => {
    const f = fakeFetch({ [`GET ${G}/c1`]: [json(200, { status: 'IN_PROGRESS' }), json(200, { status: 'FINISHED' }), json(200, { status: 'ERROR', error_message: 'FAILED_DOWNLOADING_VIDEO' })] });
    const p = new ThreadsProvider(app('threads'), f.impl);
    expect((await p.checkStatus(ctx, { containerId: 'c1' })).status).toBe('pending');
    expect((await p.checkStatus(ctx, { containerId: 'c1' })).status).toBe('ready');
    const err = await p.checkStatus(ctx, { containerId: 'c1' }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequest);
    expect(err.message).toMatch(/FAILED_DOWNLOADING_VIDEO/);
  });

  it('finalizes via threads_publish and fetches the permalink', async () => {
    const f = fakeFetch({
      [`POST ${G}/me/threads_publish`]: json(200, { id: 't1' }),
      [`GET ${G}/t1`]: json(200, { permalink: 'https://www.threads.net/@harbor/post/XYZ' }),
    });
    const r = await new ThreadsProvider(app('threads'), f.impl).finalize(ctx, { containerId: 'c1' });
    expect(r).toEqual({ status: 'published', platformPostId: 't1', url: 'https://www.threads.net/@harbor/post/XYZ' });
    expect(f.calls[0]!.body).toEqual({ creation_id: 'c1', access_token: 'tok' });
  });

  it('replies: container with reply_to_id → poll → publish', async () => {
    const f = fakeFetch({
      [`POST ${G}/me/threads`]: json(200, { id: 'rc1' }),
      [`GET ${G}/rc1`]: [json(200, { status: 'IN_PROGRESS' }), json(200, { status: 'FINISHED' })],
      [`POST ${G}/me/threads_publish`]: json(200, { id: 'r1' }),
      [`GET ${G}/r1`]: json(200, { permalink: 'https://www.threads.net/@harbor/post/R1' }),
    });
    const r = await new ThreadsProvider(app('threads'), f.impl).comment(ctx, { replyToPlatformPostId: 't1', part: { text: 'part 2', media: [] } });
    expect(r).toEqual({ platformPostId: 'r1', url: 'https://www.threads.net/@harbor/post/R1' });
    expect(f.calls[0]!.body).toMatchObject({ media_type: 'TEXT', text: 'part 2', reply_to_id: 't1' });
    expect(f.find('GET', `${G}/rc1`)).toHaveLength(2);
  });

  it('gives up on a reply that never finishes without publishing', async () => {
    const f = fakeFetch({ [`POST ${G}/me/threads`]: json(200, { id: 'rc1' }), [`GET ${G}/rc1`]: json(200, { status: 'IN_PROGRESS' }) });
    await expect(new ThreadsProvider(app('threads'), f.impl).comment(ctx, { replyToPlatformPostId: 't1', part: { text: 'x', media: [] } })).rejects.toThrow(/still processing/);
    expect(f.find('GET', `${G}/rc1`)).toHaveLength(10);
    expect(f.find('POST', `${G}/me/threads_publish`)).toHaveLength(0);
  });

  describe('error mapping', () => {
    const finalize = (res: Response) =>
      new ThreadsProvider(app('threads'), fakeFetch({ [`POST ${G}/me/threads_publish`]: res }).impl).finalize(ctx, { containerId: 'c1' });
    it('190 → RefreshNeeded', async () => {
      await expect(finalize(json(400, { error: { message: 'Session has expired', type: 'OAuthException', code: 190, error_subcode: 463 } }))).rejects.toBeInstanceOf(RefreshNeeded);
    });
    it('429 → RateLimited', async () => {
      await expect(finalize(json(429, { error: { message: 'slow down' } }, { 'retry-after': '30' }))).rejects.toBeInstanceOf(RateLimited);
    });
    it('400 → BadRequest', async () => {
      await expect(finalize(json(400, { error: { message: 'Invalid parameter', code: 100 } }))).rejects.toBeInstanceOf(BadRequest);
    });
    it('500 on threads_publish → PublishOutcomeUnknown', async () => {
      await expect(finalize(json(500, { error: { message: 'Unknown', code: 1 } }))).rejects.toBeInstanceOf(PublishOutcomeUnknown);
    });
  });

  it('maps insights (quotes count as reposts)', async () => {
    const f = fakeFetch({
      [`GET ${G}/t1/insights`]: json(200, {
        data: ['views:500', 'likes:20', 'replies:4', 'reposts:3', 'quotes:2', 'shares:1'].map((s) => {
          const [name, v] = s.split(':');
          return { name, period: 'lifetime', values: [{ value: Number(v) }] };
        }),
      }),
    });
    const m = await new ThreadsProvider(app('threads'), f.impl).fetchPostMetrics(ctx, 't1');
    expect(m.metrics).toEqual({ views: 500, likes: 20, comments: 4, reposts: 5, shares: 1 });
    expect(f.calls[0]!.url.searchParams.get('metric')).toBe('views,likes,replies,reposts,quotes,shares');
  });
});
