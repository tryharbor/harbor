import { describe, expect, it } from 'vitest';
import { BadRequest, PublishOutcomeUnknown, RateLimited, RefreshNeeded, type PlatformProvider } from '@harbor/core';
import { LinkedInProvider, escapeLittleText, toCommentary } from '../src/index.ts';
import { app, fakeFetch, json } from './fake-fetch.ts';

const ctx = { accessToken: 'tok', account: { platformAccountId: 'abc123', handle: 'Derek' } };
const URN = 'urn:li:share:7000000000000000001';

describe('toCommentary', () => {
  it('turns #tags into LinkedIn hashtags and escapes the rest', () => {
    expect(toCommentary('Shipping #buildinpublic (day 3) and #AI_agents. Not a tag: C# or a#b'))
      .toBe('Shipping {hashtag|\\#|buildinpublic} \\(day 3\\) and {hashtag|\\#|AI\\_agents}. Not a tag: C\\# or a\\#b');
  });
});

describe('escapeLittleText', () => {
  it('backslash-escapes every reserved character', () => {
    expect(escapeLittleText('a|b{c}d@e[f]g(h)i<j>k#l\\m*n_o~p')).toBe('a\\|b\\{c\\}d\\@e\\[f\\]g\\(h\\)i\\<j\\>k\\#l\\\\m\\*n\\_o\\~p');
  });
  it('leaves ordinary text alone', () => {
    expect(escapeLittleText('Hello, world! 50% off: café.')).toBe('Hello, world! 50% off: café.');
  });
});

describe('LinkedInProvider', () => {
  it('builds an authorize URL without PKCE', async () => {
    const { url, codeVerifier, state } = await new LinkedInProvider(app('linkedin')).generateAuthUrl();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(u.searchParams.get('scope')).toBe('openid profile w_member_social');
    expect(u.searchParams.get('redirect_uri')).toBe('https://harbor.test/v1/channels/linkedin/callback');
    expect(u.searchParams.get('state')).toBe(state);
    expect(u.searchParams.has('code_challenge')).toBe(false);
    expect(codeVerifier).toBe('');
  });

  it('asks for LINKEDIN_* env when unconfigured', async () => {
    await expect(new LinkedInProvider({}).authenticate({ code: 'c', codeVerifier: '' })).rejects.toThrow(/LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET/);
  });

  it('exchanges the code, reads userinfo, and returns no refresh token', async () => {
    const f = fakeFetch({
      'POST www.linkedin.com/oauth/v2/accessToken': json(200, { access_token: 'at', expires_in: 5183999, scope: 'openid,profile,w_member_social', refresh_token: 'ignored' }),
      'GET api.linkedin.com/v2/userinfo': json(200, { sub: 'abc123', name: 'Derek K', picture: 'https://media.licdn.com/p.jpg' }),
    });
    const t = await new LinkedInProvider(app('linkedin'), f.impl).authenticate({ code: 'c0de', codeVerifier: '' });
    expect(t.refreshToken).toBeUndefined();
    expect(t.scopes).toEqual(['openid', 'profile', 'w_member_social']);
    expect(t.account).toEqual({ platformAccountId: 'abc123', handle: 'Derek K', displayName: 'Derek K', avatarUrl: 'https://media.licdn.com/p.jpg' });
    expect(f.calls[0]!.body).toMatchObject({ grant_type: 'authorization_code', code: 'c0de', client_id: 'client-id', client_secret: 'client-secret' });
  });

  it("can't refresh", async () => {
    await expect(new LinkedInProvider(app('linkedin')).refreshToken('x')).rejects.toBeInstanceOf(RefreshNeeded);
  });

  it('has no fetchPostMetrics', () => {
    const p: PlatformProvider = new LinkedInProvider(app('linkedin'));
    expect(p.fetchPostMetrics).toBeUndefined();
  });

  it('publishes a text post with versioned headers and escaped commentary', async () => {
    const f = fakeFetch({ 'POST api.linkedin.com/rest/posts': json(201, undefined, { 'x-restli-id': URN }) });
    const r = await new LinkedInProvider({ ...app('linkedin'), apiVersion: '202605' }, f.impl).publish(ctx, {
      postId: 'p',
      parts: [{ text: 'Ship it (v2) #launch', media: [] }],
    });
    expect(r).toEqual({ status: 'published', platformPostId: URN, url: `https://www.linkedin.com/feed/update/${URN}/` });
    const call = f.calls[0]!;
    expect(call.headers['linkedin-version']).toBe('202605');
    expect(call.headers['x-restli-protocol-version']).toBe('2.0.0');
    expect(call.headers.authorization).toBe('Bearer tok');
    expect(call.body).toEqual({
      author: 'urn:li:person:abc123',
      commentary: 'Ship it \\(v2\\) {hashtag|\\#|launch}',
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
  });

  it('defaults Linkedin-Version', async () => {
    const f = fakeFetch({ 'POST api.linkedin.com/rest/posts': json(201, undefined, { 'x-restli-id': URN }) });
    await new LinkedInProvider(app('linkedin'), f.impl).publish(ctx, { postId: 'p', parts: [{ text: 'hi', media: [] }] });
    expect(f.calls[0]!.headers['linkedin-version']).toBe('202601');
  });

  it('uploads a single image before posting', async () => {
    const f = fakeFetch({
      'POST api.linkedin.com/rest/images': json(200, { value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/xyz', image: 'urn:li:image:I1' } }),
      'GET cdn.test/a.jpg': new Response(new Uint8Array([9, 9]), { headers: { 'content-type': 'image/jpeg' } }),
      'PUT www.linkedin.com/dms-uploads/xyz': new Response(null, { status: 201 }),
      'POST api.linkedin.com/rest/posts': json(201, undefined, { 'x-restli-id': URN }),
    });
    await new LinkedInProvider(app('linkedin'), f.impl).publish(ctx, {
      postId: 'p',
      parts: [{ text: 'pic', media: [{ kind: 'image', url: 'https://cdn.test/a.jpg', alt: 'A chart' }] }],
    });
    expect(f.calls.map((c) => `${c.method} ${c.url.host}${c.url.pathname}`)).toEqual([
      'POST api.linkedin.com/rest/images',
      'GET cdn.test/a.jpg',
      'PUT www.linkedin.com/dms-uploads/xyz',
      'POST api.linkedin.com/rest/posts',
    ]);
    expect(f.calls[0]!.url.searchParams.get('action')).toBe('initializeUpload');
    expect(f.calls[0]!.body).toEqual({ initializeUploadRequest: { owner: 'urn:li:person:abc123' } });
    expect(f.calls[3]!.body.content).toEqual({ media: { id: 'urn:li:image:I1', altText: 'A chart' } });
  });

  it('rejects multiple images and video for now', async () => {
    const p = new LinkedInProvider(app('linkedin'), fakeFetch({}).impl);
    const img = { kind: 'image' as const, url: 'https://cdn.test/a.jpg' };
    await expect(p.publish(ctx, { postId: 'p', parts: [{ text: 'x', media: [img, img] }] })).rejects.toBeInstanceOf(BadRequest);
    await expect(p.publish(ctx, { postId: 'p', parts: [{ text: 'x', media: [{ kind: 'video', url: 'https://cdn.test/v.mp4' }] }] })).rejects.toBeInstanceOf(BadRequest);
  });

  it('comments on a post', async () => {
    const f = fakeFetch({ [`POST api.linkedin.com/rest/socialActions/${encodeURIComponent(URN)}/comments`]: json(201, { id: '99' }, { 'x-restli-id': 'urn:li:comment:(urn:li:activity:1,99)' }) });
    const r = await new LinkedInProvider(app('linkedin'), f.impl).comment(ctx, { replyToPlatformPostId: URN, part: { text: 'first!', media: [] } });
    // Thread parts stay top-level comments on the original post.
    expect(r.platformPostId).toBe(URN);
    expect(f.calls[0]!.body).toEqual({ actor: 'urn:li:person:abc123', object: URN, message: { text: 'first!' } });
  });

  describe('error mapping', () => {
    const publish = (res: Response) =>
      new LinkedInProvider(app('linkedin'), fakeFetch({ 'POST api.linkedin.com/rest/posts': res }).impl).publish(ctx, { postId: 'p', parts: [{ text: 'hi', media: [] }] });
    it('401 → RefreshNeeded', async () => {
      await expect(publish(json(401, { status: 401, serviceErrorCode: 65601, message: 'The token used in the request has been revoked by the user' }))).rejects.toBeInstanceOf(RefreshNeeded);
    });
    it('429 → RateLimited', async () => {
      const err = await publish(json(429, { message: 'Too many requests' }, { 'retry-after': '120' })).catch((e) => e);
      expect(err).toBeInstanceOf(RateLimited);
      expect(err.retryAfterSec).toBe(120);
    });
    it('422 → BadRequest with message', async () => {
      const err = await publish(json(422, { status: 422, message: 'Content is a duplicate of urn:li:share:1' })).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequest);
      expect(err.message).toMatch(/duplicate/);
    });
    it('500 → PublishOutcomeUnknown', async () => {
      await expect(publish(json(500, { message: 'Internal' }))).rejects.toBeInstanceOf(PublishOutcomeUnknown);
    });
  });
});
