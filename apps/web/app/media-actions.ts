'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Platform } from '@harbor/core';
import { ApiError, api, getMedia, getMediaFit, type MediaAsset, type MediaFit } from './api';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const go = (path: string, params: Record<string, string> = {}): never => {
  const q = new URLSearchParams(params);
  return redirect(q.size ? `${path}${path.includes('?') ? '&' : '?'}${q}` : path);
};

export async function saveMediaDetails(form: FormData) {
  const id = text(form, 'assetId');
  const tags = text(form, 'tags').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  try {
    await api(`/v1/media/${id}`, { method: 'PATCH', body: JSON.stringify({ alt: text(form, 'alt'), tags }) });
  } catch (err) {
    go(`/media/${id}`, { error: message(err, 'Could not save.') });
  }
  revalidatePath(`/media/${id}`);
  go(`/media/${id}`, { notice: 'Saved.' });
}

/** Focal point from a click on the image (0–1 on each axis); every crop centers on it. */
export async function setFocal(id: string, x: number, y: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await api(`/v1/media/${id}`, { method: 'PATCH', body: JSON.stringify({ focal: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } }) });
    revalidatePath(`/media/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err, 'Could not move the focal point.') };
  }
}

export async function deleteMedia(form: FormData) {
  const id = text(form, 'assetId');
  const brandId = text(form, 'brandId');
  try {
    await api(`/v1/media/${id}`, { method: 'DELETE' });
  } catch (err) {
    go(`/media/${id}`, { error: message(err, 'Could not delete it.') });
  }
  revalidatePath('/media');
  go(`/media?brand=${brandId}`, { notice: 'Deleted.' });
}

export async function importMediaUrl(_prev: { error?: string; ok?: string }, form: FormData): Promise<{ error?: string; ok?: string }> {
  const brandId = text(form, 'brandId');
  try {
    const a = await api<MediaAsset>(`/v1/brands/${brandId}/media/from-url`, { method: 'POST', body: JSON.stringify({ url: text(form, 'url') }) });
    revalidatePath('/media');
    return { ok: a.id };
  } catch (err) {
    return { error: message(err, 'Could not fetch that URL.') };
  }
}

/** For the picker: the brand's library, newest first. */
export async function listMedia(brandId: string, q?: string): Promise<{ assets: MediaAsset[]; error?: string }> {
  try {
    return { assets: (await getMedia(brandId, { q: q || undefined, limit: '60' })).data };
  } catch (err) {
    return { assets: [], error: message(err, 'Could not load the library.') };
  }
}

/** The platform's preferred crop of an asset, with its check. */
export async function fitMedia(id: string, platform: Platform): Promise<MediaFit | { error: string }> {
  try {
    return await getMediaFit(id, platform);
  } catch (err) {
    return { error: message(err, 'Could not size that image for this platform.') };
  }
}

export async function refreshMedia() {
  revalidatePath('/media');
}
