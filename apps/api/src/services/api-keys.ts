import { createHash, randomBytes } from 'node:crypto';
import { HarborError, newId } from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';

/**
 * API keys for agents (the MCP server). The token is `hbr_` + 32 random base62 characters; only its SHA-256 is
 * stored, plus its first 12 characters for display. The full token is shown once, when the key is created.
 */

export const API_KEY_SCOPES = ['read', 'write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TOKEN_CHARS = 32;
const PREFIX_CHARS = 12;

export interface ApiKeyRow {
  id: string;
  workspace_id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  created_at: Date | string;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
}

export const toApiKey = (r: ApiKeyRow) => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  scopes: r.scopes,
  createdAt: iso(r.created_at),
  lastUsedAt: r.last_used_at ? iso(r.last_used_at) : undefined,
  revokedAt: r.revoked_at ? iso(r.revoked_at) : undefined,
});
export type ApiKey = ReturnType<typeof toApiKey>;

/** Random base62 without modulo bias (bytes ≥ 248 are skipped). */
export function generateToken(): string {
  let body = '';
  while (body.length < TOKEN_CHARS) {
    for (const b of randomBytes(TOKEN_CHARS * 2)) {
      if (b < 248 && body.length < TOKEN_CHARS) body += BASE62[b % 62];
    }
  }
  return `hbr_${body}`;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const COLUMNS = 'id, workspace_id, name, prefix, scopes, created_at, last_used_at, revoked_at';

export async function createApiKey(db: Db, k: { workspaceId: string; name: string; scopes: ApiKeyScope[] }): Promise<{ key: ApiKey; token: string }> {
  const token = generateToken();
  const [row] = await db.query<ApiKeyRow>(
    `INSERT INTO api_keys (id, workspace_id, name, prefix, hash, scopes) VALUES ($1, $2, $3, $4, $5, $6::text[]) RETURNING ${COLUMNS}`,
    [newId('apiKey'), k.workspaceId, k.name, token.slice(0, PREFIX_CHARS), hashToken(token), [...new Set(k.scopes)]],
  );
  return { key: toApiKey(row!), token };
}

export async function listApiKeys(db: Db, workspaceId: string): Promise<ApiKey[]> {
  const rows = await db.query<ApiKeyRow>(`SELECT ${COLUMNS} FROM api_keys WHERE workspace_id = $1 ORDER BY created_at DESC, id`, [workspaceId]);
  return rows.map(toApiKey);
}

/** Revoke a key (idempotent: an already revoked key keeps its first revoked_at). */
export async function revokeApiKey(db: Db, id: string): Promise<ApiKey> {
  const [row] = await db.query<ApiKeyRow>(`UPDATE api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  if (!row) throw new HarborError('NOT_FOUND', `API key ${id} not found.`);
  return toApiKey(row);
}

/** The live key behind an `Authorization: Bearer hbr_…` header, marking it used; undefined when missing, unknown or revoked. */
export async function authenticateKey(db: Db, header: string | undefined): Promise<ApiKeyRow | undefined> {
  const token = /^Bearer\s+(hbr_[0-9A-Za-z]+)\s*$/i.exec(header ?? '')?.[1];
  if (!token) return undefined;
  const [row] = await db.query<ApiKeyRow>(
    `UPDATE api_keys SET last_used_at = now() WHERE hash = $1 AND revoked_at IS NULL RETURNING ${COLUMNS}`,
    [hashToken(token)],
  );
  return row;
}
