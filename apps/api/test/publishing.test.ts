import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PLATFORM_METRICS,
  PublishOutcomeUnknown,
  RateLimited,
  type AuthCallback,
  type JsonObject,
  type Platform,
  type PlatformProvider,
  type PostPart,
  type ProviderContext,
  type PublishRequest,
  type PublishResult,
  type StatusCheck,
  type TokenSet,
} from '@harbor/core';
import { createApp, createDeps, type App, type AppDeps } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { tick } from '../src/worker.ts';

/** A scriptable stand-in for a platform. `mode` decides what publish() does. */
class FakeProvider implements PlatformProvider {
  readonly name: string;
  readonly scopes = ['write'];
  readonly adapterVersion = 'test-1';
  readonly maxConcurrentJobs = 1;
  readonly reportsReplies = false;
  mode: 'published' | 'pending' | 'unknown' | 'rate_limited' = 'published';
  calls = { publish: 0, comment: [] as string[], finalize: 0, refresh: 0 };
  constructor(readonly identifier: Platform) {
    this.name = identifier.toUpperCase();
  }
  get metrics() {
    return PLATFORM_METRICS[this.identifier];
  }
  maxLength() {
    return 280;
  }
  validate(parts: PostPart[]) {
    return parts[0]?.text.includes('INVALID') ? { ok: false as const, issues: ['nope'] } : { ok: true as const };
  }
  async generateAuthUrl() {
    return { url: `https://${this.identifier}.example/auth?state=st_${this.identifier}`, codeVerifier: 'verifier', state: `st_${this.identifier}_${Date.now()}` };
  }
  async authenticate(cb: AuthCallback): Promise<TokenSet> {
    expect(cb.codeVerifier).toBe('verifier');
    return {
      accessToken: `secret-access-${cb.code}`,
      refreshToken: 'secret-refresh',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scopes: [...this.scopes],
      account: { platformAccountId: '42', handle: 'harborhq', displayName: 'Harbor' },
    };
  }
  async refreshToken(): Promise<TokenSet> {
    this.calls.refresh++;
    return { ...(await this.authenticate({ code: 'refreshed', codeVerifier: 'verifier' })) };
  }
  async publish(_ctx: ProviderContext, _req: PublishRequest): Promise<PublishResult> {
    this.calls.publish++;
    if (this.mode === 'unknown') throw new PublishOutcomeUnknown(this.identifier, 'socket hang up');
    if (this.mode === 'rate_limited') throw new RateLimited(this.identifier, 'slow down', 120);
    if (this.mode === 'pending') return { status: 'pending', pendingData: { containerId: 'c1' } };
    return { status: 'published', platformPostId: `p${this.calls.publish}`, url: `https://${this.identifier}.example/p${this.calls.publish}` };
  }
  async checkStatus(_ctx: ProviderContext, pendingData: JsonObject): Promise<StatusCheck> {
    return { status: 'ready', pendingData };
  }
  async finalize() {
    this.calls.finalize++;
    return { status: 'published' as const, platformPostId: 'final1', url: 'https://ig.example/final1' };
  }
  async comment(_ctx: ProviderContext, req: { replyToPlatformPostId: string; part: PostPart }) {
    this.calls.comment.push(req.replyToPlatformPostId);
    return { platformPostId: `r${this.calls.comment.length}` };
  }
  async fetchPostMetrics(ctx: ProviderContext, id: string) {
    return { raw: { id, token: ctx.accessToken.length }, metrics: { views: 120, likes: 9 }, adapterVersion: this.adapterVersion };
  }
}

let db: Db;
let app: App;
let deps: AppDeps;
const x = new FakeProvider('x');
const ig = new FakeProvider('instagram');
let brandId: string;

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

async function connect(platform: Platform): Promise<string> {
  const start = await send('GET', `/v1/channels/${platform}/connect?brandId=${brandId}`);
  expect(start.status).toBe(302);
  const [state] = await db.query<{ state: string }>('SELECT state FROM oauth_states WHERE platform = $1 ORDER BY created_at DESC LIMIT 1', [platform]);
  const cb = await send('GET', `/v1/channels/${platform}/callback?code=abc&state=${state!.state}`);
  expect(cb.status).toBe(302);
  expect(cb.headers.get('location')).toContain(`/brands/${brandId}?connected=`);
  const [ch] = await db.query<{ id: string }>('SELECT id FROM channels WHERE platform = $1', [platform]);
  return ch!.id;
}

beforeAll(async () => {
  db = await openDb('memory://');
  const registry = new Map<Platform, PlatformProvider>([['x', x], ['instagram', ig]]);
  deps = createDeps(db, { publishMode: 'live', registry, secretKey: randomBytes(32).toString('base64'), webUrl: 'http://web.test' });
  app = createApp(db, {}, deps);
  const res = await send('POST', '/v1/brands', { name: 'Harbor' });
  brandId = (await res.json()).id;
});
afterAll(() => db.close());
beforeEach(() => {
  x.mode = 'published';
  x.calls = { publish: 0, comment: [], finalize: 0, refresh: 0 };
});

describe('connecting a channel', () => {
  it('stores the account and keeps the token encrypted', async () => {
    const id = await connect('x');
    const list = await (await send('GET', `/v1/brands/${brandId}/channels`)).json();
    expect(list.data).toEqual([expect.objectContaining({ id, platform: 'x', status: 'connected', account: expect.objectContaining({ handle: 'harborhq' }) })]);
    const [secret] = await db.query<{ ciphertext: string }>('SELECT ciphertext FROM secrets');
    expect(secret!.ciphertext).not.toContain('secret-access');
    expect(await deps.secrets().get(list.data[0].tokenRef)).toMatchObject({ accessToken: 'secret-access-abc' });
  });

  it('rejects a callback with an unknown state', async () => {
    const res = await send('GET', '/v1/channels/x/callback?code=abc&state=forged');
    expect(res.status).toBe(400);
  });

  it('sends the browser back with the error when the owner declines', async () => {
    await send('GET', `/v1/channels/x/connect?brandId=${brandId}`);
    const [st] = await db.query<{ state: string }>("SELECT state FROM oauth_states WHERE platform = 'x' ORDER BY created_at DESC LIMIT 1");
    const res = await send('GET', `/v1/channels/x/callback?error=access_denied&state=${st!.state}`);
    expect(res.headers.get('location')).toContain('error=');
  });
});

describe('publishing', () => {
  let channelId: string;
  beforeAll(async () => {
    [{ id: channelId }] = (await db.query<{ id: string }>("SELECT id FROM channels WHERE platform = 'x'")) as [{ id: string }];
  });

  it('publishes now, chains thread replies and schedules the growth curve', async () => {
    const res = await send('POST', '/v1/posts', {
      channelId,
      parts: [{ text: 'Main post' }, { text: 'Reply one' }, { text: 'Reply two' }],
    });
    expect(res.status).toBe(201);
    const post = await res.json();
    expect(post).toMatchObject({ status: 'published', platformPostId: 'p1', url: 'https://x.example/p1' });
    expect(x.calls.comment).toEqual(['p1', 'r1']);
    const jobs = await db.query<{ age_hours: number }>('SELECT age_hours FROM snapshot_jobs WHERE post_id = $1 ORDER BY age_hours', [post.id]);
    expect(jobs.map((j) => Number(j.age_hours))).toEqual([1, 6, 24, 72, 168]);
  });

  it('takes a snapshot when one is due', async () => {
    const [post] = await db.query<{ id: string }>("SELECT id FROM posts WHERE status = 'published' LIMIT 1");
    await db.query("UPDATE snapshot_jobs SET due_at = now() - interval '1 minute' WHERE post_id = $1 AND age_hours = 1", [post!.id]);
    await tick(deps.publishDeps());
    const detail = await (await send('GET', `/v1/posts/${post!.id}`)).json();
    expect(detail.snapshots).toHaveLength(1);
    expect(detail.snapshots[0].metrics).toEqual({ views: 120, likes: 9 });
    expect(detail.latest.metrics.views).toBe(120);
  });

  it('never retries a publish whose outcome is unknown', async () => {
    x.mode = 'unknown';
    const post = await (await send('POST', '/v1/posts', { channelId, parts: [{ text: 'Maybe posted' }] })).json();
    expect(post.status).toBe('unknown');
    expect(post.error.kind).toBe('outcome_unknown');
    await tick(deps.publishDeps());
    expect(x.calls.publish).toBe(1);

    // The owner checks the platform: it did not go out, so Harbor queues it again.
    x.mode = 'published';
    const resolved = await (await send('POST', `/v1/posts/${post.id}/resolve`, { outcome: 'not_published' })).json();
    expect(resolved.status).toBe('scheduled');
    await tick(deps.publishDeps());
    expect((await (await send('GET', `/v1/posts/${post.id}`)).json()).status).toBe('published');
  });

  it('backs off on a rate limit without publishing', async () => {
    x.mode = 'rate_limited';
    const post = await (await send('POST', '/v1/posts', { channelId, parts: [{ text: 'Later' }] })).json();
    expect(post.status).toBe('scheduled');
    expect(Date.parse(post.scheduledFor)).toBeGreaterThan(Date.now() + 60_000);
  });

  it('refuses content the platform would reject', async () => {
    const res = await send('POST', '/v1/posts', { channelId, parts: [{ text: 'INVALID' }] });
    expect(res.status).toBe(400);
  });

  it('refreshes a token that is about to expire', async () => {
    const [ch] = await db.query<{ token_ref: string }>('SELECT token_ref FROM channels WHERE id = $1', [channelId]);
    const stored = await deps.secrets().get<Record<string, string>>(ch!.token_ref);
    await deps.secrets().put(ch!.token_ref, { ...stored, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await send('POST', '/v1/posts', { channelId, parts: [{ text: 'After refresh' }] });
    expect(x.calls.refresh).toBe(1);
  });

  it('waits for a pending platform, then finalizes', async () => {
    ig.mode = 'pending';
    const igChannel = await connect('instagram');
    const post = await (await send('POST', '/v1/posts', { channelId: igChannel, parts: [{ text: 'Photo', media: [{ kind: 'image', url: 'https://cdn.example/a.jpg' }] }] })).json();
    expect(post.status).toBe('pending');
    await db.query("UPDATE posts SET next_check_at = now() - interval '1 second' WHERE id = $1", [post.id]);
    await tick(deps.publishDeps());
    const done = await (await send('GET', `/v1/posts/${post.id}`)).json();
    expect(done).toMatchObject({ status: 'published', platformPostId: 'final1' });
    expect(ig.calls.finalize).toBe(1);
  });
});
