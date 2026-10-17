# Post goals

Status: proposed, 2026-10-17. Not built.

## Why

A week of posts should be a mix on purpose: some to start conversations, some to teach, some to prove the product works, some to announce. Today that mix lives in people's heads, or in notes ("Pillar: The Proof") that Harbor can't read. Tools like ClimbX track post types (questions, stories, lists, takes) by how they perform. Harbor already measures every post against its brand's own median, so it can answer the better question: which kind of post works for this brand, and is this week's plan balanced?

A goal is a label on a post that says what it's for. It shows as a colored pill everywhere the post appears, so a calendar reads at a glance.

## Shape

- **Goals belong to a brand**, in Brand Memory: `goals: [{ id, name, description, color }]`, 2 to 8 of them.
  - New brands start with defaults they can rename, reword or delete:

    | Goal | For |
    |---|---|
    | Engage | Questions and takes that start a conversation |
    | Teach | How-tos and lessons the audience can use |
    | Proof | Results, numbers and customer stories |
    | Product | Launches, updates and changelogs |
    | Behind the build | What you're working on and why |

  - A personal account gets its own defaults: *Opinion*, *Lesson*, *Build in public*, *Amplify* (quoting a brand's win).
  - Deleting a goal leaves its posts unlabeled. Renaming keeps them, since posts store the goal's id.
- **An idea has at most one goal** (`ideas.goal_id`, nullable). Drafts, approvals and posts made from it inherit it.
- **A post stores the goal it went out with** (`posts.goal_id`), copied from its idea when it's created. Compose can set one directly. Measurement reads the post's own goal, so moving an idea later doesn't rewrite history.
- **The API and MCP:** `goalId` on ideas and posts. `create_idea`, `draft_idea` and `propose_post` accept it, and `get_brand_memory` returns the brand's goals, so Claude can plan a balanced week too.

## Colors

- Each goal takes one of 8 fixed hues in a fixed order. The first goal gets the first hue, and a goal keeps its hue when others are added or removed (color follows the goal, never its position).
- The palette is checked with the dataviz validator against the light and dark panel colors for colorblind separation and contrast. It's distinct from the stage colors and the violet best-time shading.
- **The pill always carries the label.** Color is never the only signal. It's a small square swatch plus the name in normal ink: no colored text, no colored card edges.
- On calendar chips, where space is tight, the swatch shows alone and the name is in the tooltip and the legend above the calendar.

## Where it shows

- **Hub board and table:** the pill on idea and post cards; a goal filter next to the brand filter.
- **Calendar (week and month):** the swatch on every chip, and a legend with this week's count per goal ("Proof 3 · Engage 0").
- **Studio:** a goal picker on the idea.
- **Approvals:** the pill on each card, so you approve a balanced week rather than ten Product posts.
- **Performance:** the pill on the post.

## Measuring

- **Insights gets a "By goal" table per brand:** posts, median result at 24h against the brand's median, and the trend. For example, "Proof: 6 posts, 2.1× your median. Product: 4 posts, 0.6×."
  - It uses the same outcomes as everything else (each platform's primary metric against the brand and platform median), so goals compare fairly across platforms.
  - It needs at least 3 posts in a goal before showing a ratio, like voice learning does.
- **The weekly digest** gets the same numbers, so its findings can say "Proof posts keep outperforming; plan more of them".

## Planning

- **Suggest ideas** gives each idea a goal and spreads them across the brand's goals.
- **Weekly plan** aims for a mix: by default, roughly equal across goals, tilted toward the goals that perform best for the brand once there's data. Each proposal's reason names its goal ("Proof: your best-performing goal; nothing scheduled for it this week").
- Optional per-goal targets ("Product: at most 1 a week") come later, if people want them.

## What it isn't

- Not campaigns. A campaign groups posts around an event or launch for a period of time. A goal says what one post is for. A launch campaign will have Product, Proof and Engage posts in it.
- Not formats. Thread, single post, image or video is how a post is built; a goal is why it exists. Formats could be measured the same way later.

## Build order

1. Data: `goals` in Brand Memory with defaults, plus `goal_id` on ideas and posts (migration), in the API and MCP.
2. App: pills on the Hub, Studio, Approvals and Performance; the picker in Studio and Compose; swatches and the legend on the calendar.
3. Insights: the "By goal" table and digest numbers.
4. Agents: Suggest ideas and Weekly plan assign and balance goals.
5. Then make Calendar the Hub's default view.

## Open questions

- Should the defaults differ by platform? For example, LinkedIn leans Teach and Proof, X leans Engage. Probably not at first: one set per brand, with Insights showing which goals work where.
- Should an idea be allowed two goals? No for now. One goal keeps the measuring clean.
