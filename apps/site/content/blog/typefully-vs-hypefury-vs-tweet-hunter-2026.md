---
title: "Typefully vs Hypefury vs Tweet Hunter (2026): which is still worth it for X and LinkedIn"
date: 2026-10-26
description: Hypefury dropped X this summer, Typefully repriced twice, and X restricted automated replies. Here's where the three writing tools stand for founders on X and LinkedIn, with prices, platforms, growth features and the rules they bump into. Checked October 23, 2026.
author: Derek
tags: [comparison, x, linkedin, writing]
---

**For most founders writing on X and LinkedIn, Typefully is now the default pick.** It covers both (plus Threads, Bluesky, Mastodon and Substack Notes), has a real free plan, a $99-a-year paid plan, and an API and MCP server on every plan. **Tweet Hunter** is for people who live on X and want its viral-post library and growth automation. **Hypefury no longer supports X at all**, so it's only worth a look for LinkedIn, Instagram, TikTok, Threads and Bluesky.

Everything below comes from each tool's pricing page (all three load prices with JavaScript, so they were read in a browser), help center and changelog, checked on October 23, 2026. Prices are in US dollars. A disclosure: I build Harbor, an open-source scheduler, which isn't part of this comparison.

## What changed in 2026

- **Hypefury dropped X** between mid-June and mid-July 2026. Its pricing FAQ now answers "Does Hypefury still support X?" with "Nope!". It published no announcement I could find. Its sister product BlackMagic, an X analytics tool, shut down on July 1, 2026.
- **Typefully repriced twice.** In April its plans were Free, Creator ($12.50/mo), Team ($29/mo) and Agency ($79/mo), billed yearly. By May they were per "social set" (one person or brand's group of accounts). Today: Free, Creator at $99 a year, and Business per social set.
- **X restricted replies sent through its API.** For self-serve API customers, a reply is now only allowed if the account being replied to mentioned or quoted the replying account first. Otherwise X rejects it. Tools that automate replies to other people's posts are directly affected.

## At a glance

| | Typefully | Hypefury | Tweet Hunter |
|---|---|---|---|
| **Free plan** | Yes: 10 posts a month, 1 social set | No (7-day trial, no card) | No (7-day trial) |
| **Cheapest paid** | Creator, $99/year (annual only) | Flexible, $6/mo per channel ($5 billed yearly) | Discover, $29/mo ($23 billed yearly) |
| **Top plan** | Business, $20 per social set/mo ($18 billed yearly) | Full, $19/mo or $199/year | Enterprise, $200/mo ($167 billed yearly) |
| **X** | Yes | **No** | Yes, X only |
| **LinkedIn** | Yes | Yes | No (lempire sells Taplio for LinkedIn) |
| **Threads, Bluesky** | Yes | Yes | No |
| **Instagram, TikTok** | No | Yes | No |
| **Also** | Mastodon, Substack Notes | | |
| **Viral or inspiration library** | No | Yes | Yes, "12M+" posts |
| **API / MCP** | Yes / Yes, on every plan | Neither documented | Neither found; Zapier trigger only |

## Typefully

A writing-first scheduler built around a clean editor.

- **Writing:** threads with numbering, X long-form posts and Articles, polls, LinkedIn PDF carousels, first comments, previews, and a Writing Assistant (launched February 2026) that learns your voice from samples, flags weak hooks and adapts a post between X and LinkedIn. Typefully says the assistant does no auto-posting and no one-click content generation.
- **Growth tools on every plan:** scheduled reposts, auto-plugs, replies to posts, and auto-DMs. Auto-DM campaigns are capped at 500 a day, and the post has to say "DM", "Message" or "Send", which keeps recipients opted in.
- **Analytics:** X only for now; LinkedIn analytics is in progress. The default view is the last 30 days.
- **Teams (Business):** roles, inline comments, Slack notifications, a shared calendar, and "planned posts" that sit on the calendar until someone confirms them.
- **For developers:** a REST API with webhooks, an MCP server, an official Claude connector (September 2026), and Zapier.
- **Watch out for:** AI usage limits aren't published, and Creator is annual only. There's almost no review history yet.

## Hypefury

Once a popular X growth tool, now a multi-platform scheduler without X.

- **Plans:** Flexible ($6/mo per channel) or Full ($19/mo, all channels). Full adds cross-posting, LinkedIn carousels and long posts, follower growth and profile clicks, and AI trained on your posts.
- **Strengths:** an inspiration gallery of hooks and templates, evergreen and recurring posts, repurposing into Instagram images, Reels, TikTok videos and LinkedIn carousels, and Instagram auto-DMs triggered by keyword replies.
- **Watch out for:** no X. No public API. No approval workflow. Much of its help center still describes the X version, and almost all its reviews (G2 4.7 from 21, Capterra 4.8 from 26) predate the X exit.

## Tweet Hunter

An X-only growth tool from lempire, the company behind lemlist.

- **Library and writing:** a searchable library of viral posts, custom inspirations, an AI writer from the Grow plan ($49/mo, $36 billed yearly), hooks and thread ideas, and evergreen posts.
- **Growth automation:** auto-retweets at intervals, auto-plugs triggered by a like threshold, auto-DMs triggered by a like, reply or retweet (3,000 to 15,000 a month by plan), a reply feed called Engage, and an X CRM.
- **Analytics:** 30 days of history when you connect, then tracking from there.
- **Teams:** every member pays for their own seat, with 25% off from 3 members. A writer/client mode lets a client approve or request changes, but both sides need paid seats.
- **Watch out for:** X only. The auto-DM help text doesn't mention an opt-out or disclosure. AI-generated replies and engagement features are the ones most exposed to X's new reply restriction.

## The rules these growth features bump into

All three sell some automation. The platforms' own rules are stricter than the feature lists suggest.

**X's automation rules** (updated April 2026):
- Automated replies and mentions are allowed only to people who opted in. Replying based on keyword searches alone isn't allowed.
- Automated DMs are allowed only to people who asked to be contacted that way. Following you doesn't count.
- Automated reposts are fine for informational purposes; bulk or aggressive reposting isn't.
- Automated likes aren't allowed.
- AI reply bots need X's written approval.

**LinkedIn's User Agreement** prohibits bots or unauthorized automated methods that comment on, like, share or re-share posts, or otherwise drive inauthentic engagement.

In practice: scheduling, threads, first comments on your own posts and opt-in auto-DMs (where the post asks people to reply for the DM) are the safe end. Automated replies to strangers, automated likes and engagement pods are the risky end, and they're the features most likely to get an account limited.

## Which should you pick?

- **X and LinkedIn, writing-focused, on a budget:** Typefully, Free then Creator ($99 a year).
- **A team or agency writing for several people:** Typefully Business, per social set.
- **X only, growth-focused, wants a viral library:** Tweet Hunter. Keep automation to opt-in DMs and your own reposts.
- **LinkedIn, Instagram and TikTok, no X:** Hypefury Full.
- **Driving it from Claude or scripts:** Typefully, the only one of the three with an API and MCP server.

## FAQ

### Does Hypefury still support X (Twitter)?

No. Hypefury's pricing FAQ says it no longer supports X. The change happened between mid-June and mid-July 2026, and its plans were restructured afterwards.

### Is Typefully free?

Yes, with limits: the Free plan allows 10 posts a month for one social set and includes the API and MCP server. Creator costs $99 a year, billed annually only.

### Does Tweet Hunter support LinkedIn?

No. Tweet Hunter is X only. Its owner, lempire, sells a separate LinkedIn tool called Taplio.

### Are auto-DMs and auto-replies allowed on X?

Only with consent. X's rules allow automated DMs only to people who asked to be contacted that way, and automated replies only to users who opted in. Since early 2026, replies sent through X's self-serve API are also rejected unless the other account mentioned or quoted you first.

### Which has an API or MCP server?

Typefully, on every plan including Free. I found no public API or MCP server for Hypefury or Tweet Hunter; Tweet Hunter has a Zapier trigger.

## Sources

- Typefully: [pricing](https://typefully.com/pricing), [changelog](https://typefully.com/changelog), [teams](https://support.typefully.com/en/articles/8717333-collaborating-in-teams), [analytics](https://support.typefully.com/en/articles/8718148-analytics-page-metrics), [auto-DMs](https://support.typefully.com/en/articles/8718257-auto-dm-campaigns), [Writing Assistant](https://support.typefully.com/en/articles/14756434-writing-assistant), [planned posts](https://support.typefully.com/en/articles/16213506-planned-posts), [API](https://support.typefully.com/en/articles/8718287-typefully-api), [MCP server](https://support.typefully.com/en/articles/13128440-typefully-mcp-server)
- Hypefury: [pricing](https://hypefury.com/features-pricing/), [home](https://hypefury.com/), [auto-DMs](https://hypefury.crisp.help/en/article/auto-dms-cd4ik1/), [refunds](https://hypefury.crisp.help/en/article/can-i-request-a-refund-1ajd9cl/), [BlackMagic](https://blackmagic.so)
- Tweet Hunter: [pricing](https://tweethunter.io/pricing), [plans summary](https://intercom.help/tweethunter/en/articles/10938770-tweethunter-subscriptions-summary), [analytics](https://intercom.help/tweethunter/en/articles/10111591-what-is-the-analytics-feature-and-how-do-i-access-it), [team billing](https://intercom.help/tweethunter/en/articles/11199385-understanding-team-billing-and-discounts), [collaboration](https://intercom.help/tweethunter/en/articles/11172099-collaboration), [Engage](https://intercom.help/tweethunter/en/articles/10111356-what-is-engage-and-how-does-it-work)
- Platform rules: [X automation rules](https://help.x.com/en/rules-and-policies/x-automation), [X API: managing posts](https://docs.x.com/x-api/posts/manage-tweets/integrate.md), [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement), [LinkedIn: prohibited software](https://www.linkedin.com/help/linkedin/answer/a1341387)
- Price history: Wayback Machine snapshots of [Typefully's pricing (April 2026)](https://web.archive.org/web/20260407092502/https://typefully.com/pricing) and [(May 2026)](https://web.archive.org/web/20260519072501/https://typefully.com/pricing), and [Hypefury's pricing (June 2026)](https://web.archive.org/web/20260614063940/https://hypefury.com/features-pricing/) and [(July 2026)](https://web.archive.org/web/20260714165051/https://hypefury.com/features-pricing/)
