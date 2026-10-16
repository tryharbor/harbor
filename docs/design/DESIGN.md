# Harbor design direction

Date: 2026-10-15. Applies to the app and, later, the marketing site.

**One line:** Sanity's marketing site for the look, Jasper for the depth of the product, the original Harbor system for tokens and the mark.

## What we take from each reference

| Reference | What's great | What Harbor takes |
|---|---|---|
| **Sanity, marketing site** (sanity.io) | Near-black and white with one hot orange-red; a large, tight grotesk (Waldenburg, 400, −0.04em at 112px); IBM Plex Mono uppercase micro-labels (`CLICK TO INTERACT`, `STATUS:`); pill buttons (orange with black text, white, outline mono); dotted-grid and dashed-hairline panels; real product UI and code shown inside the page | The overall look: dark-first, tight light-weight headlines, mono uppercase labels, pill actions, dotted grids and dashed frames for "staging" areas, product windows framed like the site's demos |
| **Sanity Studio / dashboard** | Structured content: typed fields, validation, document panes side by side, history, Releases (changes shipped together), Presentation (live preview) | Brand Memory as typed sections; the Studio's side-by-side panes (idea → one version per platform with a live preview); draft history; campaign "releases" later. Not its bare visual style |
| **Jasper** | Depth: Canvas (board ↔ table of assets), agent side panel (context chips, questions, run, output card), Brand Voice structure (personality → values → rules → excerpts → sources) with a live preview while creating, guided setup | Information architecture and interaction patterns: board/table toggle, agent panel, voice structure and wizard, output cards with status and rating, onboarding checklists |
| **Original Harbor** (`~/Harbor/docs/design/DESIGN.md`) | Black + zinc, one orange signal, Geist with tight tracking, dithered textures, dark product windows in both themes | Tokens, the signal orange, Geist, the mark |

## Tokens

- **Color (dark, default):** bg `#0a0a0a`, panel `#111112`, raised `#18181b`, hairline `rgba(255,255,255,.08)`, strong hairline `rgba(255,255,255,.16)`, text `#fafafa`, muted `#a1a1aa`, dim `#71717a`.
- **Color (light):** bg `#f4f4f5`, panel `#ffffff`, raised `#fafafa`, hairline `rgba(0,0,0,.08)`, text `#0a0a0a`, muted `#52525b`, dim `#71717a`.
- **Signal:** `#ff5b2e` is the only hue: primary actions, "now/live" states, the active nav item marker, the Sandbox/Live badge in Live. Status uses muted green / amber / red at low opacity, never as decoration.
- **Platform tints:** none. Platforms are named in mono labels, not colored.
- **Type:** Geist (400 for headlines with −0.03 to −0.04em tracking; 500 for UI emphasis), Geist Mono for uppercase micro-labels (11px, +0.08em), IDs, counts, table headers and code.
- **Shape:** pills (`9999px`) for actions and status; `10px` for panels; `6px` for inputs and small cards. Hairline borders, no shadows except floating menus.
- **Texture:** dotted grid (Sanity) behind empty states, headers and "Coming next" areas; dashed frames for staging areas (drafts not yet approved, simulated output).

## Product rules

- **Show the real thing.** Empty states show what will appear and how to get there, framed with the dotted grid.
- **Simulated is always labeled.** Anything produced by the simulated model or sandbox publishing carries a mono `SIMULATED` / `SANDBOX` tag. The current mode is always visible in the sidebar.
- **Every idea cites its reason**, shown as a chip linking to the signal.
- **Mono labels name things; headlines say things.** Section titles are statements ("What worked this week"), labels are nouns (`IDEAS`, `DRAFTING`).

## Logo

`brand/harbor-mark.svg` (currentColor; use in UI), `harbor-mark-black.svg`, `harbor-mark-white.svg`, `favicon.svg` (white mark on a black rounded square). The mark is always monochrome; orange stays reserved for signals. Copied unchanged from the original Harbor.
