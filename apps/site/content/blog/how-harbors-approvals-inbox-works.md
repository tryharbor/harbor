---
title: How Harbor's approvals inbox works
date: 2026-10-17
description: Every post Harbor's agents, automations and MCP clients propose lands in one inbox, with the time slot, the reason and a voice check. Here is what a card shows, what each button does, and what it doesn't do yet.
author: Derek
tags: [approvals, agents, mcp, workflow]
---

**Approvals is the inbox where every proposed post waits for a person.** An agent run, an automation or an MCP client like Claude proposes a draft. Harbor picks a time slot, writes down why, and runs the draft through that brand's voice check. You approve it (it's scheduled), edit it and approve (it's saved as a new version and scheduled), or reject it (it's kept, with your note). Nothing an agent proposes gets published until you've approved it.

This is a walkthrough of the screen as it works today, in the open-source release.

## Where proposals come from

Three things can put a post in Approvals:

- **Agent runs.** Weekly plan drafts the week from your ideas, Brand Memory and last week's results. Repurpose a winner turns a post that outperformed into drafts for your other platforms. Both propose what they draft.
- **Automations.** An agent on a schedule, for example Weekly plan every Monday at 8am. Each automation has a daily run limit, and pauses itself after three failures in a row.
- **MCP clients.** Claude, or any MCP client, calls `propose_post` with a draft. That's the only way an MCP client can get a post onto a calendar.

If a proposal doesn't name a time, Harbor takes the next free best-time slot on that account, based on when that brand's past posts did well.

## What a card shows

Each card is one post on one account:

- **The brand, account and platform**, with the post as it will go out, media included.
- **The slot**, in your timezone.
- **Why.** The reason for the slot and the post, such as "Tue 9:00 AM is one of Harbor's best X slots. From last week's digest: …", or for a repurposed post, how many times the median the original did.
- **Where it came from.** The agent's name or "Proposed over MCP", linked to the idea it was drafted from.
- **The checks.** The draft, run against that brand's voice and the platform's rules.

| Check | What it looks at | If it fails |
|---|---|---|
| Placeholders | Unfilled text like `[stars]` | Blocks approval |
| Banned words | The brand's banned list | Flagged as a fail |
| Avoid list | Phrases the voice avoids | Warning |
| Length | The platform's limit, counting an X link as 23 | Flagged as a fail |
| Hashtags | More than the platform's sensible number | Warning |
| Style rules | The voice's do and avoid rules | Warning |
| Hook | An empty or very short first line | Fail if empty, warning if short |
| Media | Instagram needs an image or video; size and format | Blocks approval on Instagram |

The checks are there to catch problems before you read the post, not to replace reading it.

## The three decisions

**Approve.** The post is scheduled on that account at the proposed time. It goes through the same path as a post you schedule yourself, with the same validation.

**Edit, then approve.** Change the text, pick another time or attach media, then "Approve with changes". Your edit is saved as a new version written by a person, and the agent's version is kept next to it. If the slot has passed while the card waited, the button reads "Pick a new time" instead.

**Reject.** Optionally say what was off. The card moves to the Rejected tab with your note, so you can see later what the agents keep getting wrong.

You can also tick several cards and use **Approve selected** or **Reject selected**. Tabs at the top show how many are Waiting, Approved and Rejected, and a brand dropdown narrows the list to one brand.

Once approved, the card links to the post's performance page, where it's measured at 1 hour, 6 hours, 24 hours, 3 days and 7 days against that brand's median.

## Brand Memory proposals

The second tab holds proposed changes to a brand's memory. The main one is a **voice refresh**: once a brand has enough measured posts (at least three on each side of a pattern), the Voice refresh agent suggests do and avoid rules based on what performed. Each change has its own checkbox and lists the posts it's based on, so you can keep two rules and drop the third. Nothing changes in Brand Memory until you apply it.

## Over MCP

Harbor's MCP server has 23 tools. Clients can read everything (brands, posts, ideas, best times, digests, approvals) and write ideas, drafts, notes and proposals. `propose_post` creates a waiting approval and returns the slot it took:

```
Proposed for 2026-10-20T14:00:00Z on @tryharbor; waiting for approval
```

`list_approvals` lets the client check what's still waiting. There's no MCP tool that schedules or publishes, so you can let Claude draft a week of posts for every brand and review them in one place.

## When a post's outcome is unknown

Sometimes a platform times out and Harbor can't tell whether a post went out. Harbor marks it **Check platform** and asks you rather than retrying, because a duplicate post is worse than a short delay. You check, then click "It went out" or "It didn't go out, retry".

## What it doesn't do yet

- **One approver.** There are no team roles, multi-step approval stages or client review links yet. If you need client sign-off today, BrightBean Studio has the most complete workflow among open-source tools ([compared here](/blog/open-source-social-media-schedulers-2026)).
- **Rejection notes are a record, not training.** They're saved and shown, but the agents don't read them yet.
- **No approval-free mode.** You can't let a trusted agent skip the inbox.

## FAQ

### Can Harbor's agents publish without approval?

No. Agents, automations and MCP clients can only propose. A post is scheduled when a person approves it, and published at that time.

### What happens if I don't approve a post before its time slot?

It stays in Approvals. Its slot has passed, so the card asks you to pick a new time before you can approve it.

### Can I edit an agent's draft before approving it?

Yes. Change the text, time or media and choose "Approve with changes". Harbor saves your edit as a new version and keeps the agent's version too.

### Can I approve posts in bulk?

Yes. Select several cards and use Approve selected or Reject selected. Each post is still checked and scheduled individually.

### Can Claude schedule posts through Harbor's MCP server?

Claude can propose posts with `propose_post`, which puts them in Approvals with a time slot. It can't schedule or publish them; you approve them in Harbor.

### Does Harbor support multi-step or client approvals?

Not yet. Today one person approves. Collaboration, with team roles and shared review, is planned but not built.

## Try it

Approvals is in the open-source release, on every plan. Start with [the repo](https://github.com/tryharbor/harbor), or see [how to connect Claude over MCP](/developers).
