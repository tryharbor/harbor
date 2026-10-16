import type { Migration } from '../migrations.ts';

/**
 * The media library (docs/design/media-library.md): uploaded images and videos per brand. Files live in the media
 * store (local disk by default); variants (crops) are generated on first request and cached there.
 */
export const media0008: Migration = {
  id: '0008_media',
  statements: [
    `CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
      mime TEXT NOT NULL,
      bytes BIGINT NOT NULL,
      width INT,
      height INT,
      storage_key TEXT NOT NULL,
      original_name TEXT,
      alt TEXT,
      tags TEXT[] NOT NULL DEFAULT '{}',
      focal_x REAL NOT NULL DEFAULT 0.5 CHECK (focal_x >= 0 AND focal_x <= 1),
      focal_y REAL NOT NULL DEFAULT 0.5 CHECK (focal_y >= 0 AND focal_y <= 1),
      sha256 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS media_assets_brand_created ON media_assets (brand_id, created_at DESC) WHERE deleted_at IS NULL`,
    // Uploading the same file to a brand twice returns the existing asset.
    `CREATE UNIQUE INDEX IF NOT EXISTS media_assets_brand_sha256 ON media_assets (brand_id, sha256) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS media_assets_tags ON media_assets USING GIN (tags)`,
  ],
};
