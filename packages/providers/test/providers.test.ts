import { describe, expect, it } from 'vitest';
import { HarborError, PLATFORM_METRICS, PLATFORMS } from '@harbor/core';
import { LinkedInProvider, createPkcePair, createProviderRegistry, getProvider, parseRetryAfter } from '../src/index.ts';

const registry = createProviderRegistry({});

describe('provider registry', () => {
  it('has one provider per platform', () => {
    expect([...registry.keys()].sort()).toEqual([...PLATFORMS].sort());
    expect(getProvider(registry, 'x')?.name).toBe('X');
    expect(getProvider(registry, 'myspace')).toBeUndefined();
  });

  it('validates length and media locally', () => {
    const x = registry.get('x')!;
    expect(x.validate([{ text: 'hi', media: [] }])).toEqual({ ok: true });
    expect(x.validate([{ text: 'a'.repeat(281), media: [] }]).ok).toBe(false);
    expect(registry.get('instagram')!.validate([{ text: 'caption', media: [] }]).ok).toBe(false);
    expect(registry.get('threads')!.validate([{ text: 'a'.repeat(501), media: [] }]).ok).toBe(false);
  });

  it('reports adapter version and metric availability per platform', () => {
    for (const p of registry.values()) {
      expect(p.adapterVersion).toBe('1.0.0');
      expect(p.metrics).toEqual(PLATFORM_METRICS[p.identifier]);
    }
  });

  it('refuses to start OAuth without credentials', async () => {
    for (const p of registry.values()) await expect(p.generateAuthUrl()).rejects.toBeInstanceOf(HarborError);
  });

  it('wires credentials and redirect URIs from env', async () => {
    const env = {
      HARBOR_API_URL: 'https://api.harbor.test',
      X_CLIENT_ID: 'xid', X_CLIENT_SECRET: 'xs',
      LINKEDIN_CLIENT_ID: 'lid', LINKEDIN_CLIENT_SECRET: 'ls', LINKEDIN_API_VERSION: '202607',
      INSTAGRAM_APP_ID: 'iid', INSTAGRAM_APP_SECRET: 'is',
      THREADS_APP_ID: 'tid', THREADS_APP_SECRET: 'ts',
      META_APP_ID: 'wrong',
    };
    const r = createProviderRegistry(env);
    const expectedIds = { x: 'xid', linkedin: 'lid', instagram: 'iid', threads: 'tid' } as const;
    for (const p of r.values()) {
      const u = new URL((await p.generateAuthUrl()).url);
      expect(u.searchParams.get('client_id')).toBe(expectedIds[p.identifier]);
      expect(u.searchParams.get('redirect_uri')).toBe(`https://api.harbor.test/v1/channels/${p.identifier}/callback`);
    }
    expect((r.get('linkedin') as LinkedInProvider).apiVersion).toBe('202607');
  });
});

describe('helpers', () => {
  it('creates distinct PKCE pairs', () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });

  it('parses Retry-After seconds, dates and x-rate-limit-reset', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    expect(parseRetryAfter(new Headers({ 'retry-after': '30' }), now)).toBe(30);
    expect(parseRetryAfter(new Headers({ 'retry-after': 'Thu, 15 Oct 2026 12:01:00 GMT' }), now)).toBe(60);
    expect(parseRetryAfter(new Headers({ 'x-rate-limit-reset': String(now / 1000 + 90) }), now)).toBe(90);
    expect(parseRetryAfter(new Headers(), now)).toBeUndefined();
  });
});
