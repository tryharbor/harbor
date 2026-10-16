import { describe, expect, it } from 'vitest';
import { PLATFORM_METRICS, PLATFORMS, PublishOutcomeUnknown, RateLimited, type ProviderContext } from '@harbor/core';
import { SandboxProvider, createSandboxRegistry, sandboxMetricsAt, sandboxPostTime } from '../src/index.ts';

const ctx: ProviderContext = { accessToken: 'sbx_access', account: { platformAccountId: 'sbx_1', handle: 'harbor' } };
const text = (t: string) => [{ text: t, media: [] }];

describe('sandbox provider', () => {
  it('has one provider per platform with the real names, limits and metric availability', () => {
    const reg = createSandboxRegistry();
    expect([...reg.keys()].sort()).toEqual([...PLATFORMS].sort());
    expect(reg.get('x')!.name).toBe('X');
    expect(reg.get('x')!.maxLength()).toBe(280);
    expect(reg.get('linkedin')!.maxLength()).toBe(3000);
    expect(reg.get('instagram')!.maxLength()).toBe(2200);
    expect(reg.get('threads')!.maxLength()).toBe(500);
    expect(reg.get('x')!.validate(text('a'.repeat(281))).ok).toBe(false);
    expect(reg.get('instagram')!.validate(text('caption only')).ok).toBe(false);
    for (const p of reg.values()) expect(p.metrics).toEqual(PLATFORM_METRICS[p.identifier]);
    expect(reg.get('linkedin')!.fetchPostMetrics).toBeUndefined();
    expect(reg.get('instagram')!.comment).toBeUndefined();
  });

  it('publishes X and LinkedIn synchronously with sandbox ids and urls', async () => {
    const t0 = Date.UTC(2026, 9, 1);
    const x = new SandboxProvider('x', { now: () => t0 });
    const res = await x.publish(ctx, { parts: text('Hello'), postId: 'pst_1' });
    expect(res.status).toBe('published');
    if (res.status !== 'published') return;
    expect(res.platformPostId).toMatch(/^sbx_[0-9a-z]+_[0-9a-f]+$/);
    expect(res.url).toBe(`https://sandbox.harbor.local/x/${res.platformPostId}`);
    expect(sandboxPostTime(res.platformPostId)).toBe(t0);
    const reply = await x.comment!(ctx, { replyToPlatformPostId: res.platformPostId, part: { text: 'reply', media: [] } });
    expect(reply.platformPostId).toMatch(/^sbx_/);
    expect((await new SandboxProvider('linkedin').publish(ctx, { parts: text('Hi'), postId: 'pst_2' })).status).toBe('published');
  });

  it('goes through pending → ready → finalize on Instagram and Threads', async () => {
    for (const platform of ['instagram', 'threads'] as const) {
      const p = new SandboxProvider(platform);
      const res = await p.publish(ctx, { parts: [{ text: 'Photo', media: [{ kind: 'image', url: 'https://cdn.example/a.jpg' }] }], postId: 'pst_3' });
      expect(res.status).toBe('pending');
      if (res.status !== 'pending') return;
      const check = await p.checkStatus(ctx, res.pendingData);
      expect(check.status).toBe('ready');
      const done = await p.finalize(ctx, res.pendingData);
      expect(done.platformPostId).toBe(res.pendingData.platformPostId);
      expect(done.url).toContain(`/${platform}/`);
    }
  });

  it('fails on demand', async () => {
    const x = new SandboxProvider('x');
    await expect(x.publish(ctx, { parts: text('oops #fail-unknown'), postId: 'p' })).rejects.toBeInstanceOf(PublishOutcomeUnknown);
    const err = await x.publish(ctx, { parts: text('slow #fail-rate'), postId: 'p' }).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimited);
    expect(err.retryAfterSec).toBe(60);
  });

  it('grows metrics along a deterministic, saturating curve', () => {
    const id = 'sbx_abc_123';
    let prev = -1;
    for (const age of [0, 1, 6, 24, 72, 168, 500]) {
      const { metrics, curve } = sandboxMetricsAt('x', id, age);
      expect(metrics.views!).toBeGreaterThanOrEqual(prev);
      expect(metrics.views!).toBeLessThanOrEqual(curve.peak);
      expect(curve.peak).toBeGreaterThanOrEqual(300);
      expect(curve.peak).toBeLessThanOrEqual(20_000);
      prev = metrics.views!;
    }
    expect(sandboxMetricsAt('x', id, 24)).toEqual(sandboxMetricsAt('x', id, 24));
    expect(sandboxMetricsAt('x', 'sbx_other_1', 24).curve.peak).not.toBe(sandboxMetricsAt('x', id, 24).curve.peak);
    const late = sandboxMetricsAt('x', id, 168).metrics;
    expect(late.likes!).toBeLessThan(late.views!);
  });

  it('only fills metrics the platform reports', async () => {
    const t0 = Date.now() - 24 * 3_600_000;
    const ig = new SandboxProvider('instagram');
    const m = await ig.fetchPostMetrics!({ ...ctx, settings: { publishedAt: new Date(t0).toISOString() } }, 'sbx_abc_1');
    expect(Object.keys(m.metrics).sort()).toEqual(['comments', 'likes', 'reach', 'saves', 'shares', 'views']);
    expect(m.adapterVersion).toBe('sandbox-1');
    const x = await new SandboxProvider('x').fetchPostMetrics!(ctx, `sbx_${t0.toString(36)}_1`);
    expect(Object.keys(x.metrics)).not.toContain('reach');
    expect((x.raw as { ageHours: number }).ageHours).toBeCloseTo(24, 1);
  });
});
