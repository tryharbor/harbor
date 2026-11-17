import { CATALOG, PROVIDERS, defaultModelFor, envKeyFor, type ModelMode, type Provider } from '@harbor/ai';
import { DEFAULT_WORKSPACE_ID, HarborError } from '@harbor/core';
import type { AppDeps } from '../app.ts';

/**
 * Which AI model the workspace uses, and whose key pays for it. Harbor's own keys come from the environment; an
 * owner can add their own key per provider (stored encrypted), which then takes precedence. Keys are never returned.
 */

type Deps = Pick<AppDeps, 'db' | 'secrets' | 'models'>;
const keyRef = (p: Provider) => `model-key:${p}`;

export interface ModelChoice {
  active: { provider: ModelMode; model: string };
  providers: {
    id: Provider;
    name: string;
    models: { id: string; label: string; note: string; price?: { input: number; output: number } }[];
    /** Whose key a request would use: the owner's, Harbor's, or none yet. */
    key: 'own' | 'harbor' | 'none';
  }[];
  /** False when this server's model can't be changed at runtime (tests that inject a fixed model). */
  switchable: boolean;
}

async function ownKey(deps: Deps, p: Provider): Promise<string | undefined> {
  try {
    return (await deps.secrets().get<{ key: string }>(keyRef(p)))?.key;
  } catch {
    // No HARBOR_SECRET_KEY: owners' keys can't be stored or read, so only Harbor's keys count.
    return undefined;
  }
}

const keyFor = async (deps: Deps, p: Provider) => (await ownKey(deps, p)) ?? envKeyFor(p);

export async function modelChoice(deps: Deps): Promise<ModelChoice> {
  const providers = await Promise.all(PROVIDERS.map(async (id) => ({
    id,
    name: CATALOG[id].name,
    models: CATALOG[id].models,
    key: ((await ownKey(deps, id)) ? 'own' : envKeyFor(id) ? 'harbor' : 'none') as 'own' | 'harbor' | 'none',
  })));
  return { active: deps.models?.active ?? { provider: 'simulated', model: 'simulated-v1' }, providers, switchable: !!deps.models };
}

/** Switch the workspace's model; it takes effect on the next AI call. */
export async function setActiveModel(deps: Deps, input: { provider: ModelMode; model?: string }): Promise<ModelChoice> {
  if (!deps.models) throw new HarborError('CONFLICT', "This server's model is fixed and can't be switched.");
  if (input.provider === 'simulated') deps.models.configure({ provider: 'simulated' });
  else {
    const apiKey = await keyFor(deps, input.provider);
    if (!apiKey) throw new HarborError('INVALID_REQUEST', `Add a ${CATALOG[input.provider].name} API key first.`);
    deps.models.configure({ provider: input.provider, model: input.model || defaultModelFor(input.provider), apiKey });
  }
  const model = input.provider === 'simulated' ? null : deps.models.active.model;
  await deps.db.query(
    `INSERT INTO model_settings (workspace_id, provider, model) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id) DO UPDATE SET provider = EXCLUDED.provider, model = EXCLUDED.model, updated_at = now()`,
    [DEFAULT_WORKSPACE_ID, input.provider, model],
  );
  return modelChoice(deps);
}

export async function setOwnKey(deps: Deps, p: Provider, key: string): Promise<ModelChoice> {
  await deps.secrets().put(keyRef(p), { key });
  // The active provider picks up the new key straight away.
  if (deps.models?.active.provider === p) deps.models.configure({ provider: p, model: deps.models.active.model, apiKey: key });
  return modelChoice(deps);
}

/** Forget the owner's key. If that provider is active and Harbor has no key for it, Harbor falls back to the simulated model. */
export async function deleteOwnKey(deps: Deps, p: Provider): Promise<ModelChoice> {
  await deps.secrets().delete(keyRef(p));
  if (deps.models?.active.provider === p) {
    const harbor = envKeyFor(p);
    if (harbor) deps.models.configure({ provider: p, model: deps.models.active.model, apiKey: harbor });
    else await setActiveModel(deps, { provider: 'simulated' });
  }
  return modelChoice(deps);
}

/** At start-up: re-apply the saved choice. A saved provider whose key is gone falls back to what the environment set. */
export async function applySavedModel(deps: Deps): Promise<void> {
  if (!deps.models) return;
  const [row] = await deps.db.query<{ provider: ModelMode; model: string | null }>('SELECT provider, model FROM model_settings WHERE workspace_id = $1', [DEFAULT_WORKSPACE_ID]);
  if (!row) return;
  if (row.provider === 'simulated') return deps.models.configure({ provider: 'simulated' });
  const apiKey = await keyFor(deps, row.provider);
  if (apiKey) deps.models.configure({ provider: row.provider, model: row.model ?? undefined, apiKey });
  else console.warn(`[models] Saved model ${row.provider} has no API key; using ${deps.models.active.provider}.`);
}
