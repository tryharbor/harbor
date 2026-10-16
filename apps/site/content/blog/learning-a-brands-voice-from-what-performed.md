---
title: Learning a brand's voice from what actually performed
date: 2026-10-16
description: Most brand-voice tools learn from what you paste in once. Harbor's voice refresh looks at which posts beat the brand's own median, and proposes rule changes with the evidence attached.
author: Derek
tags: [brand memory, insights, jasper]
---

Before building Harbor's Brand Memory, I spent two long sessions inside Jasper and wrote up everything I found. Jasper is good at a lot of this. I copied more from it than from any other tool, and I want to be specific about what, and about the one thing I think it gets wrong for people like me.

## What Jasper gets right

Jasper's Brand Voice has the best structure I've seen. You give it writing samples, and it produces:

- a personality paragraph;
- a few values, each with what it means in the writing;
- rules: what to do and what to avoid;
- verbatim excerpts from your samples;
- the list of sources it used.

When I gave it a single 1,105-character sample of my own writing, it came back with a fair description: candid, builder-minded, direct, short declarative sentences. It named values like transparency and anti-hype, and wrote an avoid list with words like "leverage" and "seamless". From one sample, in under a minute, that's a good start.

It also has a "Preview Brand Voice" view: the same brief written with the voice and without it, side by side. That's the clearest way I know to show what a voice actually changes.

Harbor's voice uses the same structure (a summary, values, do and avoid rules, excerpts, sources), and Harbor has the same with-and-without preview. Credit where it's due.

## The gap

Here's what I couldn't find anywhere in Jasper: **nothing learns from how posts did.** The voice, the audiences and the agents never see results. A voice generated from that one sample stays exactly that voice until somebody edits it by hand.

That's not carelessness. Jasper is built for marketing teams writing all kinds of content, and it doesn't publish your posts, so it never gets the numbers back. But for a builder posting for a few brands, the numbers are the most honest feedback there is. What you think your voice is and what your audience responds to are often two different things.

So that became the thing Harbor had to do differently.

## How Harbor measures a post

Harbor publishes directly to X, LinkedIn, Instagram and Threads, and then reads each post's metrics five times over its first week: at 1 hour, 6 hours, 24 hours, 3 days and 7 days. That gives a growth curve, not just a final total.

Each post is then compared with the brand's own median, for the same platform, at the same age. A post at 1.3 times the median or more has **outperformed**. Between 0.7 and 1.3 times, it **met** the median. Below 0.7, it **underperformed**. With fewer than three comparable posts, the verdict is **inconclusive**, because a median of two posts tells you nothing.

The point of comparing against your own median is that a brand with 400 followers and a brand with 40,000 can both learn. Nobody is measured against anybody else.

## The voice refresh

The voice refresh is one of Harbor's built-in agents. It takes a brand's published posts from the last 90 days that have a verdict, and looks at simple, countable features of each one:

- does it open in the first person, with a number, or with a question;
- does it contain a list, a link in the first part, a hashtag, an emoji;
- is it short (under 120 characters) or long (over 400);
- is it a thread, does it end with a question;
- does it have an image, a carousel or a video.

For each feature it computes a **lift**: the median result of posts with the feature, divided by the median result of posts without it. A feature only counts when both sides have at least three posts.

A lift of 1.25 or more proposes a new "do" rule. A lift of 0.8 or less proposes an "avoid" rule. If you already have a rule that the numbers now contradict, it proposes removing it. It also suggests one or two sentences from your best posts as new excerpts. It proposes at most six changes per run, so the review stays short.

Each change comes with one sentence that has the numbers in it, for example: "Posts opening in the first person did 1.6× the median (5 vs 7 posts)."

## You approve every change

The refresh never edits Brand Memory on its own. Its changes land in Approvals, next to the posts agents propose, and you accept or reject each one. That's the same rule as for posts: agents propose, people decide.

Once you accept a change, the rule keeps its **evidence**: links to the posts and signals behind it, and where it came from (learned from samples, from a refresh, saved by you, or written by you). So six months from now, when you wonder why your voice says "open with a number", you can click through to the posts that taught it that.

## Replies count too

Metrics tell you what got attention. Replies tell you why. Harbor fetches replies with the 24-hour and 3-day snapshots, sorts them into questions, objections, praise and requests, and groups the ones that share a keyword into themes, like "3 people asked how the growth curve is measured". Those themes become signals that the idea generator and the weekly plan can cite.

Some limits, plainly: replies work on Threads and Instagram. On X they're off by default, because X bills every read; you can turn them on if you've set a spending limit. LinkedIn doesn't give replies or post metrics without partner approval, so LinkedIn posts publish fine but don't feed the refresh yet.

You can also save anything to Brand Memory by hand: a post, a reply, a whole reply theme. And you can import a channel's recent posts, review the list, and uncheck anything that doesn't belong, so a new brand has history on day one instead of after a month.

## What this isn't

I want to be careful about what this claims. The analysis is deterministic and deliberately simple. It counts features; it doesn't understand your writing. Three posts on each side is a low bar, and a lift is a correlation, not a cause. A first-person post might do well because of what it says, not because it starts with "I".

That's exactly why every change is a proposal with its numbers attached, not an automatic edit. The refresh does the counting. You decide whether the pattern is real.

## Try it

Harbor runs in sandbox mode by default, with simulated platforms whose metrics depend on a post's traits, so there are real patterns to find without connecting any accounts. Run the demo seed, run a voice refresh on one of the sample brands, and look at what it proposes and why.

If the numbers it shows you ever look wrong, tell me: hello@useharbor.io.
