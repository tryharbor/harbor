import { HarborError, PLATFORMS, newId, shortId, type Brand, type Platform, type PostPart } from '@harbor/core';
import type { ModelResult, RewriteInstruction } from '@harbor/ai';
import type { AppDeps } from '../app.ts';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { DEFAULT_MAX, insertDraft } from './drafts.ts';
import { insertIdea } from './ideas.ts';
import { withRun, type RunInfo } from './runs.ts';

/**
 * The social assistant: a chat that turns "I want to post about X" into three post options, each with drafts for
 * the chosen platforms and a design built from Business Memory → Branding. Follow-ups rework the latest options
 * ("shorter", "punchier", "more specific", "other hooks", "different angles"). Choosing an option creates an idea with
 * its drafts in Studio. Nothing here schedules or publishes (decision 0003).
 *
 * Intent is read from the message with plain rules, so the assistant works the same with the simulated model; the
 * writing itself is the content model's (draft, rewrite).
 */

export const DESIGN_LAYOUTS = ['headline', 'quote', 'list'] as const;
export type DesignLayout = (typeof DESIGN_LAYOUTS)[number];

export interface PostOption {
  id: string;
  /** Which angle it takes, e.g. 'story'. */
  kind: string;
  /** Short name shown on the card, e.g. "Story". */
  label: string;
  title: string;
  angle: string;
  design: { layout: DesignLayout; headline: string; sub?: string };
  drafts: { platform: Platform; parts: PostPart[] }[];
  /** Set once the owner picks it: the idea it became. */
  ideaId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  options?: PostOption[];
  runId?: string;
  model?: string;
  simulated?: boolean;
}

export interface Chat {
  id: string;
  brandId: string;
  title: string;
  platforms: Platform[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ChatRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  title: string;
  platforms: unknown;
  messages: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

const toChat = (r: ChatRow): Chat => ({
  id: r.id,
  brandId: r.brand_id,
  title: r.title,
  platforms: (Array.isArray(r.platforms) ? r.platforms : []) as Platform[],
  messages: (Array.isArray(r.messages) ? r.messages : []) as ChatMessage[],
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function loadChat(db: Db, id: string): Promise<Chat> {
  const [row] = await db.query<ChatRow>('SELECT * FROM assistant_chats WHERE id = $1', [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Chat ${id} not found.`);
  return toChat(row);
}

export async function listChats(db: Db, brandId?: string): Promise<{ id: string; brandId: string; title: string; updatedAt: string; messageCount: number }[]> {
  const rows = await db.query<ChatRow>(
    `SELECT * FROM assistant_chats ${brandId ? 'WHERE brand_id = $1' : ''} ORDER BY updated_at DESC LIMIT 50`,
    brandId ? [brandId] : [],
  );
  return rows.map((r) => {
    const c = toChat(r);
    return { id: c.id, brandId: c.brandId, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages.length };
  });
}

export async function deleteChat(db: Db, id: string): Promise<void> {
  const rows = await db.query<{ id: string }>('DELETE FROM assistant_chats WHERE id = $1 RETURNING id', [id]);
  if (!rows.length) throw new HarborError('NOT_FOUND', `Chat ${id} not found.`);
}

async function saveMessages(db: Db, chat: Chat): Promise<Chat> {
  const [row] = await db.query<ChatRow>('UPDATE assistant_chats SET messages = $2, updated_at = now() WHERE id = $1 RETURNING *', [chat.id, JSON.stringify(chat.messages)]);
  return toChat(row!);
}

// ---- Reading the message ----

export type Intent =
  | { kind: 'greeting' }
  | { kind: 'refine'; instruction: RewriteInstruction }
  | { kind: 'more' }
  | { kind: 'topic'; topic: string };

const REFINE: [RegExp, RewriteInstruction][] = [
  [/\b(short(er)?|trim|tighter|fewer words|less wordy|too long)\b/i, 'shorter'],
  [/\b(hooks?|opening|first lines?)\b/i, 'hook_variations'],
  [/\b(specific|concrete|details?|numbers|examples?)\b/i, 'more_specific'],
  [/\b(punch(y|ier)|bolder|energy|exciting|fun(nier)?|playful|livelier)\b/i, 'punchier'],
];
const MORE = /\b(other|different|new|more|fresh)\s+(options|ideas|ones|angles|takes|versions)\b|\btry again\b|\bregenerate\b|\bsomething else\b/i;
const GREETING = /^\s*(hi|hello|hey|help|what can you do)\b[\s!?.]*$/i;
const LEAD_IN = /^(?:please\s+)?(?:(?:can|could) you\s+)?(?:(?:i\s+(?:want|need|'d like|would like)\s+to|help me|let'?s|let me)\s+)?(?:write|make|create|draft|do|post|share|announce)?\s*(?:a\s+|some\s+)?(?:social\s+)?(?:posts?|something|content)?\s*(?:about|on|for|announcing)?\s*/i;

/** What the owner wants from this message. Refinements only apply when there are options to refine. */
export function readIntent(message: string, hasOptions: boolean): Intent {
  const text = message.trim();
  if (GREETING.test(text)) return { kind: 'greeting' };
  if (hasOptions) {
    if (MORE.test(text)) return { kind: 'more' };
    // A short follow-up ("shorter please", "make them punchier") reworks the options; a long one is a new topic.
    if (text.split(/\s+/).length <= 8) for (const [re, instruction] of REFINE) if (re.test(text)) return { kind: 'refine', instruction };
  }
  return { kind: 'topic', topic: topicOf(text) };
}

/** "Can you write a post about our new Ethiopian roast?" → "Our new Ethiopian roast". */
export function topicOf(message: string): string {
  const stripped = message.trim().replace(LEAD_IN, '').replace(/[?.!\s]+$/, '').trim();
  const t = stripped || message.trim();
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 200);
}

// ---- Angles ----

interface Angle { kind: string; label: string; layout: DesignLayout; angle: (ctx: AngleContext) => string }
interface AngleContext { topic: string; audience: string; cta: string; proof?: string }

/**
 * Each angle opens with a line of copy (a statement) and then tells the writer what to do (an instruction starting
 * with a verb). Models use the statement as the post's opening and follow the instruction; the simulated model
 * turns the instruction into a bracketed note for the owner.
 */
const FIRST: Angle[] = [
  { kind: 'story', label: 'Story', layout: 'quote', angle: (c) => `The story behind ${lower(c.topic)}. Tell what happened and why it matters to ${c.audience}, with one concrete detail and no hype.` },
  { kind: 'tip', label: 'Tip', layout: 'list', angle: (c) => `One thing ${c.audience} should know about ${lower(c.topic)}. Share it in two or three short steps they can use today.` },
  { kind: 'announcement', label: 'Announcement', layout: 'headline', angle: (c) => `Introducing ${lower(c.topic)}.${c.proof ? ` ${sentence(c.proof)}` : ''} End with one clear next step: ${c.cta}.` },
];
/** "Different angles": the second set. */
const SECOND: Angle[] = [
  { kind: 'question', label: 'Question', layout: 'headline', angle: (c) => `You asked about ${lower(c.topic)}, so here's the answer. Open with the question in ${c.audience}'s own words, then answer it in a few lines.` },
  { kind: 'behind', label: 'Behind the scenes', layout: 'quote', angle: (c) => `What goes into ${lower(c.topic)}, behind the scenes. Show the work, the choices and one honest detail.` },
  { kind: 'proof', label: 'Proof', layout: 'list', angle: (c) => `Why ${lower(c.topic)} is worth it.${c.proof ? ` ${sentence(c.proof)}` : ''} Name the facts only, then invite ${c.audience} to ${lower(c.cta)}.` },
];

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function angleContext(brand: Brand, topic: string): AngleContext {
  const m = brand.memory;
  const audience = m.audiences[0]?.name ? lower(m.audiences[0].name) : 'your customers';
  const cta = m.products[0]?.cta || (m.business.website ? `visit ${m.business.website}` : 'get in touch');
  const proof = m.business.differentiators[0];
  return { topic, audience, cta, ...(proof ? { proof } : {}) };
}

// ---- Designs ----

const URL_OR_TAG = /(https?:\/\/\S+|#[\p{L}\p{N}_]+|@[\w.]+)/gu;

/** The design's headline: the first sentence of the first draft, without links or hashtags, at most ~90 characters. */
export function headlineFrom(text: string, fallback: string): string {
  // Bracketed notes ([Add the specifics here.]) are for the owner, never the design.
  const clean = text.replace(/\[[^\]]*\]/g, '').replace(URL_OR_TAG, '').replace(/\s+/g, ' ').trim();
  const first = (/^(.+?[.!?])(\s|$)/.exec(clean)?.[1] ?? clean).trim();
  const h = first.length > 90 ? `${first.slice(0, 87).replace(/\s+\S*$/, '')}…` : first;
  return h || fallback;
}

function designFor(layout: DesignLayout, drafts: PostOption['drafts'], title: string, brand: Brand): PostOption['design'] {
  const text = drafts[0]?.parts[0]?.text ?? '';
  const headline = headlineFrom(text, title);
  const sub = brand.memory.branding.tagline || brand.memory.business.oneLiner || undefined;
  return { layout, headline, ...(sub ? { sub } : {}) };
}

// ---- Turns ----

const PLATFORM_NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const listNames = (ps: Platform[]) => {
  const n = ps.map((p) => PLATFORM_NAME[p]);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

/** Connected platforms, at most three; Instagram and LinkedIn when none are connected yet. */
export async function defaultPlatforms(db: Db, brandId: string): Promise<Platform[]> {
  const rows = await db.query<{ platform: Platform }>("SELECT DISTINCT platform FROM channels WHERE brand_id = $1 AND status = 'connected'", [brandId]);
  const connected = PLATFORMS.filter((p) => rows.some((r) => r.platform === p));
  return connected.length ? connected.slice(0, 3) : ['instagram', 'linkedin'];
}

type Deps = Pick<AppDeps, 'db' | 'model' | 'registry'>;

async function draftOptions(deps: Deps, brand: Brand, topic: string, angles: Angle[], platforms: Platform[], calls: ModelResult<unknown>[]): Promise<PostOption[]> {
  const ctx = angleContext(brand, topic);
  const options: PostOption[] = [];
  for (const a of angles) {
    const idea = { title: topic, angle: a.angle(ctx) };
    const drafts: PostOption['drafts'] = [];
    for (const platform of platforms) {
      const maxLength = deps.registry.get(platform)?.maxLength() ?? DEFAULT_MAX[platform];
      const res = await deps.model.draft({ brand, idea, platform, maxLength });
      calls.push(res);
      drafts.push({ platform, parts: res.result });
    }
    options.push({ id: shortId(8), kind: a.kind, label: a.label, title: topic, angle: idea.angle, design: designFor(a.layout, drafts, topic, brand), drafts });
  }
  return options;
}

const REFINE_WORD: Record<RewriteInstruction, string> = { shorter: 'shorter', punchier: 'punchier', more_specific: 'more specific', hook_variations: 'opening with new hooks' };

async function refineOptions(deps: Deps, brand: Brand, options: PostOption[], instruction: RewriteInstruction, calls: ModelResult<unknown>[]): Promise<PostOption[]> {
  const out: PostOption[] = [];
  for (const [i, o] of options.entries()) {
    const drafts: PostOption['drafts'] = [];
    for (const d of o.drafts) {
      const first = d.parts[0];
      if (!first) { drafts.push(d); continue; }
      const res = await deps.model.rewrite({ brand, text: first.text, instruction, platform: d.platform });
      calls.push(res);
      // Hook variations come back as several; give each option a different one.
      const text = res.result[instruction === 'hook_variations' ? i % Math.max(1, res.result.length) : 0] ?? first.text;
      drafts.push({ platform: d.platform, parts: [{ ...first, text }, ...d.parts.slice(1)] });
    }
    out.push({ ...o, id: shortId(8), ideaId: undefined, drafts, design: designFor(o.design.layout, drafts, o.title, brand) });
  }
  return out;
}

function brandingNote(brand: Brand): string {
  const b = brand.memory.branding;
  return b.colors.length ? ' Each design uses your colours from Branding.' : ' Add colours and a tagline under Business Memory → Branding and the designs will use them.';
}

const lastOptions = (chat: Pick<Chat, 'messages'> | undefined) => [...(chat?.messages ?? [])].reverse().find((m) => m.role === 'assistant' && m.options?.length);

/** One assistant turn: read the message, write or rework options, and answer. */
async function respond(deps: Deps, brand: Brand, chat: Pick<Chat, 'id' | 'messages' | 'platforms'>, message: string): Promise<ChatMessage> {
  const previous = lastOptions(chat);
  const intent = readIntent(message, !!previous);
  if (intent.kind === 'greeting') {
    return {
      id: shortId(8), role: 'assistant', at: new Date().toISOString(),
      text: `Tell me what you want to post about and I'll write three options for ${listNames(chat.platforms)}, in ${brand.name}'s voice: a story, a tip and an announcement. Try "our new spring menu" or "why we started".`,
    };
  }
  const { value, run } = await withRun(deps.db, brand, 'assistant', { chatId: chat.id, intent: intent.kind, platforms: chat.platforms }, deps.model.name, async () => {
    const calls: ModelResult<unknown>[] = [];
    let options: PostOption[];
    let text: string;
    if (intent.kind === 'refine' && previous?.options) {
      options = await refineOptions(deps, brand, previous.options, intent.instruction, calls);
      text = `Here they are again, ${REFINE_WORD[intent.instruction]}. Pick one to open it in Studio, or keep adjusting.`;
    } else if (intent.kind === 'more' && previous?.options) {
      const topic = previous.options[0]!.title;
      const used = new Set(previous.options.map((o) => o.kind));
      const angles = SECOND.every((a) => !used.has(a.kind)) ? SECOND : FIRST;
      options = await draftOptions(deps, brand, topic, angles, chat.platforms, calls);
      text = `Three different angles on "${topic}": ${angles.map((a) => a.label.toLowerCase()).join(', ')}.${brandingNote(brand)}`;
    } else {
      const topic = intent.kind === 'topic' ? intent.topic : topicOf(message);
      options = await draftOptions(deps, brand, topic, FIRST, chat.platforms, calls);
      text = `Here are three ways to post about "${topic}" for ${brand.name}: a story, a tip and an announcement, each drafted for ${listNames(chat.platforms)} in your voice.${brandingNote(brand)} Pick one to open it in Studio, or ask me to make them shorter, punchier or more specific.`;
    }
    return { value: { options, text }, calls, output: { options: options.length } };
  }, { source: 'ui' });
  return { id: shortId(8), role: 'assistant', at: new Date().toISOString(), text: value.text, options: value.options, runId: run.id, model: run.model, simulated: run.simulated };
}

/** Start a chat with its first message. */
export async function startChat(deps: Deps, brand: Brand, input: { message: string; platforms?: Platform[] }): Promise<{ chat: Chat; run?: RunInfo }> {
  const platforms = input.platforms?.length ? [...new Set(input.platforms)] : await defaultPlatforms(deps.db, brand.id);
  const id = newId('chat');
  const userMsg: ChatMessage = { id: shortId(8), role: 'user', text: input.message.trim(), at: new Date().toISOString() };
  const reply = await respond(deps, brand, { id, messages: [userMsg], platforms }, input.message);
  const intent = readIntent(input.message, false);
  const title = intent.kind === 'topic' ? intent.topic.slice(0, 80) : 'New chat';
  await deps.db.query(
    'INSERT INTO assistant_chats (id, workspace_id, brand_id, title, platforms, messages) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, brand.workspaceId, brand.id, title, JSON.stringify(platforms), JSON.stringify([userMsg, reply])],
  );
  return { chat: await loadChat(deps.db, id) };
}

/** Add a message to a chat and answer it. */
export async function sendMessage(deps: Deps, brand: Brand, chat: Chat, message: string): Promise<Chat> {
  const userMsg: ChatMessage = { id: shortId(8), role: 'user', text: message.trim(), at: new Date().toISOString() };
  const withUser = { ...chat, messages: [...chat.messages, userMsg] };
  const reply = await respond(deps, brand, withUser, message);
  // A chat that started with a greeting takes its title from the first real topic.
  if (chat.title === 'New chat' && reply.options?.[0]) {
    await deps.db.query('UPDATE assistant_chats SET title = $2 WHERE id = $1', [chat.id, reply.options[0].title.slice(0, 80)]);
  }
  return saveMessages(deps.db, { ...withUser, messages: [...withUser.messages, reply] });
}

/**
 * Turn an option into an idea with one agent draft per platform, ready in Studio. Picking the same option again
 * returns the idea it already became.
 */
export async function useOption(db: Db, chat: Chat, optionId: string): Promise<{ ideaId: string; draftIds: string[]; chat: Chat }> {
  const msg = chat.messages.find((m) => m.options?.some((o) => o.id === optionId));
  const option = msg?.options?.find((o) => o.id === optionId);
  if (!msg || !option) throw new HarborError('NOT_FOUND', `Option ${optionId} not found in chat ${chat.id}.`);
  if (option.ideaId) return { ideaId: option.ideaId, draftIds: [], chat };
  const ideaId = await insertIdea(db, { brandId: chat.brandId, title: option.title, angle: option.angle, agentRunId: msg.runId });
  const draftIds: string[] = [];
  for (const d of option.drafts) draftIds.push(await insertDraft(db, { brandId: chat.brandId, ideaId, platform: d.platform, parts: d.parts, author: 'agent', agentRunId: msg.runId }));
  const messages = chat.messages.map((m) => (m !== msg ? m : { ...m, options: m.options!.map((o) => (o.id === optionId ? { ...o, ideaId } : o)) }));
  return { ideaId, draftIds, chat: await saveMessages(db, { ...chat, messages }) };
}
