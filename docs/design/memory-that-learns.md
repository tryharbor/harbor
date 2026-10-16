# Brand Memory that learns: contract

Status: build contract, 2026-10-15. The API (apps/api) implements it, and the web app (apps/web) consumes it.

Jasper's voices, audiences and agents never learn from how posts did (teardown §6, "Avoid"). Harbor closes that loop. Results become proposed Brand Memory changes, every rule links to its evidence, and the owner approves each change, the same way they approve posts (decision 0003).

## Pieces

| Piece | Reference | Harbor's version |
|---|---|---|
| Voice refresh | Jasper voice structure (values, do/avoid, excerpts) | An agent compares winners and losers against the brand's median and proposes changes to the voice, each with evidence |
| Evidence | Jasper's "sources" list on a voice | Every rule carries the posts and signals behind it, plus where it came from (learned, refresh, saved, owner) |
| Save to Brand Memory | Jasper "Add to Knowledge Base" on any asset | One action on a post, reply or reply theme, signal or draft. It saves as a knowledge note, an excerpt, an example post, or a do or avoid rule |
| Preview Brand Memory | Jasper "Preview Brand Voice": with vs. without | The same brief drafted with and without memory, and which rules fired, each linked to its evidence |
| Replies | Teardown: objections and hooks ranked by what actually got replies | Replies are fetched per post and grouped into themes (question, objection, praise, request). Themes become `comment` signals that ideas and the weekly plan can cite. |
| Import past posts | Jasper "We found N sources, uncheck any" review step | Scan a channel's recent posts, review the list (uncheck to exclude), then import them so a new brand has history on day one |

## 1. Evidence on Brand Memory

Add an optional field to `brandVoiceSchema` in packages/core/src/memory.ts. It defaults to `[]`; old documents parse unchanged, and PATCH keeps the merge-by-top-level-key behavior.

```ts
evidence: {
  /** Exactly the rule's text as stored in voice.do / voice.avoid / voice.bannedWords / voice.values[].name / voice.excerpts[].text. */
  rule: string;
  kind: 'do' | 'avoid' | 'banned' | 'value' | 'excerpt';
  posts: string[];      // post ids (≤ 12)
  signals: string[];    // signal ids (≤ 12)
  /** e.g. "Posts opening in the first person did 1.6× the median (5 vs 7 posts)". */
  note?: string;
  source: 'learned' | 'refresh' | 'saved' | 'owner';
  at: string;           // ISO
}[]
```

Evidence for a rule that no longer exists is dropped on save. If the owner edits a rule's text, its evidence no longer matches, and that's acceptable.

## 2. Voice refresh agent and memory proposals

- **The agent:** a new built-in agent `voice_refresh` (category `'review'`, name "Voice refresh"). Inputs: brandId*. Produces: `['report', 'approvals']`. Triggers: manual, schedule.
- **Steps:**
  1. `outcomes`: refresh verdicts.
  2. `compare`: winners vs. losers.
  3. `rules`: check the current rules.
  4. `propose`: draft the changes.
  5. `queue`: send them for approval.
- **Analysis (deterministic, in `services/voice-learning.ts`):**
  - Use the brand's published posts with an outcome from the last 90 days.
  - Features per post (first part):
    - first-person opening ("I ", "I'm", "My "), opens with a number, opens with a question
    - contains a list (lines starting with "-", "•" or "1.")
    - a link in the first part, any hashtag, an emoji
    - length bucket (short < 120 chars / long > 400)
    - a thread (more than one part), ends with a question
  - The lift of a feature is median(ratio of posts with it) / median(ratio of posts without it). It only counts when each side has at least 3 posts.
  - Lift ≥ 1.25 → propose a `do` rule. Lift ≤ 0.8 → propose an `avoid` rule. Skip it when an equivalent rule already exists (case-insensitive substring of a canonical phrase per feature).
  - When an existing `do` rule maps to a feature whose lift is ≤ 0.8, propose removing it. Do the same for an `avoid` rule mapping to a lift ≥ 1.25.
  - Propose adding the best sentence of the top 1–2 outperforming posts as `excerpts`, unless an excerpt is already that text.
  - At most 6 changes per run.
- **Wording:** a new ContentModel method, `refineVoiceChanges(input: { brandName, voice, changes: DraftChange[] }) => ModelResult<DraftChange[]>`. The simulated model polishes the rule wording from templates and is deterministic. `anthropic.ts` stubs it like the others.
- **Storage:** a new table `memory_proposals`:
  - columns: `id` (prefix `mpr`), `workspace_id`, `brand_id`, `run_id`, `agent_id`, `status` ('pending', 'applied' or 'rejected'), `changes jsonb`, `created_at`, `decided_at`
  - shape:

```ts
type MemoryChange = {
  id: string;                       // short id within the proposal
  op: 'add' | 'remove';
  target: 'voice.do' | 'voice.avoid' | 'voice.excerpts' | 'voice.bannedWords' | 'knowledge' | 'examplePosts';
  text: string;                     // the rule / excerpt / note text
  why: string;                      // one sentence with the numbers
  lift?: number;                    // e.g. 1.6
  evidence: { posts: { id: string; text: string; platform: Platform; ratio?: number; verdict?: string }[]; signals: string[] };
  status: 'pending' | 'accepted' | 'rejected';
};
type MemoryProposal = { id: string; brandId: string; brandName: string; runId?: string; agentId?: string; status: 'pending' | 'applied' | 'rejected'; changes: MemoryChange[]; createdAt: string; decidedAt?: string };
```

- **Endpoints:**
  - `GET /v1/memory-proposals?status=pending&brandId=` → `{ data: MemoryProposal[], counts: { pending, applied, rejected } }`
  - `POST /v1/memory-proposals/:id/apply` with `{ accept: string[], reject?: string[] }`
    - Accepted changes merge into Brand Memory and write evidence with `source: 'refresh'`.
    - Changes not listed are rejected.
    - The proposal becomes `applied`, or `rejected` if nothing was accepted.
    - Returns `{ proposal, memory }`. A proposal that is no longer pending returns 409 CONFLICT.
- **Counts and listings:** approval counts stay post-only. The web app reads both counts.
- **MCP:** gains `list_memory_proposals` (read), and `run_agent` can run voice_refresh.

## 3. Save to Brand Memory

`POST /v1/brands/:id/memory/save` with:
```ts
{ from: { kind: 'post' | 'reply' | 'theme' | 'signal' | 'draft'; id: string }, as: 'knowledge' | 'excerpt' | 'example' | 'do' | 'avoid', text?: string /* override */, note?: string, title?: string }
```
- The text defaults to the source's text: a post's first part, a reply's text, a theme's label plus sample replies, a signal's summary, a draft's first part.
- As `knowledge` it becomes a note: the title defaults to the first 80 characters, and the body is the text plus "Saved from <kind> <link>".
- As `example` it becomes examplePosts with the platform.
- As `excerpt`, `do` or `avoid` it is added to the voice.
- It always writes evidence with `source: 'saved'`, linking the post, or the signal behind a reply or theme.
- Returns `{ memory, saved: { target, text } }`.
- Rejects a source from another brand with 400. Rejects a duplicate (same text already in the target) with 409.
- MCP: `add_knowledge` stays, and a new write tool `save_to_memory` mirrors this endpoint.

## 4. Preview Brand Memory

`POST /v1/brands/:id/memory/preview` with `{ ideaId?: string, brief?: string, platform: Platform }` (ideaId or brief is required):
- It drafts twice with the brand's model: once with the brand as it is, once with an empty Brand Memory (same name).
- Returns:
```ts
{ platform, with: { parts: PostPart[] }, without: { parts: PostPart[] }, applied: { kind: 'do'|'avoid'|'banned'|'excerpt'|'term'|'product'|'audience'|'value'; text: string; evidence?: Evidence }[], run: RunInfo }
```
- `applied` comes from the model: add an optional `trace?: { kind; text }[]` to `ModelResult`. The simulated model's draft fills it with the rules and terms it actually used, and the API attaches the matching evidence.
- It records one run with kind 'preview' (add to the kind check) and source 'studio'. It persists no drafts.

## 5. Replies and themes

- **Core:** a `Reply` type `{ platformReplyId, author: { handle, displayName? }, text, createdAt, likes? }`, and an optional provider method `fetchReplies?(ctx, platformPostId, opts: { limit?: number }): Promise<Reply[]>`. Also `readonly reportsReplies: boolean` on the provider metadata used by `/v1/platforms`. Per platform:
  - **sandbox:** deterministic replies seeded from the post id and text, numbering roughly its comment count (capped at 25), mixing questions, objections, praise and requests that echo words from the post.
  - **threads:** `GET /{media-id}/replies?fields=id,text,username,timestamp`.
  - **instagram:** `GET /{media-id}/comments?fields=id,text,username,timestamp,like_count`.
  - **x:** `GET /2/tweets/search/recent?query=conversation_id:<id>`, only when `HARBOR_X_READ_REPLIES=true`, since X bills per read. Otherwise `[]`, and `reportsReplies` is false.
  - **linkedin:** not implemented (`reportsReplies: false`); restricted API.
  - Unit tests use the existing mocked-HTTP pattern.
- **Storage:** a new table `post_replies`:
  - columns: `id` (prefix `rpl`), `post_id`, `brand_id`, `platform_reply_id`, `author_handle`, `author_name`, `text`, `created_at`, `likes`, `kind` ('question', 'objection', 'praise', 'request' or 'other'), `theme_signal_id`, `fetched_at`
  - unique on (post_id, platform_reply_id)
- **Classifying and grouping (deterministic, in `services/replies.ts`):**
  - Kind:
    - question: contains "?", or starts with how/what/why/does/can/is
    - objection: "but", "too expensive", "doesn't", "won't", "not sure", "why would"
    - praise: "love", "great", "this is", "so good", "🔥", "👏"
    - request: "please", "would love", "can you", "wish", "add"
  - Themes:
    - Per brand, group replies of the same kind that share their most informative keyword. Use the top non-stopword appearing in ≥2 replies; otherwise one theme per kind.
    - Each theme is upserted as a signal of kind 'comment', with source `{ theme, replyKind, keyword, postIds, replyIds }` and a summary like `"3 people asked how the growth curve is measured"`.
  - Ideas generation already reads signals, so themes flow into ideas and the weekly plan.
- **When replies are fetched:** with the 24h and 72h snapshots, when the provider reports replies. Also on demand.
- **Endpoints:**
  - `GET /v1/posts/:id/replies` → `{ data: ReplyView[], themes: Theme[], supported: boolean }`
  - `POST /v1/posts/:id/replies/refresh` → the same response
  - `GET /v1/brands/:id/conversation?days=30` → `{ themes: Theme[], total: number, byKind: Record<kind, number> }`, themes sorted by count
- **Shapes:**
  - `ReplyView = { id, postId, author: { handle, displayName? }, text, createdAt, likes?, kind, themeId? }`
  - `Theme = { id /* signal id */, label, kind, keyword?, count, posts: string[], sample: ReplyView[] (≤3) }`
- **MCP:** a read tool `get_conversation {brandId}`.
- **Seed:** demo posts get replies, so both brands show themes.

## 6. Import past posts

- **Provider:** an optional `listRecentPosts?(ctx, opts: { limit: number }): Promise<{ platformPostId, text, parts?: string[], publishedAt, url?, metrics?: NormalizedMetrics }[]>`.
  - sandbox: deterministic, 20–40 plausible posts over the last 60 days, using the brand voice/examples when available.
  - threads: `/me/threads`.
  - instagram: `/me/media` with caption.
  - x: `/2/users/:id/tweets`, only with `HARBOR_X_READ_REPLIES=true`.
  - linkedin: not implemented.
- **Endpoints:**
  - `POST /v1/channels/:id/import/scan` with `{ limit?: number (≤50, default 30) }` → `{ scanId, channelId, supported, found: { platformPostId, text, publishedAt, url?, metrics?, alreadyImported: boolean }[] }`. Scans are stored in `import_scans` (jsonb, expires in 1h).
  - `POST /v1/channels/:id/import` with `{ scanId, include: string[] /* platformPostIds */ }` → `{ imported: number, skipped: number, postIds: string[] }`
- **What an import creates:**
  - Imported posts are `published`, with `origin = 'imported'` (new column, default 'harbor') and `published_at` from the platform.
  - Each gets one snapshot from the scanned metrics, at its true age, with `adapter_version = 'import'`.
  - No snapshot jobs are created for ages already past.
- **Outcomes:** when a post has no snapshot near the target age, a snapshot at an age ≥ 168h counts as the 168h value. Document this in outcomes.ts: most engagement lands within a week. This lets imported posts take part in verdicts and in voice refresh.
- **UI flow:** after an import the UI offers "Refresh the voice from these".

## Tests

- Voice-refresh analysis:
  - lift math
  - thresholds
  - minimum of 3 per side
  - skips existing rules
  - proposes removing a contradicted rule
- Applying a proposal:
  - partial accept writes evidence
  - a non-pending proposal returns 409
- Save to memory:
  - each `as`
  - duplicate returns 409
  - cross-brand returns 400
- Preview returns both drafts and a non-empty `applied` for a brand with rules.
- Replies:
  - kind classification
  - theme grouping and the signal upsert
  - the sandbox provider is deterministic
  - instagram/threads use mocked HTTP
- Import:
  - scan, review, import
  - alreadyImported is flagged on rescan
  - imported posts get verdicts
