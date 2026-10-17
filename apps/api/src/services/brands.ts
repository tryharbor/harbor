import { HarborError, brandMemorySchema, fillMemoryIds, migrateBrandMemory, shortId, type Brand } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';

export interface BrandRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  kind: 'brand' | 'person';
  speaks_for: unknown;
  memory: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Reads v1 and v2 Brand Memory documents alike (v1 is migrated by the schema). */
export const toBrand = (r: BrandRow): Brand => ({
  id: r.id,
  workspaceId: r.workspace_id,
  kind: r.kind ?? 'brand',
  name: r.name,
  slug: r.slug,
  logoUrl: r.logo_url ?? undefined,
  speaksFor: Array.isArray(r.speaks_for) ? (r.speaks_for as string[]) : [],
  memory: brandMemorySchema.parse(r.memory ?? {}),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function loadBrand(db: Db, id: string): Promise<Brand> {
  const [row] = await db.query<BrandRow>('SELECT * FROM brands WHERE id = $1', [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Brand ${id} not found.`);
  return toBrand(row);
}

/**
 * For request bodies: migrate v1-shaped memory and give new list items (audiences, products, knowledge,
 * examplePosts) random short ids before validation.
 */
export function prepareMemoryInput(raw: unknown): unknown {
  return fillMemoryIds(migrateBrandMemory(raw), () => shortId());
}

/** Apply prepareMemoryInput to `body.memory`, if present. */
export function prepareBrandBody(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('memory' in raw)) return raw;
  const b = raw as Record<string, unknown>;
  return { ...b, memory: prepareMemoryInput(b.memory) };
}

/**
 * The brands a person may speak for: existing brands (not people) in the same workspace, de-duplicated, in the order
 * given. Anything else is a 400, so a typo doesn't silently drop a link.
 */
export async function checkSpeaksFor(db: Db, workspaceId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const rows = await db.query<{ id: string; kind: string; workspace_id: string }>('SELECT id, kind, workspace_id FROM brands WHERE id = ANY($1::text[])', [unique]);
  const ok = new Set(rows.filter((r) => r.kind === 'brand' && r.workspace_id === workspaceId).map((r) => r.id));
  const bad = unique.filter((id) => !ok.has(id));
  if (bad.length) throw new HarborError('INVALID_REQUEST', `speaksFor must list brands in this workspace: ${bad.join(', ')} ${bad.length === 1 ? 'is' : 'are'} not one.`);
  return unique;
}

/** A person's first connected account gives them a picture: its avatar becomes the logo, unless one is already set. */
export async function adoptPersonAvatar(db: Db, brandId: string, avatarUrl: string | undefined): Promise<void> {
  if (!avatarUrl?.startsWith('https://') || avatarUrl.length > 2048) return;
  await db.query(`UPDATE brands SET logo_url = $2, updated_at = now() WHERE id = $1 AND kind = 'person' AND logo_url IS NULL`, [brandId, avatarUrl]);
}
