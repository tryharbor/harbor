import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ModelRouter, SimulatedModel, type LlmProvider } from '@harbor/ai';
import { createApp, createDeps, type App, type AppDeps } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { applySavedModel } from '../src/services/models.ts';
import { sender } from './helpers.ts';

const KEY = Buffer.alloc(32, 9).toString('base64');
const OWN = 'sk-own-key-0123456789abcdef';

describe('choosing the AI model', () => {
  let db: Db;
  let app: App;
  let deps: AppDeps;
  const send = sender(() => app);
  const used: { provider: string; key: string }[] = [];
  // A router whose providers are fakes: records which key each one was built with, never calls out.
  const fakeProvider = (provider: 'anthropic' | 'openai' | 'google', key: string): LlmProvider => {
    used.push({ provider, key });
    return { provider, complete: async (model) => ({ text: JSON.stringify({ parts: [{ text: `from ${model}` }] }), usage: { inputTokens: 1, outputTokens: 1 }, model }) };
  };

  // The machine running the tests may have real provider keys; these tests set exactly the ones they need.
  const ENV_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  beforeAll(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.GEMINI_API_KEY = 'harbor-gemini-key-0123456789';
    db = await openDb('memory://');
    deps = createDeps(db, { publishMode: 'sandbox', secretKey: KEY, model: new ModelRouter(new SimulatedModel(), { provider: 'simulated' }, fakeProvider) });
    app = createApp(db, {}, deps);
  });
  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    return db.close();
  });

  it("lists the providers, their models and whose key each would use", async () => {
    const m = await (await send('GET', '/v1/models')).json();
    expect(m.active).toEqual({ provider: 'simulated', model: 'simulated-v1' });
    expect(m.switchable).toBe(true);
    expect(m.providers.map((p: { id: string; key: string }) => [p.id, p.key])).toEqual([['anthropic', 'none'], ['openai', 'none'], ['google', 'harbor']]);
    expect(m.providers[0].models[0]).toMatchObject({ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' });
  });

  it("needs a key before switching, and uses Harbor's key when that's all there is", async () => {
    const res = await send('PUT', '/v1/models/active', { provider: 'openai' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/OpenAI API key/);
    const m = await (await send('PUT', '/v1/models/active', { provider: 'google' })).json();
    expect(m.active).toEqual({ provider: 'google', model: 'gemini-4-argon' });
    expect(used.at(-1)).toEqual({ provider: 'google', key: 'harbor-gemini-key-0123456789' });
    expect(await (await send('GET', '/v1/mode')).json()).toEqual({ publish: 'sandbox', model: 'google', modelId: 'gemini-4-argon', modelLabel: 'Gemini 4 Argon' });
  });

  it("stores an owner's key encrypted, prefers it, and never returns it", async () => {
    const m = await (await send('PUT', '/v1/models/keys/openai', { key: OWN })).json();
    expect(m.providers.find((p: { id: string }) => p.id === 'openai').key).toBe('own');
    expect(JSON.stringify(m)).not.toContain(OWN);
    const [row] = await db.query<{ ciphertext: string }>("SELECT ciphertext FROM secrets WHERE ref = 'model-key:openai'");
    expect(row!.ciphertext).not.toContain(OWN);
    const active = await (await send('PUT', '/v1/models/active', { provider: 'openai', model: 'gpt-6.1-sol' })).json();
    expect(active.active).toEqual({ provider: 'openai', model: 'gpt-6.1-sol' });
    expect(used.at(-1)).toEqual({ provider: 'openai', key: OWN });
    expect((await send('PUT', '/v1/models/keys/openai', { key: 'short' })).status).toBe(400);
    expect((await send('PUT', '/v1/models/keys/mistral', { key: OWN })).status).toBe(400);
  });

  it('re-applies the saved choice at start-up', async () => {
    deps.models!.configure({ provider: 'simulated' });
    await applySavedModel(deps);
    expect(deps.models!.active).toEqual({ provider: 'openai', model: 'gpt-6.1-sol' });
  });

  it("falls back to the simulated model when the active provider's only key is removed", async () => {
    const m = await (await send('DELETE', '/v1/models/keys/openai')).json();
    expect(m.active.provider).toBe('simulated');
    expect(m.providers.find((p: { id: string }) => p.id === 'openai').key).toBe('none');
  });
});
