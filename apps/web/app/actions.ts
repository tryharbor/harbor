'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { IdeaStatus, Platform } from '@harbor/core';
import { ApiError, api, getBrand, type BrandVoice, type MemoryListKey, type RunInfo } from './api';

// ---- Helpers ----

const go = (path: string, params: Record<string, string> = {}): never => {
  const q = new URLSearchParams(params);
  return redirect(q.size ? `${path}${path.includes('?') ? '&' : '?'}${q}` : path);
};
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const lines = (form: FormData, key: string) => text(form, key).split('\n').map((l) => l.trim()).filter(Boolean);
/** Blocks separated by a line containing only `---`. */
const blocks = (value: string) => value.split(/^\s*---\s*$/m).map((t) => t.trim()).filter(Boolean);
const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
/** Only same-app paths are allowed as return targets. */
const returnTo = (form: FormData, fallback: string) => {
  const r = text(form, 'returnTo');
  return r.startsWith('/') && !r.startsWith('//') ? r : fallback;
};
const refresh = () => revalidatePath('/', 'layout');
const shortId = () => Math.random().toString(36).slice(2, 10);
const patchMemory = (brandId: string, memory: Record<string, unknown>) =>
  api(`/v1/brands/${brandId}`, { method: 'PATCH', body: JSON.stringify({ memory }) });

// ---- Brands ----

export async function createBrand(form: FormData) {
  let id = '';
  try {
    ({ id } = await api<{ id: string }>('/v1/brands', { method: 'POST', body: JSON.stringify({ name: text(form, 'name') }) }));
    const summary = text(form, 'summary');
    if (summary) await patchMemory(id, { products: [{ id: shortId(), name: text(form, 'name'), summary, url: text(form, 'url') || undefined, cta: text(form, 'cta') || undefined, proofPoints: [] }] });
  } catch (err) {
    go('/brands/new', { error: message(err, 'Could not create the brand.') });
  }
  refresh();
  go('/brands/new', { brandId: id, step: 'audience' });
}

export async function renameBrand(form: FormData) {
  const brandId = text(form, 'brandId');
  await api(`/v1/brands/${brandId}`, { method: 'PATCH', body: JSON.stringify({ name: text(form, 'name') }) }).catch(() => undefined);
  refresh();
  go(returnTo(form, `/brands/${brandId}`));
}

// ---- Brand Memory: voice ----

const valueLines = (form: FormData) =>
  lines(form, 'values').map((l) => {
    const [name, ...rest] = l.split(':');
    return { name: name!.trim(), meaning: rest.join(':').trim() };
  });

export async function saveVoice(form: FormData) {
  const brandId = text(form, 'brandId');
  const back = returnTo(form, `/brands/${brandId}/memory?section=voice`);
  try {
    const current = (await getBrand(brandId)).memory.voice;
    const voice: BrandVoice = {
      ...current,
      summary: text(form, 'summary'),
      values: valueLines(form),
      do: lines(form, 'do'),
      avoid: lines(form, 'avoid'),
      bannedWords: text(form, 'bannedWords').split(/[,\n]/).map((w) => w.trim()).filter(Boolean),
      excerpts: blocks(text(form, 'excerpts')).map((t) => ({ text: t })),
    };
    await patchMemory(brandId, { voice });
  } catch (err) {
    go(back, { error: message(err, 'Could not save the voice.') });
  }
  refresh();
  go(back, { notice: 'Voice saved.' });
}

export type LearnState = { voice?: BrandVoice; run?: RunInfo; error?: string; examples?: string } | undefined;

/** Ask the model to propose a voice from examples. Nothing is saved until the owner applies it. */
export async function learnVoice(_prev: LearnState, form: FormData): Promise<LearnState> {
  const brandId = text(form, 'brandId');
  const raw = text(form, 'examples');
  try {
    const res = await api<{ voice: BrandVoice; run: RunInfo }>(`/v1/brands/${brandId}/voice/learn`, {
      method: 'POST',
      body: JSON.stringify(raw ? { examples: blocks(raw) } : { fromExamplePosts: true }),
    });
    return { voice: res.voice, run: res.run, examples: raw };
  } catch (err) {
    return { error: message(err, 'Could not learn the voice.'), examples: raw };
  }
}

export async function applyVoice(form: FormData) {
  const brandId = text(form, 'brandId');
  const back = returnTo(form, `/brands/${brandId}/memory?section=voice`);
  try {
    const voice = JSON.parse(text(form, 'voice')) as BrandVoice;
    await patchMemory(brandId, { voice });
    const examples = blocks(text(form, 'examples'));
    if (examples.length && text(form, 'keepExamples') === 'on') {
      const current = (await getBrand(brandId)).memory.examplePosts;
      const known = new Set(current.map((e) => e.text));
      await patchMemory(brandId, { examplePosts: [...current, ...examples.filter((t) => !known.has(t)).map((t) => ({ id: shortId(), text: t }))] });
    }
  } catch (err) {
    go(back, { error: message(err, 'Could not apply the voice.') });
  }
  refresh();
  go(back, { notice: back.startsWith('/brands/new') ? 'Voice applied. You can fine-tune it later in Brand Memory.' : 'Voice applied. Edit anything below.' });
}

// ---- Brand Memory: lists (audiences, products, knowledge, example posts) ----

function itemFromForm(key: MemoryListKey, form: FormData, id: string): Record<string, unknown> {
  switch (key) {
    case 'audiences':
      return { id, name: text(form, 'name'), description: text(form, 'description'), painPoints: lines(form, 'painPoints'), goals: lines(form, 'goals') };
    case 'products':
      return { id, name: text(form, 'name'), summary: text(form, 'summary'), url: text(form, 'url') || undefined, cta: text(form, 'cta') || undefined, proofPoints: lines(form, 'proofPoints') };
    case 'knowledge':
      return { id, title: text(form, 'title'), kind: text(form, 'url') ? 'link' : 'note', body: text(form, 'body') || undefined, url: text(form, 'url') || undefined };
    case 'examplePosts':
      return { id, text: text(form, 'text'), platform: (text(form, 'platform') || undefined) as Platform | undefined, url: text(form, 'url') || undefined, note: text(form, 'note') || undefined };
  }
}

export async function saveListItem(form: FormData) {
  const brandId = text(form, 'brandId');
  const key = text(form, 'list') as MemoryListKey;
  const back = returnTo(form, `/brands/${brandId}/memory?section=${key}`);
  try {
    const memory = (await getBrand(brandId)).memory;
    const list = [...((memory[key] as { id: string }[]) ?? [])];
    const id = text(form, 'id') || shortId();
    const item = itemFromForm(key, form, id);
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list[i] = item as { id: string };
    else list.push(item as { id: string });
    await patchMemory(brandId, { [key]: list });
  } catch (err) {
    go(back, { error: message(err, 'Could not save.') });
  }
  refresh();
  go(back, { notice: 'Saved.' });
}

export async function deleteListItem(form: FormData) {
  const brandId = text(form, 'brandId');
  const key = text(form, 'list') as MemoryListKey;
  const back = returnTo(form, `/brands/${brandId}/memory?section=${key}`);
  try {
    const memory = (await getBrand(brandId)).memory;
    await patchMemory(brandId, { [key]: ((memory[key] as { id: string }[]) ?? []).filter((x) => x.id !== text(form, 'id')) });
  } catch (err) {
    go(back, { error: message(err, 'Could not remove it.') });
  }
  refresh();
  go(back);
}

export async function saveStyleRules(form: FormData) {
  const brandId = text(form, 'brandId');
  const back = returnTo(form, `/brands/${brandId}/memory?section=style`);
  try {
    const terms = lines(form, 'terms')
      .map((l) => l.split(/\s*(?:=>|→|instead of)\s*/i))
      .filter((p) => p.length === 2 && p[0] && p[1])
      .map(([use, insteadOf]) => ({ use: use!, insteadOf: insteadOf! }));
    await patchMemory(brandId, { styleRules: { terms, formatting: lines(form, 'formatting') } });
  } catch (err) {
    go(back, { error: message(err, 'Could not save the style rules.') });
  }
  refresh();
  go(back, { notice: 'Style rules saved.' });
}

// ---- Competitors ----

export async function createCompetitor(form: FormData) {
  const brandId = text(form, 'brandId');
  const back = returnTo(form, `/brands/${brandId}/memory?section=competitors`);
  const handles = lines(form, 'handles')
    .map((l) => l.match(/^(x|linkedin|instagram|threads)\s*[:@ ]\s*@?(\S+)$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ platform: m[1]!.toLowerCase(), handle: m[2]! }));
  try {
    await api(`/v1/brands/${brandId}/competitors`, {
      method: 'POST',
      body: JSON.stringify({ name: text(form, 'name'), url: text(form, 'url') || undefined, handles, notes: text(form, 'notes') || undefined }),
    });
  } catch (err) {
    go(back, { error: message(err, 'Could not add the competitor.') });
  }
  refresh();
  go(back, { notice: 'Competitor added.' });
}

export async function deleteCompetitor(form: FormData) {
  const brandId = text(form, 'brandId');
  await api(`/v1/competitors/${text(form, 'id')}`, { method: 'DELETE' }).catch(() => undefined);
  refresh();
  go(returnTo(form, `/brands/${brandId}/memory?section=competitors`));
}

// ---- Sandbox ----

export async function connectSandbox(form: FormData) {
  const brandId = text(form, 'brandId');
  const back = returnTo(form, `/brands/${brandId}/channels`);
  try {
    await api('/v1/sandbox/channels', {
      method: 'POST',
      body: JSON.stringify({ brandId, platform: text(form, 'platform'), handle: text(form, 'handle').replace(/^@/, '') }),
    });
  } catch (err) {
    go(back, { error: message(err, 'Could not connect the sandbox account.') });
  }
  refresh();
  go(back, { notice: 'Sandbox account connected. Posts to it are recorded, never sent.' });
}

export async function advanceSandbox(form: FormData) {
  const back = returnTo(form, '/performance');
  const hours = Number(text(form, 'hours')) || 24;
  try {
    await api('/v1/sandbox/advance', { method: 'POST', body: JSON.stringify({ hours }) });
  } catch (err) {
    go(back, { error: message(err, 'Could not advance sandbox time.') });
  }
  refresh();
  go(back, { notice: `Moved sandbox time forward ${hours >= 24 ? `${hours / 24} day${hours >= 48 ? 's' : ''}` : `${hours}h`}. Due snapshots were taken.` });
}

// ---- Ideas ----

export async function createIdea(form: FormData) {
  const back = returnTo(form, '/hub');
  try {
    await api('/v1/ideas', { method: 'POST', body: JSON.stringify({ brandId: text(form, 'brandId'), title: text(form, 'title'), angle: text(form, 'angle') }) });
  } catch (err) {
    go(back, { error: message(err, 'Could not add the idea.') });
  }
  refresh();
  go(back);
}

export async function suggestIdeas(form: FormData) {
  const back = returnTo(form, '/hub');
  try {
    const res = await api<{ data: unknown[] }>('/v1/ideas/generate', { method: 'POST', body: JSON.stringify({ brandId: text(form, 'brandId'), count: Number(text(form, 'count')) || 5 }) });
    refresh();
    go(back, { notice: `${res.data.length} ideas suggested, each citing what it's based on.` });
  } catch (err) {
    if (err instanceof ApiError) go(back, { error: err.message });
    throw err;
  }
}

export async function moveIdea(form: FormData) {
  const back = returnTo(form, '/hub');
  try {
    await api(`/v1/ideas/${text(form, 'ideaId')}`, { method: 'PATCH', body: JSON.stringify({ status: text(form, 'status') as IdeaStatus }) });
  } catch (err) {
    go(back, { error: message(err, 'Could not move the idea.') });
  }
  refresh();
  go(back);
}

export async function deleteIdea(form: FormData) {
  const back = returnTo(form, '/hub');
  await api(`/v1/ideas/${text(form, 'ideaId')}`, { method: 'DELETE' }).catch(() => undefined);
  refresh();
  go(back);
}

// ---- Studio: drafts ----

export async function generateDrafts(form: FormData) {
  const ideaId = text(form, 'ideaId');
  const back = returnTo(form, `/studio/${ideaId}`);
  const platforms = form.getAll('platform').map(String);
  if (!platforms.length) go(back, { error: 'Pick at least one platform.' });
  try {
    await api('/v1/drafts/generate', { method: 'POST', body: JSON.stringify({ ideaId, platforms }) });
    // Drafting starts once there's a draft.
    await api(`/v1/ideas/${ideaId}`, { method: 'PATCH', body: JSON.stringify({ status: 'drafting' }) }).catch(() => undefined);
  } catch (err) {
    go(back, { error: message(err, 'Could not draft.') });
  }
  refresh();
  go(back, { notice: 'Drafts ready. Edit them, then approve.' });
}

export async function saveDraft(form: FormData) {
  const ideaId = text(form, 'ideaId');
  const back = returnTo(form, `/studio/${ideaId}`);
  const parts = blocks(text(form, 'body')).map((t) => ({ text: t, media: [] as { kind: 'image' | 'video'; url: string }[] }));
  const media = text(form, 'mediaUrl');
  if (media && parts[0]) parts[0].media.push({ kind: /\.(mp4|mov)(\?|$)/i.test(media) ? 'video' : 'image', url: media });
  if (!parts.length) go(back, { error: 'The draft is empty.' });
  try {
    await api('/v1/drafts', { method: 'POST', body: JSON.stringify({ brandId: text(form, 'brandId'), ideaId: ideaId || undefined, platform: text(form, 'platform'), parts, author: 'human' }) });
  } catch (err) {
    go(back, { error: message(err, 'Could not save the draft.') });
  }
  refresh();
  go(back, { notice: 'Saved as a new version.' });
}

export type RewriteState = { variations?: string[]; run?: RunInfo; error?: string; draftId?: string; instruction?: string } | undefined;

export async function rewriteDraft(_prev: RewriteState, form: FormData): Promise<RewriteState> {
  const draftId = text(form, 'draftId');
  const instruction = text(form, 'instruction');
  try {
    const res = await api<{ variations: string[]; run: RunInfo }>(`/v1/drafts/${draftId}/rewrite`, { method: 'POST', body: JSON.stringify({ instruction }) });
    return { variations: res.variations, run: res.run, draftId, instruction };
  } catch (err) {
    return { error: message(err, 'Could not rewrite.'), draftId, instruction };
  }
}

export async function scheduleDraft(form: FormData) {
  const ideaId = text(form, 'ideaId');
  const back = returnTo(form, ideaId ? `/studio/${ideaId}` : '/studio');
  const when = text(form, 'scheduledFor');
  try {
    const post = await api<{ status: string; error?: { message: string } }>('/v1/posts', {
      method: 'POST',
      body: JSON.stringify({ channelId: text(form, 'channelId'), draftId: text(form, 'draftId'), ideaId: ideaId || undefined, scheduledFor: when ? new Date(when).toISOString() : undefined }),
    });
    refresh();
    go(back, post.error ? { error: post.error.message } : { notice: when ? 'Scheduled.' : `Published (${post.status}).` });
  } catch (err) {
    if (err instanceof ApiError) go(back, { error: err.message });
    throw err;
  }
}

// ---- Posts (composer) ----

/**
 * The quick composer: one textarea, where a line containing only `---` starts the next part of a thread.
 * An optional image/video URL attaches to the first part. One post is created per selected channel.
 */
export async function createPost(form: FormData) {
  const back = returnTo(form, '/compose');
  const parts = blocks(text(form, 'body')).map((t) => ({ text: t, media: [] as { kind: 'image' | 'video'; url: string }[] }));
  const mediaUrl = text(form, 'mediaUrl');
  if (mediaUrl && parts[0]) parts[0].media.push({ kind: /\.(mp4|mov)(\?|$)/i.test(mediaUrl) ? 'video' : 'image', url: mediaUrl });
  if (parts.length === 0) go(back, { error: 'Write something first.' });

  const when = text(form, 'scheduledFor');
  const ideaId = text(form, 'ideaId') || undefined;
  const channelIds = form.getAll('channelId').map(String).filter(Boolean);
  if (channelIds.length === 0) go(back, { error: 'Pick at least one channel.' });

  const results: string[] = [];
  let failed = false;
  for (const channelId of channelIds) {
    try {
      const post = await api<{ status: string; channel: { platform: string; handle: string }; error?: { message: string } }>('/v1/posts', {
        method: 'POST',
        body: JSON.stringify({ channelId, parts, ideaId, scheduledFor: when ? new Date(when).toISOString() : undefined }),
      });
      failed ||= post.status === 'failed' || post.status === 'unknown';
      results.push(`${post.channel.platform} @${post.channel.handle}: ${post.status}${post.error ? ` (${post.error.message})` : ''}`);
    } catch (err) {
      failed = true;
      results.push(message(err, 'failed'));
    }
  }
  refresh();
  go(failed ? back : '/performance', { [failed ? 'error' : 'notice']: results.join(' · ') });
}

export async function resolvePost(form: FormData) {
  const back = returnTo(form, '/performance');
  await api(`/v1/posts/${text(form, 'postId')}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: text(form, 'outcome') }) }).catch(() => undefined);
  refresh();
  go(back);
}

export async function removePost(form: FormData) {
  const back = returnTo(form, '/performance');
  await api(`/v1/posts/${text(form, 'postId')}`, { method: 'DELETE' }).catch(() => undefined);
  refresh();
  go(back);
}

// ---- Channels ----

export async function disconnectChannel(form: FormData) {
  const brandId = text(form, 'brandId');
  await api(`/v1/channels/${text(form, 'channelId')}`, { method: 'DELETE' }).catch(() => undefined);
  refresh();
  go(`/brands/${brandId}/channels`, { notice: 'Disconnected.' });
}
