---
title: "Social media schedulers with an API or MCP server (2026)"
date: 2026-10-30
description: Which schedulers you can drive from Claude, ChatGPT, Cursor or a script, which plan you need, and whether the assistant can publish without a person checking first. 22 tools, checked October 23, 2026.
author: Derek
tags: [comparison, mcp, api, ai]
---

**If you want to plan and post from an AI assistant, the cheapest official options are Buffer, Typefully and Metricool, whose MCP servers work on their free plans.** Postiz, TryPost, Shoutrrr and BrightBean Studio are open source and free to self-host. Most of these let the assistant publish directly, so the bigger question is who checks a post before it goes out:

- **Most tools rely on your AI app's approval prompt.** If you click "always allow", the assistant can post on its own.
- **Shoutrrr** refuses to publish, retry or delete over MCP unless the call includes an explicit `confirm=true`.
- **Agorapulse** can't publish over MCP at all; it creates drafts.
- **Harbor** (which I build) has no publish tool; the assistant can only propose a post that a person approves.

Everything below comes from each tool's own docs, pricing pages and GitHub, checked on October 23, 2026. Prices are in US dollars. A disclosure: I build Harbor, so weigh my take on it accordingly.

## API vs MCP, in one paragraph

An **API** is for code you write: a script, a cron job, an automation. An **MCP server** (Model Context Protocol) is for AI assistants: you connect it once in Claude, ChatGPT, Cursor or similar, and the assistant can read your accounts and create posts when you ask. Some tools have both, some only one.

## Hosted tools

| Tool | Public API | MCP server | Can the assistant publish? | Cheapest plan with it |
|---|---|---|---|---|
| **Buffer** | Yes, GraphQL, all plans | Official, hosted | Yes: now, scheduled or draft | Free |
| **Typefully** | Yes, REST | Official, hosted | Drafts and scheduling | Free (10 posts a month) |
| **Metricool** | Yes, REST, Advanced and up | Official, hosted | Creates and schedules posts, sends for review | MCP: Free. API: from $53/mo billed annually |
| **Publer** | Yes, REST | Official, hosted | Drafts and scheduling | Business, $8 per account/mo billed yearly |
| **Ordinal** | Yes, REST | Official, hosted | Can set a post to Scheduled | Pro, $235/mo billed annually |
| **Hootsuite** | Yes, REST (developer account needed) | Official, hosted (Perch for publishing) | Yes, through your Hootsuite approval rules | Not stated; plans start at $99 per user/mo |
| **Ayrshare** | Yes, REST, all plans | Official, hosted, API key only | Yes | Premium, $149/mo |
| **Agorapulse** | Not stated | Official, hosted (beta) | No, drafts only | All plans except Legacy |
| **Vista Social** | Not stated | Official, hosted | Scheduling | All paid plans |
| **SocialPilot** | Not stated | Official | Yes | Not stated |
| **SocialBu** | Not stated | Official, hosted | Scheduling | Not stated |
| **Zernio** (formerly Late) | Yes, REST | Official, hosted | Yes | First 2 accounts free |
| **Sprout Social** | Yes, REST; publishing creates drafts only | No official server | n/a | Advanced, $399 per seat/mo billed annually |
| **Later** | None found | None found | n/a | n/a |
| **SocialBee** | No (on its roadmap) | No official server | n/a | n/a |
| **Hypefury** | None documented | Community server only | n/a | n/a |

A few details that matter more than the table suggests:

- **Buffer's** MCP server gets the same access as your account. Its docs tell you to leave your AI app's approval prompts on.
- **Typefully's** pricing page lists agents, the API and MCP on its free plan.
- **Metricool's** MCP works on every plan, but plan limits still apply, such as 20 scheduled posts a month on Free. Its two MCP help pages disagree on whether comments and direct publishing are included.
- **Hootsuite** doesn't say which plans include its API or MCP. Its MCP follows the approval steps your team already uses.
- **Ayrshare's** action server accepts only an API key, so it works with Claude Code, Cursor and VS Code but not as a Claude.ai connector. Its ads tools spend real money.

## Open-source tools you can self-host

| Tool | License | API | MCP | Can the assistant publish? | Hosted plan with API and MCP |
|---|---|---|---|---|---|
| **Postiz** | AGPL-3.0 | Yes | Hosted or self-hosted | Yes: now or scheduled | $23/mo billed annually |
| **TryPost** | AGPL-3.0 | Yes | Hosted or self-hosted, 81 tools | Yes, unless the member needs approval | $19/mo |
| **Shoutrrr** | Apache-2.0 | Yes | Built into every instance | Yes, but only with `confirm=true` | $10/mo |
| **BrightBean Studio** | AGPL-3.0 | Yes | Built in | Scheduling | Free hosted version |
| **Mixpost** | Lite is MIT; Pro is source-available | Pro and Cloud | Pro and Cloud | Scheduling and queue | $299 one-time (Pro) or $49/mo (Cloud) |
| **Harbor** | AGPL-3.0 | Yes, local only | Self-hosted, 23 tools | No: proposes for approval | Cloud not open yet |

Self-hosting any of these means registering your own developer app on each platform you post to. I compared these tools in more depth in [open-source social media schedulers](/blog/open-source-social-media-schedulers-2026).

## The question to ask before you connect one

Connecting a scheduler's MCP server gives an AI assistant the ability to post as your brand. Before you do, check three things:

1. **Can it publish immediately, or only draft and schedule?** Drafts are safe to experiment with. Immediate publishing is not.
2. **What stops a wrong post?** Your AI app's approval prompt, a server-side confirmation, your tool's approval workflow, or nothing.
3. **How much does the key reach?** Some keys cover your whole account and every brand in it. Prefer tools that let you limit a key to one workspace or brand.

| What stops a wrong post | Tools |
|---|---|
| The server refuses to publish without explicit confirmation | Shoutrrr |
| The assistant can only draft or propose | Agorapulse, Harbor |
| Your team's approval workflow applies | Hootsuite, TryPost (members who need approval) |
| Your AI app's tool-approval prompt | Most others |

The approval prompt in your AI app is a real safeguard as long as you leave it on. The trouble is that "always allow" is one click away.

## Which should you pick?

- **Free, hosted, and posting from Claude today:** Buffer or Typefully.
- **Analytics-heavy, several brands, on a budget:** Metricool, with MCP on its free plan.
- **Agency workflows with approvals:** Ordinal or Hootsuite, at a much higher price.
- **Developer building posting into a product:** Ayrshare, or the Postiz API.
- **Self-hosted, with a hard stop before publishing:** Shoutrrr or Harbor.

## FAQ

### What is an MCP server for social media?

It's a connector that lets an AI assistant like Claude or ChatGPT use your social media tool: read your accounts and posts, draft, schedule and, on many tools, publish. You add it once in your AI app's connector settings and then ask in plain language.

### Which social media schedulers have an MCP server?

As of October 2026, official ones include Buffer, Typefully, Metricool, Publer, Ordinal, Hootsuite, Ayrshare, Agorapulse, Vista Social, SocialPilot, SocialBu and Zernio, plus the open-source Postiz, TryPost, Shoutrrr, BrightBean Studio, Mixpost and Harbor.

### Can I use an MCP server for free?

Yes. Buffer, Typefully and Metricool include their MCP servers on free plans, with each plan's limits. Postiz, TryPost, Shoutrrr, BrightBean Studio and Harbor are free if you host them yourself.

### Is it safe to let an AI assistant post for me?

It can be, if a person checks each post first. Keep your AI app's approval prompt on, prefer tools that draft or schedule rather than publish immediately, and limit the key to the accounts it needs.

### Does Later have an API?

Not that I could find. Later doesn't document a public API for scheduling, and it doesn't offer an MCP server.

### Does Sprout Social have an MCP server?

Not an official one. Sprout Social has a REST API on its Advanced plan, which can create draft posts but not publish them, and there are community-built MCP servers.

## Sources

- Buffer: [developer docs](https://developers.buffer.com/), [MCP guide](https://developers.buffer.com/guides/integrations/mcp.html), [API limits](https://developers.buffer.com/guides/api-limits.html), [pricing](https://buffer.com/pricing)
- Typefully: [API docs](https://typefully.com/docs/api), [MCP server](https://support.typefully.com/en/articles/13128440-typefully-mcp-server), [pricing](https://typefully.com/pricing)
- Metricool: [MCP limits and plans](https://help.metricool.com/mcp-limits-and-plan-requirements-h72jg), [connecting the MCP](https://help.metricool.com/how-to-connect-metricools-mcp-eqp9h), [plans and API](https://help.metricool.com/plans-add-ons-and-api-access-explained-xux1u), [pricing](https://metricool.com/pricing/)
- Publer: [MCP](https://publer.com/help/en/article/14orlq0/), [API docs](https://publer.com/docs), [plans](https://publer.com/plans)
- Ordinal: [MCP](https://docs.tryordinal.com/api/mcp), [MCP tools](https://docs.tryordinal.com/mcp/tools), [API](https://docs.tryordinal.com/api), [pricing](https://www.tryordinal.com/pricing)
- Hootsuite: [MCP](https://www.hootsuite.com/integrations/mcp), [API overview](https://developer.hootsuite.com/docs/api-overview), [plans](https://www.hootsuite.com/plans)
- Ayrshare: [pricing](https://www.ayrshare.com/pricing/), [MCP action server](https://www.ayrshare.com/docs/additional/mcp-action-server), [MCP tools](https://www.ayrshare.com/docs/additional/mcp-action-tools)
- Agorapulse: [ChatGPT and Claude integration](https://support.agorapulse.com/en/articles/12960496-chatgpt-claude-integration-explained)
- Vista Social: [MCP](https://vistasocial.com/integrations/mcp/)
- SocialPilot: [MCP server](https://www.socialpilot.co/product-update/mcp-server)
- SocialBu: [MCP changelog](https://feedback.socialbu.com/changelog/use-socialbu-in-eightspokedasteriskclaude-via-mcp-integration)
- Zernio: [site](https://zernio.com/)
- Sprout Social: [API docs](https://api.sproutsocial.com/docs/), [pricing](https://sproutsocial.com/pricing/)
- Later: [pricing](https://later.com/pricing/)
- SocialBee: [integrations](https://help.socialbee.com/hc/en-us/articles/29979155669143-All-SocialBee-s-Integrations)
- Hypefury: [pricing](https://hypefury.com/features-pricing)
- Postiz: [repository](https://github.com/gitroomhq/postiz-app), [public API](https://docs.postiz.com/public-api), [MCP](https://postiz.com/mcp), [pricing](https://postiz.com/pricing)
- TryPost: [repository](https://github.com/trypostit/trypost), [MCP](https://trypost.it/en/mcp), [API](https://docs.trypost.it/api-reference/introduction), [pricing](https://trypost.it/pricing)
- Shoutrrr: [MCP docs](https://shoutrrr.com/docs/mcp), [API docs](https://shoutrrr.com/docs/api), [repository](https://github.com/coollabsio/shoutrrr)
- BrightBean Studio: [repository](https://github.com/brightbeanxyz/brightbean-studio)
- Mixpost: [MCP](https://mixpost.app/mcp), [MCP tools](https://docs.mixpost.app/mcp/tools/), [API](https://docs.mixpost.app/api/), [pricing](https://mixpost.app/pricing)
- Harbor: [repository](https://github.com/tryharbor/harbor), [developers](https://useharbor.io/developers)
