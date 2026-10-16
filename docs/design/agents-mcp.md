# Agents, automations, approvals and MCP: contract

Status: build contract, 2026-10-15. The API (apps/api) implements it, and the web app (apps/web) consumes it.

## References

| Piece | Borrowed from | Harbor's version |
|---|---|---|
| Agent library | Jasper Agent Library: cards with what an agent does, its inputs and a Run button | `GET /v1/agents`: built-in agents defined in code |
| Running an agent | Jasper's docked agent panel: context chips, a few inputs, results as cards | `POST /v1/agents/:id/runs` (synchronous), with a step timeline |
| Automations | Sanity Functions: code runs on a document event or on a schedule | `automations`: a schedule (weekday + hour) or an event (`post_published`, `post_outperformed`) |
| Run log | Sanity Functions logs | `agent_runs` gets steps, a source, a parent and an automation |
| Agent access | Sanity's MCP server and API tokens | `/mcp` (Streamable HTTP) with hashed `hbr_` API keys; a stdio bridge for clients that only speak stdio |
| Approvals | Harbor's own rule | **Agents never publish.** Anything an agent wants posted becomes an approval with a proposed slot. A person approves, edits or rejects it. |

## Agents (built in, defined in code)

| id | Name | Inputs | Produces | Triggers |
|---|---|---|---|---|
| `weekly_plan` | Weekly plan | brandId*, platforms (default: brand's connected platforms), postsPerPlatform (1–7, default 3), campaignId? | digest (reused if < 24h old), ideas, drafts, approvals | manual, schedule |
| `repurpose_winner` | Repurpose a winner | postId* (published), platforms (default: connected platforms other than the post's) | idea, drafts, approvals | manual, post_outperformed |
| `voice_check` | Voice check | draftId* | report (checks) | manual |
| `digest` | Weekly digest | brandId* | digest | manual, schedule |

The weekly plan's steps (each is a timeline step):
1. `digest`: read last week (reuse the latest digest if it's under 24h old; otherwise generate one).
2. `slots`: find open slots. For each target platform's connected channel, take the next 7 days starting tomorrow and pick the top best-time slots. Skip any slot within 3h of a scheduled post, or of a pending approval, on that channel. Slots must be at least 1h in the future, with at most one per day per channel when possible.
3. `ideas`: suggest `postsPerPlatform` ideas, with the digest's recommendations as context.
4. `drafts`: draft every idea for every target platform. These are child runs.
5. `checks`: run the voice check on each draft.
6. `approvals`: queue one approval per draft, assigned to that platform's next free slot, with a `reason` that cites the slot and the digest finding.

If campaignId is given, the ideas join the campaign, and idea and draft cards are added to its Ideas and Drafts frames.

The voice check is deterministic and makes no model call. It checks:
- banned words and the voice's `avoid` phrases;
- length against the platform limit;
- the hashtag count (warn above 3 on X, LinkedIn and Threads);
- any `styleRules` that can be checked mechanically (the agent's judgement, kept simple);
- an empty or very short hook.

Each check is `{ key, ok, severity: 'info'|'warn'|'fail', label, detail }`.

## Data

- `agent_runs` gets new columns:
  - `agent_id TEXT NULL`
  - `source TEXT NOT NULL DEFAULT 'ui'`, one of 'ui', 'mcp', 'automation', 'canvas' or 'studio'
  - `parent_run_id TEXT NULL`
  - `automation_id TEXT NULL`
  - `api_key_id TEXT NULL`
  - `steps JSONB NOT NULL DEFAULT '[]'`
  - `summary TEXT NULL`

  The `kind` check gains `'agent'`. Parent runs use kind `'agent'`. Model runs made inside an agent keep their own kind and set `parent_run_id`. A parent's usage is the sum of its children's.
- `approvals`:
  - `id` (prefix `apr`), `workspace_id`, `brand_id`, `run_id`, `agent_id`
  - `draft_id`, `channel_id`, `platform`, `proposed_for timestamptz`, `slot_score real`, `reason text`
  - `checks jsonb`
  - `status` ('pending', 'approved' or 'rejected'), `decided_at`, `decided_note`, `post_id`
  - `source`, `created_at`
- `automations`:
  - `id` (prefix `aut`), `workspace_id`, `brand_id`, `agent_id`, `name`
  - `trigger jsonb`
  - `inputs jsonb`, `enabled bool`, `max_runs_per_day int` (default 3)
  - `consecutive_failures int`, `next_run_at`, `last_run_at`, `last_run_id`, `created_at`

  After 3 consecutive failures the automation pauses itself (`enabled=false`, status `failing`).
- `agent_events`: `id`, `type` ('post_published' or 'post_outperformed'), `brand_id`, `ref_id`, `created_at`, `processed_at`.
  - The publisher emits `post_published`.
  - The outcome refresh emits `post_outperformed` only the first time a post's verdict becomes 'outperformed'.
  - The worker tick processes events and due schedules. It dedupes on (automation, ref_id), so the same post never triggers the same automation twice.
- `api_keys`:
  - `id` (prefix `key`), `workspace_id`, `name`, `prefix`, `hash`
  - `scopes text[]` ('read', 'write')
  - `created_at`, `last_used_at`, `revoked_at`

  The token is `hbr_` followed by 32 random base62 characters. Only its SHA-256 is stored. `prefix` is the first 12 characters of the token, for display. The full key is returned once.

## HTTP API

The response shapes use the TypeScript of the web app's `api.ts`.

```ts
type AgentInput = { key: string; label: string; type: 'brand'|'campaign'|'post'|'draft'|'platforms'|'number'; required: boolean; default?: unknown; min?: number; max?: number; help?: string };
type AgentDef = { id: string; name: string; tagline: string; description: string; category: 'plan'|'repurpose'|'review'|'insights'; inputs: AgentInput[]; produces: ('digest'|'ideas'|'drafts'|'approvals'|'report')[]; triggers: ('manual'|'schedule'|'post_published'|'post_outperformed')[]; steps: { key: string; label: string }[]; lastRun?: AgentRunView; automations: number };
type RunRef = { kind: 'idea'|'draft'|'post'|'digest'|'approval'|'run'|'campaign'; id: string; label?: string };
type RunStep = { key: string; label: string; status: 'running'|'succeeded'|'failed'|'skipped'; startedAt: string; finishedAt?: string; detail?: string; refs?: RunRef[] };
type AgentRunView = { id: string; kind: string; agentId?: string; brandId?: string; brandName?: string; status: 'running'|'succeeded'|'failed'; source: 'ui'|'mcp'|'automation'|'canvas'|'studio'; automationId?: string; parentRunId?: string; model?: string; simulated: boolean; usage?: { inputTokens: number; outputTokens: number }; summary?: string; startedAt: string; finishedAt?: string; error?: string; stepCount: number; approvalCount: number };
type AgentRunDetail = AgentRunView & { inputs: Record<string, unknown>; steps: RunStep[]; children: AgentRunView[]; approvals: Approval[]; output?: unknown };
type Check = { key: string; ok: boolean; severity: 'info'|'warn'|'fail'; label: string; detail: string };
type Approval = { id: string; brandId: string; brandName: string; runId?: string; agentId?: string; source: string; status: 'pending'|'approved'|'rejected'; draft: DraftView; ideaId?: string; ideaTitle?: string; channel: { id: string; platform: Platform; handle: string; displayName?: string; status: string }; proposedFor: string; slotScore?: number; reason: string; checks: Check[]; createdAt: string; decidedAt?: string; decidedNote?: string; postId?: string };
type Trigger = { type: 'schedule'; weekday: number /*0=Sun*/; hour: number /*0-23, server local*/ } | { type: 'event'; event: 'post_published'|'post_outperformed' };
type Automation = { id: string; brandId: string; brandName: string; agentId: string; name: string; trigger: Trigger; inputs: Record<string, unknown>; enabled: boolean; status: 'active'|'paused'|'failing'; maxRunsPerDay: number; runsToday: number; consecutiveFailures: number; nextRunAt?: string; lastRunAt?: string; lastRunId?: string; lastRunStatus?: string; createdAt: string };
type ApiKey = { id: string; name: string; prefix: string; scopes: ('read'|'write')[]; createdAt: string; lastUsedAt?: string; revokedAt?: string };
```

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | /v1/agents | | `{ data: AgentDef[] }` |
| GET | /v1/agents/:id | | `AgentDef` |
| POST | /v1/agents/:id/runs | `{ inputs: {...} }` | `201 AgentRunDetail` (synchronous; failures still return the failed run with 201 and `status: 'failed'`; input errors are 400) |
| GET | /v1/agent-runs | `?brandId ?agentId ?source ?topLevel=true ?limit` | `{ data: AgentRunView[] }` (existing route, extended) |
| GET | /v1/agent-runs/:id | | `AgentRunDetail` |
| GET | /v1/approvals | `?status=pending ?brandId ?runId` | `{ data: Approval[], counts: { pending, approved, rejected } }`, pending first by proposedFor |
| POST | /v1/approvals/:id/approve | `{ scheduledFor?: iso, parts?: [{text}] }` | `{ approval, post }`. Edited parts save a new draft version (author 'human'). A proposed time in the past without an override is 400. Rejects a non-pending approval (409 / INVALID_REQUEST). |
| POST | /v1/approvals/:id/reject | `{ note?: string }` | `Approval` |
| POST | /v1/approvals/bulk | `{ action: 'approve'|'reject', ids: string[] }` | `{ results: { id, ok, error? }[] }` |
| GET | /v1/automations | `?brandId` | `{ data: Automation[] }` |
| POST | /v1/automations | `{ brandId, agentId, name?, trigger, inputs?, enabled?, maxRunsPerDay? }` | `201 Automation` (the trigger must be one the agent supports) |
| PATCH | /v1/automations/:id | partial | `Automation` (re-enabling resets failures) |
| DELETE | /v1/automations/:id | | 204 |
| POST | /v1/automations/:id/run | | `201 AgentRunDetail` (source 'automation') |
| GET | /v1/api-keys | | `{ data: ApiKey[] }` |
| POST | /v1/api-keys | `{ name, scopes }` | `201 ApiKey & { key: string }` |
| DELETE | /v1/api-keys/:id | | `ApiKey` (revoked) |
| GET | /v1/mcp | | `{ url, transport: 'streamable-http', tools: { name, description, scope: 'read'|'write' }[], resources: { uri, name }[] }` |
| POST/GET/DELETE | /mcp | `Authorization: Bearer hbr_…` | MCP Streamable HTTP (stateless) |

## MCP tools

Every tool result states the mode, for example "(sandbox · simulated model)". Read tools need the `read` scope and write tools need `write`. MCP runs are recorded with source 'mcp' and the `api_key_id`. **No tool publishes or schedules directly:** `propose_post` creates an approval.

- **Read:**
  - `list_brands`
  - `get_brand_memory {brandId}`
  - `list_posts {brandId, status?, limit?}`
  - `get_post {postId}` (with outcome and curve)
  - `get_digest {brandId}`
  - `best_times {brandId, platform?}`
  - `list_campaigns {brandId?}`
  - `list_ideas {brandId, status?}`
  - `list_approvals {status?, brandId?}`
  - `list_agents`
  - `get_agent_run {runId}`
- **Write:**
  - `create_idea {brandId, title, angle?, notes?}`
  - `suggest_ideas {brandId, count?}`
  - `draft_idea {ideaId, platforms}`
  - `propose_post {draftId, proposedFor?, reason?}`: without `proposedFor`, it takes the next free best-time slot on that platform's channel
  - `run_agent {agentId, inputs}`
  - `add_knowledge {brandId, title, body}`: appends to Brand Memory knowledge
  - `add_canvas_note {campaignId, text}`
- **Resources:** `harbor://brands/{brandId}/memory` (JSON).

The stdio bridge is `pnpm --dir apps/api mcp:stdio`, with `HARBOR_API_URL` and `HARBOR_API_KEY`. It relays to `/mcp`, so it works while the API (and its single-process PGlite) is running.
