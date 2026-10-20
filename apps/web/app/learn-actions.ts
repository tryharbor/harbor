'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Platform } from '@harbor/core';
import { ApiError, api, type AgentRunDetail, type ImportScan, type MemoryPreview } from './api';

const go = (path: string, params: Record<string, string> = {}): never => {
  const q = new URLSearchParams(params);
  // A #section stays at the end, after any query.
  const [base, hash] = path.split('#') as [string, string | undefined];
  return redirect(`${q.size ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base}${hash ? `#${hash}` : ''}`);
};
// Form submissions send line breaks as \r\n; store plain \n so lengths match what the platform counts.
const text = (form: FormData, key: string) => String(form.get(key) ?? '').replace(/\r\n?/g, '\n').trim();
const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const returnTo = (form: FormData, fallback: string) => {
  const r = text(form, 'returnTo');
  return r.startsWith('/') && !r.startsWith('//') ? r : fallback;
};
const refresh = () => revalidatePath('/', 'layout');

// ---- Voice refresh and memory proposals ----

export async function refreshVoice(form: FormData) {
  const brandId = text(form, 'brandId');
  let run: AgentRunDetail | undefined;
  try {
    run = await api<AgentRunDetail>('/v1/agents/voice_refresh/runs', { method: 'POST', body: JSON.stringify({ inputs: { brandId } }) });
  } catch (err) {
    go(returnTo(form, `/brands/${brandId}/memory`), { error: message(err, 'The voice refresh could not run.') });
  }
  refresh();
  go(`/agents/runs/${run!.id}`);
}

/** Checked changes are accepted; everything else in the proposal is rejected. */
export async function applyProposal(form: FormData) {
  const id = text(form, 'proposalId');
  const accept = form.getAll('accept').map(String);
  const rejectAll = text(form, 'intent') === 'reject';
  try {
    await api(`/v1/memory-proposals/${id}/apply`, { method: 'POST', body: JSON.stringify({ accept: rejectAll ? [] : accept }) });
  } catch (err) {
    go(returnTo(form, '/approvals?tab=memory'), { error: message(err, 'Could not apply those changes.') });
  }
  refresh();
  go(returnTo(form, '/approvals?tab=memory'), {
    notice: rejectAll || !accept.length ? 'Rejected. Brand Memory is unchanged.' : `Applied ${accept.length} change${accept.length === 1 ? '' : 's'} to Brand Memory, each linked to its evidence.`,
  });
}

// ---- Save to Brand Memory ----

export type SaveState = { ok?: string; error?: string };

export async function saveToMemory(_prev: SaveState, form: FormData): Promise<SaveState> {
  const brandId = text(form, 'brandId');
  try {
    const res = await api<{ saved: { target: string; text: string } }>(`/v1/brands/${brandId}/memory/save`, {
      method: 'POST',
      body: JSON.stringify({
        from: { kind: text(form, 'kind'), id: text(form, 'id') },
        as: text(form, 'as'),
        text: text(form, 'text') || undefined,
        note: text(form, 'note') || undefined,
      }),
    });
    revalidatePath(`/brands/${brandId}/memory`);
    return { ok: `Saved to ${TARGET[res.saved.target] ?? res.saved.target}.` };
  } catch (err) {
    return { error: message(err, 'Could not save that to Brand Memory.') };
  }
}
const TARGET: Record<string, string> = {
  knowledge: 'Knowledge', examplePosts: 'Example posts', excerpt: 'voice excerpts', 'voice.excerpts': 'voice excerpts', 'voice.do': 'the voice’s Do rules', 'voice.avoid': 'the voice’s Avoid rules', do: 'the voice’s Do rules', avoid: 'the voice’s Avoid rules', example: 'Example posts',
};

// ---- Preview Brand Memory ----

export type PreviewState = { preview?: MemoryPreview; error?: string; brief?: string; ideaId?: string; platform?: Platform };

export async function previewMemory(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const brandId = text(form, 'brandId');
  const ideaId = text(form, 'ideaId') || undefined;
  const brief = ideaId ? undefined : text(form, 'brief') || undefined;
  const platform = text(form, 'platform') as Platform;
  if (!ideaId && !brief) return { error: 'Pick an idea or write a one-line brief.', platform };
  try {
    const preview = await api<MemoryPreview>(`/v1/brands/${brandId}/memory/preview`, { method: 'POST', body: JSON.stringify({ ideaId, brief, platform }) });
    return { preview, brief, ideaId, platform };
  } catch (err) {
    return { error: message(err, 'Could not draft the preview.'), brief, ideaId, platform };
  }
}

// ---- Replies ----

export async function refreshReplies(form: FormData) {
  const postId = text(form, 'postId');
  try {
    await api(`/v1/posts/${postId}/replies/refresh`, { method: 'POST' });
  } catch (err) {
    go(`${returnTo(form, `/performance/${postId}`)}#replies`, { error: message(err, 'Could not fetch replies.') });
  }
  revalidatePath(`/performance/${postId}`);
  go(`${returnTo(form, `/performance/${postId}`)}#replies`, { notice: 'Replies refreshed.' });
}

/** Answer a reply as the post's account (Instagram). */
export async function respondToReply(form: FormData) {
  const postId = text(form, 'postId');
  const back = `${returnTo(form, `/performance/${postId}`)}#replies`;
  try {
    await api(`/v1/replies/${text(form, 'replyId')}/respond`, { method: 'POST', body: JSON.stringify({ text: text(form, 'text') }) });
  } catch (err) {
    go(back, { error: message(err, 'Could not post the reply.') });
  }
  revalidatePath(`/performance/${postId}`);
  go(back, { notice: 'Reply posted.' });
}

/** Hide a reply on its platform, or show it again. */
export async function hideReply(form: FormData) {
  const postId = text(form, 'postId');
  const back = `${returnTo(form, `/performance/${postId}`)}#replies`;
  const hidden = text(form, 'hidden') === 'true';
  try {
    await api(`/v1/replies/${text(form, 'replyId')}/hide`, { method: 'POST', body: JSON.stringify({ hidden }) });
  } catch (err) {
    go(back, { error: message(err, hidden ? 'Could not hide the comment.' : 'Could not show the comment again.') });
  }
  revalidatePath(`/performance/${postId}`);
  go(back, { notice: hidden ? 'Comment hidden.' : 'Comment shown again.' });
}

/** Delete a reply from its platform (the form asks for a second click first). */
export async function deleteReply(form: FormData) {
  const postId = text(form, 'postId');
  const back = `${returnTo(form, `/performance/${postId}`)}#replies`;
  try {
    await api(`/v1/replies/${text(form, 'replyId')}`, { method: 'DELETE' });
  } catch (err) {
    go(back, { error: message(err, 'Could not delete the comment.') });
  }
  revalidatePath(`/performance/${postId}`);
  go(back, { notice: 'Comment deleted.' });
}

// ---- Import past posts ----

export type ScanState = { scan?: ImportScan; error?: string; imported?: number; skipped?: number };

export async function scanChannel(_prev: ScanState, form: FormData): Promise<ScanState> {
  const channelId = text(form, 'channelId');
  try {
    const scan = await api<ImportScan>(`/v1/channels/${channelId}/import/scan`, { method: 'POST', body: JSON.stringify({ limit: Number(text(form, 'limit')) || 30 }) });
    return { scan };
  } catch (err) {
    return { error: message(err, 'Could not scan that channel.') };
  }
}

export async function importPosts(prev: ScanState, form: FormData): Promise<ScanState> {
  const channelId = text(form, 'channelId');
  const include = form.getAll('include').map(String);
  if (!include.length) return { ...prev, error: 'Select at least one post to import.' };
  try {
    const res = await api<{ imported: number; skipped: number }>(`/v1/channels/${channelId}/import`, { method: 'POST', body: JSON.stringify({ scanId: text(form, 'scanId'), include }) });
    refresh();
    return { imported: res.imported, skipped: res.skipped };
  } catch (err) {
    return { ...prev, error: message(err, 'Could not import those posts.') };
  }
}
