'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { BrandMemory, IdeaStatus } from '@harbor/core';
import { ApiError, api, getBrand } from './api';

const go = (path: string, params: Record<string, string> = {}) => {
  const q = new URLSearchParams(params);
  return redirect(q.size ? `${path}${path.includes('?') ? '&' : '?'}${q}` : path);
};
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
/** Only same-app paths are allowed as return targets. */
const returnTo = (form: FormData, fallback: string) => {
  const r = text(form, 'returnTo');
  return r.startsWith('/') && !r.startsWith('//') ? r : fallback;
};

// ---- Brands ----

export async function createBrand(form: FormData) {
  let id: string;
  try {
    ({ id } = await api<{ id: string }>('/v1/brands', { method: 'POST', body: JSON.stringify({ name: text(form, 'name') }) }));
  } catch (err) {
    return go('/brands/new', { error: message(err, 'Could not create the brand.') });
  }
  revalidatePath('/', 'layout');
  go(`/brands/${id}/memory`, { notice: 'Brand created. Tell Harbor how it sounds and who it talks to.' });
}

const lines = (form: FormData, key: string) => text(form, key).split('\n').map((l) => l.trim()).filter(Boolean);

/** Save the Brand Memory form. Example posts are separated by a line containing only `---`. */
export async function saveMemory(form: FormData) {
  const brandId = text(form, 'brandId');
  const page = `/brands/${brandId}/memory`;
  try {
    const current = await getBrand(brandId);
    const url = text(form, 'offerUrl');
    const memory: BrandMemory = {
      ...current.memory,
      voice: {
        description: text(form, 'voiceDescription'),
        traits: lines(form, 'voiceTraits'),
        do: lines(form, 'voiceDo'),
        dont: lines(form, 'voiceDont'),
      },
      offer: { summary: text(form, 'offerSummary'), callToAction: text(form, 'offerCta') || undefined, url: url || undefined },
      audience: {
        description: text(form, 'audienceDescription'),
        segments: lines(form, 'audienceSegments'),
        painPoints: lines(form, 'audiencePainPoints'),
      },
      examplePosts: text(form, 'examples')
        .split(/^\s*---\s*$/m)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => ({ text: t })),
    };
    await api(`/v1/brands/${brandId}`, { method: 'PATCH', body: JSON.stringify({ name: text(form, 'name') || current.name, memory }) });
  } catch (err) {
    return go(page, { error: message(err, 'Could not save Brand Memory.') });
  }
  revalidatePath('/', 'layout');
  go(page, { notice: 'Brand Memory saved.' });
}

// ---- Ideas ----

export async function createIdea(form: FormData) {
  const back = returnTo(form, '/hub');
  try {
    await api('/v1/ideas', {
      method: 'POST',
      body: JSON.stringify({ brandId: text(form, 'brandId'), title: text(form, 'title'), angle: text(form, 'angle') }),
    });
  } catch (err) {
    return go(back, { error: message(err, 'Could not add the idea.') });
  }
  revalidatePath(back.split('?')[0]!);
  go(back);
}

export async function moveIdea(form: FormData) {
  const back = returnTo(form, '/hub');
  try {
    await api(`/v1/ideas/${text(form, 'ideaId')}`, { method: 'PATCH', body: JSON.stringify({ status: text(form, 'status') as IdeaStatus }) });
  } catch (err) {
    return go(back, { error: message(err, 'Could not move the idea.') });
  }
  revalidatePath(back.split('?')[0]!);
  go(back);
}

export async function deleteIdea(form: FormData) {
  const back = returnTo(form, '/hub');
  await api(`/v1/ideas/${text(form, 'ideaId')}`, { method: 'DELETE' }).catch(() => undefined);
  revalidatePath(back.split('?')[0]!);
  go(back);
}

// ---- Posts ----

/**
 * The composer: one textarea, where a line containing only `---` starts the next part of a thread.
 * An optional image/video URL attaches to the first part. One post is created per selected channel.
 */
export async function createPost(form: FormData) {
  const back = returnTo(form, '/compose');
  const parts = text(form, 'body')
    .split(/^\s*---\s*$/m)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ text: t, media: [] as { kind: 'image' | 'video'; url: string }[] }));
  const mediaUrl = text(form, 'mediaUrl');
  if (mediaUrl && parts[0]) parts[0].media.push({ kind: /\.(mp4|mov)(\?|$)/i.test(mediaUrl) ? 'video' : 'image', url: mediaUrl });
  if (parts.length === 0) return go(back, { error: 'Write something first.' });

  const when = text(form, 'scheduledFor');
  const ideaId = text(form, 'ideaId') || undefined;
  const channelIds = form.getAll('channelId').map(String).filter(Boolean);
  if (channelIds.length === 0) return go(back, { error: 'Pick at least one channel.' });

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
  revalidatePath('/', 'layout');
  go(failed ? back : '/performance', { [failed ? 'error' : 'notice']: results.join(' · ') });
}

export async function resolvePost(form: FormData) {
  const back = returnTo(form, '/performance');
  await api(`/v1/posts/${text(form, 'postId')}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: text(form, 'outcome') }) }).catch(() => undefined);
  revalidatePath('/', 'layout');
  go(back);
}

export async function removePost(form: FormData) {
  const back = returnTo(form, '/performance');
  await api(`/v1/posts/${text(form, 'postId')}`, { method: 'DELETE' }).catch(() => undefined);
  revalidatePath('/', 'layout');
  go(back);
}

// ---- Channels ----

export async function disconnectChannel(form: FormData) {
  const brandId = text(form, 'brandId');
  await api(`/v1/channels/${text(form, 'channelId')}`, { method: 'DELETE' }).catch(() => undefined);
  revalidatePath(`/brands/${brandId}/channels`);
  go(`/brands/${brandId}/channels`, { notice: 'Disconnected. Also remove Harbor from the account’s app settings on the platform if you want to revoke access there.' });
}
