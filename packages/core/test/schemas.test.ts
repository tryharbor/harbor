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
  brandMemoryPatchSchema,
  brandMemorySchema,
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
      voice: { summary: '', values: [], do: [], avoid: [], bannedWords: [], excerpts: [], sources: [], evidence: [] },
      audiences: [],
      products: [],
      knowledge: [],
      styleRules: { terms: [], formatting: [] },
      examplePosts: [],
    });
  });

  it('rejects unknown fields and bad slugs', () => {
    expect(brandCreateSchema.safeParse({ name: 'Acme', color: 'red' }).success).toBe(false);
    expect(brandCreateSchema.safeParse({ name: 'Acme', slug: 'Not A Slug' }).success).toBe(false);
  });
});

describe('Brand Memory v1 → v2', () => {
  const v1 = {
    voice: { description: 'Plain and specific.', traits: ['Direct', 'Anti-hype'], do: ['Use numbers'], dont: ['leverage'] },
    offer: { summary: 'Open-source content strategist', callToAction: 'Join the waitlist', url: 'https://harbor.example' },
    audience: { description: 'Builders with several brands', segments: ['Indie hackers'], painPoints: ['Context switching'] },
    examplePosts: [{ platform: 'x', text: 'Shipped the poller.' }],
  };

  it('migrates every v1 field', () => {
    const m = brandMemorySchema.parse(v1);
    expect(m.voice).toMatchObject({
      summary: 'Plain and specific.',
      values: [{ name: 'Direct', meaning: '' }, { name: 'Anti-hype', meaning: '' }],
      do: ['Use numbers'],
      avoid: ['leverage'],
      bannedWords: [],
    });
    expect(m.products).toEqual([
      { id: expect.any(String), name: 'Main offer', summary: 'Open-source content strategist', cta: 'Join the waitlist', url: 'https://harbor.example', proofPoints: [] },
    ]);
    expect(m.audiences).toEqual([
      { id: expect.any(String), name: 'Primary audience', description: 'Builders with several brands', painPoints: ['Context switching'], goals: [], segments: ['Indie hackers'] },
    ]);
    expect(m.examplePosts[0]).toMatchObject({ platform: 'x', text: 'Shipped the poller.', id: expect.any(String) });
    expect(m).not.toHaveProperty('offer');
  });

  it('gives migrated items stable ids and keeps v2 documents unchanged', () => {
    const a = brandMemorySchema.parse(v1);
    expect(brandMemorySchema.parse(v1)).toEqual(a);
    expect(brandMemorySchema.parse(a)).toEqual(a);
  });

  it('skips empty v1 offer and audience', () => {
    const m = brandMemorySchema.parse({ offer: { summary: '' }, audience: { description: '', segments: [], painPoints: [] } });
    expect(m.products).toEqual([]);
    expect(m.audiences).toEqual([]);
  });

  it('patches only the keys given', () => {
    expect(brandMemoryPatchSchema.parse({ voice: { summary: 'New' } })).toEqual({
      voice: { summary: 'New', values: [], do: [], avoid: [], bannedWords: [], excerpts: [], sources: [], evidence: [] },
    });
    expect(brandMemoryPatchSchema.safeParse({ colour: 'red' }).success).toBe(false);
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
