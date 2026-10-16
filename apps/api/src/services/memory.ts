import { HarborError, brandMemorySchema, postPartSchema, type Brand, type BrandMemory, type Evidence, type Platform, type PostPart } from '@harbor/core';
import type { TraceItem } from '@harbor/ai';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { DEFAULT_MAX, loadDraft } from './drafts.ts';
import { loadIdea } from './ideas.ts';
import { applyChange, inTarget, saveMemory, type MemoryTarget } from './memory-proposals.ts';
import { loadPost } from './posts.ts';
import { withRun, type RunInfo } from './runs.ts';

/** Save to Brand Memory (one action on a post, reply, theme, signal or draft) and Preview Brand Memory. */

export const SAVE_SOURCES = ['post', 'reply', 'theme', 'signal', 'draft'] as const;
export const SAVE_AS = ['knowledge', 'excerpt', 'example', 'do', 'avoid'] as const;
export type SaveSource = (typeof SAVE_SOURCES)[number];
export type SaveAs = (typeof SAVE_AS)[number];

const TARGET: Record<SaveAs, MemoryTarget> = { knowledge: 'knowledge', excerpt: 'voice.excerpts', example: 'examplePosts', do: 'voice.do', avoid: 'voice.avoid' };

export interface SaveInput {
  from: { kind: SaveSource; id: string };
  as: SaveAs;
  /** Overrides the source's text. */
  text?: string;
  note?: string;
  title?: string;
}

interface Source {
  brandId: string;
  text: string;
  platform?: Platform;
  url?: string;
  /** Where it came from, for the knowledge note: a URL or "<kind> <id>". */
  link: string;
  posts: string[];
  signals: string[];
}

const firstPart = (parts: PostPart[]) => parts[0]?.text.trim() ?? '';

async function postSignal(db: Db, brandId: string, postId: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>("SELECT id FROM signals WHERE brand_id = $1 AND kind = 'post_performance' AND source->>'postId' = $2", [brandId, postId]);
  return rows.map((r) => r.id);
}

async function loadSource(db: Db, from: SaveInput['from']): Promise<Source> {
  switch (from.kind) {
    case 'post': {
      const p = await loadPost(db, from.id);
      return { brandId: p.brandId, text: firstPart(p.parts), platform: p.channel.platform as Platform, url: p.url, link: p.url ?? `post ${p.id}`, posts: [p.id], signals: await postSignal(db, p.brandId, p.id) };
    }
    case 'reply': {
      const [r] = await db.query<{ id: string; brand_id: string; post_id: string; text: string; theme_signal_id: string | null; url: string | null; platform: Platform }>(
        `SELECT r.id, r.brand_id, r.post_id, r.text, r.theme_signal_id, p.url, ch.platform
         FROM post_replies r JOIN posts p ON p.id = r.post_id JOIN channels ch ON ch.id = p.channel_id WHERE r.id = $1`,
        [from.id],
      );
      if (!r) throw new HarborError('NOT_FOUND', `Reply ${from.id} not found.`);
      return { brandId: r.brand_id, text: r.text.trim(), platform: r.platform, link: r.url ?? `reply ${r.id}`, posts: [r.post_id], signals: r.theme_signal_id ? [r.theme_signal_id] : [] };
    }
    case 'theme':
    case 'signal': {
      const [s] = await db.query<{ id: string; brand_id: string; kind: string; summary: string; source: { postId?: string; postIds?: string[]; replyIds?: string[]; url?: string; theme?: string } | null }>(
        'SELECT id, brand_id, kind, summary, source FROM signals WHERE id = $1',
        [from.id],
      );
      if (!s || (from.kind === 'theme' && !(s.kind === 'comment' && s.source?.theme))) throw new HarborError('NOT_FOUND', `${from.kind === 'theme' ? 'Theme' : 'Signal'} ${from.id} not found.`);
      let text = s.summary.trim();
      if (from.kind === 'theme') {
        const sample = await db.query<{ text: string }>('SELECT text FROM post_replies WHERE theme_signal_id = $1 ORDER BY likes DESC NULLS LAST, created_at DESC LIMIT 3', [s.id]);
        if (sample.length) text = `${text}:\n${sample.map((r) => `"${r.text.trim()}"`).join('\n')}`;
      }
      const posts = s.source?.postIds ?? (s.source?.postId ? [s.source.postId] : []);
      return { brandId: s.brand_id, text, url: s.source?.url, link: s.source?.url ?? `${from.kind} ${s.id}`, posts, signals: [s.id] };
    }
    case 'draft': {
      const d = await loadDraft(db, from.id);
      return { brandId: d.brandId, text: firstPart(d.parts), platform: d.platform, link: `draft ${d.id}`, posts: [], signals: [] };
    }
  }
}

/**
 * POST /v1/brands/:id/memory/save. Rule-shaped saves (do, avoid, excerpt) write evidence with source 'saved' that
 * links the post and the signal behind it; knowledge notes and example posts carry their source in the item.
 * 400 for a source from another brand, 409 when the same text is already in the target.
 */
export async function saveToMemory(db: Db, brand: Brand, input: SaveInput): Promise<{ memory: BrandMemory; saved: { target: MemoryTarget; text: string } }> {
  const src = await loadSource(db, input.from);
  if (src.brandId !== brand.id) throw new HarborError('INVALID_REQUEST', `That ${input.from.kind} belongs to another brand.`);
  const text = (input.text ?? src.text).trim();
  if (!text) throw new HarborError('INVALID_REQUEST', `text: the ${input.from.kind} has no text to save; give text.`);
  const target = TARGET[input.as];
  if (inTarget(brand.memory, target, text)) throw new HarborError('CONFLICT', `That text is already in ${brand.name}'s ${target}.`);
  const note = input.note?.trim() || undefined;
  const memory = applyChange(brand.memory, {
    op: 'add',
    target,
    text,
    title: input.title,
    body: [text, note, `Saved from ${input.from.kind} ${src.link}`].filter(Boolean).join('\n\n'),
    platform: src.platform,
    url: src.url,
    note,
    excerptSource: `Saved from ${input.from.kind}`,
    evidence: { posts: src.posts, signals: src.signals, ...(note ? { note } : {}), source: 'saved', at: new Date().toISOString() },
  });
  return { memory: await saveMemory(db, brand.id, memory), saved: { target, text } };
}

// ---- Preview ----

export type AppliedRule = TraceItem & { evidence?: Evidence };

export interface PreviewInput {
  ideaId?: string;
  brief?: string;
  platform: Platform;
}

/** A brief as an idea: the first sentence (or line) is the title, the rest the angle. */
function briefIdea(brief: string): { title: string; angle: string } {
  const flat = brief.trim();
  const m = /^(.+?[.!?])(\s|$)/s.exec(flat.split('\n')[0] ?? flat);
  const title = (m?.[1] ?? flat.split('\n')[0] ?? flat).trim();
  return { title: title.slice(0, 300), angle: flat.slice(title.length).trim().slice(0, 4000) };
}

/**
 * POST /v1/brands/:id/memory/preview: the same brief drafted with the brand's Brand Memory and with an empty one
 * (same name), plus which rules fired, each with its evidence. One 'preview' run (source 'studio'); no drafts saved.
 */
export async function previewMemory(
  deps: Pick<AppDeps, 'db' | 'model' | 'registry'>,
  brand: Brand,
  input: PreviewInput,
): Promise<{ platform: Platform; with: { parts: PostPart[] }; without: { parts: PostPart[] }; applied: AppliedRule[]; run: RunInfo }> {
  const { db, model } = deps;
  let idea: { title: string; angle: string };
  if (input.ideaId) {
    const i = await loadIdea(db, input.ideaId);
    if (i.brandId !== brand.id) throw new HarborError('INVALID_REQUEST', `Idea ${i.id} belongs to another brand.`);
    idea = { title: i.title, angle: i.angle };
  } else if (input.brief?.trim()) idea = briefIdea(input.brief);
  else throw new HarborError('INVALID_REQUEST', 'Give ideaId or brief.');
  const maxLength = deps.registry.get(input.platform)?.maxLength() ?? DEFAULT_MAX[input.platform];
  const bare: Brand = { ...brand, memory: brandMemorySchema.parse({}) };
  const runInput = { platform: input.platform, ...(input.ideaId ? { ideaId: input.ideaId } : { brief: idea.title }) };
  const { value, run } = await withRun(db, brand, 'preview', runInput, model.name, async () => {
    const withMemory = await model.draft({ brand, idea, platform: input.platform, maxLength });
    const without = await model.draft({ brand: bare, idea, platform: input.platform, maxLength });
    const value = { with: postPartSchema.array().parse(withMemory.result), without: postPartSchema.array().parse(without.result), trace: withMemory.trace ?? [] };
    return { value, calls: [withMemory, without], output: { platform: input.platform, applied: value.trace.length } };
  }, { source: 'studio' });
  const evidence = brand.memory.voice.evidence;
  const applied = value.trace.map((t): AppliedRule => {
    const e = [...evidence].reverse().find((x) => x.kind === t.kind && x.rule === t.text);
    return e ? { ...t, evidence: e } : { ...t };
  });
  return { platform: input.platform, with: { parts: value.with }, without: { parts: value.without }, applied, run };
}
