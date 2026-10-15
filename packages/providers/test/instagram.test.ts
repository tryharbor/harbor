import { describe, expect, it } from 'vitest';
import { BadRequest, PublishOutcomeUnknown, RateLimited, RefreshNeeded } from '@harbor/core';
import { InstagramProvider } from '../src/index.ts';
import { app, fakeFetch, json, networkError } from './fake-fetch.ts';

const ctx = { accessToken: 'tok', account: { platformAccountId: '1784', handle: 'harbor' } };
const G = 'graph.instagram.com/v23.0';
const img = (n: number) => ({ kind: 'image' as const, url: `https://cdn.test/${n}.jpg` });

describe('InstagramProvider', () => {
  it('builds an Instagram Login authorize URL', async () => {
    const { url, codeVerifier } = await new InstagramProvider(app('instagram')).generateAuthUrl();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(u.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('client-id');
    expect(codeVerifier).toBe('');
  });

  it('asks for INSTAGRAM_APP_* env when unconfigured', async () => {
    await expect(new InstagramProvider({}).generateAuthUrl()).rejects.toThrow(/INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET/);
  });

  it.each([
    ['flat', { access_token: 'short', user_id: 1784, permissions: 'instagram_business_basic,instagram_business_content_publish' }],
    ['wrapped', { data: [{ access_token: 'short', user_id: 1784, permissions: ['instagram_business_basic', 'instagram_business_content_publish'] }] }],
  ])('exchanges a %s short-lived token for a long-lived one', async (_label, shortBody) => {
    const f = fakeFetch({
      'POST api.instagram.com/oauth/access_token': json(200, shortBody),
      'GET graph.instagram.com/access_token': json(200, { access_token: 'long', token_type: 'bearer', expires_in: 5184000 }),
      [`GET ${G}/me`]: json(200, { user_id: '1784', id: 'app-scoped', username: 'harbor', name: 'Harbor', profile_picture_url: 'https://scontent.test/p.jpg' }),
    });
    const t = await new InstagramProvider(app('instagram'), f.impl).authenticate({ code: 'c0de#_', codeVerifier: '' });
    expect(t).toMatchObject({ accessToken: 'long', refreshToken: 'long', scopes: ['instagram_business_basic', 'instagram_business_content_publish'] });
    expect(t.account).toEqual({ platformAccountId: '1784', handle: 'harbor', displayName: 'Harbor', avatarUrl: 'https://scontent.test/p.jpg' });
    expect(Date.parse(t.expiresAt!)).toBeGreaterThan(Date.now() + 59 * 86400_000);
    expect(f.calls[0]!.body).toMatchObject({ grant_type: 'authorization_code', code: 'c0de#_', client_secret: 'client-secret' });
    const exchange = f.calls[1]!.url.searchParams;
    expect(exchange.get('grant_type')).toBe('ig_exchange_token');
    expect(exchange.get('access_token')).toBe('short');
  });

  it('refreshes with the long-lived token', async () => {
    const f = fakeFetch({
      'GET graph.instagram.com/refresh_access_token': json(200, { access_token: 'long2', expires_in: 5184000 }),
      [`GET ${G}/me`]: json(200, { user_id: '1784', username: 'harbor' }),
    });
    const t = await new InstagramProvider(app('instagram'), f.impl).refreshToken('long');
    expect(t.accessToken).toBe('long2');
    expect(t.refreshToken).toBe('long2');
    expect(f.calls[0]!.url.searchParams.get('grant_type')).toBe('ig_refresh_token');
  });

  it('creates a single image container and returns pending', async () => {
    const f = fakeFetch({ [`POST ${G}/1784/media`]: json(200, { id: 'c1' }) });
    const r = await new InstagramProvider(app('instagram'), f.impl).publish(ctx, { postId: 'p', parts: [{ text: 'cap', media: [img(1)] }] });
    expect(r).toEqual({ status: 'pending', pendingData: { containerId: 'c1', igUserId: '1784' } });
    expect(f.calls[0]!.body).toEqual({ image_url: 'https://cdn.test/1.jpg', caption: 'cap', access_token: 'tok' });
  });

  it('creates a reel for a single video', async () => {
    const f = fakeFetch({ [`POST ${G}/1784/media`]: json(200, { id: 'c1' }) });
    await new InstagramProvider(app('instagram'), f.impl).publish(ctx, { postId: 'p', parts: [{ text: 'cap', media: [{ kind: 'video', url: 'https://cdn.test/v.mp4' }] }] });
    expect(f.calls[0]!.body).toMatchObject({ media_type: 'REELS', video_url: 'https://cdn.test/v.mp4', caption: 'cap' });
  });

  it('creates a carousel from children', async () => {
    const f = fakeFetch({
      [`POST ${G}/1784/media`]: [json(200, { id: 'k1' }), json(200, { id: 'k2' }), json(200, { id: 'parent' })],
      [`GET ${G}/k2`]: json(200, { status_code: 'FINISHED' }),
    });
    const r = await new InstagramProvider(app('instagram'), f.impl).publish(ctx, {
      postId: 'p',
      parts: [{ text: 'cap', media: [img(1), { kind: 'video', url: 'https://cdn.test/v.mp4' }] }],
    });
    expect(r.pendingData).toEqual({ containerId: 'parent', igUserId: '1784' });
    const creates = f.find('POST', `${G}/1784/media`).map((c) => c.body);
    expect(creates[0]).toMatchObject({ is_carousel_item: 'true', image_url: 'https://cdn.test/1.jpg' });
    expect(creates[1]).toMatchObject({ is_carousel_item: 'true', media_type: 'VIDEO', video_url: 'https://cdn.test/v.mp4' });
    expect(creates[2]).toMatchObject({ media_type: 'CAROUSEL', children: 'k1,k2', caption: 'cap' });
  });

  it('maps container status', async () => {
    const f = fakeFetch({
      [`GET ${G}/c1`]: [json(200, { status_code: 'IN_PROGRESS' }), json(200, { status_code: 'FINISHED' }), json(200, { status_code: 'ERROR', status: 'Error: 2207026' })],
    });
    const p = new InstagramProvider(app('instagram'), f.impl);
    const pd = { containerId: 'c1', igUserId: '1784' };
    expect(await p.checkStatus(ctx, pd)).toEqual({ status: 'pending', pendingData: pd });
    expect(await p.checkStatus(ctx, pd)).toEqual({ status: 'ready', pendingData: pd });
    await expect(p.checkStatus(ctx, pd)).rejects.toThrow(/2207026/);
    expect(f.calls[0]!.url.searchParams.get('fields')).toBe('status_code,status');
  });

  it('finalizes with media_publish and fetches the permalink', async () => {
    const f = fakeFetch({
      [`POST ${G}/1784/media_publish`]: json(200, { id: 'm9' }),
      [`GET ${G}/m9`]: json(200, { permalink: 'https://www.instagram.com/p/ABC/' }),
    });
    const r = await new InstagramProvider(app('instagram'), f.impl).finalize(ctx, { containerId: 'c1', igUserId: '1784' });
    expect(r).toEqual({ status: 'published', platformPostId: 'm9', url: 'https://www.instagram.com/p/ABC/' });
    expect(f.calls[0]!.body).toEqual({ creation_id: 'c1', access_token: 'tok' });
  });

  it('still reports published when the permalink read fails', async () => {
    const f = fakeFetch({ [`POST ${G}/1784/media_publish`]: json(200, { id: 'm9' }), [`GET ${G}/m9`]: json(500, {}) });
    expect(await new InstagramProvider(app('instagram'), f.impl).finalize(ctx, { containerId: 'c1', igUserId: '1784' })).toEqual({
      status: 'published',
      platformPostId: 'm9',
      url: undefined,
    });
  });

  describe('error mapping', () => {
    const finalize = (res: Parameters<typeof fakeFetch>[0][string]) =>
      new InstagramProvider(app('instagram'), fakeFetch({ [`POST ${G}/1784/media_publish`]: res }).impl).finalize(ctx, { containerId: 'c1', igUserId: '1784' });
    it('OAuthException 190 → RefreshNeeded, even on 400', async () => {
      await expect(finalize(json(400, { error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } }))).rejects.toBeInstanceOf(RefreshNeeded);
    });
    it('401 → RefreshNeeded', async () => {
      await expect(finalize(json(401, { error: { message: 'Unauthorized', code: 1 } }))).rejects.toBeInstanceOf(RefreshNeeded);
    });
    it('429 and Graph rate-limit codes → RateLimited', async () => {
      await expect(finalize(json(429, {}))).rejects.toBeInstanceOf(RateLimited);
      await expect(finalize(json(400, { error: { message: 'Application request limit reached', code: 4 } }))).rejects.toBeInstanceOf(RateLimited);
    });
    it('400 → BadRequest with message', async () => {
      const err = await finalize(json(400, { error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027 } })).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequest);
      expect(err.message).toMatch(/Media ID is not available/);
      expect(err.message).not.toContain('tok');
    });
    it('5xx / network on media_publish → PublishOutcomeUnknown', async () => {
      await expect(finalize(json(500, { error: { message: 'An unknown error occurred', code: 1 } }))).rejects.toBeInstanceOf(PublishOutcomeUnknown);
      await expect(finalize(networkError())).rejects.toBeInstanceOf(PublishOutcomeUnknown);
    });
    it('5xx on container creation is not an unknown outcome', async () => {
      const f = fakeFetch({ [`POST ${G}/1784/media`]: json(500, {}) });
      const err = await new InstagramProvider(app('instagram'), f.impl).publish(ctx, { postId: 'p', parts: [{ text: 'c', media: [img(1)] }] }).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(PublishOutcomeUnknown);
    });
  });

  it('maps insights', async () => {
    const f = fakeFetch({
      [`GET ${G}/m9/insights`]: json(200, {
        data: [
          { name: 'views', period: 'lifetime', values: [{ value: 1200 }] },
          { name: 'reach', period: 'lifetime', values: [{ value: 800 }] },
          { name: 'likes', period: 'lifetime', values: [{ value: 60 }] },
          { name: 'comments', period: 'lifetime', total_value: { value: 5 } },
          { name: 'saved', period: 'lifetime', values: [{ value: 9 }] },
        ],
      }),
    });
    const m = await new InstagramProvider(app('instagram'), f.impl).fetchPostMetrics(ctx, 'm9');
    expect(m.metrics).toEqual({ views: 1200, reach: 800, likes: 60, comments: 5, saves: 9 });
    expect(f.calls[0]!.url.searchParams.get('metric')).toBe('views,reach,likes,comments,shares,saved');
  });
});
