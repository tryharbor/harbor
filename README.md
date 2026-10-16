<p>
  <img src="docs/design/brand/harbor-mark.svg" width="40" alt="Harbor" />
</p>

# Harbor

**The open-source content strategist for builders who run more than one brand.**

Harbor remembers how each of your brands sounds, plans the week from what actually worked, drafts it for every platform and waits for your OK. It publishes directly to X, LinkedIn, Instagram and Threads, measures every post against your own median, and learns from the results.

[useharbor.io](https://useharbor.io) · [Self-host guide](https://useharbor.io/open-source) · [Developers and MCP](https://useharbor.io/developers) · [Blog](https://useharbor.io/blog)

## What it does

- **Brand Memory.** One memory per brand: voice, audiences, products, knowledge and style rules. Learn a voice by picking sample posts or tuning dials. Then the voice refresh proposes new rules from what beat your median, each linked to the posts that prove it.
- **Agents and Approvals.** The weekly plan reads last week's results, finds open best-time slots, suggests ideas and drafts them. Other agents repurpose winners, check drafts against the voice, write the digest and refresh the voice. Automations run them on a schedule, or when a post outperforms. **Agents never publish.** Everything they make waits in Approvals.
- **Studio and Canvas.** Draft one idea for every platform in its native shape, rewrite it, keep versions. Each campaign gets a canvas of ideas, drafts, posts and signals, where connected cards become context for the drafts.
- **Publishing.** Direct to each platform through your own developer apps. It handles threads and carousels, schedules into each brand's best times and has a media library with focal-point crops per platform. A post whose outcome is unknown is never retried automatically, so nothing goes out twice.
- **Insights.** Every post's growth curve is measured at 1h, 6h, 24h, 3 days and 7 days against the brand's median at the same age. Insights give each post a verdict, write a weekly digest that cites its posts, map best times on a 7×24 heatmap and group replies into themes.
- **MCP server.** Claude, or any MCP client, can read Brand Memory, check best times, draft and propose posts using an API key. Proposals land in Approvals.

## Try it in two minutes: no keys, no spend

Requires Node 22.12+ and pnpm 10.

```sh
git clone https://github.com/tryharbor/harbor && cd harbor
pnpm install
pnpm dev            # API on :4800, app on :4801
```

By default Harbor runs in **sandbox** publishing mode with the **simulated** model. Every platform is simulated with its real limits, growth curves are synthetic and deterministic, and nothing leaves your machine.

To see it full of sample data (two demo brands with six weeks of posts, digests, agents, approvals and media):

```sh
pnpm --filter @harbor/api dev:demo   # API backed by apps/api/.pglite-demo
pnpm dev:web
```

## Going live

1. `cp .env.example .env`
2. Set `HARBOR_SECRET_KEY` (`openssl rand -base64 32`). Harbor encrypts every account token with it, using AES-256-GCM.
3. Create your platform developer apps and set a stable HTTPS `HARBOR_API_URL` (a tunnel while developing): **[docs/setup/platform-apps.md](docs/setup/platform-apps.md)**.
4. Run `pnpm --filter @harbor/api dev:live` (live publishing with the simulated model, on its own database) together with `pnpm dev:web`.

Use Postgres anywhere by setting `DATABASE_URL`. Without it, Harbor uses an embedded PGlite database.

| Env | Default | |
| --- | --- | --- |
| `HARBOR_PUBLISH_MODE` | `sandbox` | `live` publishes through the real platform APIs |
| `HARBOR_MODEL` | `simulated` | a deterministic offline model; `anthropic` (the real model) is switched off during the build-out |
| `HARBOR_X_READ_REPLIES` | off | X bills every read, so reading X replies and importing past X posts is opt-in |

## Repo map

| Path | What it is |
| --- | --- |
| `apps/web` | The Harbor app (Next.js): Home, Hub, Approvals, Campaigns, Studio, Agents, Media, Performance, Insights, brands, settings |
| `apps/api` | The API (Hono) plus the background worker: publishing, snapshots, agents, automations, MCP. Raw SQL on Postgres or PGlite |
| `apps/site` | useharbor.io, the marketing site |
| `packages/core` | Domain types and schemas, Brand Memory, platform metric and media rules, the publishing interface |
| `packages/providers` | X, LinkedIn, Instagram and Threads adapters, plus a sandbox that simulates all four |
| `packages/ai` | The content model interface, the simulated model and the Anthropic stub |
| `docs/` | [API reference](docs/api.md), design contracts, [decisions](docs/decisions), [setup](docs/setup/platform-apps.md) |

```sh
pnpm test        # every package (PGlite in memory, no network)
pnpm typecheck
```

## Principles

- **Agents propose, people publish** ([0003](docs/decisions/0003-agents-propose-people-publish.md)).
- **Publish directly**, through your own developer apps ([0001](docs/decisions/0001-direct-publishing.md)).
- **Never auto-retry an unknown outcome.** Only failures that prove nothing was posted are retried (`classifyPublishFailure` in `packages/core/src/publishing.ts`).
- **Free to self-host**, with Harbor Cloud priced per brand ([0002](docs/decisions/0002-pricing-shape.md)).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately: [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE). Use it, change it and run it for anything. If you host a modified Harbor for other people, share your changes with them.
