# 0004: Develop builds websites and full apps, on any major model

Date: 2026-11-16. Status: accepted (owner's answers to the open questions below).

## Decision

Harbor's Develop pillar ("Build" in the sidebar) makes the thing a business runs on. It starts from Business Memory, so
whatever it builds already knows the offer, the customers, the pricing and the brand. The owner picks one of two modes:

| Mode | What you get | Use it when |
|---|---|---|
| **Website** | A finished, hosted site in minutes: pages, booking or contact forms, payments, SEO. Pick from three design directions, edit by asking. No code. | You sell a service or a few products and need to be found, booked and paid. A landscaper, a coach, a coffee roaster. |
| **Full app** | Real software an agent writes and runs: accounts, a database, your own features, a live preview, and the code is yours. | The product *is* software, or you need something no website builder does: a client portal, a marketplace, a tool, a SaaS. |

The page says it in one line each: *"Website: get online and get booked. Full app: build the product itself."*

### Models: the owner chooses

Harbor supports **Anthropic (Claude), OpenAI and Google (Gemini)**. The workspace picks a default model; each project (and
each content feature) can override it. Harbor ships a recommended pick per job and shows what each choice costs.

- One provider layer in `packages/ai`: the existing `ContentModel` interface grows provider adapters (`anthropic`, `openai`,
  `google`), each using that provider's official SDK. Content features (drafts, the Assistant, ideas) go through it too, so
  model choice isn't a Develop-only setting.
- Tool calling, streaming and usage are normalized at the adapter, so the agent loop and the cost meter don't care which
  provider ran.
- Owners can bring their own provider key, or use Harbor's (billed through their plan).

### Website mode

- Generated, not coded: page structure and copy from Business Memory (the chosen model writes the copy), styled from
  Branding, rendered by Harbor's own site templates. Three directions to pick from, like the post designs.
- Hosted by Harbor on a subdomain or the owner's domain. Forms feed a customer list; payments go through Stripe and show in
  Money. Edits are "ask for a change" plus direct text editing.
- Cheap: a handful of model calls per site, no sandbox.

### Full app mode

- **Harbor's own agent loop** (provider-agnostic) with a small, fixed toolset: read, write and edit files, run commands,
  search, and "show preview".
- **A sandbox per project** that Harbor controls, behind a `Sandbox` interface (create, exec, files, expose a port, snapshot,
  destroy) so the provider can change. Because Harbor controls it, the dev server is exposed for an **instant live preview**.
  Candidates to evaluate: a hosted sandbox service, or containers Harbor runs itself. Egress is deny-by-default with package
  registries allowed.
- **Code lives in Git** (one repository per project); history is the undo button, and the owner can export the code.
- **One opinionated starter per app type** (first: a web app with sign-in, a database and Stripe), so non-technical requests
  land on a stack that works.
- **Every build has a hard cost cap**, priced per provider at list rates; the run pauses at the cap. Plans include a
  monthly build allowance.
- **Agents propose, people ship** (0003): the agent works on a branch; the owner reviews the preview and merges with one
  click. Production deploys only from what they merged.

## Why

- **Two different jobs.** Most of Durable's audience needs a site, not software, and a generated site is fast, cheap and
  reliable. Product builders need real code. One "Build" that makes them choose up front, with a plain explanation, serves
  both without forcing either into the other's tool.
- **Model choice is a selling point and a hedge.** Owners already have preferences and keys; prices and quality move
  monthly; no single provider is best at every job. Supporting the big three keeps Harbor from being tied to one vendor's
  roadmap and pricing.
- **Multi-model rules out a single vendor's hosted agent.** Anthropic's Managed Agents (hosted loop and sandbox) runs Claude
  only. Building Harbor's own loop and sandbox costs more up front, but it's the only way to offer the same builder on every
  model, and it buys the instant live preview a hosted sandbox can't expose.
- **Business Memory is the advantage either way.** Lovable, Bolt and Durable start from a blank prompt. Harbor starts from
  the business.

## Phases

1. **Provider layer and Website mode, no build spend.** Multi-provider `ContentModel` (with the simulated model kept for
   tests and demos); a model picker in settings; Website mode end to end (generate, pick a direction, edit, publish on a
   Harbor subdomain).
2. **Full app plumbing.** The `Sandbox` interface with a local Docker implementation for development; the agent loop tested
   against a fake model; projects, Git history, the preview pane.
3. **First real builds.** A hosted sandbox provider, real models on with small per-build caps, the first starter, review and
   merge, export.
4. **Close the loop.** "Shipped" events → Assistant ideas; Stripe products → Money; Business Memory → the app's copy and theme.

## Owner's answers (2026-11-16)

1. **Spend: $5 cap per Full app build** while testing, and **keep builds basic at first**: small, well-scoped apps on the
   starter, not whole platforms in one go.
2. **Keys: both.** Harbor's provider keys by default, billed through plans; owners can plug in their own key.
3. **Hosting: Harbor-managed.** Harbor holds the repositories and hosting; owners never see GitHub and can export their
   code at any time.
4. **First starter: a web app with sign-in, a database and Stripe payments.**

5. **Sandbox: Vercel Sandbox** (chosen 2026-11-16 over E2B, Daytona, Modal and Cloudflare). Firecracker microVMs (a
   dedicated kernel per sandbox, the right isolation for AI-written code); billed for active CPU, so a dev server sitting
   idle for a preview costs little; a public URL per declared port (`sandbox.domain(port)`) for the live preview;
   deny-by-default network rules that can change at runtime; files persist across stops (running processes don't, so
   the dev server restarts on resume). Runner-up: E2B, for its pause/resume of memory and processes, at wall-clock
   billing and a $150/mo plan for sessions over an hour. Docker stays the local option; nothing requires it.

**Still open: what people will want to build.** Before adding more starters, research which basic apps new owners would
pay for. Early candidates from the owner: dropshipping stores, SEO/GEO tools, and similar simple platforms. Each becomes a
starter only once we know it sells.

## Consequences

- `packages/ai` gains the OpenAI and Google SDKs next to Anthropic's; `HARBOR_MODEL` becomes a provider-and-model setting.
- "Build" joins the sidebar as one item, with Websites and Apps under it.
- Harbor now runs sandboxes (or pays a provider for them): a new security surface (isolation, egress, secrets) to design
  before any real build runs.
