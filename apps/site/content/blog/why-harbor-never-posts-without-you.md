---
title: Why Harbor never posts without you
date: 2026-10-15
description: Harbor's agents plan, draft and pick a time. Then they stop and wait for you. Here is why that rule is in the code, not in a setting.
author: Derek
tags: [agents, approvals, decisions]
---

I run more than one brand. A product, a side project, my own name. Each one has an audience that took a long time to build, and each one sounds different.

The failure I worry about isn't a slow week. It's one post in the wrong voice, or the right post on the wrong brand's account. Nobody remembers the ten minutes a tool saved them. They remember the post they had to delete.

So when I wrote down how Harbor's agents should work, the first rule was simple: **agents propose, people publish.**

## What the rule says

No agent in Harbor publishes or schedules a post on its own. That covers the built-in agents, automations that run on a schedule or after a post goes out, and any outside agent that connects over MCP.

Whatever an agent wants posted becomes an **approval**. An approval holds:

- the draft, in the platform's shape;
- the account it would go out on;
- a proposed time slot;
- the reason for that slot and that post;
- the results of the voice check.

From there a person does one of three things. Approving schedules the post. Editing first saves a new version of the draft, so you can see what the agent wrote and what you changed. Rejecting keeps the record, with an optional note.

A proposal from the weekly plan looks roughly like this:

```
X · @harbor · proposed Tue 9:00
Reason: Tuesday 9am is this brand's best slot on X, and
last week's digest found posts opening with a number did
better than the median.
Checks: banned words ✓ · length ✓ · hashtags ✓ · hook ✓
```

## It's enforced in the code

I didn't want this to be a toggle someone flips at 2am. So it's built into what agents are allowed to call.

Harbor's MCP server has a tool called `propose_post`. There is no `schedule_post` and no `publish`. API keys come with two scopes, `read` and `write`, and even `write` stops at proposing. An agent with a write key can create ideas, draft them, attach images, run Harbor's own agents and queue approvals. It can't put anything on a platform.

For comparison: Postiz, an open-source scheduler I studied closely while designing Harbor's publishing, lets its public API publish directly. For a scheduler, where a person usually wrote the post, that's a reasonable choice. Harbor writes the posts itself, so it needs the opposite default.

## Why I think this is right

**One bad post costs more than ten saved minutes.** Harbor posts for several brands at once. The more brands, the more chances for a mix-up, and the more it matters that a person looks before anything goes out.

**The platforms ask for it.** X, Meta and LinkedIn all restrict fully automated posting to some degree. A person in the loop keeps Harbor on the right side of those rules, and keeps your accounts out of trouble.

**The useful part is the work before the click.** The time sink was never pressing publish. It's working out what to post, writing it for each platform, and finding a time that works. Harbor does that part. Reading a week of drafts, each with its reason attached, and approving them takes a couple of minutes.

**Spend stays predictable.** Automations have a daily run cap (three a day by default) and pause themselves after three failures in a row. A loop that goes wrong stops, instead of quietly burning model tokens overnight.

## The same idea, one layer down

The same instinct shows up in how Harbor publishes. If Harbor sends a post and can't confirm it landed, for example after a timeout, it marks the post **Check platform** and asks you. You look, then click "It went out" or "It didn't go out, retry". Harbor never retries those on its own, because a double post is worse than a short delay.

When Harbor isn't sure, it asks a person. That's the whole design.

## What I gave up

This isn't free. Harbor will never be a "set it and forget it" tool, and some people want exactly that. If you want fully automatic posting, Harbor isn't the right fit today.

There may be room later for a "trusted" mode, where a brand opts in to auto-approving posts that pass every check. If that ever ships, it will be an explicit choice per brand, off by default. It isn't built, and I'm in no hurry.

## Try it

Harbor is open source. Clone it and run `pnpm dev`. It starts in sandbox mode with a simulated model, so you can run the weekly plan, read the proposals and approve a few without any keys and without posting anything real.

If you think this rule is wrong, I'd like to hear why: hello@useharbor.io.
