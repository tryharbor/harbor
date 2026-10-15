'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api } from './api';

const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export async function createBrand(form: FormData) {
  let id: string;
  try {
    ({ id } = await api<{ id: string }>('/v1/brands', { method: 'POST', body: JSON.stringify({ name: text(form, 'name') }) }));
  } catch (err) {
    return back('/', { error: err instanceof ApiError ? err.message : 'Could not create the brand.' });
  }
  redirect(`/brands/${id}`);
}

/**
 * The composer: one textarea, where a line containing only `---` starts the next part of a thread.
 * An optional image URL attaches to the first part.
 */
export async function createPost(form: FormData) {
  const brandId = text(form, 'brandId');
  const page = `/brands/${brandId}`;
  const parts = text(form, 'body')
    .split(/^\s*---\s*$/m)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ text: t, media: [] as { kind: 'image' | 'video'; url: string }[] }));
  const mediaUrl = text(form, 'mediaUrl');
  if (mediaUrl && parts[0]) parts[0].media.push({ kind: /\.(mp4|mov)(\?|$)/i.test(mediaUrl) ? 'video' : 'image', url: mediaUrl });
  if (parts.length === 0) return back(page, { error: 'Write something first.' });

  const when = text(form, 'scheduledFor');
  const channelIds = form.getAll('channelId').map(String).filter(Boolean);
  if (channelIds.length === 0) return back(page, { error: 'Pick at least one channel.' });

  const results: string[] = [];
  for (const channelId of channelIds) {
    try {
      const post = await api<{ status: string; channel: { platform: string; handle: string }; error?: { message: string } }>('/v1/posts', {
        method: 'POST',
        body: JSON.stringify({ channelId, parts, scheduledFor: when ? new Date(when).toISOString() : undefined }),
      });
      results.push(`${post.channel.platform} @${post.channel.handle}: ${post.status}${post.error ? ` (${post.error.message})` : ''}`);
    } catch (err) {
      results.push(`${channelId}: ${err instanceof ApiError ? err.message : 'failed'}`);
    }
  }
  revalidatePath(page);
  return back(page, { notice: results.join(' · ') });
}

export async function resolvePost(form: FormData) {
  const brandId = text(form, 'brandId');
  await api(`/v1/posts/${text(form, 'postId')}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: text(form, 'outcome') }) }).catch(() => undefined);
  revalidatePath(`/brands/${brandId}`);
}

export async function removePost(form: FormData) {
  const brandId = text(form, 'brandId');
  await api(`/v1/posts/${text(form, 'postId')}`, { method: 'DELETE' }).catch(() => undefined);
  revalidatePath(`/brands/${brandId}`);
}

export async function disconnectChannel(form: FormData) {
  const brandId = text(form, 'brandId');
  await api(`/v1/channels/${text(form, 'channelId')}`, { method: 'DELETE' }).catch(() => undefined);
  revalidatePath(`/brands/${brandId}`);
}
