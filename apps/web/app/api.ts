import type { Brand, Channel, Idea, NormalizedMetrics, Platform, PostPart } from '@harbor/core';

/** Server-side calls go straight to the API process. */
export const API_INTERNAL_URL = process.env.HARBOR_API_INTERNAL_URL ?? 'http://localhost:4800';
/** What the browser uses for OAuth links. Same as HARBOR_API_URL (an HTTPS tunnel when testing Meta apps). */
export const API_PUBLIC_URL = process.env.HARBOR_API_URL ?? 'http://localhost:4800';

export type PostStatus = 'scheduled' | 'publishing' | 'pending' | 'published' | 'failed' | 'unknown';

export interface PostView {
  id: string;
  brandId: string;
  brandName: string;
  channelId: string;
  channel: { platform: Platform; handle: string };
  ideaId?: string;
  status: PostStatus;
  parts: PostPart[];
  scheduledFor?: string;
  publishedAt?: string;
  url?: string;
  error?: { kind: string; message: string };
  latest?: { metrics: NormalizedMetrics; ageHours: number };
  snapshotCount: number;
  createdAt: string;
}

export interface PostDetail extends PostView {
  snapshots: { takenAt: string; ageHours: number; metrics: NormalizedMetrics; adapterVersion: string }[];
}

export type IdeaView = Idea & { brandName: string; postCount: number };

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

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  return p.size ? `?${p}` : '';
};

export const getBrands = () => api<{ data: Brand[] }>('/v1/brands').then((r) => r.data);
export const getBrand = (id: string) => api<Brand>(`/v1/brands/${id}`);
export const getChannels = (brandId?: string) =>
  api<{ data: Channel[] }>(brandId ? `/v1/brands/${brandId}/channels` : '/v1/channels').then((r) => r.data);
export const getPosts = (params: { brandId?: string; status?: PostStatus; from?: string; to?: string; limit?: string } = {}) =>
  api<{ data: PostView[] }>(`/v1/posts${qs(params)}`).then((r) => r.data);
export const getPost = (id: string) => api<PostDetail>(`/v1/posts/${id}`);
export const getIdeas = (params: { brandId?: string } = {}) => api<{ data: IdeaView[] }>(`/v1/ideas${qs(params)}`).then((r) => r.data);
export const getPlatforms = () => api<{ data: PlatformInfo[] }>('/v1/platforms').then((r) => r.data);

/** Load several things at once; any failure becomes one readable message for the page. */
export async function loadAll<T extends readonly unknown[]>(calls: { [K in keyof T]: Promise<T[K]> }): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: (await Promise.all(calls)) as unknown as T };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Something went wrong loading this page.' };
  }
}
