import type { Channel, NormalizedMetrics, Platform, PostPart } from '@harbor/core';

/** Server-side calls go straight to the API process. */
export const API_INTERNAL_URL = process.env.HARBOR_API_INTERNAL_URL ?? 'http://localhost:4800';
/** What the browser uses for OAuth links. Same as HARBOR_API_URL (an HTTPS tunnel when testing Meta apps). */
export const API_PUBLIC_URL = process.env.HARBOR_API_URL ?? 'http://localhost:4800';

// ---- Shapes (mirror the API contract; camelCase) ----

export interface Mode {
  publish: 'sandbox' | 'live';
  model: 'simulated' | 'anthropic';
}

export interface BrandVoice {
  summary: string;
  values: { name: string; meaning: string }[];
  do: string[];
  avoid: string[];
  bannedWords: string[];
  excerpts: { text: string; source?: string }[];
  sources: { kind: 'example' | 'url' | 'post'; label: string; ref?: string }[];
  learnedAt?: string;
  learnedBy?: string;
}
export interface Audience { id: string; name: string; description: string; painPoints: string[]; goals: string[] }
export interface Product { id: string; name: string; summary: string; url?: string; cta?: string; proofPoints: string[] }
export interface KnowledgeItem { id: string; title: string; kind: 'note' | 'link'; body?: string; url?: string }
export interface ExamplePost { id: string; platform?: Platform; text: string; url?: string; note?: string }
export interface BrandMemoryV2 {
  voice: BrandVoice;
  audiences: Audience[];
  products: Product[];
  knowledge: KnowledgeItem[];
  styleRules: { terms: { use: string; insteadOf: string }[]; formatting: string[] };
  examplePosts: ExamplePost[];
}
export interface BrandView {
  id: string;
  workspaceId: string;
  name: string;
  /** https URL or data: URI; absent → monogram. */
  logoUrl?: string;
  slug: string;
  memory: BrandMemoryV2;
  createdAt: string;
  updatedAt: string;
}
export type MemoryListKey = 'audiences' | 'products' | 'knowledge' | 'examplePosts';

export interface Competitor { id: string; brandId: string; name: string; url?: string; handles: { platform: Platform; handle: string }[]; notes?: string }
export interface SignalView { id: string; brandId: string; kind: string; summary: string; observedAt: string; source: Record<string, string | undefined> }

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

export interface IdeaView {
  id: string;
  brandId: string;
  brandName: string;
  title: string;
  angle: string;
  status: 'idea' | 'drafting' | 'approved' | 'scheduled' | 'live';
  basis: { signalId: string; note?: string }[];
  agentRunId?: string;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DraftView {
  id: string;
  brandId: string;
  ideaId?: string;
  platform: Platform;
  channelId?: string;
  parts: PostPart[];
  version: number;
  author: 'agent' | 'human';
  agentRunId?: string;
  createdAt: string;
}

export interface RunInfo { id: string; model: string; usage?: { inputTokens: number; outputTokens: number } }
export interface AgentRunView { id: string; kind: string; status: string; model?: string; usage?: { inputTokens: number; outputTokens: number }; startedAt: string; finishedAt?: string; error?: string }

export interface PlatformInfo {
  platform: Platform;
  name: string;
  reportsMetrics: boolean;
}

// ---- Transport ----

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
const data = <T,>(r: { data: T }) => r.data;

export const getMode = () => api<Mode>('/v1/mode');
export const getBrands = () => api<{ data: BrandView[] }>('/v1/brands').then(data);
export const getBrand = (id: string) => api<BrandView>(`/v1/brands/${id}`);
export const getChannels = (brandId?: string) => api<{ data: Channel[] }>(brandId ? `/v1/brands/${brandId}/channels` : '/v1/channels').then(data);
export const getPosts = (params: { brandId?: string; status?: PostStatus; from?: string; to?: string; limit?: string } = {}) =>
  api<{ data: PostView[] }>(`/v1/posts${qs(params)}`).then(data);
export const getPost = (id: string) => api<PostDetail>(`/v1/posts/${id}`);
export const getIdeas = (params: { brandId?: string } = {}) => api<{ data: IdeaView[] }>(`/v1/ideas${qs(params)}`).then(data);
export const getPlatforms = () => api<{ data: PlatformInfo[] }>('/v1/platforms').then(data);
export const getCompetitors = (brandId: string) => api<{ data: Competitor[] }>(`/v1/brands/${brandId}/competitors`).then(data);
export const getSignals = (brandId: string) => api<{ data: SignalView[] }>(`/v1/brands/${brandId}/signals`).then(data);
export const getDrafts = (params: { ideaId?: string; brandId?: string; all?: string } = {}) => api<{ data: DraftView[] }>(`/v1/drafts${qs(params)}`).then(data);
export const getAgentRuns = (brandId?: string) => api<{ data: AgentRunView[] }>(`/v1/agent-runs${qs({ brandId })}`).then(data);

/** Load several things at once; any failure becomes one readable message for the page. */
export async function loadAll<T extends readonly unknown[]>(calls: { [K in keyof T]: Promise<T[K]> }): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: (await Promise.all(calls)) as unknown as T };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Something went wrong loading this page.' };
  }
}

// ---- Campaigns and the canvas ----

export interface Campaign {
  id: string;
  brandId: string;
  brandName: string;
  name: string;
  goal: string;
  status: 'planning' | 'active' | 'done';
  startsOn?: string;
  endsOn?: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CanvasKind = 'idea' | 'draft' | 'post' | 'signal' | 'note' | 'frame';

export interface CanvasItem {
  id: string;
  campaignId: string;
  kind: CanvasKind;
  refId?: string;
  parentId?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  data: { title?: string; text?: string; color?: string };
  /** The idea / draft / post / signal behind the card; absent if it was deleted. */
  entity?: IdeaView | (DraftView & { simulated?: boolean; model?: string }) | PostView | Pick<SignalView, 'id' | 'kind' | 'summary' | 'observedAt'>;
}

export interface CanvasEdge {
  id: string;
  campaignId: string;
  source: string;
  target: string;
  label?: string;
}

export interface CanvasData {
  campaign: Campaign;
  items: CanvasItem[];
  edges: CanvasEdge[];
}

export const getCampaigns = (brandId?: string) => api<{ data: Campaign[] }>(`/v1/campaigns${qs({ brandId })}`).then(data);
export const getCanvas = (campaignId: string) => api<CanvasData>(`/v1/campaigns/${campaignId}/canvas`);
