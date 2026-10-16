# Harbor design direction

Date: 2026-10-15. Applies to the app and, later, the marketing site.

**One line:** Sanity's marketing site for the look, Jasper for the depth of the product, the original Harbor system for the mark, and the pixel-key palette for color.

## What we take from each reference

| Reference | What's great | What Harbor takes |
|---|---|---|
| **Sanity, marketing site** (sanity.io) | Near-black and white with one hot orange-red; a large, tight grotesk (Waldenburg, 400, −0.04em at 112px); IBM Plex Mono uppercase micro-labels (`CLICK TO INTERACT`, `STATUS:`); pill buttons (orange with black text, white, outline mono); dotted-grid and dashed-hairline panels; real product UI and code shown inside the page | The overall look: tight light-weight headlines, mono uppercase labels, square actions, dotted grids and dashed frames for "staging" areas, product windows framed like the site's demos |
| **Sanity Studio / dashboard** | Structured content: typed fields, validation, document panes side by side, history, Releases (changes shipped together), Presentation (live preview) | Brand Memory as typed sections; the Studio's side-by-side panes (idea → one version per platform with a live preview); draft history; campaign "releases" later. Not its bare visual style |
| **Jasper** | Depth: Canvas (board ↔ table of assets), agent side panel (context chips, questions, run, output card), Brand Voice structure (personality → values → rules → excerpts → sources) with a live preview while creating, guided setup | Information architecture and interaction patterns: board/table toggle, agent panel, voice structure and wizard, output cards with status and rating, onboarding checklists |
| **Original Harbor** (`~/Harbor/docs/design/DESIGN.md`) | Black + zinc, one orange signal, Geist with tight tracking, dithered textures, dark product windows in both themes | Tokens, the signal orange, Geist, the mark |

## Tokens

- **Theme:** light by default; dark is opt-in from the sidebar toggle (saved in the `harbor-theme` cookie, applied as `data-theme="dark"` on `<html>` before render, so there's no flash).
- **Color (light, default):** bg `#fafafa`, panel and sidebar `#ffffff`, raised/sunken `#f4f4f5`, hairline `rgba(10,10,10,.08)`, strong hairline `rgba(10,10,10,.15)`, text `#0a0a0a`, muted `#52525b`, dim `#71717a`.
- **Color (dark):** bg `#0a0a0a`, panel `#111112`, raised `#18181b`, hairline `rgba(255,255,255,.08)`, strong hairline `rgba(255,255,255,.16)`, text `#fafafa`, muted `#a1a1aa`, dim `#71717a`.
- **Palette (from the pixel-key logo of our sister product):** pink `#f78ad9`, violet `#c77dff`, coral `#ff8670`, amber `#ffc13b`, yellow `#ffde2e`, each with a deeper text tone for light mode (e.g. pink `#b4307e`, violet `#7a3fcf`) and soft tints. This replaces Sanity's single orange and is what makes Harbor look like itself.
- **Color roles (colors carry meaning, never decoration):**
  - **Pipeline stages follow the gradient:** Idea pink → Drafting violet → Approved coral → Scheduled amber → Live yellow (square markers on Hub columns and stage labels).
  - **Canvas card kinds:** idea pink, draft violet, signal coral, post amber, note neutral (a small square before the kind label).
  - **Primary action:** pink fill with near-black text. **Focus, selection, active tab:** violet.
  - **Charts:** the growth curve is stroked along the gradient (early = pink, mature = yellow).
  - **Status stays separate:** green (published, connected), amber (needs a look), red (failed).
- **Pixel strip:** five hard-edged squares in the palette order. Used sparingly: next to the wordmark and on agent panels, where Harbor's own intelligence shows up. Never as a smooth gradient fill on buttons or backgrounds.
- **Platform tints:** none. Platforms are named in mono labels, not colored.
- **Type:** Geist (400 for headlines with −0.03 to −0.04em tracking; 500 for UI emphasis), Geist Mono for uppercase micro-labels (11px, +0.08em), IDs, counts, table headers and code.
- **Shape:** square controls: buttons, toggles, inputs, picks, chips, tags and status labels have `0` radius (a deliberate departure from Sanity's pills). Panels and cards `10px`. Hairline borders, no shadows except floating menus.
- **No colored edge accents.** No left/side border in an accent or status color on any element (it reads as generated UI). Status is a small square dot or a label; emphasis is fill or weight; quotes are quote marks.
- **Texture:** dotted grid (Sanity) behind empty states, headers and "Coming next" areas; dashed frames for staging areas (drafts not yet approved, simulated output).

## Product rules

- **Show the real thing.** Empty states show what will appear and how to get there, framed with the dotted grid.
- **Simulated is always labeled.** Anything produced by the simulated model or sandbox publishing carries a mono `SIMULATED` / `SANDBOX` tag. The current mode is always visible in the sidebar.
- **Every idea cites its reason**, shown as a chip linking to the signal.
- **Mono labels name things; headlines say things.** Section titles are statements ("What worked this week"), labels are nouns (`IDEAS`, `DRAFTING`).

## Logo

`brand/harbor-mark.svg` (currentColor; use in UI), `harbor-mark-black.svg`, `harbor-mark-white.svg`, `favicon.svg` (white mark on a black rounded square). The mark is always monochrome; orange stays reserved for signals. Copied unchanged from the original Harbor.
