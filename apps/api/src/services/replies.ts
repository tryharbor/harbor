import { HarborError, ProviderError, newId, postPartSchema, type Platform, type PlatformProvider } from '@harbor/core';
import { STOPWORDS, words } from '@harbor/ai';
import type { ProviderRegistry } from '@harbor/providers';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { getChannelRow, providerContext } from './channels.ts';
import type { PublishDeps } from './publisher.ts';

/**
 * Replies: fetched per post (with the 24h and 72h snapshots, and on demand), classified by kind, and grouped per
 * brand into themes. Each theme is a 'comment' signal, so ideas and the weekly plan can cite what people said.
 * Deterministic: no model call.
 */

export const REPLY_KINDS = ['question', 'objection', 'praise', 'request', 'other'] as const;
export type ReplyKind = (typeof REPLY_KINDS)[number];

const OBJECTION = [/\bbut\b/i, /\btoo expensive\b/i, /\bdoesn['’]t\b/i, /\bwon['’]t\b/i, /\bnot sure\b/i, /\bwhy would\b/i];
const REQUEST = [/\bplease\b/i, /\bwould love\b/i, /\bcan you\b/i, /\bwish\b/i, /\badd\b/i];
const QUESTION_START = /^(how|what|why|does|can|is)\b/i;
const PRAISE = [/\blove\b/i, /\bgreat\b/i, /\bthis is\b/i, /\bso good\b/i, /🔥/u, /👏/u];

/**
 * A reply's kind. Checked in this order, so the more specific reading wins: objection ("but", "too expensive",
 * "doesn't", "won't", "not sure", "why would"), request ("please", "would love", "can you", "wish", "add"),
 * question (a "?", or opening with how/what/why/does/can/is), praise ("love", "great", "this is", "so good", 🔥, 👏).
 */
export function classifyReply(text: string): ReplyKind {
  const t = text.trim();
  if (OBJECTION.some((re) => re.test(t))) return 'objection';
  if (REQUEST.some((re) => re.test(t))) return 'request';
  if (t.includes('?') || QUESTION_START.test(t)) return 'question';
  if (PRAISE.some((re) => re.test(t))) return 'praise';
  return 'other';
}

/** The classifier's cue words say what kind a reply is, not what it is about, so they never name a theme. */
const CUE_WORDS = new Set(['love', 'loved', 'great', 'please', 'wish', 'add', 'sure', 'expensive', 'good', 'thanks', 'thank', 'cool', 'nice', 'awesome']);

function tokens(text: string): string[] {
  const out = new Set<string>();
  for (const w of words(text.replace(/https?:\/\/\S+/g, ' '))) {
    const lw = w.toLowerCase().replace(/['’]s$/, '');
    if (lw.length < 3 || /^\d/.test(lw) || STOPWORDS.has(lw) || CUE_WORDS.has(lw)) continue;
    out.add(lw);
  }
  return [...out];
}

export interface GroupableReply {
  id: string;
  postId: string;
  kind: ReplyKind;
  text: string;
  /** The text of the post it answers. */
  postText: string;
}

export interface ThemeGroup {
  /** `<kind>:<keyword>`, or `<kind>:*` for the kind's replies that share no keyword. */
  key: string;
  kind: ReplyKind;
  keyword?: string;
  replyIds: string[];
  postIds: string[];
}

/**
 * Group one brand's replies into themes: replies of the same kind that share their most informative keyword. A
 * reply's keywords are its non-stopword words that echo the post it answers (all its non-stopword words when none
 * do). Per kind, the keyword shared by the most replies (at least 2; ties alphabetical) takes them as a theme, and
 * so on; what's left is one theme per kind. Largest first.
 */
export function groupThemes(replies: GroupableReply[]): ThemeGroup[] {
  const out: ThemeGroup[] = [];
  for (const kind of REPLY_KINDS) {
    const mine = replies.filter((r) => r.kind === kind);
    const keys = new Map(
      mine.map((r) => {
        const own = tokens(r.text);
        const post = new Set(tokens(r.postText));
        const echo = own.filter((w) => post.has(w));
        return [r.id, new Set(echo.length ? echo : own)];
      }),
    );
    let rest = [...mine];
    for (;;) {
      const df = new Map<string, number>();
      for (const r of rest) for (const k of keys.get(r.id)!) df.set(k, (df.get(k) ?? 0) + 1);
      const [best] = [...df.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (!best) break;
      const taken = rest.filter((r) => keys.get(r.id)!.has(best[0]));
      rest = rest.filter((r) => !taken.includes(r));
      out.push({ key: `${kind}:${best[0]}`, kind, keyword: best[0], replyIds: taken.map((r) => r.id), postIds: [...new Set(taken.map((r) => r.postId))] });
    }
    if (rest.length) out.push({ key: `${kind}:*`, kind, replyIds: rest.map((r) => r.id), postIds: [...new Set(rest.map((r) => r.postId))] });
  }
  return out.sort((a, b) => b.replyIds.length - a.replyIds.length || a.key.localeCompare(b.key));
}

/** "3 people asked about "pricing"", counting distinct authors. */
export function themeLabel(kind: ReplyKind, keyword: string | undefined, people: number): string {
  const who = people === 1 ? '1 person' : `${people} people`;
  const k = keyword ? `"${keyword}"` : undefined;
  switch (kind) {
    case 'question':
      return k ? `${who} asked about ${k}` : `${who} asked a question`;
    case 'objection':
      return k ? `${who} pushed back on ${k}` : `${who} raised an objection`;
    case 'praise':
      return k ? `${who} praised ${k}` : `${who} left praise`;
    case 'request':
      return k ? `${who} asked for more on ${k}` : `${who} made a request`;
    case 'other':
      return k ? `${who} mentioned ${k}` : `${who} replied`;
  }
}

// ---- Storage ----

interface ReplyRow {
  id: string;
  post_id: string;
  brand_id: string;
  platform_reply_id: string;
  author_handle: string;
  author_name: string | null;
  text: string;
  created_at: Date | string;
  likes: number | null;
  kind: ReplyKind;
  theme_signal_id: string | null;
  hidden?: boolean;
  answers?: Answer[] | null;
  removed_at?: Date | string | null;
  post_parts?: unknown;
}

/** The account's own answer to a reply, sent from Harbor. */
export interface Answer {
  platformReplyId: string;
  text: string;
  /** ISO timestamp. */
  at: string;
}

export const toReplyView = (r: ReplyRow) => ({
  id: r.id,
  postId: r.post_id,
  author: { handle: r.author_handle, ...(r.author_name ? { displayName: r.author_name } : {}) },
  text: r.text,
  createdAt: iso(r.created_at),
  ...(r.likes !== null && r.likes !== undefined ? { likes: Number(r.likes) } : {}),
  kind: r.kind,
  ...(r.theme_signal_id ? { themeId: r.theme_signal_id } : {}),
  ...(r.hidden ? { hidden: true } : {}),
  ...(r.answers?.length ? { answers: r.answers } : {}),
});
export type ReplyView = ReturnType<typeof toReplyView>;

export interface Theme {
  /** The theme's 'comment' signal. */
  id: string;
  label: string;
  kind: ReplyKind;
  keyword?: string;
  count: number;
  posts: string[];
  sample: ReplyView[];
}

const SELECT_REPLIES = `
  SELECT r.*, d.parts AS post_parts FROM post_replies r
  JOIN posts p ON p.id = r.post_id LEFT JOIN drafts d ON d.id = p.draft_id`;
/** Deleted replies keep a row (so a later fetch can't bring them back) and are left out everywhere else. */
const LIVE = 'removed_at IS NULL';

const firstPart = (parts: unknown) => postPartSchema.array().catch([]).parse(parts ?? [])[0]?.text ?? '';

/** Regroup every reply of a brand into themes, upsert one comment signal per theme and drop themes that are gone. */
export async function regroupBrandThemes(db: Db, brandId: string): Promise<number> {
  const rows = await db.query<ReplyRow>(`${SELECT_REPLIES} WHERE r.brand_id = $1 AND r.${LIVE} ORDER BY r.created_at, r.id`, [brandId]);
  const groups = groupThemes(rows.map((r) => ({ id: r.id, postId: r.post_id, kind: r.kind, text: r.text, postText: firstPart(r.post_parts) })));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const g of groups) {
    const replies = g.replyIds.map((id) => byId.get(id)!);
    const people = new Set(replies.map((r) => r.author_handle)).size;
    const summary = themeLabel(g.kind, g.keyword, people);
    const source = { theme: g.key, replyKind: g.kind, ...(g.keyword ? { keyword: g.keyword } : {}), postIds: g.postIds.slice(0, 50), replyIds: g.replyIds.slice(0, 50) };
    const data = { kind: g.kind, keyword: g.keyword ?? null, count: replies.length, people, sample: replies.slice(-3).map((r) => r.text) };
    const observedAt = replies.reduce((max, r) => Math.max(max, new Date(r.created_at).getTime()), 0);
    const [sig] = await db.query<{ id: string }>(
      `INSERT INTO signals (id, brand_id, kind, summary, source, data, observed_at) VALUES ($1, $2, 'comment', $3, $4, $5, $6)
       ON CONFLICT (brand_id, (source->>'theme')) WHERE kind = 'comment'
       DO UPDATE SET summary = EXCLUDED.summary, source = EXCLUDED.source, data = EXCLUDED.data, observed_at = EXCLUDED.observed_at
       RETURNING id`,
      [newId('signal'), brandId, summary, JSON.stringify(source), JSON.stringify(data), new Date(observedAt || Date.now()).toISOString()],
    );
    await db.query('UPDATE post_replies SET theme_signal_id = $2 WHERE id = ANY($1::text[])', [g.replyIds, sig!.id]);
  }
  await db.query(
    `DELETE FROM signals WHERE brand_id = $1 AND kind = 'comment' AND source->>'theme' IS NOT NULL AND NOT (source->>'theme' = ANY($2::text[]))`,
    [brandId, groups.map((g) => g.key)],
  );
  return groups.length;
}

/**
 * Store replies from the platform (updating ones seen before) with their kind. A reply Harbor deleted stays deleted,
 * and where the platform doesn't say whether a reply is hidden, the stored answer stands. Returns how many were new.
 */
export async function upsertReplies(db: Db, post: { id: string; brandId: string }, replies: Awaited<ReturnType<NonNullable<PlatformProvider['fetchReplies']>>>): Promise<number> {
  let added = 0;
  for (const r of replies) {
    const [row] = await db.query<{ inserted: boolean }>(
      `INSERT INTO post_replies (id, post_id, brand_id, platform_reply_id, author_handle, author_name, text, created_at, likes, kind, hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::boolean, false))
       ON CONFLICT (post_id, platform_reply_id) DO UPDATE SET author_handle = EXCLUDED.author_handle, author_name = EXCLUDED.author_name,
         text = EXCLUDED.text, likes = EXCLUDED.likes, kind = EXCLUDED.kind, hidden = COALESCE($11::boolean, post_replies.hidden), fetched_at = now()
         WHERE post_replies.removed_at IS NULL
       RETURNING (xmax = 0) AS inserted`,
      [newId('reply'), post.id, post.brandId, r.platformReplyId, r.author.handle, r.author.displayName ?? null, r.text, r.createdAt, r.likes ?? null, classifyReply(r.text), r.hidden ?? null],
    );
    if (row?.inserted) added++;
  }
  return added;
}

/** Whether Harbor can read replies for this provider. */
export const supportsReplies = (provider: PlatformProvider | undefined): provider is PlatformProvider & Required<Pick<PlatformProvider, 'fetchReplies'>> =>
  !!provider && provider.reportsReplies && typeof provider.fetchReplies === 'function';

interface PostRef {
  id: string;
  brand_id: string;
  channel_id: string;
  status: string;
  platform: Platform;
  platform_post_id: string | null;
  published_at: Date | string | null;
  parts: unknown;
}

async function postRef(db: Db, postId: string): Promise<PostRef> {
  const [row] = await db.query<PostRef>(
    `SELECT p.id, p.brand_id, p.channel_id, p.status, ch.platform, p.platform_post_id, p.published_at, d.parts
     FROM posts p JOIN channels ch ON ch.id = p.channel_id LEFT JOIN drafts d ON d.id = p.draft_id WHERE p.id = $1`,
    [postId],
  );
  if (!row) throw new HarborError('NOT_FOUND', `Post ${postId} not found.`);
  return row;
}

/**
 * Fetch a published post's replies from its platform and regroup the brand's themes (`regroup: false` skips that,
 * for batch callers). Does nothing on a platform that doesn't report replies.
 */
export async function refreshPostReplies(deps: PublishDeps, postId: string, opts: { regroup?: boolean } = {}): Promise<{ supported: boolean; added: number }> {
  const { db } = deps;
  const post = await postRef(db, postId);
  const provider = deps.registry.get(post.platform);
  if (!supportsReplies(provider)) return { supported: false, added: 0 };
  if (post.status !== 'published' || !post.platform_post_id || !post.published_at) {
    throw new HarborError('INVALID_REQUEST', `Post ${post.id} is ${post.status}; replies can only be fetched for published posts.`);
  }
  const channel = await getChannelRow(db, post.channel_id);
  // publishedAt and parts let the sandbox write replies that fit the post; real providers ignore both.
  const parts = postPartSchema.array().catch([]).parse(post.parts ?? []);
  const ctx = await providerContext(db, deps.secrets, provider, channel, { settings: { publishedAt: iso(post.published_at), parts } });
  const replies = await provider.fetchReplies(ctx, post.platform_post_id, { limit: 100 });
  const added = await upsertReplies(db, { id: post.id, brandId: post.brand_id }, replies);
  if (opts.regroup !== false) await regroupBrandThemes(db, post.brand_id);
  return { supported: true, added };
}

/** Build theme views from replies in scope; `prefer` puts one post's replies first in the samples. */
async function buildThemes(db: Db, rows: ReplyRow[], prefer?: string): Promise<Theme[]> {
  const ids = [...new Set(rows.map((r) => r.theme_signal_id).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const signals = await db.query<{ id: string; source: { replyKind?: ReplyKind; keyword?: string } | null }>('SELECT id, source FROM signals WHERE id = ANY($1::text[])', [ids]);
  const out: Theme[] = [];
  for (const s of signals) {
    const mine = rows.filter((r) => r.theme_signal_id === s.id);
    const kind = s.source?.replyKind ?? mine[0]!.kind;
    const keyword = s.source?.keyword;
    const sample = [...mine]
      .sort((a, b) => Number(b.post_id === prefer) - Number(a.post_id === prefer) || (b.likes ?? 0) - (a.likes ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3)
      .map(toReplyView);
    out.push({
      id: s.id,
      label: themeLabel(kind, keyword, new Set(mine.map((r) => r.author_handle)).size),
      kind,
      ...(keyword ? { keyword } : {}),
      count: mine.length,
      posts: [...new Set(mine.map((r) => r.post_id))],
      sample,
    });
  }
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** What Harbor can do with replies on a platform, besides reading them. */
export interface ReplyActions {
  respond: boolean;
  hide: boolean;
  remove: boolean;
}
export const replyActions = (provider: PlatformProvider | undefined): ReplyActions => ({
  respond: typeof provider?.respondToReply === 'function',
  hide: typeof provider?.setReplyHidden === 'function',
  remove: typeof provider?.deleteReply === 'function',
});

/** GET /v1/posts/:id/replies: the post's replies (newest first), the brand's themes they belong to, and what Harbor can do with them. */
export async function postReplies(db: Db, registry: ProviderRegistry, postId: string): Promise<{ data: ReplyView[]; themes: Theme[]; supported: boolean; actions: ReplyActions }> {
  const post = await postRef(db, postId);
  const rows = await db.query<ReplyRow>(`SELECT * FROM post_replies WHERE post_id = $1 AND ${LIVE} ORDER BY created_at DESC, id`, [post.id]);
  const themeIds = [...new Set(rows.map((r) => r.theme_signal_id).filter((x): x is string => !!x))];
  const inThemes = themeIds.length ? await db.query<ReplyRow>(`SELECT * FROM post_replies WHERE theme_signal_id = ANY($1::text[]) AND ${LIVE}`, [themeIds]) : [];
  const provider = registry.get(post.platform);
  return { data: rows.map(toReplyView), themes: await buildThemes(db, inThemes, post.id), supported: supportsReplies(provider), actions: replyActions(provider) };
}

// ---- Managing replies (answer, hide, delete) ----

const PLATFORM_NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };

/** A live reply with its post, the platform's provider and a context for the post's account. */
async function managedReply(deps: PublishDeps, replyId: string) {
  const { db } = deps;
  const [row] = await db.query<ReplyRow>(`SELECT * FROM post_replies WHERE id = $1 AND ${LIVE}`, [replyId]);
  if (!row) throw new HarborError('NOT_FOUND', `Reply ${replyId} not found.`);
  const post = await postRef(db, row.post_id);
  const provider = deps.registry.get(post.platform);
  if (!provider) throw new HarborError('INVALID_REQUEST', `No provider for ${post.platform}.`);
  const ctx = await providerContext(db, deps.secrets, provider, await getChannelRow(db, post.channel_id));
  return { row, post, provider, ctx, platformName: PLATFORM_NAME[post.platform] };
}

/** A platform's refusal (a deleted comment, an expired token, a rate limit) as a 400 the person can read, not a 500. */
async function onPlatform<T>(platformName: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof ProviderError) throw new HarborError('INVALID_REQUEST', `${platformName} refused: ${err.message}`);
    throw err;
  }
}

/** Answer a reply as the post's account, and keep the answer on the reply. */
export async function respondToReply(deps: PublishDeps, replyId: string, text: string): Promise<string> {
  const { row, provider, ctx, platformName } = await managedReply(deps, replyId);
  if (!provider.respondToReply) throw new HarborError('INVALID_REQUEST', `Harbor can't answer replies on ${platformName}.`);
  const { platformReplyId } = await onPlatform(platformName, () => provider.respondToReply!(ctx, row.platform_reply_id, text));
  const answer: Answer = { platformReplyId, text, at: new Date().toISOString() };
  await deps.db.query(`UPDATE post_replies SET answers = answers || $2::jsonb WHERE id = $1`, [row.id, JSON.stringify([answer])]);
  return row.post_id;
}

/** Hide a reply on its platform, or show it again. */
export async function setReplyHidden(deps: PublishDeps, replyId: string, hidden: boolean): Promise<string> {
  const { row, provider, ctx, platformName } = await managedReply(deps, replyId);
  if (!provider.setReplyHidden) throw new HarborError('INVALID_REQUEST', `Harbor can't hide replies on ${platformName}.`);
  await onPlatform(platformName, () => provider.setReplyHidden!(ctx, row.platform_reply_id, hidden));
  await deps.db.query('UPDATE post_replies SET hidden = $2 WHERE id = $1', [row.id, hidden]);
  return row.post_id;
}

/** Delete a reply from its platform. Harbor keeps only a marker (no text), so the next fetch doesn't bring it back. */
export async function deleteReply(deps: PublishDeps, replyId: string): Promise<string> {
  const { row, provider, ctx, platformName } = await managedReply(deps, replyId);
  if (!provider.deleteReply) throw new HarborError('INVALID_REQUEST', `Harbor can't delete replies on ${platformName}.`);
  await onPlatform(platformName, () => provider.deleteReply!(ctx, row.platform_reply_id));
  await deps.db.query(
    `UPDATE post_replies SET removed_at = now(), text = '', author_name = NULL, answers = '[]'::jsonb, theme_signal_id = NULL WHERE id = $1`,
    [row.id],
  );
  await regroupBrandThemes(deps.db, row.brand_id);
  return row.post_id;
}

/** GET /v1/brands/:id/conversation: themes over the last `days` days (by reply time), largest first. */
export async function brandConversation(db: Db, brandId: string, days: number): Promise<{ themes: Theme[]; total: number; byKind: Record<ReplyKind, number> }> {
  const rows = await db.query<ReplyRow>(
    `SELECT * FROM post_replies WHERE brand_id = $1 AND ${LIVE} AND created_at >= now() - make_interval(days => $2) ORDER BY created_at DESC, id`,
    [brandId, days],
  );
  const byKind = Object.fromEntries(REPLY_KINDS.map((k) => [k, 0])) as Record<ReplyKind, number>;
  for (const r of rows) byKind[r.kind]++;
  return { themes: await buildThemes(db, rows), total: rows.length, byKind };
}
