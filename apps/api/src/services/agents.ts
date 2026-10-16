import { z } from 'zod';
import { HarborError, platformSchema, type Brand, type Platform } from '@harbor/core';
import type { DraftContextItem } from '@harbor/ai';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { check } from '../lib/http.ts';
import { insertApproval, listApprovals, type Approval } from './approvals.ts';
import { loadBrand } from './brands.ts';
import {
  CARD,
  campaignForBrand,
  findFrame,
  gridRightOfAll,
  listItems,
  placeCards,
  upsertEdge,
  type CampaignRow,
} from './campaigns.ts';
import { DEFAULT_MAX, generateDrafts, loadDraft, type DraftOut } from './drafts.ts';
import { generateIdeas, insertIdea, loadIdea } from './ideas.ts';
import { generateDigest, latestDigestRow } from './insights.ts';
import { assetRef, imageForIdea, mediaLookup } from './media.ts';
import { insertMemoryProposal } from './memory-proposals.ts';
import { refreshBrandOutcomes } from './outcomes.ts';
import { loadPost } from './posts.ts';
import { AgentRunRecorder, SELECT_RUNS, toRunSummary, withRun, type AgentRunRow, type AgentRunView, type RunOpts, type RunRef, type RunStep } from './runs.ts';
import { derivePerformanceSignals } from './signals.ts';
import { openSlots, slotLabel, type Slot } from './slots.ts';
import { PLATFORM_NAMES, checkDraft, checksSummary, voiceCheck, type Check } from './voice-check.ts';
import { featureLifts, loadLearningPosts, proposeChanges, ruleCoverage, type ProposedChange } from './voice-learning.ts';

/**
 * Built-in agents, defined in code. An agent run is a parent run (kind 'agent') with a step timeline; the model
 * runs it makes are child runs. Agents never publish: what they want posted becomes a pending approval.
 */

export type AgentDeps = Pick<AppDeps, 'db' | 'model' | 'registry' | 'publishMode' | 'modelMode'>;

export interface AgentInput {
  key: string;
  label: string;
  type: 'brand' | 'campaign' | 'post' | 'draft' | 'platforms' | 'number';
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  help?: string;
}

export type AgentTrigger = 'manual' | 'schedule' | 'post_published' | 'post_outperformed';

interface AgentInfo {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: 'plan' | 'repurpose' | 'review' | 'insights';
  inputs: AgentInput[];
  produces: ('digest' | 'ideas' | 'drafts' | 'approvals' | 'report')[];
  triggers: AgentTrigger[];
  steps: { key: string; label: string }[];
}

interface Prepared {
  brand: Brand;
  /** What the run records as its inputs (defaults filled in). */
  inputs: Record<string, unknown>;
}

interface AgentSpec<I, P extends Prepared> {
  info: AgentInfo;
  schema: z.ZodType<I, z.ZodTypeDef, unknown>;
  /** Resolve and validate inputs before the run starts; errors here are input errors (400/404), not failed runs. */
  prepare(deps: AgentDeps, inputs: I): Promise<P>;
  execute(deps: AgentDeps, p: P, rec: AgentRunRecorder): Promise<{ summary: string; output?: Record<string, unknown> }>;
}

const spec = <I, P extends Prepared>(s: AgentSpec<I, P>) => s as unknown as AgentSpec<unknown, Prepared>;

const DAY_MS = 86_400_000;
const platformList = (ps: Platform[]) => ps.map((p) => PLATFORM_NAMES[p]).join(', ');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const platforms = z.array(platformSchema).min(1).max(4).transform((ps) => [...new Set(ps)]);

interface ChannelRef {
  id: string;
  platform: Platform;
  handle: string;
}

/** The brand's first connected channel per platform. */
async function connectedChannels(db: Db, brandId: string): Promise<Map<Platform, ChannelRef>> {
  const rows = await db.query<ChannelRef>(
    "SELECT id, platform, handle FROM channels WHERE brand_id = $1 AND status = 'connected' ORDER BY created_at, id",
    [brandId],
  );
  const out = new Map<Platform, ChannelRef>();
  for (const r of rows) if (!out.has(r.platform)) out.set(r.platform, r);
  return out;
}

function channelsFor(brand: Brand, all: Map<Platform, ChannelRef>, wanted: Platform[]): ChannelRef[] {
  if (!wanted.length) throw new HarborError('INVALID_REQUEST', `platforms: ${brand.name} has no connected channel to plan for. Connect one first.`);
  return wanted.map((p) => {
    const ch = all.get(p);
    if (!ch) throw new HarborError('INVALID_REQUEST', `platforms: ${brand.name} has no connected ${PLATFORM_NAMES[p]} channel.`);
    return ch;
  });
}

const maxLengthOf = (deps: Pick<AgentDeps, 'registry'>, platform: Platform) => deps.registry.get(platform)?.maxLength() ?? DEFAULT_MAX[platform];

// ---- Shared steps ----

async function checkDrafts(deps: AgentDeps, brand: Brand, drafts: DraftOut[], rec: AgentRunRecorder): Promise<Map<string, Check[]>> {
  return rec.step('checks', 'Voice check', async () => {
    const assets = await mediaLookup(deps.db, drafts);
    const out = new Map(drafts.map((d) => [d.id, voiceCheck(brand, d, maxLengthOf(deps, d.platform), assets)]));
    const flagged = [...out.values()].filter((cs) => cs.some((c) => !c.ok)).length;
    return { value: out, detail: `${plural(drafts.length, 'draft')} checked; ${flagged ? `${flagged} with issues` : 'all pass'}.` };
  });
}

async function findSlots(deps: AgentDeps, brand: Brand, channels: ChannelRef[], perChannel: number, rec: AgentRunRecorder): Promise<Map<string, Slot[]>> {
  return rec.step('slots', 'Find open slots', async () => {
    const out = new Map<string, Slot[]>();
    for (const ch of channels) out.set(ch.id, await openSlots(deps.db, brand.id, ch, perChannel));
    const n = [...out.values()].reduce((a, s) => a + s.length, 0);
    const short = channels.filter((ch) => (out.get(ch.id)?.length ?? 0) < perChannel);
    return {
      value: out,
      detail: `${plural(n, 'open slot')} over the next 7 days on ${platformList(channels.map((c) => c.platform))}.${short.length ? ` Not enough room on ${platformList(short.map((c) => c.platform))}.` : ''}`,
    };
  });
}

/** One approval per draft, each on its platform's next free slot (drafts beyond the free slots are left unqueued). */
async function queueApprovals(
  deps: AgentDeps,
  brand: Brand,
  agentId: string,
  rec: AgentRunRecorder,
  drafts: DraftOut[],
  channels: ChannelRef[],
  slots: Map<string, Slot[]>,
  checks: Map<string, Check[]>,
  reasonFor: (slot: Slot, channel: ChannelRef, i: number) => string,
): Promise<string[]> {
  return rec.step('approvals', 'Queue for approval', async () => {
    const ids: string[] = [];
    const refs: RunRef[] = [];
    let unqueued = 0;
    for (const ch of channels) {
      const free = [...(slots.get(ch.id) ?? [])];
      for (const [i, d] of drafts.filter((x) => x.platform === ch.platform).entries()) {
        const slot = free.shift();
        if (!slot) {
          unqueued++;
          continue;
        }
        const id = await insertApproval(deps.db, {
          workspaceId: brand.workspaceId, brandId: brand.id, runId: rec.id, agentId, draftId: d.id, channelId: ch.id, platform: ch.platform,
          proposedFor: slot.at, slotScore: slot.score, reason: reasonFor(slot, ch, i), checks: checks.get(d.id) ?? [], source: rec.opts.source ?? 'ui',
        });
        ids.push(id);
        refs.push({ kind: 'approval', id, label: `${PLATFORM_NAMES[ch.platform]} · ${slotLabel(slot)}` });
      }
    }
    return { value: ids, refs, detail: `${plural(ids.length, 'post')} waiting for approval.${unqueued ? ` ${unqueued} without a free slot.` : ''}` };
  });
}

// ---- Weekly plan ----

const weeklyPlan = spec({
  info: {
    id: 'weekly_plan',
    name: 'Weekly plan',
    tagline: 'Plan next week from what worked last week.',
    description:
      "Reads last week's digest, finds open best-time slots for the next 7 days, suggests ideas, drafts each one for every platform, runs the voice check and queues every draft for approval on its slot. Nothing is published until you approve it.",
    category: 'plan',
    inputs: [
      { key: 'brandId', label: 'Brand', type: 'brand', required: true },
      { key: 'platforms', label: 'Platforms', type: 'platforms', required: false, help: "Defaults to the brand's connected platforms." },
      { key: 'postsPerPlatform', label: 'Posts per platform', type: 'number', required: false, default: 3, min: 1, max: 7 },
      { key: 'campaignId', label: 'Campaign', type: 'campaign', required: false, help: 'Ideas join the campaign and land on its canvas.' },
    ],
    produces: ['digest', 'ideas', 'drafts', 'approvals'],
    triggers: ['manual', 'schedule'],
    steps: [
      { key: 'digest', label: 'Read last week' },
      { key: 'slots', label: 'Find open slots' },
      { key: 'ideas', label: 'Suggest ideas' },
      { key: 'drafts', label: 'Draft every idea' },
      { key: 'checks', label: 'Voice check' },
      { key: 'approvals', label: 'Queue for approval' },
    ],
  },
  schema: z.object({
    brandId: z.string().min(1),
    platforms: platforms.optional(),
    postsPerPlatform: z.number().int().min(1).max(7).default(3),
    campaignId: z.string().min(1).optional(),
  }),
  async prepare(deps, i) {
    const brand = await loadBrand(deps.db, i.brandId);
    const all = await connectedChannels(deps.db, brand.id);
    const channels = channelsFor(brand, all, i.platforms ?? [...all.keys()]);
    const campaign = i.campaignId ? await campaignForBrand(deps.db, i.campaignId, brand.id) : undefined;
    return { brand, channels, campaign, count: i.postsPerPlatform, inputs: { ...i, platforms: channels.map((c) => c.platform) } };
  },
  async execute(deps, p, rec) {
    const { db } = deps;
    const { brand, channels, campaign, count } = p;
    const targets = channels.map((c) => c.platform);

    const { digest, digestId } = await rec.step('digest', 'Read last week', async () => {
      const latest = await latestDigestRow(db, brand.id);
      if (latest && Date.now() - new Date(latest.created_at).getTime() < DAY_MS) {
        return { value: { digest: latest.data, digestId: latest.id }, detail: `Reused today's digest: ${latest.data.headline}`, refs: [{ kind: 'digest', id: latest.id, label: latest.data.headline }] };
      }
      const { digest, run } = await generateDigest(deps, brand, 7, { run: rec.child });
      const [row] = await db.query<{ id: string }>('SELECT id FROM digests WHERE agent_run_id = $1', [run.id]);
      const refs: RunRef[] = [{ kind: 'run', id: run.id, label: 'Digest run' }];
      if (row) refs.unshift({ kind: 'digest', id: row.id, label: digest.headline });
      return { value: { digest, digestId: row?.id }, detail: digest.headline, refs };
    });

    const slots = await findSlots(deps, brand, channels, count, rec);

    const ideaIds = await rec.step('ideas', 'Suggest ideas', async () => {
      const guidance = digest.recommendations.map((r) => `${r.title}: ${r.detail}`);
      const { ids, run } = await generateIdeas(deps, brand, count, { campaignId: campaign?.id, guidance, run: rec.child });
      const ideas = await Promise.all(ids.map((id) => loadIdea(db, id)));
      if (campaign) await placeIdeas(db, campaign, ids);
      return {
        value: ids,
        detail: `${plural(ids.length, 'idea')}${guidance.length ? ` guided by ${plural(guidance.length, 'recommendation')}` : ''}${campaign ? `, added to ${campaign.name}` : ''}.`,
        refs: [...ideas.map((i): RunRef => ({ kind: 'idea', id: i.id, label: i.title })), { kind: 'run', id: run.id, label: 'Ideas run' }],
      };
    });

    const drafts = await rec.step('drafts', 'Draft every idea', async () => {
      const out: DraftOut[] = [];
      const runs: RunRef[] = [];
      let attached = 0;
      for (const ideaId of ideaIds) {
        const idea = await loadIdea(db, ideaId);
        const { ids, run } = await generateDrafts(deps, brand, idea, targets, [], { run: rec.child });
        runs.push({ kind: 'run', id: run.id, label: `Drafts: ${idea.title}` });
        const made = await Promise.all(ids.map((id) => loadDraft(db, id)));
        for (const [i, d] of made.entries()) {
          if (!(await attachIdeaImage(db, d, idea.title))) continue;
          attached++;
          made[i] = await loadDraft(db, d.id);
        }
        out.push(...made);
        if (campaign) await placeDrafts(db, campaign, ideaId, ids);
      }
      const refs = out.map((d): RunRef => ({ kind: 'draft', id: d.id, label: PLATFORM_NAMES[d.platform] }));
      const images = targets.includes('instagram') ? ` ${attached ? `Attached a library image to ${plural(attached, 'Instagram draft')}.` : 'No library image matched the Instagram drafts.'}` : '';
      return { value: out, detail: `${plural(out.length, 'draft')} for ${platformList(targets)}.${images}`, refs: [...refs, ...runs] };
    });

    const checks = await checkDrafts(deps, brand, drafts, rec);

    const findings = digest.recommendations.length ? digest.recommendations : digest.wins;
    const approvalIds = await queueApprovals(deps, brand, 'weekly_plan', rec, drafts, channels, slots, checks, (slot, ch, i) => {
      // Cite a finding about this platform, or one that names no platform; never another platform's tip.
      const names = Object.values(PLATFORM_NAMES);
      const fits = findings.filter((f) => f.title.includes(PLATFORM_NAMES[ch.platform]) || !names.some((n) => new RegExp(`\\b${n}\\b`).test(f.title)));
      const finding = fits.length ? fits[i % fits.length]!.title : digest.headline;
      return `${slotLabel(slot)} is one of ${brand.name}'s best ${PLATFORM_NAMES[ch.platform]} slots. From last week's digest: ${finding}`;
    });

    return {
      summary: `Planned ${plural(drafts.length, 'post')} across ${platformList(targets)}; ${approvalIds.length} waiting for approval.`,
      output: { digestId, ideaIds, draftIds: drafts.map((d) => d.id), approvalIds },
    };
  },
} satisfies AgentSpec<
  { brandId: string; platforms?: Platform[]; postsPerPlatform: number; campaignId?: string },
  Prepared & { channels: ChannelRef[]; campaign?: CampaignRow; count: number }
>);

/**
 * Instagram can't post without media: give a fresh Instagram draft the brand's most recently used image tagged for
 * the idea's topic, if any. Without one the media stays empty, and the voice check flags it in Approvals. The draft
 * is the agent's own, just written, so it's updated in place rather than versioned.
 */
async function attachIdeaImage(db: Db, draft: DraftOut, title: string): Promise<boolean> {
  if (draft.platform !== 'instagram' || draft.parts[0]?.media.length) return false;
  const image = await imageForIdea(db, draft.brandId, title);
  if (!image) return false;
  const parts = draft.parts.map((p, i) => (i === 0 ? { ...p, media: [assetRef(image, 'instagram')] } : p));
  await db.query('UPDATE drafts SET parts = $2 WHERE id = $1', [draft.id, JSON.stringify(parts)]);
  return true;
}

/** Idea cards go into the campaign's Ideas frame. */
async function placeIdeas(db: Db, campaign: CampaignRow, ideaIds: string[]) {
  const rows = await listItems(db, campaign.id);
  const fresh = ideaIds.filter((id) => !rows.some((r) => r.kind === 'idea' && r.ref_id === id));
  await placeCards(db, campaign.id, rows, 'idea', fresh, CARD.idea, findFrame(rows, 'Ideas'), { cols: 2, fallback: () => gridRightOfAll(rows, fresh.length, CARD.idea, 2) });
}

/** Draft cards go into the Drafts frame, connected from their idea's card. */
async function placeDrafts(db: Db, campaign: CampaignRow, ideaId: string, draftIds: string[]) {
  const rows = await listItems(db, campaign.id);
  const placed = await placeCards(db, campaign.id, rows, 'draft', draftIds, CARD.draft, findFrame(rows, 'Drafts'), {
    fallback: () => gridRightOfAll(rows, draftIds.length, CARD.draft, 2),
  });
  const ideaCard = rows.find((r) => r.kind === 'idea' && r.ref_id === ideaId);
  if (ideaCard) for (const d of placed) await upsertEdge(db, { campaignId: campaign.id, source: ideaCard.id, target: d.id });
}

// ---- Repurpose a winner ----

const repurposeWinner = spec({
  info: {
    id: 'repurpose_winner',
    name: 'Repurpose a winner',
    tagline: 'Turn a post that outperformed into posts for your other platforms.',
    description:
      'Takes a published post, turns it into an idea that cites its performance, drafts it natively for your other platforms with the original as context, runs the voice check and queues each draft for approval on the next free best-time slot.',
    category: 'repurpose',
    inputs: [
      { key: 'postId', label: 'Published post', type: 'post', required: true },
      { key: 'platforms', label: 'Platforms', type: 'platforms', required: false, help: "Defaults to the brand's connected platforms other than the post's." },
    ],
    produces: ['ideas', 'drafts', 'approvals'],
    triggers: ['manual', 'post_outperformed'],
    steps: [
      { key: 'post', label: 'Read the winner' },
      { key: 'idea', label: 'Turn it into an idea' },
      { key: 'drafts', label: 'Draft for other platforms' },
      { key: 'checks', label: 'Voice check' },
      { key: 'slots', label: 'Find open slots' },
      { key: 'approvals', label: 'Queue for approval' },
    ],
  },
  schema: z.object({ postId: z.string().min(1), platforms: platforms.optional() }),
  async prepare(deps, i) {
    const post = await loadPost(deps.db, i.postId);
    if (post.status !== 'published') throw new HarborError('INVALID_REQUEST', `postId: post ${post.id} is ${post.status}; only published posts can be repurposed.`);
    const brand = await loadBrand(deps.db, post.brandId);
    const all = await connectedChannels(deps.db, brand.id);
    const from = post.channel.platform as Platform;
    const channels = channelsFor(brand, all, i.platforms ?? [...all.keys()].filter((p) => p !== from));
    return { brand, post, channels, inputs: { ...i, platforms: channels.map((c) => c.platform) } };
  },
  async execute(deps, p, rec) {
    const { db } = deps;
    const { brand, post, channels } = p;
    const from = post.channel.platform as Platform;
    const text = post.parts.map((x) => x.text).join('\n\n');
    const hook = (post.parts[0]?.text ?? '').split('\n')[0]!.trim();

    const outcome = await rec.step('post', 'Read the winner', async () => {
      const o = post.outcome;
      const detail = o ? `${o.ratio}x the ${PLATFORM_NAMES[from]} median ${o.metric} at ${o.atAgeHours}h (${o.verdict}).` : 'No verdict yet; repurposing anyway.';
      return { value: o, detail, refs: [{ kind: 'post', id: post.id, label: hook.slice(0, 80) }] };
    });

    const idea = await rec.step('idea', 'Turn it into an idea', async () => {
      await derivePerformanceSignals(db, brand.id);
      const [signal] = await db.query<{ id: string; summary: string }>(
        "SELECT id, summary FROM signals WHERE brand_id = $1 AND kind = 'post_performance' AND source->>'postId' = $2",
        [brand.id, post.id],
      );
      const did = outcome ? `did ${outcome.ratio}x the median ${outcome.metric}` : 'did well';
      const id = await insertIdea(db, {
        brandId: brand.id,
        title: `Repurpose: ${hook || 'a winning post'}`.slice(0, 300),
        angle: `This ${PLATFORM_NAMES[from]} post ${did}. Keep its core point and the shape of its hook, and rewrite it natively for ${platformList(channels.map((c) => c.platform))}.`,
        basis: signal ? [{ signalId: signal.id, note: signal.summary.slice(0, 200) }] : [],
        campaignId: post.campaignId,
      });
      const i = await loadIdea(db, id);
      return { value: i, detail: i.title, refs: [{ kind: 'idea', id, label: i.title }] };
    });

    const drafts = await rec.step('drafts', 'Draft for other platforms', async () => {
      const context: DraftContextItem[] = [{ kind: 'post', text }];
      const { ids, run } = await generateDrafts(deps, brand, idea, channels.map((c) => c.platform), context, { run: rec.child });
      const out = await Promise.all(ids.map((id) => loadDraft(db, id)));
      return {
        value: out,
        detail: `${plural(out.length, 'draft')} for ${platformList(out.map((d) => d.platform))}.`,
        refs: [...out.map((d): RunRef => ({ kind: 'draft', id: d.id, label: PLATFORM_NAMES[d.platform] })), { kind: 'run', id: run.id, label: 'Drafts run' }],
      };
    });

    const checks = await checkDrafts(deps, brand, drafts, rec);
    const slots = await findSlots(deps, brand, channels, 1, rec);
    const approvalIds = await queueApprovals(deps, brand, 'repurpose_winner', rec, drafts, channels, slots, checks, (slot, ch) =>
      `${slotLabel(slot)} is the next free best-time slot on @${ch.handle}. The original ${PLATFORM_NAMES[from]} post ${outcome ? `did ${outcome.ratio}x the median` : 'did well'}.`,
    );
    return {
      summary: `Repurposed a winning ${PLATFORM_NAMES[from]} post into ${plural(drafts.length, 'draft')}; ${approvalIds.length} waiting for approval.`,
      output: { postId: post.id, ideaId: idea.id, draftIds: drafts.map((d) => d.id), approvalIds },
    };
  },
} satisfies AgentSpec<{ postId: string; platforms?: Platform[] }, Prepared & { post: Awaited<ReturnType<typeof loadPost>>; channels: ChannelRef[] }>);

// ---- Voice check ----

const voiceCheckAgent = spec({
  info: {
    id: 'voice_check',
    name: 'Voice check',
    tagline: 'Check a draft against the brand voice and platform rules.',
    description:
      "Checks a draft for banned words and the voice's avoid list, length against the platform limit, hashtags, the style rules that can be checked mechanically, and the hook. Deterministic: no model call.",
    category: 'review',
    inputs: [{ key: 'draftId', label: 'Draft', type: 'draft', required: true }],
    produces: ['report'],
    triggers: ['manual'],
    steps: [{ key: 'checks', label: 'Check the draft' }],
  },
  schema: z.object({ draftId: z.string().min(1) }),
  async prepare(deps, i) {
    const draft = await loadDraft(deps.db, i.draftId);
    return { brand: await loadBrand(deps.db, draft.brandId), draft, inputs: i };
  },
  async execute(deps, p, rec) {
    const checks = await rec.step('checks', 'Check the draft', async () => {
      const cs = await checkDraft(deps, p.brand, p.draft);
      return { value: cs, detail: checksSummary(cs), refs: [{ kind: 'draft', id: p.draft.id, label: PLATFORM_NAMES[p.draft.platform] }] };
    });
    return { summary: checksSummary(checks), output: { report: { draftId: p.draft.id, ok: checks.every((c) => c.ok), checks } } };
  },
} satisfies AgentSpec<{ draftId: string }, Prepared & { draft: DraftOut }>);

// ---- Digest ----

const digestAgent = spec({
  info: {
    id: 'digest',
    name: 'Weekly digest',
    tagline: 'What worked, what missed, and what to do next week.',
    description: "Refreshes every post's verdict and writes the brand's digest for the last 7 days: wins, misses, patterns and recommendations, each citing posts.",
    category: 'insights',
    inputs: [{ key: 'brandId', label: 'Brand', type: 'brand', required: true }],
    produces: ['digest'],
    triggers: ['manual', 'schedule'],
    steps: [{ key: 'digest', label: 'Write the digest' }],
  },
  schema: z.object({ brandId: z.string().min(1) }),
  async prepare(deps, i) {
    return { brand: await loadBrand(deps.db, i.brandId), inputs: i };
  },
  async execute(deps, p, rec) {
    const { digest, digestId } = await rec.step('digest', 'Write the digest', async () => {
      const { digest, run } = await generateDigest(deps, p.brand, 7, { run: rec.child });
      const [row] = await deps.db.query<{ id: string }>('SELECT id FROM digests WHERE agent_run_id = $1', [run.id]);
      const refs: RunRef[] = [{ kind: 'run', id: run.id, label: 'Digest run' }];
      if (row) refs.unshift({ kind: 'digest', id: row.id, label: digest.headline });
      return { value: { digest, digestId: row?.id }, detail: digest.headline, refs };
    });
    return { summary: digest.headline, output: { digestId } };
  },
} satisfies AgentSpec<{ brandId: string }, Prepared>);

// ---- Voice refresh ----

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const voiceRefresh = spec({
  info: {
    id: 'voice_refresh',
    name: 'Voice refresh',
    tagline: 'Learn the voice from what actually worked.',
    description:
      "Refreshes every post's verdict, compares the posts that beat the brand's median with the ones that missed, checks the voice's rules against them and proposes changes: new do and avoid rules, rules the results contradict, and new excerpts, each linked to its posts. Nothing changes until you apply it.",
    category: 'review',
    inputs: [{ key: 'brandId', label: 'Brand', type: 'brand', required: true }],
    produces: ['report', 'approvals'],
    triggers: ['manual', 'schedule'],
    steps: [
      { key: 'outcomes', label: 'Refresh verdicts' },
      { key: 'compare', label: 'Compare winners and losers' },
      { key: 'rules', label: 'Check the current rules' },
      { key: 'propose', label: 'Draft the changes' },
      { key: 'queue', label: 'Send for approval' },
    ],
  },
  schema: z.object({ brandId: z.string().min(1) }),
  async prepare(deps, i) {
    return { brand: await loadBrand(deps.db, i.brandId), inputs: i };
  },
  async execute(deps, p, rec) {
    const { db } = deps;
    const { brand } = p;
    const voice = brand.memory.voice;

    const posts = await rec.step('outcomes', 'Refresh verdicts', async () => {
      await refreshBrandOutcomes(db, brand.id);
      await derivePerformanceSignals(db, brand.id);
      const posts = await loadLearningPosts(db, brand.id);
      return { value: posts, detail: `${plural(posts.length, 'post')} with a verdict in the last 90 days.` };
    });

    const lifts = await rec.step('compare', 'Compare winners and losers', async () => {
      const lifts = featureLifts(posts);
      const won = posts.filter((x) => x.verdict === 'outperformed');
      const lost = posts.filter((x) => x.verdict === 'underperformed');
      const top = [...lifts].sort((a, b) => Math.abs(Math.log(b.lift)) - Math.abs(Math.log(a.lift)))[0];
      const refs = [...won].sort((a, b) => b.ratio - a.ratio).slice(0, 3).map((x): RunRef => ({ kind: 'post', id: x.id, label: `${x.ratio}x: ${(x.parts[0] ?? '').slice(0, 60)}` }));
      const detail = lifts.length
        ? `${won.length} outperformed, ${lost.length} underperformed. ${plural(lifts.length, 'feature')} with 3+ posts on each side; the strongest: ${top!.label.toLowerCase()} at ${top!.lift}×.`
        : `${won.length} outperformed, ${lost.length} underperformed. Not enough posts on both sides of any feature yet.`;
      return { value: lifts, detail, refs };
    });

    await rec.step('rules', 'Check the current rules', async () => {
      const { covered, contradicted } = ruleCoverage(voice, lifts);
      return {
        value: undefined,
        detail: `${plural(voice.do.length, 'do rule')} and ${plural(voice.avoid.length, 'avoid rule')}; ${covered.length} backed by the results, ${contradicted.length} contradicted.`,
      };
    });

    const changes = await rec.step('propose', 'Draft the changes', async () => {
      const drafted = proposeChanges(voice, posts, lifts);
      if (!drafted.length) return { value: [] as ProposedChange[], detail: 'Nothing to change: the voice already matches the results.' };
      const { value, run } = await withRun(db, brand, 'voice', { refresh: true, changes: drafted.length }, deps.model.name, async () => {
        const res = await deps.model.refineVoiceChanges({ brandName: brand.name, voice, changes: drafted.map(({ evidence: _, ...c }) => c) });
        // The model polishes wording only; a result that doesn't line up with the draft falls back to it.
        const refined = res.result.length === drafted.length ? drafted.map((d, i) => ({ ...d, ...res.result[i]!, op: d.op, target: d.target, evidence: d.evidence })) : drafted;
        const out: ProposedChange[] = [];
        for (const c of refined) {
          if (c.op === 'remove' && !(voice[c.target === 'voice.do' ? 'do' : 'avoid'] ?? []).includes(c.text)) continue;
          if (c.op === 'add' && c.target === 'voice.do' && voice.do.some((r) => sameText(r, c.text))) continue;
          if (c.op === 'add' && c.target === 'voice.avoid' && voice.avoid.some((r) => sameText(r, c.text))) continue;
          if (out.some((o) => o.op === c.op && o.target === c.target && sameText(o.text, c.text))) continue;
          out.push(c);
        }
        return { value: out, calls: [res], output: { changes: out.length } };
      }, rec.child);
      const adds = value.filter((c) => c.op === 'add').length;
      return { value, detail: `${plural(value.length, 'change')}: ${adds} to add, ${value.length - adds} to remove.`, refs: [{ kind: 'run', id: run.id, label: 'Wording run' }] };
    });

    if (!changes.length) {
      await rec.skip('queue', 'Send for approval', 'Nothing to send: no change has enough evidence yet.');
      return { summary: `No changes proposed: ${brand.name}'s voice already matches the results.`, output: { report: { posts: posts.length, lifts } } };
    }
    const proposalId = await rec.step('queue', 'Send for approval', async () => {
      const id = await insertMemoryProposal(db, {
        workspaceId: brand.workspaceId, brandId: brand.id, runId: rec.id, agentId: 'voice_refresh',
        changes: changes.map((c) => ({ op: c.op, target: c.target, text: c.text, why: c.why, ...(c.lift !== undefined ? { lift: c.lift } : {}), evidence: c.evidence })),
      });
      return { value: id, detail: `${plural(changes.length, 'change')} waiting for approval.`, refs: [{ kind: 'proposal', id, label: `${plural(changes.length, 'change')} to ${brand.name}'s voice` }] };
    });
    return {
      summary: `Proposed ${plural(changes.length, 'change')} to ${brand.name}'s voice; waiting for approval.`,
      output: { proposalId, report: { posts: posts.length, lifts } },
    };
  },
} satisfies AgentSpec<{ brandId: string }, Prepared>);

// ---- Registry ----

const SPECS = [weeklyPlan, repurposeWinner, voiceCheckAgent, digestAgent, voiceRefresh];
export const AGENT_IDS = SPECS.map((s) => s.info.id);

function specFor(id: string): AgentSpec<unknown, Prepared> {
  const s = SPECS.find((x) => x.info.id === id);
  if (!s) throw new HarborError('NOT_FOUND', `Agent ${id} not found. Agents: ${AGENT_IDS.join(', ')}.`);
  return s;
}

export const agentInfo = (id: string): AgentInfo => specFor(id).info;

export type AgentDef = AgentInfo & { lastRun?: AgentRunView; automations: number };

/** Every agent with its latest top-level run and how many automations use it (optionally for one brand). */
export async function listAgentDefs(db: Db, brandId?: string): Promise<AgentDef[]> {
  const last = await db.query<AgentRunRow>(
    `SELECT DISTINCT ON (x.agent_id) x.* FROM (${SELECT_RUNS} WHERE r.kind = 'agent' AND r.parent_run_id IS NULL AND ($1::text IS NULL OR r.brand_id = $1)) x
     ORDER BY x.agent_id, x.started_at DESC, x.id DESC`,
    [brandId ?? null],
  );
  const counts = await db.query<{ agent_id: string; n: number }>(
    'SELECT agent_id, count(*)::int AS n FROM automations WHERE ($1::text IS NULL OR brand_id = $1) GROUP BY agent_id',
    [brandId ?? null],
  );
  return SPECS.map(({ info }) => {
    const run = last.find((r) => r.agent_id === info.id);
    return { ...info, ...(run ? { lastRun: toRunSummary(run) } : {}), automations: Number(counts.find((c) => c.agent_id === info.id)?.n ?? 0) };
  });
}

/**
 * Run an agent synchronously. Input errors throw (400/404) before anything is recorded; once the run has started,
 * a failure is recorded on the run (status 'failed', the failed step marked) and the run id is still returned.
 */
export async function runAgent(deps: AgentDeps, agentId: string, raw: unknown, opts: RunOpts = {}): Promise<string> {
  const s = specFor(agentId);
  const inputs = check(s.schema, raw ?? {});
  const prepared = await s.prepare(deps, inputs);
  const rec = await AgentRunRecorder.start(deps.db, prepared.brand, agentId, prepared.inputs, deps.model.name, opts);
  try {
    const { summary, output } = await s.execute(deps, prepared, rec);
    await rec.finish({ summary, output, simulated: deps.model.simulated });
  } catch (err) {
    const failed = rec.steps.find((x) => x.status === 'failed');
    await rec.finish({ error: err, summary: failed ? `Failed at "${failed.label}".` : 'Failed.', simulated: deps.model.simulated });
  }
  return rec.id;
}

/** A run that failed before it could start (an automation with inputs that no longer work), so it shows up in the log. */
export async function recordFailedRun(deps: AgentDeps, brand: Brand, agentId: string, inputs: Record<string, unknown>, err: unknown, opts: RunOpts): Promise<string> {
  const rec = await AgentRunRecorder.start(deps.db, brand, agentId, inputs, deps.model.name, opts);
  await rec.finish({ error: err, summary: 'Could not start.', simulated: deps.model.simulated });
  return rec.id;
}

// ---- Run detail ----

export type AgentRunDetail = AgentRunView & {
  inputs: Record<string, unknown>;
  steps: RunStep[];
  children: AgentRunView[];
  approvals: Approval[];
  output?: unknown;
};

export async function loadRunDetail(db: Db, id: string): Promise<AgentRunDetail> {
  const [row] = await db.query<AgentRunRow>(`${SELECT_RUNS} WHERE r.id = $1`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Run ${id} not found.`);
  const [extra] = await db.query<{ input: Record<string, unknown> | null; steps: RunStep[] | null; output: Record<string, unknown> | null }>(
    'SELECT input, steps, output FROM agent_runs WHERE id = $1',
    [id],
  );
  const children = await db.query<AgentRunRow>(`${SELECT_RUNS} WHERE r.parent_run_id = $1 ORDER BY r.started_at, r.id`, [id]);
  // `simulated` is already on the view.
  const { simulated: _, ...output } = extra?.output ?? {};
  return {
    ...toRunSummary(row),
    inputs: extra?.input ?? {},
    steps: extra?.steps ?? [],
    children: children.map(toRunSummary),
    approvals: (await listApprovals(db, { runId: id })).data,
    ...(extra?.output ? { output } : {}),
  };
}
