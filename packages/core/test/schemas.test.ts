import { describe, expect, it } from 'vitest';
import {
  BadRequest,
  Disconnect,
  PLATFORM_METRICS,
  PublishedWithError,
  RateLimited,
  RefreshNeeded,
  SNAPSHOT_SCHEDULE_HOURS,
  availableMetrics,
  brandCreateSchema,
  canAutoRetryPublish,
  canTransitionIdea,
  classifyPublishFailure,
  ideaSchema,
  newId,
  snapshotSchema,
} from '../src/index.ts';

const now = new Date().toISOString();

describe('brand schemas', () => {
  it('fills Brand Memory defaults on create', () => {
    const parsed = brandCreateSchema.parse({ name: 'Acme' });
    expect(parsed.memory).toEqual({
      voice: { description: '', traits: [], do: [], dont: [] },
      offer: { summary: '' },
      audience: { description: '', segments: [], painPoints: [] },
      examplePosts: [],
    });
  });

  it('rejects unknown fields and bad slugs', () => {
    expect(brandCreateSchema.safeParse({ name: 'Acme', color: 'red' }).success).toBe(false);
    expect(brandCreateSchema.safeParse({ name: 'Acme', slug: 'Not A Slug' }).success).toBe(false);
  });
});

describe('snapshot schema', () => {
  it('accepts normalized metrics and keeps the raw payload', () => {
    const snap = snapshotSchema.parse({
      id: newId('snapshot'), postId: newId('post'), takenAt: now, ageHours: 6,
      raw: { public_metrics: { like_count: 3 } }, metrics: { likes: 3, views: 120 }, adapterVersion: 'x@0.0.1',
    });
    expect(snap.metrics).toEqual({ likes: 3, views: 120 });
    expect(snap.raw).toEqual({ public_metrics: { like_count: 3 } });
  });

  it('rejects unknown metric keys and negative counts', () => {
    const base = { id: 'snp_1', postId: 'pst_1', takenAt: now, ageHours: 1, raw: {}, adapterVersion: 'v1' };
    expect(snapshotSchema.safeParse({ ...base, metrics: { impressions: 1 } }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...base, metrics: { likes: -1 } }).success).toBe(false);
  });

  it('polls at 1h, 6h, 24h, 72h, 7d', () => {
    expect(SNAPSHOT_SCHEDULE_HOURS).toEqual([1, 6, 24, 72, 168]);
  });
});

describe('metric availability', () => {
  it('marks every key available or unavailable for every platform', () => {
    for (const map of Object.values(PLATFORM_METRICS)) {
      expect(Object.keys(map)).toHaveLength(12);
      for (const v of Object.values(map)) expect(['available', 'unavailable']).toContain(v);
    }
    expect(availableMetrics('x')).toContain('reposts');
  });
});

describe('ideas', () => {
  it('moves forward one step at a time and never leaves Live', () => {
    expect(canTransitionIdea('idea', 'drafting')).toBe(true);
    expect(canTransitionIdea('idea', 'approved')).toBe(false);
    expect(canTransitionIdea('approved', 'drafting')).toBe(true);
    expect(canTransitionIdea('scheduled', 'live')).toBe(true);
    expect(canTransitionIdea('live', 'scheduled')).toBe(false);
  });

  it('cites signals as its basis', () => {
    const idea = ideaSchema.parse({
      id: 'ida_1', brandId: 'brd_1', title: 'Teardown thread', status: 'idea',
      basis: [{ signalId: 'sig_1', note: 'teardowns got 3x median views' }], createdAt: now, updatedAt: now,
    });
    expect(idea.basis[0]?.signalId).toBe('sig_1');
    expect(ideaSchema.safeParse({ ...idea, status: 'Live' }).success).toBe(false);
  });
});

describe('publish failure policy', () => {
  it('only retries failures that prove nothing was published', () => {
    expect(canAutoRetryPublish(new RateLimited('x', '429', 60))).toBe(true);
    expect(canAutoRetryPublish(new RefreshNeeded('x', '401'))).toBe(true);
    expect(canAutoRetryPublish(new BadRequest('x', 'too long'))).toBe(false);
    expect(classifyPublishFailure(new Disconnect('x', 'revoked'))).toEqual({ action: 'fail', disconnect: true });
    expect(classifyPublishFailure(new PublishedWithError('x', 'reply failed', '123'))).toEqual({
      action: 'mark_published', platformPostId: '123', url: undefined,
    });
  });

  it('never auto-retries an unknown outcome', () => {
    expect(classifyPublishFailure(new Error('socket hang up'))).toEqual({ action: 'needs_human' });
    expect(canAutoRetryPublish(new TypeError('fetch failed'))).toBe(false);
  });
});
