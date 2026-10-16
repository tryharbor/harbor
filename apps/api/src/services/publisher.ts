import {
  BadRequest,
  HarborError,
  PublishOutcomeUnknown,
  RateLimited,
  RefreshNeeded,
  SNAPSHOT_SCHEDULE_HOURS,
  classifyPublishFailure,
  newId,
  postPartSchema,
  type PlatformProvider,
  type PostPart,
  type ProviderContext,
} from '@harbor/core';
import type { ProviderRegistry } from '@harbor/providers';
import type { Db } from '../db/client.ts';
import type { SecretStore } from '../lib/secrets.ts';
import { getChannelRow, providerContext, setChannelStatus, type ChannelRow } from './channels.ts';
import { refreshOutcome } from './outcomes.ts';

export interface PublishDeps {
  db: Db;
  secrets: SecretStore;
  registry: ProviderRegistry;
}

export interface PostRow {
  id: string;
  brand_id: string;
  channel_id: string;
  draft_id: string | null;
  idea_id: string | null;
  status: 'scheduled' | 'publishing' | 'pending' | 'published' | 'failed' | 'unknown';
  scheduled_for: Date | string | null;
  published_at: Date | string | null;
  platform_post_id: string | null;
  url: string | null;
  pending_data: Record<string, unknown> | null;
  error: { kind: string; message: string } | null;
  attempts: number;
  next_check_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Publish tries that proved nothing went out (rate limit, refreshed token) before we give up. */
export const MAX_PUBLISH_ATTEMPTS = 5;
/** How often a 'pending' post (platform still processing media) is checked, and how long we wait overall. */
export const PENDING_CHECK_SEC = 10;
export const PENDING_GIVE_UP_MIN = 30;
/** A post stuck in 'publishing' this long means the process died mid-call: the outcome is unknown. */
export const STALE_PUBLISHING_MIN = 10;

const providerFor = (deps: PublishDeps, channel: ChannelRow): PlatformProvider => {
  const provider = deps.registry.get(channel.platform);
  if (!provider) throw new HarborError('INTERNAL_ERROR', `No provider registered for ${channel.platform}.`);
  return provider;
};

async function loadParts(db: Db, post: PostRow): Promise<PostPart[]> {
  if (!post.draft_id) return [];
  const [draft] = await db.query<{ parts: unknown }>('SELECT parts FROM drafts WHERE id = $1', [post.draft_id]);
  return postPartSchema.array().parse(draft?.parts ?? []);
}

const errorJson = (kind: string, message: string) => JSON.stringify({ kind, message });

async function setStatus(db: Db, id: string, status: PostRow['status'], extra: { error?: string | null; scheduledFor?: Date } = {}) {
  await db.query(
    `UPDATE posts SET status = $2, error = COALESCE($3::jsonb, error), scheduled_for = COALESCE($4, scheduled_for),
       pending_data = CASE WHEN $2 IN ('failed', 'unknown', 'scheduled') THEN NULL ELSE pending_data END,
       next_check_at = NULL, updated_at = now()
     WHERE id = $1`,
    [id, status, extra.error ?? null, extra.scheduledFor?.toISOString() ?? null],
  );
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Turn a failed publish/finalize call into the next state, following the core rule: only retry when the failure
 * proves nothing was published; anything ambiguous becomes `unknown` for a human to resolve.
 */
async function handleFailure(deps: PublishDeps, post: PostRow, channel: ChannelRow, provider: PlatformProvider, err: unknown) {
  const action = classifyPublishFailure(err);
  const { db } = deps;
  switch (action.action) {
    case 'retry': {
      if (post.attempts >= MAX_PUBLISH_ATTEMPTS) return setStatus(db, post.id, 'failed', { error: errorJson('rate_limited', `Gave up after ${post.attempts} tries: ${message(err)}`) });
      const after = new Date(Date.now() + (action.afterSec ?? 60 * 2 ** post.attempts) * 1000);
      return setStatus(db, post.id, 'scheduled', { error: errorJson('rate_limited', message(err)), scheduledFor: after });
    }
    case 'refresh_then_retry': {
      if (post.attempts >= MAX_PUBLISH_ATTEMPTS) return setStatus(db, post.id, 'failed', { error: errorJson('refresh_needed', message(err)) });
      try {
        await providerContext(db, deps.secrets, provider, channel, { forceRefresh: true });
        return setStatus(db, post.id, 'scheduled', { error: errorJson('refresh_needed', 'Token refreshed; retrying.'), scheduledFor: new Date() });
      } catch (refreshErr) {
        return setStatus(db, post.id, 'failed', { error: errorJson('refresh_needed', message(refreshErr)) });
      }
    }
    case 'fail':
      if (action.disconnect) await setChannelStatus(db, channel.id, 'disconnected');
      return setStatus(db, post.id, 'failed', { error: errorJson(err instanceof BadRequest ? 'bad_request' : 'disconnect', message(err)) });
    case 'mark_published':
      return markPublished(deps, post, channel, provider, { platformPostId: action.platformPostId, url: action.url }, { kind: 'published_with_error', message: message(err) });
    case 'needs_human':
      return setStatus(db, post.id, 'unknown', {
        error: errorJson('outcome_unknown', `We sent the post but couldn't confirm it went out (${message(err)}). Check ${provider.name} before retrying.`),
      });
  }
}

async function markPublished(
  deps: PublishDeps,
  post: PostRow,
  channel: ChannelRow,
  provider: PlatformProvider,
  result: { platformPostId: string; url?: string },
  error?: { kind: string; message: string },
  ctx?: ProviderContext,
) {
  const { db } = deps;
  const [row] = await db.query<PostRow>(
    `UPDATE posts SET status = 'published', published_at = COALESCE(published_at, now()), platform_post_id = $2, url = $3,
       pending_data = NULL, next_check_at = NULL, error = $4::jsonb, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [post.id, result.platformPostId, result.url ?? null, error ? JSON.stringify(error) : null],
  );
  if (post.idea_id) await db.query("UPDATE ideas SET status = 'live', updated_at = now() WHERE id = $1", [post.idea_id]);

  // Thread replies: each extra part answers the previous one. The post is already live, so a failure here is
  // recorded on the post, never retried as a new publish.
  const parts = await loadParts(db, post);
  if (parts.length > 1) {
    let replyTo = result.platformPostId;
    try {
      if (!provider.comment) throw new Error(`${provider.name} replies aren't supported yet.`);
      const replyCtx = ctx ?? (await providerContext(db, deps.secrets, provider, channel));
      for (const part of parts.slice(1)) replyTo = (await provider.comment(replyCtx, { replyToPlatformPostId: replyTo, part })).platformPostId;
    } catch (err) {
      await db.query('UPDATE posts SET error = $2::jsonb WHERE id = $1', [post.id, errorJson('published_with_error', `The post is live, but a reply failed: ${message(err)}`)]);
    }
  }

  // Growth curve: one snapshot job per age, only for platforms that report metrics.
  if (provider.fetchPostMetrics && row?.published_at) {
    const publishedAt = new Date(row.published_at).getTime();
    for (const h of SNAPSHOT_SCHEDULE_HOURS) {
      await db.query(
        'INSERT INTO snapshot_jobs (post_id, age_hours, due_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [post.id, h, new Date(publishedAt + h * 3_600_000).toISOString()],
      );
    }
  }
}

/** Publish one due post. Safe to call concurrently: only the caller that claims the row does anything. */
export async function publishPost(deps: PublishDeps, postId: string): Promise<void> {
  const { db } = deps;
  const [post] = await db.query<PostRow>(
    `UPDATE posts SET status = 'publishing', attempts = attempts + 1, updated_at = now()
     WHERE id = $1 AND status = 'scheduled' AND (scheduled_for IS NULL OR scheduled_for <= now())
     RETURNING *`,
    [postId],
  );
  if (!post) return;
  const channel = await getChannelRow(db, post.channel_id);
  const provider = providerFor(deps, channel);

  // Everything before provider.publish() sends nothing, so failures here are plain failures.
  let ctx: ProviderContext;
  try {
    const parts = await loadParts(db, post);
    const check = provider.validate(parts);
    if (!check.ok) throw new BadRequest(channel.platform, check.issues.join(' '));
    ctx = await providerContext(db, deps.secrets, provider, channel);
    const result = await provider.publish(ctx, { parts, postId: post.id });
    if (result.status === 'published') return markPublished(deps, post, channel, provider, result, undefined, ctx);
    await db.query(
      `UPDATE posts SET status = 'pending', pending_data = $2::jsonb, platform_post_id = COALESCE($3, platform_post_id),
         next_check_at = now() + make_interval(secs => $4), updated_at = now()
       WHERE id = $1`,
      [post.id, JSON.stringify(result.pendingData), result.platformPostId ?? null, PENDING_CHECK_SEC],
    );
  } catch (err) {
    // providerContext() marks the channel refresh_needed when it refuses, before anything is sent.
    if (err instanceof RefreshNeeded && (await channelStatus(db, channel.id)) !== 'connected') {
      return setStatus(db, post.id, 'failed', { error: errorJson('refresh_needed', message(err)) });
    }
    // Harbor's own errors (missing app credentials, adapter not built yet) are raised before any request goes out.
    if (err instanceof HarborError) return setStatus(db, post.id, 'failed', { error: errorJson(err.code.toLowerCase(), err.message) });
    return handleFailure(deps, post, channel, provider, err);
  }
}

async function channelStatus(db: Db, channelId: string): Promise<string | undefined> {
  const [row] = await db.query<{ status: string }>('SELECT status FROM channels WHERE id = $1', [channelId]);
  return row?.status;
}

/** Move a 'pending' post forward: wait for the platform to finish processing, then make the publish call. */
export async function advancePending(deps: PublishDeps, postId: string): Promise<void> {
  const { db } = deps;
  const [post] = await db.query<PostRow>(
    `UPDATE posts SET next_check_at = now() + make_interval(secs => $2), updated_at = now()
     WHERE id = $1 AND status = 'pending' AND next_check_at <= now() RETURNING *`,
    [postId, PENDING_CHECK_SEC],
  );
  if (!post) return;
  const channel = await getChannelRow(db, post.channel_id);
  const provider = providerFor(deps, channel);
  const pendingData = post.pending_data ?? {};
  let ctx: ProviderContext;
  try {
    ctx = await providerContext(db, deps.secrets, provider, channel);
  } catch (err) {
    // Nothing was published yet (only a media container exists), so failing here is safe.
    return setStatus(db, post.id, 'failed', { error: errorJson('refresh_needed', message(err)) });
  }

  let status;
  try {
    status = await provider.checkStatus(ctx, pendingData);
  } catch (err) {
    if (err instanceof BadRequest) return setStatus(db, post.id, 'failed', { error: errorJson('bad_request', message(err)) });
    return; // transient read failure: try again at next_check_at
  }
  if (status.status === 'published') return markPublished(deps, post, channel, provider, status, undefined, ctx);
  if (status.status === 'pending') {
    const pendingMin = (Date.now() - new Date(post.scheduled_for ?? post.created_at).getTime()) / 60_000;
    if (pendingMin > PENDING_GIVE_UP_MIN) {
      return setStatus(db, post.id, 'failed', { error: errorJson('bad_request', `${provider.name} didn't finish processing the media within ${PENDING_GIVE_UP_MIN} minutes. Nothing was published.`) });
    }
    await db.query('UPDATE posts SET pending_data = $2::jsonb WHERE id = $1', [post.id, JSON.stringify(status.pendingData)]);
    return;
  }

  // Ready: this is the call that actually publishes.
  try {
    const result = await provider.finalize(ctx, status.pendingData);
    return markPublished(deps, post, channel, provider, result, undefined, ctx);
  } catch (err) {
    if (err instanceof RateLimited) return; // nothing published; check again later
    if (err instanceof HarborError) return setStatus(db, post.id, 'failed', { error: errorJson(err.code.toLowerCase(), err.message) });
    if (err instanceof PublishOutcomeUnknown || !(err instanceof BadRequest || err instanceof RefreshNeeded)) {
      return setStatus(db, post.id, 'unknown', {
        error: errorJson('outcome_unknown', `We sent the publish call but couldn't confirm it (${message(err)}). Check ${provider.name} before retrying.`),
      });
    }
    return handleFailure(deps, post, channel, provider, err);
  }
}

/** Take one growth-curve snapshot. Failures push the job back 10 minutes; after 5 tries it's closed with the error. */
export async function takeSnapshot(deps: PublishDeps, postId: string, ageHours: number): Promise<void> {
  const { db } = deps;
  const [job] = await db.query<{ attempts: number }>(
    `UPDATE snapshot_jobs SET due_at = now() + interval '10 minutes', attempts = attempts + 1
     WHERE post_id = $1 AND age_hours = $2 AND done_at IS NULL AND due_at <= now() RETURNING attempts`,
    [postId, ageHours],
  );
  if (!job) return;
  const [post] = await db.query<PostRow>('SELECT * FROM posts WHERE id = $1', [postId]);
  try {
    if (!post?.platform_post_id || !post.published_at) throw new Error('Post has no platform id yet.');
    const channel = await getChannelRow(db, post.channel_id);
    const provider = providerFor(deps, channel);
    if (!provider.fetchPostMetrics) throw new Error(`${provider.name} doesn't report post metrics.`);
    // publishedAt and parts let the sandbox provider place the post on its growth curve (its traits shape the
    // synthetic metrics); real providers ignore both.
    const parts = await loadParts(db, post);
    const ctx = await providerContext(db, deps.secrets, provider, channel, { settings: { publishedAt: new Date(post.published_at).toISOString(), parts } });
    const m = await provider.fetchPostMetrics(ctx, post.platform_post_id);
    const age = (Date.now() - new Date(post.published_at).getTime()) / 3_600_000;
    await db.query(
      `INSERT INTO snapshots (id, post_id, taken_at, age_hours, raw, metrics, adapter_version) VALUES ($1, $2, now(), $3, $4, $5, $6)`,
      [newId('snapshot'), postId, Math.max(0, age), JSON.stringify(m.raw ?? null), JSON.stringify(m.metrics), m.adapterVersion],
    );
    await db.query('UPDATE snapshot_jobs SET done_at = now(), last_error = NULL WHERE post_id = $1 AND age_hours = $2', [postId, ageHours]);
  } catch (err) {
    await recordSnapshotFailure(db, postId, ageHours, job.attempts, err);
    return;
  }
  // The verdict moves with every snapshot. A failure here must not reopen the (already stored) snapshot.
  try {
    await refreshOutcome(db, postId);
  } catch (err) {
    console.error(`[outcomes] ${postId}:`, message(err));
  }
}

async function recordSnapshotFailure(db: Db, postId: string, ageHours: number, attempts: number, err: unknown) {
  const close = attempts >= 5;
  await db.query(
    `UPDATE snapshot_jobs SET last_error = $3, done_at = CASE WHEN $4 THEN now() ELSE NULL END WHERE post_id = $1 AND age_hours = $2`,
    [postId, ageHours, message(err), close],
  );
}

/** Posts stuck in 'publishing' (process crashed mid-call): we can't know if they went out. */
export async function sweepStalePublishing(db: Db): Promise<number> {
  const rows = await db.query(
    `UPDATE posts SET status = 'unknown', updated_at = now(),
       error = jsonb_build_object('kind', 'outcome_unknown', 'message', 'Publishing was interrupted. Check the platform before retrying.')
     WHERE status = 'publishing' AND updated_at < now() - make_interval(mins => $1) RETURNING id`,
    [STALE_PUBLISHING_MIN],
  );
  return rows.length;
}
