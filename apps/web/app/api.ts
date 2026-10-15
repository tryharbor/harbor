import type { Brand, Channel, NormalizedMetrics, Platform, PostPart } from '@harbor/core';

/** Server-side calls go straight to the API process. */
export const API_INTERNAL_URL = process.env.HARBOR_API_INTERNAL_URL ?? 'http://localhost:4800';
/** What the browser uses for OAuth links. Same as HARBOR_API_URL (an HTTPS tunnel when testing Meta apps). */
export const API_PUBLIC_URL = process.env.HARBOR_API_URL ?? 'http://localhost:4800';

export interface PostView {
  id: string;
  channelId: string;
  channel: { platform: Platform; handle: string };
  status: 'scheduled' | 'publishing' | 'pending' | 'published' | 'failed' | 'unknown';
  parts: PostPart[];
  scheduledFor?: string;
  publishedAt?: string;
  url?: string;
  error?: { kind: string; message: string };
  latest?: { metrics: NormalizedMetrics; ageHours: number };
  snapshotCount: number;
  createdAt: string;
}

export interface PlatformInfo {
  platform: Platform;
  name: string;
  reportsMetrics: boolean;
}

export class ApiError extends Error {}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(`Can't reach the API at ${API_INTERNAL_URL}. Start it with \`pnpm dev\`.`);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new ApiError(json.error?.message ?? `The API answered ${res.status}.`);
  return json as T;
}

export const getBrands = () => api<{ data: Brand[] }>('/v1/brands').then((r) => r.data);
export const getBrand = (id: string) => api<Brand>(`/v1/brands/${id}`);
export const getChannels = (brandId: string) => api<{ data: Channel[] }>(`/v1/brands/${brandId}/channels`).then((r) => r.data);
export const getPosts = (brandId: string) => api<{ data: PostView[] }>(`/v1/brands/${brandId}/posts`).then((r) => r.data);
export const getPlatforms = () => api<{ data: PlatformInfo[] }>('/v1/platforms').then((r) => r.data);
