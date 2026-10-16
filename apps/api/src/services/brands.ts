import { HarborError, brandMemorySchema, fillMemoryIds, migrateBrandMemory, shortId, type Brand } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';

export interface BrandRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  memory: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Reads v1 and v2 Brand Memory documents alike (v1 is migrated by the schema). */
export const toBrand = (r: BrandRow): Brand => ({
  id: r.id,
  workspaceId: r.workspace_id,
  name: r.name,
  slug: r.slug,
  logoUrl: r.logo_url ?? undefined,
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
