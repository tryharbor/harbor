---
title: Open-source social media schedulers compared (2026)
date: 2026-10-17
description: Postiz, Mixpost, BrightBean Studio, TryPost, Shoutrrr and Harbor, compared on license, what it takes to self-host, platforms, approvals and hosted pricing. Plus the ones that are no longer maintained.
author: Derek
tags: [open source, self-hosting, comparison]
---

**The actively maintained open-source social media schedulers in 2026 are Postiz, Mixpost, BrightBean Studio, TryPost, Shoutrrr and Harbor.**

- **Postiz** if you need the most platforms (34).
- **TryPost** or **Mixpost** if you live in PHP and Laravel. Most of Mixpost is paid; only its Lite edition is open source.
- **BrightBean Studio** for a free hosted version with real approval workflows, as long as you don't need X.
- **Shoutrrr** for the lightest self-host.
- **Harbor** if you run several brands on X, LinkedIn, Instagram and Threads and want each post measured against that brand's own results.

A disclosure: I build Harbor, so weigh my take on it accordingly. Everything below comes from each project's own repository, docs and pricing page, checked on October 17, 2026. Star counts are a snapshot from that day.

## At a glance

| | License | What you run to self-host | Platforms | Hosted plan | Activity |
|---|---|---|---|---|---|
| **Postiz** | AGPL-3.0, no feature gates | Next.js and NestJS, Postgres, Redis, Temporal | 34 | From $29/mo (5 channels) | ~37.3k stars, release Oct 11, 2026 |
| **Mixpost** | MIT for Lite; Pro is commercial | PHP and Laravel, MySQL, Redis | Lite: 3. Pro: 12 | From $29/mo | ~3.8k stars, Lite release Mar 2026 |
| **BrightBean Studio** | AGPL-3.0, no paid tier | Python and Django, Postgres (or SQLite) | 11, no X | Free | ~2.5k stars, started Mar 2026 |
| **TryPost** | AGPL-3.0, no locked features | PHP and Laravel, Postgres or MySQL, Redis | 13 | From $19/mo | ~710 stars, release Oct 10, 2026 |
| **Shoutrrr** | Apache-2.0 | One Docker image, SQLite by default | 7 | $10/mo, incl. $5 of X API usage | ~440 stars, release Oct 13, 2026 |
| **Harbor** | AGPL-3.0, every feature self-hosted | Node.js and pnpm, Postgres (or embedded PGlite) | 4 | Not open yet | New in 2026 |

## What happens before and after you post

Most comparisons stop at "which platforms". The bigger differences are in who can post, and what you learn afterwards.

| | Approvals | AI | MCP | What it measures |
|---|---|---|---|---|
| **Postiz** | Preview links for comments; nothing blocks publishing | Copilot, image and video generation (bring your own keys when self-hosting) | Yes | Per-post stats on 12 platforms, account analytics on about 10 |
| **Mixpost** | In Pro | AI assistant in Pro | Pro and Cloud | Basic in Lite, more in Pro |
| **BrightBean Studio** | Configurable stages, client portal, audit trail | None built in; designed for external agents | Yes | Posts and channels over 7, 30 and 90 days |
| **TryPost** | Members submit, admins approve | AI assistant, many providers including Ollama | Yes, 80+ tools | Insights against the previous period |
| **Shoutrrr** | None documented | None | Yes, 22 tools; publish and delete need confirmation | Followers and per-post engagement |
| **Harbor** | Required: agents and MCP clients can only propose | Plans and drafts with a built-in offline model today; a hosted model is on the roadmap | Yes, 23 tools, proposals only | Each post at 1h, 6h, 24h, 3d and 7d against that brand's median |

## Postiz

The biggest project here by a distance, and the one most people mean by "open-source Buffer alternative". It covers 34 platforms, including TikTok, YouTube, Facebook, Pinterest, Reddit, Bluesky and Mastodon. Self-hosted Postiz has the same features as Postiz Cloud.

- **Good for:** going wide on platforms, AI image and video, a big community, a hosted plan you can buy today.
- **Watch out for:** it's heavy to run. Since v2.12 it needs Temporal, and the official Docker Compose file starts nine services. The docs suggest 4 vCPUs and 8 GB of RAM. Approval is a shared preview link for comments; its docs say there's no approved flag that blocks publishing.

[Harbor vs Postiz in detail](/compare/postiz)

## Mixpost

A polished Laravel app, but open-core. The MIT-licensed Lite edition publishes to Facebook Pages, X and Mastodon only. Instagram, LinkedIn, TikTok, approvals, the AI assistant and the API are in Pro ($299 one-time, internal use) or Enterprise ($1,199 one-time, needed to resell).

- **Good for:** PHP shops that will pay for Pro, or want to embed it in an existing Laravel app.
- **Watch out for:** Lite moves slowly (last release March 2026) and only takes feature changes that don't overlap with Pro.

## BrightBean Studio

The newcomer to watch: started in March 2026, no paid tier, and a free hosted version. It has the most complete approval workflow here, with stages, threaded comments, an audit trail and a client portal. There's a unified inbox and an MCP server.

- **Good for:** agencies that need client approvals, and anyone who wants a free hosted tool.
- **Watch out for:** no X support yet (it's an open request). With local storage, media files are served without authentication, so platforms can fetch them.

## TryPost

A newer Laravel project (January 2026), very active, with no locked features and 13 platforms including X, Instagram, TikTok and LinkedIn. Its MCP server is the largest here, with 80+ tools.

- **Good for:** a full-featured, all-open Laravel stack with a cheap hosted plan.
- **Watch out for:** it's young and leans on one main maintainer. AI is in the web app only, not in the API or MCP.

## Shoutrrr

The simplest self-host on the list: one Docker image running the app, worker and scheduler on SQLite. It's published under the coollabsio GitHub organization. It covers X, Bluesky, LinkedIn, Discord and, per its README, Facebook Pages, Instagram and Threads.

- **Good for:** a lightweight, single-container scheduler, especially for X, where the hosted plan includes some X API usage.
- **Watch out for:** no approvals or AI writing, and the homepage and README list different platforms.

## Harbor

What I build: an open-source content strategist for people who run more than one brand. Each brand gets its own memory (voice, audiences, products) and its own baseline. Every post is measured at five checkpoints against that brand's median at the same age, and the weekly plan comes from what actually worked. Agents and MCP clients can propose posts, but a person approves every one.

- **Good for:** several brands on X, LinkedIn, Instagram and Threads, where you want to know which posts worked and plan from that.
- **Watch out for:** four platforms only. No hosted plan yet. No AI image or video. Drafting uses a built-in offline model for now.

[Harbor vs Buffer](/compare/buffer) · [Self-hosting Harbor](/use-cases/self-hosted-social-media-scheduler)

## Also worth knowing

- **CogSend** (MIT, September 2026) runs on Cloudflare Workers with a single admin, and covers X, LinkedIn, Threads, Bluesky and Mastodon. It's very new.
- **Socioboard** is effectively unmaintained: its last release was in 2019, and 2026 activity is only automated dependency updates.
- **Shoutify** and **Bulkit.dev** are archived, though both still appear in older roundups.
- **Typefully** and **Buffer** aren't open source.

## Which should you pick?

- **Most platforms:** Postiz.
- **Client approvals, free hosting, no X needed:** BrightBean Studio.
- **Laravel, everything open:** TryPost.
- **Smallest footprint:** Shoutrrr.
- **Several brands, measured and planned from results:** Harbor.

Whichever you pick, self-hosting means registering your own developer app on each platform. Meta's review can take weeks, and [X charges per call](/blog/x-api-pricing-what-a-post-costs). Budget for both.

## FAQ

### What is the best open-source social media scheduler?

It depends on what you need. Postiz supports the most platforms (34). BrightBean Studio has the strongest approval workflow and free hosting, but no X. TryPost is a fully open Laravel option. Shoutrrr is the easiest to self-host. Harbor is built for several brands measured against their own results.

### Is there an open-source alternative to Buffer?

Yes. Postiz is the most established. TryPost, BrightBean Studio, Shoutrrr and Harbor are newer, fully open options, and Mixpost has an MIT-licensed Lite edition.

### Which open-source schedulers support X (Twitter)?

Postiz, Mixpost (Lite and Pro), TryPost, Shoutrrr, CogSend and Harbor. BrightBean Studio doesn't support X yet.

### Which is the easiest to self-host?

Shoutrrr: one Docker image with SQLite by default. CogSend deploys to Cloudflare Workers. Postiz is the heaviest, with Postgres, Redis and Temporal.

### Is Mixpost open source?

Partly. Mixpost Lite is MIT-licensed and covers Facebook Pages, X and Mastodon. Mixpost Pro and Enterprise are commercial licenses that add the other platforms, approvals, AI and the API.

### Do I need my own developer apps to self-host?

Yes, for every tool here. You register an app on each platform you post to. Hosted plans, like Postiz Cloud, use the provider's own approved apps instead.

### Is Socioboard still maintained?

Not actively. Its last release was version 4.1.0 in November 2019, and recent activity is automated dependency updates.

## Sources

- Postiz: [repository](https://github.com/gitroomhq/postiz-app), [system requirements](https://docs.postiz.com/self-host/installation/system-requirements.md), [approvals](https://docs.postiz.com/general/approvals.md), [pricing](https://postiz.com/pricing)
- Mixpost: [repository](https://github.com/inovector/mixpost), [pricing](https://mixpost.app/pricing), [Cloud](https://mixpost.app/cloud)
- BrightBean Studio: [repository](https://github.com/brightbeanxyz/brightbean-studio), [site](https://brightbean.xyz/studio/), [X support request](https://github.com/brightbeanxyz/brightbean-studio/issues/19)
- TryPost: [repository](https://github.com/trypostit/trypost), [self-hosting requirements](https://docs.trypost.it/self-hosting/requirements.md), [plans](https://docs.trypost.it/knowledge-base/settings/plans-and-billing.md)
- Shoutrrr: [repository](https://github.com/coollabsio/shoutrrr), [site](https://shoutrrr.com/)
- CogSend: [repository](https://github.com/cogsend/cogsend)
- Socioboard: [repository](https://github.com/Socioboard-developers/Socioboard-5.0)
- Harbor: [repository](https://github.com/tryharbor/harbor)
