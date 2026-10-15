# Harbor

Harbor is an open-source content strategist for builders who run several brands.

- **Brand Memory**: each brand has its own voice, offer, audience, competitors and example posts.
- **Performance snapshots**: Harbor polls every published post at 1h, 6h, 24h, 72h and 7d, so it sees each post's growth curve and not only the final total. Raw platform payloads are stored next to normalized metrics.
- **Insights and ideas**: snapshots and competitor activity become signals. Insights and ideas cite the signals they are based on.
- **Drafting**: drafts are written in each brand's voice, for each platform's limits.
- **Publishing**: Harbor publishes to X, LinkedIn, Instagram and Threads through one provider interface.

Status: early. You can create brands, connect your own X, LinkedIn, Instagram and Threads accounts, publish or schedule posts (including threads), and watch each post's metrics fill in over its first week. Insights, ideas and drafting come next.

## Repo map

| Path | What it is |
| --- | --- |
| `packages/core` (`@harbor/core`) | Domain types and zod schemas (Workspace, Brand, Channel, Competitor, Idea, Draft, Post, Snapshot, Signal, Insight, Outcome, AgentRun), normalized metric keys with per-platform availability, typed errors, and the `PlatformProvider` publishing interface with its failure policy. |
| `packages/providers` (`@harbor/providers`) | One adapter per platform (x, linkedin, instagram, threads) plus a registry: OAuth, publishing, thread replies and post metrics against each platform's own API. |
| `apps/api` (`@harbor/api`) | Hono API on port 4800. Raw SQL against Postgres: embedded PGlite locally, or a real Postgres/Supabase when `DATABASE_URL` is set. Migrations are in `src/db/migrations/`. Account tokens are AES-256-GCM encrypted (`HARBOR_SECRET_KEY`). A background worker in the same process publishes scheduled posts and takes growth-curve snapshots; its state lives in Postgres rows, so it works on PGlite too. |
| `apps/web` (`@harbor/web`) | Next.js (App Router) app on port 4801: brands, connecting channels, a composer, and a posts table with status and latest metrics. Working styles only. |
| `docs/setup/platform-apps.md` | **Start here** to connect your accounts: the four developer apps, redirect URLs, tunnel. |
| `docs/decisions` | Decisions and why (e.g. 0001: publish directly, not through Postiz). |
| `docs/research` | Research: how Postiz publishes, the Jasper teardown. |

## Quickstart

Requires Node 22.12+ and pnpm 10.

```sh
pnpm install
cp .env.example .env        # then set HARBOR_SECRET_KEY and your app credentials (docs/setup/platform-apps.md)
pnpm dev                    # API on :4800, web on :4801
```

```sh
curl -X POST localhost:4800/v1/brands -H 'content-type: application/json' \
  -d '{"name":"My Brand","memory":{"voice":{"description":"Plain and specific"}}}'
open http://localhost:4801
```

Other commands:

```sh
pnpm test                               # vitest, all packages (PGlite in memory)
pnpm typecheck                          # tsc in every package
pnpm --filter @harbor/api db:migrate    # apply migrations to DATABASE_URL (or local PGlite)
```

## API (so far)

- `GET /health`
- Brands: `GET /v1/brands` (optional `?workspaceId=`), `POST /v1/brands`, `GET|PATCH|DELETE /v1/brands/:id`
- Platforms: `GET /v1/platforms` (name, which metrics each reports)
- Channels: `GET /v1/brands/:brandId/channels`, `GET /v1/channels/:platform/connect?brandId=` (browser → consent screen), `GET /v1/channels/:platform/callback`, `DELETE /v1/channels/:id`
- Posts: `POST /v1/posts` `{channelId, parts:[{text, media:[{kind,url}]}], scheduledFor?}` (no `scheduledFor` = publish now; extra parts become thread replies), `GET /v1/brands/:brandId/posts`, `GET /v1/posts/:id` (with snapshots), `DELETE /v1/posts/:id` (scheduled/failed only), `POST /v1/posts/:id/resolve` `{outcome: 'published'|'not_published'}` for posts in `unknown`

Errors look like `{ "error": { "code", "message", "request_id" } }`.

## Publishing rule

A publish whose outcome is unknown, for example after a timeout or a 5xx, is **never retried automatically**. Such a post is marked `unknown` and waits for a human to check it. The only failures that are retried are the ones that prove nothing was posted: rate limits and expired tokens. See `classifyPublishFailure` in `packages/core/src/publishing.ts`.

## License

[AGPL-3.0](LICENSE).
