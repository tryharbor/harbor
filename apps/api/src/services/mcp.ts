import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { HarborError, brandMemorySchema, ideaStatusSchema, platformSchema, postStatusSchema, shortId, type Brand } from '@harbor/core';
import type { AppDeps } from '../app.ts';
import { listAgentDefs, loadRunDetail, runAgent } from './agents.ts';
import type { ApiKeyRow, ApiKeyScope } from './api-keys.ts';
import { listApprovals, proposeDraft } from './approvals.ts';
import { bestTimesForBrand } from './best-times.ts';
import { loadBrand, toBrand, type BrandRow } from './brands.ts';
import { CARD, SELECT_CAMPAIGNS, gridRightOfAll, insertItem, listItems, loadCampaignRow, toCampaign, toItem, type CampaignRow } from './campaigns.ts';
import { generateDrafts, loadDraft } from './drafts.ts';
import { SELECT_IDEAS, generateIdeas, insertIdea, loadIdea, toIdea, type IdeaRow } from './ideas.ts';
import { requireDigest } from './insights.ts';
import { SELECT_POSTS, loadPost, loadPostDetail, toPost, type PostListRow } from './posts.ts';
import type { RunOpts } from './runs.ts';

/**
 * Harbor's MCP server: read tools (brands, posts, digests, best times …) and write tools (ideas, drafts, proposals,
 * agent runs). No tool publishes or schedules: propose_post creates an approval for a person to decide. Built per
 * request (stateless Streamable HTTP), for one API key.
 */

interface ToolCtx {
  deps: AppDeps;
  key: ApiKeyRow;
  /** Model runs made by a tool are recorded with source 'mcp' and the key. */
  run: RunOpts;
  brand(id: string): Promise<Brand>;
}

interface ToolDef<S extends z.ZodRawShape> {
  name: string;
  description: string;
  scope: ApiKeyScope;
  input: S;
  run(args: z.objectOutputType<S, z.ZodTypeAny>, ctx: ToolCtx): Promise<{ summary: string; data: unknown }>;
}

const tool = <S extends z.ZodRawShape>(t: ToolDef<S>) => t as unknown as ToolDef<z.ZodRawShape>;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const id = (what: string) => z.string().min(1).describe(`The ${what} id.`);

const TOOLS: ToolDef<z.ZodRawShape>[] = [
  // ---- Read ----
  tool({
    name: 'list_brands',
    description: 'List the brands in this workspace with their connected channels.',
    scope: 'read',
    input: {},
    async run(_, ctx) {
      const brands = await ctx.deps.db.query<BrandRow>('SELECT * FROM brands WHERE workspace_id = $1 ORDER BY created_at, id', [ctx.key.workspace_id]);
      const channels = await ctx.deps.db.query<{ id: string; brand_id: string; platform: string; handle: string; status: string }>(
        'SELECT id, brand_id, platform, handle, status FROM channels WHERE brand_id = ANY($1::text[]) ORDER BY created_at, id',
        [brands.map((b) => b.id)],
      );
      const data = brands.map((r) => {
        const b = toBrand(r);
        return { id: b.id, name: b.name, slug: b.slug, channels: channels.filter((c) => c.brand_id === b.id).map(({ brand_id: _, ...c }) => c) };
      });
      return { summary: plural(data.length, 'brand'), data };
    },
  }),
  tool({
    name: 'get_brand_memory',
    description: "A brand's Brand Memory: voice (summary, do, avoid, banned words), audiences, products, knowledge, style rules and example posts.",
    scope: 'read',
    input: { brandId: id('brand') },
    async run({ brandId }, ctx) {
      const b = await ctx.brand(brandId);
      return { summary: `Brand Memory for ${b.name}`, data: b.memory };
    },
  }),
  tool({
    name: 'list_posts',
    description: "A brand's posts, newest first, with their latest metrics and verdict against the brand's median.",
    scope: 'read',
    input: { brandId: id('brand'), status: postStatusSchema.optional(), limit: z.number().int().min(1).max(100).default(20) },
    async run({ brandId, status, limit }, ctx) {
      const b = await ctx.brand(brandId);
      const rows = await ctx.deps.db.query<PostListRow>(
        `${SELECT_POSTS} WHERE p.brand_id = $1 AND ($2::text IS NULL OR p.status = $2)
         ORDER BY COALESCE(p.published_at, p.scheduled_for, p.created_at) DESC LIMIT $3`,
        [b.id, status ?? null, limit],
      );
      return { summary: `${plural(rows.length, 'post')} for ${b.name}`, data: rows.map(toPost) };
    },
  }),
  tool({
    name: 'get_post',
    description: 'One post with its outcome (verdict against the median), its growth curve (snapshots) and the baseline curve.',
    scope: 'read',
    input: { postId: id('post') },
    async run({ postId }, ctx) {
      const post = await loadPost(ctx.deps.db, postId);
      await ctx.brand(post.brandId);
      const detail = await loadPostDetail(ctx.deps.db, postId);
      return { summary: `Post on ${detail.channel.platform} (${detail.status}${detail.outcome ? `, ${detail.outcome.verdict}` : ''})`, data: detail };
    },
  }),
  tool({
    name: 'get_digest',
    description: "The brand's latest weekly digest: headline, stats, wins, misses, patterns and recommendations.",
    scope: 'read',
    input: { brandId: id('brand') },
    async run({ brandId }, ctx) {
      const b = await ctx.brand(brandId);
      const d = await requireDigest(ctx.deps.db, b.id);
      return { summary: d.headline, data: d };
    },
  }),
  tool({
    name: 'best_times',
    description: 'The best posting slots (weekday 0 = Sunday, hour 0-23, server local time), scored 0..1, for one platform or all of the brand’s platforms.',
    scope: 'read',
    input: { brandId: id('brand'), platform: platformSchema.optional() },
    async run({ brandId, platform }, ctx) {
      const b = await ctx.brand(brandId);
      const bt = await bestTimesForBrand(ctx.deps.db, b.id, platform);
      const top = bt.top.map((t) => ({ ...t, basis: bt.slots[t.weekday * 24 + t.hour]?.basis }));
      return { summary: `Best times for ${b.name}${platform ? ` on ${platform}` : ''}`, data: { platform, top } };
    },
  }),
  tool({
    name: 'list_campaigns',
    description: 'Campaigns, newest first, optionally for one brand.',
    scope: 'read',
    input: { brandId: id('brand').optional() },
    async run({ brandId }, ctx) {
      if (brandId) await ctx.brand(brandId);
      const rows = await ctx.deps.db.query<CampaignRow>(
        `${SELECT_CAMPAIGNS} WHERE c.workspace_id = $1 AND ($2::text IS NULL OR c.brand_id = $2) ORDER BY c.created_at DESC, c.id DESC`,
        [ctx.key.workspace_id, brandId ?? null],
      );
      return { summary: plural(rows.length, 'campaign'), data: rows.map(toCampaign) };
    },
  }),
  tool({
    name: 'list_ideas',
    description: "A brand's ideas, most recently updated first, optionally by status (idea, drafting, approved, scheduled, live).",
    scope: 'read',
    input: { brandId: id('brand'), status: ideaStatusSchema.optional() },
    async run({ brandId, status }, ctx) {
      const b = await ctx.brand(brandId);
      const rows = await ctx.deps.db.query<IdeaRow>(
        `${SELECT_IDEAS} WHERE i.brand_id = $1 AND ($2::text IS NULL OR i.status = $2) ORDER BY i.updated_at DESC LIMIT 200`,
        [b.id, status ?? null],
      );
      return { summary: `${plural(rows.length, 'idea')} for ${b.name}`, data: rows.map(toIdea) };
    },
  }),
  tool({
    name: 'list_approvals',
    description: 'The approval queue: posts agents proposed, each with its draft, slot, reason and voice checks. Pending first.',
    scope: 'read',
    input: { status: z.enum(['pending', 'approved', 'rejected']).optional(), brandId: id('brand').optional() },
    async run({ status, brandId }, ctx) {
      if (brandId) await ctx.brand(brandId);
      const res = await listApprovals(ctx.deps.db, { status, brandId });
      return { summary: `${res.counts.pending} pending, ${res.counts.approved} approved, ${res.counts.rejected} rejected`, data: res };
    },
  }),
  tool({
    name: 'list_agents',
    description: "Harbor's built-in agents: what each does, its inputs and its steps. Run one with run_agent.",
    scope: 'read',
    input: {},
    async run(_, ctx) {
      const data = await listAgentDefs(ctx.deps.db);
      return { summary: plural(data.length, 'agent'), data };
    },
  }),
  tool({
    name: 'get_agent_run',
    description: 'One agent or model run with its inputs, steps, child runs and the approvals it queued.',
    scope: 'read',
    input: { runId: id('run') },
    async run({ runId }, ctx) {
      const run = await loadRunDetail(ctx.deps.db, runId);
      if (run.brandId) await ctx.brand(run.brandId);
      return { summary: `${run.agentId ?? run.kind} run ${run.status}${run.summary ? `: ${run.summary}` : ''}`, data: run };
    },
  }),

  // ---- Write ----
  tool({
    name: 'create_idea',
    description: 'Add an idea to a brand. It starts in the Idea column.',
    scope: 'write',
    input: { brandId: id('brand'), title: z.string().trim().min(1).max(300), angle: z.string().max(4000).optional(), notes: z.string().max(4000).optional() },
    async run({ brandId, title, angle, notes }, ctx) {
      const b = await ctx.brand(brandId);
      const text = [angle?.trim(), notes?.trim() ? `Notes: ${notes.trim()}` : ''].filter(Boolean).join('\n\n');
      const ideaId = await insertIdea(ctx.deps.db, { brandId: b.id, title, angle: text.slice(0, 4000) });
      return { summary: `Created idea "${title}"`, data: await loadIdea(ctx.deps.db, ideaId) };
    },
  }),
  tool({
    name: 'suggest_ideas',
    description: "Suggest ideas for a brand from its signals (post performance, audience pain points); each cites a signal.",
    scope: 'write',
    input: { brandId: id('brand'), count: z.number().int().min(1).max(10).default(3) },
    async run({ brandId, count }, ctx) {
      const b = await ctx.brand(brandId);
      const { ids, run } = await generateIdeas(ctx.deps, b, count, { run: ctx.run });
      const ideas = await Promise.all(ids.map((i) => loadIdea(ctx.deps.db, i)));
      return { summary: `Suggested ${plural(ideas.length, 'idea')} for ${b.name}`, data: { ideas, run } };
    },
  }),
  tool({
    name: 'draft_idea',
    description: 'Draft an idea for one or more platforms (x, linkedin, instagram, threads). Each draft is a new version.',
    scope: 'write',
    input: { ideaId: id('idea'), platforms: z.array(platformSchema).min(1).max(4) },
    async run({ ideaId, platforms }, ctx) {
      const idea = await loadIdea(ctx.deps.db, ideaId);
      const b = await ctx.brand(idea.brandId);
      const { ids, run } = await generateDrafts(ctx.deps, b, idea, [...new Set(platforms)], [], { run: ctx.run });
      const drafts = await Promise.all(ids.map((d) => loadDraft(ctx.deps.db, d)));
      return { summary: `Wrote ${plural(drafts.length, 'draft')} for "${idea.title}"`, data: { drafts, run } };
    },
  }),
  tool({
    name: 'propose_post',
    description:
      'Propose a draft for posting. Creates a pending approval (a person approves, edits or rejects it); nothing is published or scheduled. Without proposedFor it takes the next free best-time slot on the channel.',
    scope: 'write',
    input: { draftId: id('draft'), proposedFor: z.string().datetime({ offset: true }).optional(), reason: z.string().max(1000).optional() },
    async run({ draftId, proposedFor, reason }, ctx) {
      const draft = await loadDraft(ctx.deps.db, draftId);
      await ctx.brand(draft.brandId);
      const approval = await proposeDraft(ctx.deps, { draftId, proposedFor, reason, source: 'mcp' });
      return { summary: `Proposed for ${approval.proposedFor} on @${approval.channel.handle}; waiting for approval`, data: approval };
    },
  }),
  tool({
    name: 'run_agent',
    description: 'Run one of the built-in agents (see list_agents) with its inputs. Agents never publish; posts they want out become approvals.',
    scope: 'write',
    input: { agentId: z.string().min(1), inputs: z.record(z.unknown()).default({}) },
    async run({ agentId, inputs }, ctx) {
      const brandId = typeof inputs.brandId === 'string' ? inputs.brandId : undefined;
      if (brandId) await ctx.brand(brandId);
      const runId = await runAgent(ctx.deps, agentId, inputs, ctx.run);
      const run = await loadRunDetail(ctx.deps.db, runId);
      return { summary: `${agentId} ${run.status}${run.summary ? `: ${run.summary}` : ''}`, data: run };
    },
  }),
  tool({
    name: 'add_knowledge',
    description: "Add a note to a brand's Brand Memory knowledge (facts, positioning, FAQs the drafts should know).",
    scope: 'write',
    input: { brandId: id('brand'), title: z.string().trim().min(1).max(300), body: z.string().min(1).max(20_000) },
    async run({ brandId, title, body }, ctx) {
      const b = await ctx.brand(brandId);
      const item = { id: shortId(), title, kind: 'note' as const, body };
      const memory = brandMemorySchema.parse({ ...b.memory, knowledge: [...b.memory.knowledge, item] });
      await ctx.deps.db.query('UPDATE brands SET memory = $2, updated_at = now() WHERE id = $1', [b.id, JSON.stringify(memory)]);
      return { summary: `Added "${title}" to ${b.name}'s knowledge`, data: item };
    },
  }),
  tool({
    name: 'add_canvas_note',
    description: "Put a sticky note on a campaign's canvas, to the right of everything on it.",
    scope: 'write',
    input: { campaignId: id('campaign'), text: z.string().trim().min(1).max(10_000) },
    async run({ campaignId, text }, ctx) {
      const campaign = await loadCampaignRow(ctx.deps.db, campaignId);
      await ctx.brand(campaign.brand_id);
      const rows = await listItems(ctx.deps.db, campaign.id);
      const [at] = gridRightOfAll(rows, 1, CARD.note, 1);
      const row = await insertItem(ctx.deps.db, { campaignId: campaign.id, kind: 'note', x: at!.x, y: at!.y, width: CARD.note.w, height: CARD.note.h, data: { text } });
      return { summary: `Added a note to ${campaign.name}`, data: toItem(row) };
    },
  }),
];

export const MEMORY_RESOURCE = 'harbor://brands/{brandId}/memory';

/** For GET /v1/mcp. */
export const MCP_TOOLS = TOOLS.map(({ name, description, scope }) => ({ name, description, scope }));

/** "(sandbox · simulated model)": every tool result says which mode it ran in. */
export function modeLabel(deps: Pick<AppDeps, 'publishMode' | 'model'>): string {
  return `(${deps.publishMode === 'sandbox' ? 'sandbox' : 'live publishing'} · ${deps.model.simulated ? 'simulated model' : `${deps.model.name} model`})`;
}

const missingScope = (key: ApiKeyRow, scope: ApiKeyScope, what: string) =>
  `${what} needs the "${scope}" scope. This API key (${key.prefix}…) only has: ${key.scopes.join(', ') || 'no scopes'}.`;

export function createMcpServer(deps: AppDeps, key: ApiKeyRow): McpServer {
  const server = new McpServer(
    { name: 'harbor', version: '0.0.1' },
    { instructions: 'Harbor is a content strategist for people running several brands. Agents never publish: propose_post and run_agent create approvals that a person decides on.' },
  );
  const mode = modeLabel(deps);
  const ctx: ToolCtx = {
    deps,
    key,
    run: { source: 'mcp', apiKeyId: key.id },
    async brand(brandId) {
      const b = await loadBrand(deps.db, brandId);
      if (b.workspaceId !== key.workspace_id) throw new HarborError('NOT_FOUND', `Brand ${brandId} not found.`);
      return b;
    },
  };
  const text = (t: string) => ({ type: 'text' as const, text: t });

  for (const t of TOOLS) {
    server.registerTool(t.name, { description: `${t.description} Needs the "${t.scope}" scope.`, inputSchema: t.input }, async (args: unknown): Promise<CallToolResult> => {
      if (!key.scopes.includes(t.scope)) return { isError: true, content: [text(`${missingScope(key, t.scope, t.name)} ${mode}`)] };
      try {
        const { summary, data } = await t.run(args as Record<string, unknown>, ctx);
        return { content: [text(`${summary} ${mode}`), text(JSON.stringify(data, null, 2))] };
      } catch (err) {
        if (!(err instanceof HarborError)) console.error(`[mcp] ${t.name}:`, err);
        return { isError: true, content: [text(`${err instanceof HarborError ? err.message : 'Something went wrong on our side.'} ${mode}`)] };
      }
    });
  }

  server.registerResource(
    'brand_memory',
    new ResourceTemplate(MEMORY_RESOURCE, {
      list: async () => {
        const rows = await deps.db.query<{ id: string; name: string }>('SELECT id, name FROM brands WHERE workspace_id = $1 ORDER BY created_at, id', [key.workspace_id]);
        return { resources: rows.map((b) => ({ uri: `harbor://brands/${b.id}/memory`, name: `${b.name}: Brand Memory`, mimeType: 'application/json' })) };
      },
    }),
    { description: "A brand's Brand Memory (JSON).", mimeType: 'application/json' },
    async (uri, vars) => {
      if (!key.scopes.includes('read')) throw new HarborError('UNAUTHORIZED', missingScope(key, 'read', 'Reading Brand Memory'));
      const b = await ctx.brand(String(vars.brandId));
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(b.memory, null, 2) }] };
    },
  );
  return server;
}
