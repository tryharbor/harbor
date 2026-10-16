import { z } from 'zod';
import { DEFAULT_WORKSPACE_ID } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { API_KEY_SCOPES, createApiKey, listApiKeys, revokeApiKey } from '../services/api-keys.ts';

const createSchema = z
  .object({ name: z.string().trim().min(1).max(200), scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).default(['read']) })
  .strict();

/** API keys for the MCP server. The full key is only in the POST response; lists show its prefix. */
export function registerApiKeys(app: App, deps: AppDeps) {
  const { db } = deps;

  app.get('/v1/api-keys', async (c) => c.json({ data: await listApiKeys(db, c.req.query('workspaceId') ?? DEFAULT_WORKSPACE_ID) }));

  app.post('/v1/api-keys', async (c) => {
    const input = await body(c, createSchema);
    const { key, token } = await createApiKey(db, { workspaceId: DEFAULT_WORKSPACE_ID, name: input.name, scopes: input.scopes });
    return c.json({ ...key, key: token }, 201);
  });

  /** Revoke (the row stays, so the key list keeps its history). */
  app.delete('/v1/api-keys/:id', async (c) => c.json(await revokeApiKey(db, c.req.param('id'))));
}
