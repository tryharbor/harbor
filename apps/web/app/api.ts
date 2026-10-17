import type { Channel, NormalizedMetrics, Platform, PostPart } from '@harbor/core';
import { createHmac } from 'node:crypto';
import { requireSession } from './auth';

/** Server-side calls go straight to the API process. */
export const API_INTERNAL_URL = process.env.HARBOR_API_INTERNAL_URL ?? 'http://localhost:4800';
/** The API's public address (HARBOR_API_URL): what platforms reach for OAuth callbacks and media downloads. */
export const API_PUBLIC_URL = process.env.HARBOR_API_URL ?? 'http://localhost:4800';
/**
 * What your own browser uses to reach the API (uploads, media previews, starting a connection). Stays on this
 * machine even when HARBOR_API_URL is a tunnel: the tunnel only exposes callbacks, media and /mcp.
 */
export const API_BROWSER_URL = process.env.HARBOR_API_BROWSER_URL ?? 'http://localhost:4800';
/** Public media URLs in API responses, pointed at the browser address instead (so previews don't go through the tunnel). */
export const forBrowser = (body: string) =>
  API_PUBLIC_URL === API_BROWSER_URL ? body : body.split(`${API_PUBLIC_URL}/media/`).join(`${API_BROWSER_URL}/media/`);

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
  /** What each rule rests on (docs/design/memory-that-learns.md §1). */
  evidence?: Evidence[];
}
export interface Evidence {
  rule: string;
  kind: 'do' | 'avoid' | 'banned' | 'value' | 'excerpt';
  posts: string[];
  signals: string[];
  note?: string;
  source: 'learned' | 'refresh' | 'saved' | 'owner';
  at: string;
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
  /** What a person posts about. */
  topics: string[];
}
export interface BrandView {
  id: string;
  workspaceId: string;
  /** 'person': someone's own account (one per workspace), which can speak for some of the brands. */
  kind: 'brand' | 'person';
  /** A person's linked brands, by id. */
  speaksFor: string[];
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
  /** How the post did against the brand's median for the platform at the same age. */
  outcome?: Outcome;
  createdAt: string;
}
export interface PostDetail extends PostView {
  snapshots: { takenAt: string; ageHours: number; metrics: NormalizedMetrics; adapterVersion: string }[];
  /** Brand + platform median of the primary metric at each schedule age. */
  baselineCurve?: { ageHours: number; value: number }[];
}
export type Verdict = 'outperformed' | 'met' | 'underperformed' | 'inconclusive';
export interface Outcome {
  verdict: Verdict;
  ratio: number;
  metric: 'views' | 'likes';
  atAgeHours: number;
  baseline: number;
  actual: number;
  comparablePosts: number;
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
  /** Whether Harbor can read replies on this platform (X only with HARBOR_X_READ_REPLIES). */
  reportsReplies?: boolean;
}

// ---- Transport ----

export class ApiError extends Error {}

/** With HARBOR_INTERNAL_TOKEN set (production), the API only answers /v1 calls that carry it. */
export const internalAuthHeader = (): Record<string, string> =>
  process.env.HARBOR_INTERNAL_TOKEN ? { authorization: `Bearer ${process.env.HARBOR_INTERNAL_TOKEN}` } : {};

/**
 * A short-lived ticket that lets the browser upload one brand's media straight to the API (a proxy through the web
 * app would cap uploads at the host's body limit). Matches createUploadTicket in apps/api/src/app.ts. Null when no
 * internal token is set: then the API takes local uploads without one.
 */
export function uploadTicket(brandId: string, now = Date.now()): string | null {
  const token = process.env.HARBOR_INTERNAL_TOKEN;
  if (!token) return null;
  const exp = now + 10 * 60_000;
  return `${exp}.${createHmac('sha256', token).update(`upload:${brandId}:${exp}`).digest('base64url')}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Every page load and server action reaches the API through here, so this is the session check behind proxy.ts.
  await requireSession();
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...internalAuthHeader(), ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(`Can't reach the API at ${API_INTERNAL_URL}. Start it with \`pnpm dev\`.`);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.text().then((t) => JSON.parse(forBrowser(t))).catch(() => ({}))) as { error?: { message?: string } };
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

// ---- Insights ----

export interface BestTimes {
  platform?: Platform;
  slots: { weekday: number; hour: number; score: number; basis: 'history' | 'prior'; posts: number }[];
  top: { weekday: number; hour: number; score: number }[];
}
export interface Finding { title: string; detail: string; posts: string[]; signalIds: string[]; confidence: number }
export interface Digest {
  brandId: string;
  period: { from: string; to: string };
  generatedAt: string;
  model: string;
  simulated: boolean;
  headline: string;
  stats: { posts: number; published: number; medianViews24h?: number; change?: number };
  wins: Finding[];
  misses: Finding[];
  patterns: Finding[];
  recommendations: Finding[];
}
export interface OverviewBrand {
  brandId: string;
  brandName: string;
  posts7d: number;
  published7d: number;
  medianViews24h?: number;
  change?: number;
  outperformed: number;
  underperformed: number;
  topPost?: { id: string; text: string; platform: Platform; views?: number; url?: string };
  digestHeadline?: string;
}

export const getBestTimes = (brandId: string, platform?: Platform) => api<BestTimes>(`/v1/brands/${brandId}/best-times${qs({ platform })}`);
/** Undefined when the brand has no digest yet. */
export const getDigest = (brandId: string) => api<Digest>(`/v1/brands/${brandId}/digest`).catch((err) => {
  if (err instanceof ApiError && /not found|no digest/i.test(err.message)) return undefined;
  throw err;
});
export const getOverview = () => api<{ brands: OverviewBrand[] }>('/v1/insights/overview').then((r) => r.brands);

// ---- Agents, automations, approvals, API keys, MCP (docs/design/agents-mcp.md) ----

export type AgentId = 'weekly_plan' | 'repurpose_winner' | 'voice_check' | 'digest' | (string & {});
export type TriggerKind = 'manual' | 'schedule' | 'post_published' | 'post_outperformed';
export interface AgentInput { key: string; label: string; type: 'brand' | 'campaign' | 'post' | 'draft' | 'platforms' | 'number'; required: boolean; default?: unknown; min?: number; max?: number; help?: string }
export interface AgentDef {
  id: AgentId;
  name: string;
  tagline: string;
  description: string;
  category: 'plan' | 'repurpose' | 'review' | 'insights';
  inputs: AgentInput[];
  produces: ('digest' | 'ideas' | 'drafts' | 'approvals' | 'report')[];
  triggers: TriggerKind[];
  steps: { key: string; label: string }[];
  lastRun?: AgentRun;
  automations: number;
}
export type RunSource = 'ui' | 'mcp' | 'automation' | 'canvas' | 'studio';
export interface RunRef { kind: 'idea' | 'draft' | 'post' | 'digest' | 'approval' | 'run' | 'campaign' | 'proposal'; id: string; label?: string }
export interface RunStep { key: string; label: string; status: 'running' | 'succeeded' | 'failed' | 'skipped'; startedAt: string; finishedAt?: string; detail?: string; refs?: RunRef[] }
export interface AgentRun {
  id: string;
  kind: string;
  agentId?: AgentId;
  brandId?: string;
  brandName?: string;
  status: 'running' | 'succeeded' | 'failed';
  source: RunSource;
  automationId?: string;
  parentRunId?: string;
  model?: string;
  simulated: boolean;
  usage?: { inputTokens: number; outputTokens: number };
  summary?: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  stepCount: number;
  approvalCount: number;
}
export interface AgentRunDetail extends AgentRun {
  inputs: Record<string, unknown>;
  steps: RunStep[];
  children: AgentRun[];
  approvals: Approval[];
  output?: unknown;
}
export interface Check { key: string; ok: boolean; severity: 'info' | 'warn' | 'fail'; label: string; detail: string }
export interface Approval {
  id: string;
  brandId: string;
  brandName: string;
  runId?: string;
  agentId?: AgentId;
  source: string;
  status: 'pending' | 'approved' | 'rejected';
  draft: DraftView;
  ideaId?: string;
  ideaTitle?: string;
  channel: { id: string; platform: Platform; handle: string; displayName?: string; status: string };
  proposedFor: string;
  slotScore?: number;
  reason: string;
  checks: Check[];
  createdAt: string;
  decidedAt?: string;
  decidedNote?: string;
  postId?: string;
}
export type Trigger = { type: 'schedule'; weekday: number; hour: number } | { type: 'event'; event: 'post_published' | 'post_outperformed' };
export interface Automation {
  id: string;
  brandId: string;
  brandName: string;
  agentId: AgentId;
  name: string;
  trigger: Trigger;
  inputs: Record<string, unknown>;
  enabled: boolean;
  status: 'active' | 'paused' | 'failing';
  maxRunsPerDay: number;
  runsToday: number;
  consecutiveFailures: number;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunId?: string;
  lastRunStatus?: string;
  createdAt: string;
}
export interface ApiKey { id: string; name: string; prefix: string; scopes: ('read' | 'write')[]; createdAt: string; lastUsedAt?: string; revokedAt?: string }
export interface McpInfo { url: string; transport: string; tools: { name: string; description: string; scope: 'read' | 'write' }[]; resources: { uri: string; name: string }[] }
export type ApprovalCounts = { pending: number; approved: number; rejected: number };

export const getAgents = () => api<{ data: AgentDef[] }>('/v1/agents').then(data);
export const getAgent = (id: string) => api<AgentDef>(`/v1/agents/${id}`);
export const getRuns = (params: { brandId?: string; agentId?: string; source?: string; topLevel?: string; limit?: string } = {}) =>
  api<{ data: AgentRun[] }>(`/v1/agent-runs${qs(params)}`).then(data);
export const getRun = (id: string) => api<AgentRunDetail>(`/v1/agent-runs/${id}`);
export const getApprovals = (params: { status?: string; brandId?: string; runId?: string } = {}) =>
  api<{ data: Approval[]; counts: ApprovalCounts }>(`/v1/approvals${qs(params)}`);
export const getAutomations = (brandId?: string) => api<{ data: Automation[] }>(`/v1/automations${qs({ brandId })}`).then(data);
export const getApiKeys = () => api<{ data: ApiKey[] }>('/v1/api-keys').then(data);
export const getMcpInfo = () => api<McpInfo>('/v1/mcp');

// ---- Brand Memory that learns (docs/design/memory-that-learns.md) ----

export interface MemoryChange {
  id: string;
  op: 'add' | 'remove';
  target: 'voice.do' | 'voice.avoid' | 'voice.excerpts' | 'voice.bannedWords' | 'knowledge' | 'examplePosts';
  text: string;
  why: string;
  lift?: number;
  evidence: { posts: { id: string; text: string; platform: Platform; ratio?: number; verdict?: string }[]; signals: string[] };
  status: 'pending' | 'accepted' | 'rejected';
}
export interface MemoryProposal { id: string; brandId: string; brandName: string; runId?: string; agentId?: string; status: 'pending' | 'applied' | 'rejected'; changes: MemoryChange[]; createdAt: string; decidedAt?: string }
export type ProposalCounts = { pending: number; applied: number; rejected: number };

export type ReplyKind = 'question' | 'objection' | 'praise' | 'request' | 'other';
export interface ReplyView { id: string; postId: string; author: { handle: string; displayName?: string }; text: string; createdAt: string; likes?: number; kind: ReplyKind; themeId?: string }
export interface Theme { id: string; label: string; kind: ReplyKind; keyword?: string; count: number; posts: string[]; sample: ReplyView[] }
export interface Conversation { themes: Theme[]; total: number; byKind: Record<ReplyKind, number> }

export type AppliedRule = { kind: 'do' | 'avoid' | 'banned' | 'excerpt' | 'term' | 'product' | 'audience' | 'value'; text: string; evidence?: Evidence };
export interface MemoryPreview { platform: Platform; with: { parts: PostPart[] }; without: { parts: PostPart[] }; applied: AppliedRule[]; run: RunInfo }

export interface ScannedPost { platformPostId: string; text: string; publishedAt: string; url?: string; metrics?: NormalizedMetrics; alreadyImported: boolean }
export interface ImportScan { scanId: string; channelId: string; supported: boolean; found: ScannedPost[] }

export const getMemoryProposals = (params: { status?: string; brandId?: string } = {}) =>
  api<{ data: MemoryProposal[]; counts: ProposalCounts }>(`/v1/memory-proposals${qs(params)}`);
export const getReplies = (postId: string) => api<{ data: ReplyView[]; themes: Theme[]; supported: boolean }>(`/v1/posts/${postId}/replies`);
export const getConversation = (brandId: string, days?: string) => api<Conversation>(`/v1/brands/${brandId}/conversation${qs({ days })}`);

// ---- Media library (docs/design/media-library.md) ----

export type MediaVariant = 'original' | 'square' | 'portrait' | 'landscape' | 'wide' | 'story';
export interface MediaAsset {
  id: string;
  brandId: string;
  kind: 'image' | 'video';
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  originalName?: string;
  alt?: string;
  tags: string[];
  focal: { x: number; y: number };
  url: string;
  variants: Partial<Record<MediaVariant, string>>;
  usageCount: number;
  createdAt: string;
}
export interface MediaUsage { kind: 'draft' | 'post' | 'approval'; id: string; status?: string; platform: Platform; text: string }
export interface MediaDetail extends MediaAsset { usage: MediaUsage[] }
export interface MediaCheck { ok: boolean; issues: { level: 'fail' | 'warn'; message: string }[] }
export interface MediaFit { variant: MediaVariant; url: string; width: number; height: number; check: MediaCheck }

export const getMedia = (brandId: string, params: { kind?: string; tag?: string; q?: string; limit?: string } = {}) =>
  api<{ data: MediaAsset[]; tags: { tag: string; count: number }[] }>(`/v1/brands/${brandId}/media${qs(params)}`);
export const getMediaAsset = (id: string) => api<MediaDetail>(`/v1/media/${id}`);
export const getMediaFit = (id: string, platform: Platform) => api<MediaFit>(`/v1/media/${id}/fit${qs({ platform })}`);
