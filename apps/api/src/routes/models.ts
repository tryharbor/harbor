import { z } from 'zod';
import { MODEL_MODES, PROVIDERS } from '@harbor/ai';
import type { App, AppDeps } from '../app.ts';
import { body, check } from '../lib/http.ts';
import { deleteOwnKey, modelChoice, setActiveModel, setOwnKey } from '../services/models.ts';

const activeSchema = z.object({ provider: z.enum(MODEL_MODES), model: z.string().trim().min(1).max(100).optional() }).strict();
const keySchema = z.object({ key: z.string().trim().min(20, 'key: that looks too short for an API key.').max(500) }).strict();
const providerSchema = z.enum(PROVIDERS);

/** The workspace's AI model: providers, their models, whose key pays, and which one is active. */
export function registerModels(app: App, deps: AppDeps) {
  app.get('/v1/models', async (c) => c.json(await modelChoice(deps)));
  app.put('/v1/models/active', async (c) => c.json(await setActiveModel(deps, await body(c, activeSchema))));
  app.put('/v1/models/keys/:provider', async (c) => {
    const p = check(providerSchema, c.req.param('provider'));
    return c.json(await setOwnKey(deps, p, (await body(c, keySchema)).key));
  });
  app.delete('/v1/models/keys/:provider', async (c) => c.json(await deleteOwnKey(deps, check(providerSchema, c.req.param('provider')))));
}
