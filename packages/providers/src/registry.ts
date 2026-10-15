import { PLATFORMS, type Platform, type PlatformProvider, type ProviderAppConfig } from '@harbor/core';
import type { FetchLike } from './base.ts';
import { InstagramProvider } from './instagram.ts';
import { LinkedInProvider } from './linkedin.ts';
import { ThreadsProvider } from './threads.ts';
import { XProvider } from './x.ts';

export type ProviderRegistry = ReadonlyMap<Platform, PlatformProvider>;
type Env = Record<string, string | undefined>;

/**
 * Build every provider with its OAuth app credentials from env. `redirectBase` is the API's public URL.
 * Instagram Login has its own app id/secret (not the Meta app's); Threads likewise.
 */
export function createProviderRegistry(
  env: Env = process.env,
  redirectBase = env.HARBOR_API_URL ?? 'http://localhost:4800',
  fetchImpl: FetchLike = globalThis.fetch,
): ProviderRegistry {
  const base = redirectBase.replace(/\/+$/, '');
  const app = (platform: Platform, id?: string, secret?: string): ProviderAppConfig => ({
    clientId: id || undefined,
    clientSecret: secret || undefined,
    redirectUri: `${base}/v1/channels/${platform}/callback`,
  });
  const list: PlatformProvider[] = [
    new XProvider(app('x', env.X_CLIENT_ID, env.X_CLIENT_SECRET), fetchImpl),
    new LinkedInProvider({ ...app('linkedin', env.LINKEDIN_CLIENT_ID, env.LINKEDIN_CLIENT_SECRET), apiVersion: env.LINKEDIN_API_VERSION || undefined }, fetchImpl),
    new InstagramProvider(app('instagram', env.INSTAGRAM_APP_ID, env.INSTAGRAM_APP_SECRET), fetchImpl),
    new ThreadsProvider(app('threads', env.THREADS_APP_ID, env.THREADS_APP_SECRET), fetchImpl),
  ];
  return new Map(list.map((p) => [p.identifier, p]));
}

export function getProvider(registry: ProviderRegistry, platform: string): PlatformProvider | undefined {
  return (PLATFORMS as readonly string[]).includes(platform) ? registry.get(platform as Platform) : undefined;
}
