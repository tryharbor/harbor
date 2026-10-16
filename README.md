# Harbor

Harbor is an open-source content strategist for builders who run several brands.

- **Brand Memory**: each brand has its own voice, offer, audience, competitors and example posts.
- **Performance snapshots**: Harbor polls every published post at 1h, 6h, 24h, 72h and 7d, so it sees each post's growth curve and not only the final total. Raw platform payloads are stored next to normalized metrics.
- **Insights and ideas**: snapshots and competitor activity become signals. Insights and ideas cite the signals they are based on.
- **Drafting**: drafts are written in each brand's voice, for each platform's limits.
- **Publishing**: Harbor publishes to X, LinkedIn, Instagram and Threads through one provider interface.

Status: early. You can create brands with a rich Brand Memory, learn a brand's voice from writing samples, generate ideas that cite the signals they're based on, draft and rewrite posts per platform in the Studio, publish or schedule posts (including threads), and watch each post's metrics fill in over its first week.

## Modes: runs with no keys and no spend

| Env | Default | What it does |
| --- | --- | --- |
| `HARBOR_PUBLISH_MODE` | `sandbox` | `sandbox`: every platform is a `SandboxProvider` with the real platform's limits (X 280, LinkedIn 3000, Instagram 2200 + media, Threads 500) and metric availability. Nothing leaves Harbor; growth curves are synthetic and deterministic per post, and depend on the post's traits so there are patterns to find: threads +40% on X, media +30% on Instagram and Threads, a number in the opening +25%, and the publish hour (0.8× far from each platform's peak, 1.25× at it: X 9:00, LinkedIn 8:00, Threads 12:00, Instagram 19:00). `live`: the real platform APIs. |
| `HARBOR_MODEL` | `simulated` | `simulated` (`simulated-v1`): a deterministic offline model that builds voice, ideas, drafts and rewrites from the brand's own memory and signals. `anthropic`: the real model, switched off during the build-out (returns 501). |

`GET /v1/mode` reports both, so the UI can label sandbox and simulated output. In sandbox mode `HARBOR_SECRET_KEY` is optional (fake tokens are encrypted with a built-in dev key and a one-line warning is logged); live mode requires it.

Sandbox extras: a first part containing `#fail-unknown` makes the publish end in `unknown`, and `#fail-rate` triggers a 60 s rate limit, so failure states can be tested. `POST /v1/sandbox/advance {hours}` moves sandbox time forward and takes every snapshot that comes due at its real age, so a week of growth curves takes seconds.

## Repo map

| Path | What it is |
| --- | --- |
| `packages/core` (`@harbor/core`) | Domain types and zod schemas (Workspace, Brand + Brand Memory v2, Channel, Competitor, Idea, Draft, Post, Snapshot, Signal, Insight, Outcome, AgentRun), normalized metric keys with per-platform availability, typed errors, and the `PlatformProvider` publishing interface with its failure policy. |
| `packages/providers` (`@harbor/providers`) | One adapter per platform (x, linkedin, instagram, threads) plus a registry: OAuth, publishing, thread replies and post metrics against each platform's own API. `SandboxProvider` / `createSandboxRegistry()` simulate all four offline. |
| `packages/ai` (`@harbor/ai`) | The `ContentModel` interface (learnVoice, generateIdeas, draft, rewrite, digest; every call returns `{result, usage, model, simulated}`), `SimulatedModel` (default) and an `AnthropicModel` stub. `createModel(env)` picks one. |
| `apps/api` (`@harbor/api`) | Hono API on port 4800. Raw SQL against Postgres: embedded PGlite locally, or a real Postgres/Supabase when `DATABASE_URL` is set. Migrations are in `src/db/migrations/`. Account tokens are AES-256-GCM encrypted (`HARBOR_SECRET_KEY`). A background worker in the same process publishes scheduled posts and takes growth-curve snapshots; its state lives in Postgres rows, so it works on PGlite too. |
| `apps/web` (`@harbor/web`) | Next.js (App Router) app on port 4801. Home (attention, coming up, recent results), Hub (Ideas → Drafting → Approved → Scheduled → Live as board, table or calendar), Performance (cross-brand results, per-post growth curves), brand pages (overview, Brand Memory, channels), composer, settings. Working styles only. |
| `docs/setup/platform-apps.md` | **Start here** to connect your accounts: the four developer apps, redirect URLs, tunnel. |
| `docs/decisions` | Decisions and why (e.g. 0001: publish directly, not through Postiz). |
| `docs/research` | Research: how Postiz publishes, the Jasper teardown. |

## Quickstart

Requires Node 22.12+ and pnpm 10.

```sh
pnpm install
pnpm --filter @harbor/api dev   # API on :4800 in sandbox + simulated mode: no .env, no keys, no network
pnpm dev                        # API on :4800 and web on :4801
```

```sh
curl -X POST localhost:4800/v1/brands -H 'content-type: application/json' \
  -d '{"name":"My Brand","memory":{"voice":{"summary":"Plain and specific"}}}'
open http://localhost:4801
```

Going live later: `cp .env.example .env`, set `HARBOR_PUBLISH_MODE=live`, `HARBOR_SECRET_KEY` and your app credentials (docs/setup/platform-apps.md).

See it with sample data (two demo brands with full Brand Memory, competitors, sandbox channels, six weeks of published posts with growth curves and verdicts, a weekly digest per brand, ideas and drafts) without touching your real database. The demo always runs in sandbox + simulated mode, so publishing from it works:

```sh
pnpm --filter @harbor/api dev:demo      # API on :4800 backed by apps/api/.pglite-demo
pnpm dev:web                            # web on :4801
```

Other commands:

```sh
pnpm test                               # vitest, all packages (PGlite in memory)
pnpm typecheck                          # tsc in every package
pnpm --filter @harbor/api db:migrate    # apply migrations to DATABASE_URL (or local PGlite)
```

## API (so far)

JSON is camelCase. Model routes return a `run` object `{id, model, simulated, usage: {inputTokens, outputTokens}}`.

- `GET /health`, `GET /v1/mode` → `{publish: 'sandbox'|'live', model: 'simulated'|'anthropic'}`
- Brands: `GET /v1/brands` (optional `?workspaceId=`), `POST /v1/brands`, `GET|PATCH|DELETE /v1/brands/:id`. Optional `logoUrl`: an https URL or a base64 `data:image/(png|jpeg|webp|svg+xml|gif)` URI up to 300 KB; `null` in PATCH removes it. PATCH merges `memory` at the top level: `{memory: {voice: {...}}}` replaces only `voice`. Brand Memory v2 keys: `voice` (summary, values, do, avoid, bannedWords, excerpts, sources, learnedAt, learnedBy), `audiences`, `products`, `knowledge`, `styleRules`, `examplePosts`; list items get short ids. v1 documents are migrated on read.
- Voice: `POST /v1/brands/:id/voice/learn` `{examples?: string[], fromExamplePosts?: boolean}` → `{voice, run}`. Needs ≥ 1,000 characters; returns a proposal, nothing is saved.
- Signals: `GET /v1/brands/:id/signals` (latest 100)
- Competitors: `GET|POST /v1/brands/:id/competitors` `{name, url?, handles?: [{platform, handle}], notes?}`, `PATCH|DELETE /v1/competitors/:id`
- Ideas: `GET /v1/ideas` (optional `?brandId=&status=`), `POST /v1/ideas`, `POST /v1/ideas/generate` `{brandId, count?}` → `{data: Idea[], run}` (refreshes post_performance signals first; every idea cites ≥ 1 signal), `PATCH /v1/ideas/:id` (stage moves one step at a time; Scheduled and Live come from posts), `DELETE /v1/ideas/:id`
- Drafts (Studio): `GET /v1/drafts?ideaId=&brandId=` (latest version per idea and platform; `&all=1` for every version), `POST /v1/drafts` `{brandId, ideaId?, platform, parts}` (new version), `GET /v1/drafts/:id`, `POST /v1/drafts/generate` `{ideaId, platforms}` → `{data: Draft[], run}`, `POST /v1/drafts/:id/rewrite` `{instruction: 'shorter'|'punchier'|'more_specific'|'hook_variations'}` → `{variations, run}` (not saved)
- Agent runs: `GET /v1/agent-runs?brandId=&limit=` → `{id, brandId, kind, status, model, simulated, usage, startedAt, finishedAt, error?}`
- Platforms: `GET /v1/platforms` (name, which metrics each reports)
- Channels: `GET /v1/channels` (all brands), `GET /v1/brands/:brandId/channels`, `GET /v1/channels/:platform/connect?brandId=` (browser → consent screen; in sandbox mode → `{web}/brands/:brandId/channels?sandbox=:platform`), `GET /v1/channels/:platform/callback`, `DELETE /v1/channels/:id`
- Sandbox only (404 in live mode): `POST /v1/sandbox/channels` `{brandId, platform, handle}` → Channel, `POST /v1/sandbox/advance` `{hours}` → `{hours, shiftedPosts, snapshotsTaken}`
- Posts: `GET /v1/posts` (all brands; `?brandId=&status=&from=&to=`), `POST /v1/posts` `{channelId, parts:[{text, media:[{kind,url}]}] | draftId, scheduledFor?}` (no `scheduledFor` = publish now; extra parts become thread replies; a `draftId` must match the channel's platform), `GET /v1/brands/:brandId/posts`, `GET /v1/posts/:id` (with snapshots and `baselineCurve: [{ageHours, value}]`, the brand + platform median of the post's primary metric at each schedule age with ≥ 3 comparable posts), `PATCH /v1/posts/:id` `{scheduledFor}` (reschedule; scheduled posts, or failed ones, which go back to scheduled; 409 otherwise), `DELETE /v1/posts/:id` (scheduled/failed only), `POST /v1/posts/:id/resolve` `{outcome: 'published'|'not_published'}` for posts in `unknown`
  - Every post view (lists, detail, canvas cards) has `outcome?: {verdict: 'outperformed'|'met'|'underperformed'|'inconclusive', ratio, metric: 'views'|'likes', atAgeHours, baseline, actual, comparablePosts}`: the post at its latest snapshot age against the brand's median for the same platform at the same age (each other post's snapshot nearest that age, within ±25%; posts published before it or in the last 90 days). Views, or likes where there are no views. ≥ 1.3× outperformed, 0.7–1.3× met, < 0.7× underperformed; inconclusive with fewer than 3 comparable posts. Re-evaluated after every snapshot.

- Insights:
  - `POST /v1/brands/:id/outcomes` → `{data: [{postId, ...outcome}]}` re-evaluates every published post now.
  - `GET /v1/brands/:id/best-times?platform=` → `{platform?, slots: [{weekday (0 = Sunday), hour, score 0..1, basis: 'history'|'prior', posts}] (7×24, server local time), top: [{weekday, hour, score}] (best 5)}`. History is each post's 24h primary metric against its platform median, smoothed across neighbouring hours; it is blended with a per-platform prior (X and LinkedIn weekday mornings, Instagram evenings, Threads mid-day) by how much history each slot has.
  - `POST /v1/brands/:id/digest` `{days?: 7}` → 201 with the digest and its `run`; `GET /v1/brands/:id/digest` → the latest (404 until there is one). Digest: `{brandId, period: {from, to}, generatedAt, model, simulated, headline, stats: {posts, published, medianViews24h?, change? (ratio vs the previous period)}, wins, misses, patterns, recommendations}`, each finding `{title, detail, posts, signalIds, confidence}`. Refreshes outcomes and post_performance signals first (so citations resolve), stores one insight per finding that cites a signal, and records an `insights` agent run. The simulated model compares posts by format (thread, media), length, hook (number, question, "I"), publish hour band and platform, explains the top post, and turns the strongest patterns plus best slots into recommendations.
  - `GET /v1/insights/overview` (optional `?workspaceId=`) → `{brands: [{brandId, brandName, posts7d, published7d, medianViews24h?, change?, outperformed, underperformed, topPost?: {id, text, platform, views?, url?}, digestHeadline?}]}`

- Campaigns (a canvas per brand): `GET /v1/campaigns?brandId=` (newest first), `POST /v1/campaigns` `{brandId, name, goal?, status?, startsOn?, endsOn?}` (dates `YYYY-MM-DD`; creates the frames Ideas, Drafts and Published), `GET|PATCH|DELETE /v1/campaigns/:id` → `{id, brandId, brandName, name, goal, status: 'planning'|'active'|'done', startsOn?, endsOn?, itemCount (cards, frames excluded), …}`. Deleting a campaign keeps its ideas and posts.
- Canvas: `GET /v1/campaigns/:id/canvas` → `{campaign, items, edges}` (frames first). Items `{id, campaignId, kind: 'idea'|'draft'|'post'|'signal'|'note'|'frame', refId?, parentId?, x, y, width?, height?, data: {title?, text?, color?}, entity?}`; x/y are relative to the parent frame; `entity` is the idea/draft/post (as in the list endpoints) or signal `{id, kind, summary, observedAt}` behind a card, absent when it was deleted.
  - `POST /v1/campaigns/:id/items` (ref kinds need a refId of the campaign's brand, an existing card comes back with 200; an idea card with `data.title` and no refId creates the idea; notes need `data.text`, frames `data.title`), `PATCH /v1/canvas-items/:id` (`data` merges, null removes a key; `parentId` must be a frame), `PUT /v1/campaigns/:id/positions` `{items: [{id, x, y, parentId?, width?, height?}]}` → 204, `DELETE /v1/canvas-items/:id` (the card only; a frame's cards keep their place on screen)
  - `POST /v1/campaigns/:id/edges` `{source, target, label?}` (duplicate → 200 with the existing edge), `DELETE /v1/canvas-edges/:id`
  - `POST /v1/campaigns/:id/agent` → `{items, edges, run?}` with new cards already placed: `{action: 'suggest_ideas', count?, frameId?}`, `{action: 'draft', ideaItemId, platforms}` (post/signal/note cards connected to the idea are passed to the model as context), `{action: 'add_top_posts', count?, frameId?}`, `{action: 'add_signals', count?}`
  - Ideas and posts carry `campaignId`: `GET /v1/ideas?campaignId=`, `GET /v1/posts?campaignId=`; `POST /v1/ideas` and `POST /v1/posts` accept `campaignId` (posts default to their idea's campaign).

Errors look like `{ "error": { "code", "message", "request_id" } }`.

## Publishing rule

A publish whose outcome is unknown, for example after a timeout or a 5xx, is **never retried automatically**. Such a post is marked `unknown` and waits for a human to check it. The only failures that are retried are the ones that prove nothing was posted: rate limits and expired tokens. See `classifyPublishFailure` in `packages/core/src/publishing.ts`.

## License

[AGPL-3.0](LICENSE).
