---
title: What every social API actually gives you in 2026
date: 2026-10-16
description: I built direct integrations with X, LinkedIn, Instagram and Threads. Here is what each one lets you post, what it tells you afterwards, what it costs, and the surprises.
author: Derek
tags: [apis, publishing, analytics, build]
---

Harbor publishes to X, LinkedIn, Instagram and Threads directly, through your own developer apps. No middleman API. That meant reading four sets of docs, registering four apps, and finding out what each platform actually lets you do once the marketing page ends.

This is the version I wanted before I started. It's current as of October 2026, and it's what Harbor's adapters do today. If something here changes, the code in the repo is the source of truth.

## The short version

| | X | LinkedIn | Instagram | Threads |
|---|---|---|---|---|
| Text limit | 280 per post | 3,000 | 2,200 caption | 500 per post |
| Threads | Yes, as replies | No (extra parts become comments) | No (carousel instead) | Yes, as replies |
| Images | Up to 4 | 1 | 1 to 10 (carousel), required | Up to 10 |
| Post metrics | Views, likes, replies, reposts, saves, profile visits, link clicks | None without partner access | Views, reach, likes, comments, shares, saves | Views, likes, replies, shares, reposts |
| Access token | 2 hours, refreshable | About 60 days, not refreshable | 60 days, refreshable | Long-lived, refreshable |
| Cost | Pay per use | Free | Free | Free |

The rest of this post is the detail behind each row.

## X: everything is available, and everything has a price

X has the most complete API of the four, and it's the only one that charges for every call.

**What it costs.** X's API is pay-per-use. Roughly:

- A post: $0.015
- A post that contains a link: about $0.20
- A metrics read: $0.005

Harbor measures each post at 1 hour, 6 hours, 24 hours, 3 days and 7 days. That's 5 reads. So publishing and tracking one post costs about 4 cents, or about 22 cents if it carries a link. For one brand posting once a day, that's a few dollars a month. Set a spending limit in the developer console anyway. A bug in a polling loop is the kind of thing you want capped.

Two design decisions came straight out of that price list. Harbor's drafts put the link last instead of in the opening line. And reading replies on X is off unless you turn it on, because every read is billed.

**What you get.** The metrics are good: views, likes, replies, reposts, saves, profile visits and link clicks, per post. That's enough to build a real growth curve.

**Auth.** OAuth 2.0 with PKCE. Access tokens last 2 hours; ask for the `offline.access` scope and you get a refresh token. Harbor refreshes about 10 minutes before expiry. If a refresh token is rejected, the only fix is reconnecting, so Harbor marks the channel and asks.

**Threads and media.** A thread is a chain of replies to your own post. Images upload separately first; up to 4 per post. Harbor doesn't do video on X yet.

## LinkedIn: easy to post, nearly blind afterwards

LinkedIn is the easiest platform to start posting to and the hardest to learn from.

**Posting.** Add two self-serve products to your app: "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect". Both are approved instantly. You post as yourself; the app has to be tied to a Company Page you admin, but the posts aren't. One image per post, 3,000 characters.

There's no thread format. Harbor posts extra parts as comments on the original post, in order, so a multi-part draft still reads top to bottom.

**Metrics.** None. Post analytics need the Community Management API, which is partner-only. Your posts publish fine, and Harbor shows "no metrics" instead of guessing. It's the biggest gap of the four, and it's why Harbor's verdicts only exist for the other three.

**Auth.** Tokens last about 60 days, and refresh tokens are partner-only too. When a token expires, Harbor marks the channel "refresh needed" and you reconnect. Once every two months isn't terrible, but it's the kind of thing that breaks a scheduled post if nobody's looking, so Harbor flags it on Home before the next post.

One more: LinkedIn versions its API by month (`202601` style), and old versions get retired. Put the version in config, not in code.

## Instagram: generous metrics, strict about media

Instagram's API, using "Instagram API with Instagram Login" (no Facebook Page needed), is better than its reputation.

**Requirements.** The account has to be a professional account: Business or Creator. In development mode you add yourself as an Instagram tester and accept the invite from inside Instagram. For your own accounts you never need app review.

**Media is mandatory.** Every post needs an image or video, and Instagram is picky about it:

- Images must be JPEG
- The aspect ratio has to be between 4:5 and 1.91:1
- 2 to 10 items make a carousel; 1 video makes a Reel
- The media has to be at a public URL, because Instagram downloads it

That last point shapes the architecture. Harbor serves its media library at public URLs and crops each image per platform. 4:5 portrait is the safe default for Instagram. During development, a tunnel gives your local server a public HTTPS address.

**Publishing is two steps.** You create a media container, then publish it. Video containers need processing time, so the post sits in a "pending" state while Harbor checks back. If the outcome is ever unclear, Harbor never retries automatically, because a retry is how you get a double post.

**Metrics.** Views, reach, likes, comments, shares and saves. Reach is the one I didn't expect: it's the only platform of the four that tells you unique accounts reached.

**Auth.** Long-lived tokens last 60 days and refresh with themselves. Harbor refreshes them automatically.

## Threads: the friendliest of the four

Threads uses the same Meta developer account as Instagram, but a separate app with its own ID and secret.

**Posting.** 500 characters per post, up to 10 images, and real threads: each part is a reply to the one before. Like Instagram, publishing is create-then-publish.

**Metrics.** Views, likes, replies, shares and reposts. Replies are readable too, with the `threads_read_replies` permission, which is how Harbor groups what people ask into themes.

**Setup gotcha.** Meta requires uninstall and data-deletion callback URLs before your app is complete. In development mode, add your profile as a Threads tester and accept the invite in Threads' settings.

## What I'd tell myself before starting

1. **Use a stable HTTPS URL from day one.** Meta only accepts HTTPS redirects, and every platform wants the redirect URL registered exactly. A tunnel with a random address means re-registering four apps every time it restarts.
2. **Never retry an unknown outcome.** Timeouts happen after the platform already accepted the post. Retry only failures that prove nothing went out, like rate limits or expired tokens. Everything else waits for a person to check.
3. **Store the raw response next to your normalized metrics.** Platforms rename fields. With the raw payload, you can re-derive history instead of losing it.
4. **Compare posts at the same age.** A post's total after a week is meaningless next to one that's 6 hours old. Harbor compares each post to the brand's own median at the same age, and says "too few posts to compare" until it has at least 3.
5. **Budget for X, and only for X.** The other three are free within rate limits. X is cheap per call, but it adds up if you poll carelessly.

All four adapters are open source in [the Harbor repo](https://github.com/tryharbor/harbor), with a sandbox that simulates every platform's limits so you can build against them without keys. The setup guide for registering your own apps is in [docs/setup/platform-apps.md](https://github.com/tryharbor/harbor/blob/main/docs/setup/platform-apps.md).
