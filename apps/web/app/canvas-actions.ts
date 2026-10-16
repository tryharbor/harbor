'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Platform } from '@harbor/core';
import { ApiError, api, type Campaign, type CanvasEdge, type CanvasItem, type CanvasKind, type RunInfo } from './api';

/**
 * Canvas mutations. The board calls these straight from event handlers (drag, connect, edit) and applies the
 * returned objects to its own state, so every change is saved as it happens. Errors come back as values.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const attempt = async <T,>(fn: () => Promise<T>, fallback: string): Promise<Result<T>> => {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : fallback };
  }
};
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export async function createCampaign(form: FormData) {
  let id = '';
  try {
    ({ id } = await api<Campaign>('/v1/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        brandId: text(form, 'brandId'),
        name: text(form, 'name'),
        goal: text(form, 'goal') || undefined,
        startsOn: text(form, 'startsOn') || undefined,
        endsOn: text(form, 'endsOn') || undefined,
      }),
    }));
  } catch (err) {
    redirect(`/campaigns?${new URLSearchParams({ error: err instanceof ApiError ? err.message : 'Could not create the campaign.' })}`);
  }
  revalidatePath('/', 'layout');
  redirect(`/campaigns/${id}`);
}

export async function updateCampaign(id: string, patch: Partial<Pick<Campaign, 'name' | 'goal' | 'status' | 'startsOn' | 'endsOn'>>) {
  const res = await attempt(() => api<Campaign>(`/v1/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), 'Could not update the campaign.');
  revalidatePath(`/campaigns/${id}`);
  return res;
}

export async function addItem(campaignId: string, item: { kind: CanvasKind; refId?: string; parentId?: string; x: number; y: number; width?: number; height?: number; data?: CanvasItem['data'] }) {
  return attempt(() => api<CanvasItem>(`/v1/campaigns/${campaignId}/items`, { method: 'POST', body: JSON.stringify(item) }), 'Could not add the card.');
}

export async function updateItem(id: string, patch: { x?: number; y?: number; width?: number; height?: number; parentId?: string | null; data?: CanvasItem['data'] }) {
  return attempt(() => api<CanvasItem>(`/v1/canvas-items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), 'Could not save the card.');
}

export async function savePositions(campaignId: string, items: { id: string; x: number; y: number; parentId?: string | null; width?: number; height?: number }[]) {
  return attempt(() => api<void>(`/v1/campaigns/${campaignId}/positions`, { method: 'PUT', body: JSON.stringify({ items }) }), 'Could not save positions.');
}

export async function deleteItem(id: string) {
  return attempt(() => api<void>(`/v1/canvas-items/${id}`, { method: 'DELETE' }), 'Could not remove the card.');
}

export async function addEdge(campaignId: string, source: string, target: string) {
  return attempt(() => api<CanvasEdge>(`/v1/campaigns/${campaignId}/edges`, { method: 'POST', body: JSON.stringify({ source, target }) }), 'Could not connect the cards.');
}

export async function deleteEdge(id: string) {
  return attempt(() => api<void>(`/v1/canvas-edges/${id}`, { method: 'DELETE' }), 'Could not remove the connection.');
}

export type AgentAction =
  | { action: 'suggest_ideas'; count?: number; frameId?: string }
  | { action: 'draft'; ideaItemId: string; platforms: Platform[] }
  | { action: 'add_top_posts'; count?: number; frameId?: string }
  | { action: 'add_signals'; count?: number };

export async function runAgent(campaignId: string, action: AgentAction) {
  const res = await attempt(
    () => api<{ items: CanvasItem[]; edges: CanvasEdge[]; run?: RunInfo & { simulated?: boolean } }>(`/v1/campaigns/${campaignId}/agent`, { method: 'POST', body: JSON.stringify(action) }),
    'The agent could not finish.',
  );
  revalidatePath('/', 'layout');
  return res;
}

/** Re-read the whole canvas (after agent runs or frame deletes, which move several cards at once). */
export async function loadCanvas(campaignId: string) {
  return attempt(() => api<{ campaign: Campaign; items: CanvasItem[]; edges: CanvasEdge[] }>(`/v1/campaigns/${campaignId}/canvas`), 'Could not reload the canvas.');
}
