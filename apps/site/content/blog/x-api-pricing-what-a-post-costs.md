---
title: "X API pricing in 2026: what a post actually costs"
date: 2026-10-17
description: X's API is pay-per-use now. A post costs $0.015, a post with a link $0.20, and reading a post's metrics $0.005. Here is what that adds up to for a real posting schedule, and what people get wrong.
author: Derek
tags: [x, apis, pricing]
---

**X's API is pay-per-use: you buy credits and pay per call.** Publishing a post costs $0.015. A post that contains a link costs $0.20. Reading a post, including its metrics, costs $0.005 per post returned. There's no free tier for new developers, and the old Basic and Pro subscriptions are being retired. For a brand posting once a day and checking each post five times, that's about $1.20 a month without links and about $6.75 with them.

I run Harbor's X integration on this pricing, so these are the numbers I actually pay. Prices below were checked against X's own pricing page and changelog on October 17, 2026.

## The short version

| What you do | Price |
|---|---|
| Publish a post | $0.015 |
| Publish a post that contains a link | $0.200 |
| Read a post (with its metrics) | $0.005 per post returned |
| Read your own data ("owned reads", see below) | $0.001 |
| Look up a user | $0.010 per user returned |
| Delete a post | $0.010 (per third-party price tables; X's page doesn't name the row) |
| Add alt text to media | $0.005 |

You prepay credits. There's no subscription, no contract and no minimum. You can set a spending limit, and requests are blocked once you hit it.

## How we got here

- **2023 and 2024: tiers.** Free, Basic and Pro. Pro launched at $5,000 a month in May 2023. Basic went from $100 to $200 a month in October 2024.
- **February 6, 2026: pay-per-use launches.** Free access stays only for public-utility apps, and new developers pay per call.
- **April 20, 2026: links get expensive.** A post with a URL went from $0.01 to $0.20. A plain post became $0.015, and reads of your own data dropped to $0.001. X also removed likes, follows and quote-posts from self-serve access.
- **Mid to late 2026: legacy plans migrate.** Several developer guides report legacy Basic plans moving to pay-per-use after June 1 and Pro after September 1. I couldn't confirm the exact dates from X's forum, so treat them as approximate.

If you're starting today, pay-per-use (or Enterprise) is the only option.

## What a scheduling app actually pays

A scheduler does two things on X: it publishes, and it reads each post back to see how it did. Harbor reads every post at 1 hour, 6 hours, 24 hours, 3 days and 7 days. That's five reads.

**One post, read five times:**

- Without a link: $0.015 + 5 × $0.005 = **$0.04**
- With a link: $0.20 + 5 × $0.005 = **$0.225**

**One brand, one post a day, for a month:**

| | No links | Every post has a link |
|---|---|---|
| 30 posts, 5 reads each | **$1.20** | **$6.75** |

Five brands posting daily, no links, is about $6 a month. The same five brands with a link in every post is about $34.

X deduplicates reads of the same post within a UTC day, and calls that a "soft guarantee". A post's 1-hour and 6-hour checks often fall on the same UTC day, so the real bill can come in a little under these numbers.

## What people get wrong

1. **Links cost 13 times as much as a plain post.** $0.20 against $0.015. This only applies to posts made through the API, not ones you type into X yourself.
2. **Batching reads doesn't save money.** Reads are billed per post returned, so fetching 100 posts in one request costs the same as 100 requests. Batching saves rate limit, not credits.
3. **"Owned reads" at $0.001 are narrow.** They apply to the `GET /2/users/{id}/...` endpoints, and only when that account owns the developer app. If you build a tool for other people's accounts, their reads cost the normal $0.005.
4. **The detailed metrics expire.** Link clicks, profile clicks and other non-public metrics need user-context auth, and X only returns them for posts from the last 30 days. Read them while you can.
5. **Rate limits are separate from credits.** For example, 100 posts per user every 15 minutes. Having credits doesn't lift them.
6. **Automated replies are restricted.** Since February 2026, a programmatic reply needs the original author to have summoned the replier. Plan threads and replies with that in mind.

## How to keep the bill small

- **Set a spending limit** in the developer console before you write any code. A bug in a polling loop is the expensive kind.
- **Leave the link out when it isn't the point.** A post that earns attention without a link is 13 times cheaper to send.
- **Read on a schedule, not on demand.** Five checkpoints tell you the shape of a post's growth. Polling every few minutes mostly buys duplicate numbers.
- **Don't read what you won't use.** Harbor leaves reading X replies off until you turn it on, because every reply read is a billed call.

Harbor is open source, and self-hosted Harbor posts through your own X developer app. You pay X directly, at these rates, under your own spending limit. The integration is in [the repo](https://github.com/tryharbor/harbor), and [what every social API gives you](/blog/what-every-social-api-gives-you-in-2026) compares X with LinkedIn, Instagram and Threads, which don't charge per call.

## FAQ

### How much does it cost to post a tweet through the X API?

$0.015 per post under pay-per-use pricing. A post that contains a link costs $0.20.

### Is there still a free X API tier?

Not for new developers. Since February 6, 2026, free access is limited to public-utility apps. Everyone else buys credits.

### How much does it cost to read a post's metrics?

$0.005 per post returned. Reads of your own data through the owned-reads endpoints cost $0.001, but only when the account owns the developer app.

### Do X API Basic and Pro plans still exist?

They're being retired. New developers get pay-per-use or Enterprise, and legacy Basic and Pro plans have been moving to pay-per-use through 2026.

### Why do posts with links cost more?

X raised the price of API posts containing a URL to $0.20 on April 20, 2026, saying it wanted to curb misuse. Posts made in the X app itself aren't affected.

### How much does a social media scheduler cost to run on X?

For one brand posting daily and checking each post five times, about $1.20 a month without links and about $6.75 with a link in every post.

## Sources

- [X API pricing](https://docs.x.com/x-api/getting-started/pricing) and [changelog](https://docs.x.com/changelog), X Developer Platform (checked October 17, 2026)
- [Rate limits](https://docs.x.com/x-api/fundamentals/rate-limits) and [metrics](https://docs.x.com/x-api/fundamentals/metrics), X Developer Platform
- [X makes it more expensive to post links through its API](https://techcrunch.com/2026/04/22/x-makes-it-more-expensive-to-post-links-through-its-api/), TechCrunch, April 22, 2026
- [X makes its Basic API tier more costly](https://techcrunch.com/2024/10/30/x-makes-its-basic-api-tier-more-costly-launches-annual-subscriptions), TechCrunch, October 30, 2024
