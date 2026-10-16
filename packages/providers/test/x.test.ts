import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BadRequest, HarborError, PublishOutcomeUnknown, RateLimited, RefreshNeeded } from '@harbor/core';
import { XProvider, createProviderRegistry } from '../src/index.ts';
import { app, fakeFetch, json, networkError } from './fake-fetch.ts';

const ctx = { accessToken: 'tok', account: { platformAccountId: '42', handle: 'harbor' } };
const me = json(200, { data: { id: '42', username: 'harbor', name: 'Harbor', profile_image_url: 'https://pbs.twimg.com/a.jpg' } });

describe('XProvider', () => {
  it('requires app credentials', async () => {
    const x = new XProvider({});
    await expect(x.generateAuthUrl()).rejects.toThrow(HarborError);
    await expect(x.generateAuthUrl()).rejects.toThrow(/X_CLIENT_ID and X_CLIENT_SECRET/);
  });

  it('builds a PKCE authorize URL', async () => {
    const { url, codeVerifier, state } = await new XProvider(app('x')).generateAuthUrl();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://x.com/i/oauth2/authorize');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('client-id');
    expect(u.searchParams.get('redirect_uri')).toBe('https://harbor.test/v1/channels/x/callback');
    expect(u.searchParams.get('scope')).toBe('tweet.read tweet.write users.read offline.access media.write');
    expect(u.searchParams.get('state')).toBe(state);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(u.searchParams.get('code_challenge')).toBe(createHash('sha256').update(codeVerifier).digest('base64url'));
  });

  it('exchanges the code and loads the account', async () => {
    const f = fakeFetch({
      'POST api.x.com/2/oauth2/token': json(200, { access_token: 'at', refresh_token: 'rt', expires_in: 7200, scope: 'tweet.read tweet.write' }),
      'GET api.x.com/2/users/me': me,
    });
    const before = Date.now();
    const t = await new XProvider(app('x'), f.impl).authenticate({ code: 'c0de', codeVerifier: 'ver' });
    expect(t).toMatchObject({ accessToken: 'at', refreshToken: 'rt', scopes: ['tweet.read', 'tweet.write'] });
    expect(t.account).toEqual({ platformAccountId: '42', handle: 'harbor', displayName: 'Harbor', avatarUrl: 'https://pbs.twimg.com/a.jpg' });
    expect(Date.parse(t.expiresAt!) - before).toBeGreaterThanOrEqual(7200_000);
    const [tokenCall] = f.find('POST', 'api.x.com/2/oauth2/token');
    expect(tokenCall!.body).toMatchObject({ grant_type: 'authorization_code', code: 'c0de', code_verifier: 'ver', redirect_uri: 'https://harbor.test/v1/channels/x/callback' });
    expect(tokenCall!.headers.authorization).toBe(`Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
    expect(f.find('GET', 'api.x.com/2/users/me')[0]!.headers.authorization).toBe('Bearer at');
  });

  it('turns a rejected refresh token into RefreshNeeded', async () => {
    const f = fakeFetch({ 'POST api.x.com/2/oauth2/token': json(400, { error: 'invalid_request', error_description: 'Value passed for the token was invalid.' }) });
    await expect(new XProvider(app('x'), f.impl).refreshToken('old')).rejects.toBeInstanceOf(RefreshNeeded);
    expect(f.calls[0]!.body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'old' });
  });

  it('publishes only the first part, with uploaded images', async () => {
    const f = fakeFetch({
      'GET cdn.test/a.png': new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }),
      'POST api.x.com/2/media/upload': json(200, { data: { id: 'm1', media_key: '3_m1' } }),
      'POST api.x.com/2/tweets': json(201, { data: { id: '1001', text: 'hello' } }),
    });
    const r = await new XProvider(app('x'), f.impl).publish(ctx, {
      postId: 'pst_1',
      parts: [{ text: 'hello', media: [{ kind: 'image', url: 'https://cdn.test/a.png' }] }, { text: 'reply', media: [] }],
    });
    expect(r).toEqual({ status: 'published', platformPostId: '1001', url: 'https://x.com/harbor/status/1001' });
    const upload = f.find('POST', 'api.x.com/2/media/upload')[0]!;
    expect(upload.body).toBeInstanceOf(FormData);
    expect((upload.body as FormData).get('media_category')).toBe('tweet_image');
    const tweets = f.find('POST', 'api.x.com/2/tweets');
    expect(tweets).toHaveLength(1);
    expect(tweets[0]!.body).toEqual({ text: 'hello', media: { media_ids: ['m1'] } });
    expect(tweets[0]!.headers.authorization).toBe('Bearer tok');
  });

  it('replies via comment()', async () => {
    const f = fakeFetch({ 'POST api.x.com/2/tweets': json(201, { data: { id: '1002' } }) });
    const r = await new XProvider(app('x'), f.impl).comment(ctx, { replyToPlatformPostId: '1001', part: { text: 'more', media: [] } });
    expect(r).toEqual({ platformPostId: '1002', url: 'https://x.com/harbor/status/1002' });
    expect(f.calls[0]!.body).toEqual({ text: 'more', reply: { in_reply_to_tweet_id: '1001' } });
  });

  it('rejects video for now', async () => {
    const f = fakeFetch({});
    await expect(
      new XProvider(app('x'), f.impl).publish(ctx, { postId: 'p', parts: [{ text: 'v', media: [{ kind: 'video', url: 'https://cdn.test/v.mp4' }] }] }),
    ).rejects.toThrow(/Video on X/);
    expect(f.calls).toHaveLength(0);
  });

  describe('error mapping', () => {
    const publish = (res: Parameters<typeof fakeFetch>[0][string]) =>
      new XProvider(app('x'), fakeFetch({ 'POST api.x.com/2/tweets': res }).impl).publish(ctx, { postId: 'p', parts: [{ text: 'hi', media: [] }] });

    it('401 → RefreshNeeded', async () => {
      await expect(publish(json(401, { title: 'Unauthorized', detail: 'Unauthorized', status: 401 }))).rejects.toBeInstanceOf(RefreshNeeded);
    });
    it('429 → RateLimited with reset', async () => {
      const reset = Math.floor(Date.now() / 1000) + 60;
      const err = await publish(json(429, { title: 'Too Many Requests' }, { 'x-rate-limit-reset': String(reset) })).catch((e) => e);
      expect(err).toBeInstanceOf(RateLimited);
      expect(err.retryAfterSec).toBeGreaterThan(55);
      expect(err.retryAfterSec).toBeLessThanOrEqual(61);
    });
    it('400/403 → BadRequest with the platform message', async () => {
      const err = await publish(json(403, { detail: 'You are not allowed to create a Tweet with duplicate content.' })).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequest);
      expect(err.message).toMatch(/duplicate content/);
      expect(err.details).toMatchObject({ status: 403 });
    });
    it('5xx and network errors on create → PublishOutcomeUnknown', async () => {
      await expect(publish(json(503, { title: 'Service Unavailable' }))).rejects.toBeInstanceOf(PublishOutcomeUnknown);
      await expect(publish(networkError())).rejects.toBeInstanceOf(PublishOutcomeUnknown);
    });
    it('5xx on a read is a plain retryable error', async () => {
      const f = fakeFetch({ 'GET api.x.com/2/tweets/1': json(500, {}) });
      const err = await new XProvider(app('x'), f.impl).fetchPostMetrics(ctx, '1').catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(PublishOutcomeUnknown);
    });
    it('never puts the token in error messages', async () => {
      const err = await publish(json(400, { detail: 'nope' })).catch((e) => e);
      expect(err.message).not.toContain('tok');
    });
  });

  describe('metrics', () => {
    const tweet = {
      id: '1',
      public_metrics: { impression_count: 900, like_count: 10, reply_count: 2, retweet_count: 3, quote_count: 1, bookmark_count: 4 },
      non_public_metrics: { impression_count: 900, user_profile_clicks: 5, url_link_clicks: 7 },
    };

    it('maps public and non-public metrics', async () => {
      const f = fakeFetch({ 'GET api.x.com/2/tweets/1': json(200, { data: tweet }) });
      const m = await new XProvider(app('x'), f.impl).fetchPostMetrics(ctx, '1');
      expect(m.metrics).toEqual({ views: 900, likes: 10, comments: 2, reposts: 4, saves: 4, profileVisits: 5, linkClicks: 7 });
      expect(m.adapterVersion).toBe('1.0.0');
      expect(f.calls[0]!.url.searchParams.get('tweet.fields')).toBe('public_metrics,non_public_metrics,created_at');
    });

    it('falls back to public metrics when non-public is refused', async () => {
      const f = fakeFetch({
        'GET api.x.com/2/tweets/1': [json(400, { title: 'Invalid Request' }), json(200, { data: { id: '1', public_metrics: { like_count: 1 } } })],
      });
      const m = await new XProvider(app('x'), f.impl).fetchPostMetrics(ctx, '1');
      expect(m.metrics).toEqual({ likes: 1 });
      expect(f.calls[1]!.url.searchParams.get('tweet.fields')).toBe('public_metrics,created_at');
    });
  });

  describe('replies and past posts', () => {
    it('reads nothing unless HARBOR_X_READ_REPLIES=true (X bills per read)', async () => {
      const f = fakeFetch({});
      const x = new XProvider(app('x'), f.impl);
      expect(x.reportsReplies).toBe(false);
      expect(await x.fetchReplies(ctx, '1001', {})).toEqual([]);
      expect(await x.listRecentPosts(ctx, { limit: 10 })).toEqual([]);
      expect(f.calls).toHaveLength(0);
      expect(createProviderRegistry({}).get('x')!.reportsReplies).toBe(false);
      expect(createProviderRegistry({ HARBOR_X_READ_REPLIES: 'true' }).get('x')!.reportsReplies).toBe(true);
    });

    it('searches the conversation for replies when enabled', async () => {
      const f = fakeFetch({
        'GET api.x.com/2/tweets/search/recent': json(200, {
          data: [
            { id: '2001', text: 'How do you measure it?', author_id: '7', created_at: '2026-10-14T09:00:00.000Z', public_metrics: { like_count: 2 } },
            { id: '2002', text: 'my own thread part', author_id: '42', created_at: '2026-10-14T09:01:00.000Z' },
          ],
          includes: { users: [{ id: '7', username: 'mara', name: 'Mara' }] },
        }),
      });
      const replies = await new XProvider({ ...app('x'), readReplies: true }, f.impl).fetchReplies(ctx, '1001', { limit: 5 });
      expect(replies).toEqual([{ platformReplyId: '2001', author: { handle: 'mara', displayName: 'Mara' }, text: 'How do you measure it?', createdAt: '2026-10-14T09:00:00.000Z', likes: 2 }]);
      const q = f.calls[0]!.url.searchParams;
      expect(q.get('query')).toBe('conversation_id:1001');
      expect(q.get('max_results')).toBe('10');
      expect(f.calls[0]!.headers.authorization).toBe('Bearer tok');
    });

    it('lists the account\'s posts with public metrics when enabled', async () => {
      const f = fakeFetch({
        'GET api.x.com/2/users/42/tweets': json(200, {
          data: [{ id: '1001', text: 'Hello', created_at: '2026-10-01T09:00:00.000Z', public_metrics: { impression_count: 500, like_count: 9, reply_count: 1, retweet_count: 2, quote_count: 0 } }],
        }),
      });
      const posts = await new XProvider({ ...app('x'), readReplies: true }, f.impl).listRecentPosts(ctx, { limit: 30 });
      expect(posts).toEqual([
        { platformPostId: '1001', text: 'Hello', publishedAt: '2026-10-01T09:00:00.000Z', url: 'https://x.com/harbor/status/1001', metrics: { views: 500, likes: 9, comments: 1, reposts: 2 } },
      ]);
      expect(f.calls[0]!.url.searchParams.get('exclude')).toBe('replies,retweets');
    });
  });
});
