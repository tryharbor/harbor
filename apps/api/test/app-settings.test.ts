import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createDeps, type App } from '../src/app.ts';
import type { Sandbox, SandboxProvider } from '../src/build/sandbox.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

const KEY = 'sk_test_51AbCdEfGhIjKlMnOpQrStUvWx1234';

/** A sandbox that records what Harbor hands it. */
function recordingSandboxes() {
  const seen = { previews: [] as (Record<string, string> | undefined)[], redacted: [] as string[][] };
  const sandbox: Sandbox = {
    exec: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
    preview: async (opts) => {
      seen.previews.push(opts?.env);
      return 'https://sb-test.vercel.run';
    },
    redact: (values) => seen.redacted.push(values),
    stop: async () => undefined,
  };
  const provider: SandboxProvider = { kind: 'vercel', available: async () => true, forProject: async () => sandbox };
  return { provider, seen };
}

describe('an app’s Stripe key', () => {
  let db: Db;
  let app: App;
  let projectId: string;
  const { provider, seen } = recordingSandboxes();
  const send = sender(() => app);

  beforeAll(async () => {
    db = await openDb('memory://');
    app = createApp(db, {}, createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated', sandboxes: provider, projectsDir: await mkdtemp(join(tmpdir(), 'harbor-settings-')) }));
    const brandId = (await (await send('POST', '/v1/brands', { name: 'Tidewater', memory: RICH_MEMORY })).json()).id;
    projectId = (await (await send('POST', `/v1/brands/${brandId}/projects`, { name: 'Coffee club' })).json()).id;
  });
  afterAll(() => db.close());

  it('starts with none, refuses keys that aren’t Stripe secret keys, and never shows the key back', async () => {
    expect(await (await send('GET', `/v1/projects/${projectId}/settings`)).json()).toEqual({ stripe: null, canStore: true });

    const pk = await send('PUT', `/v1/projects/${projectId}/settings/stripe`, { key: 'pk_test_51AbCdEfGhIjKlMnOpQrStUv' });
    expect(pk.status).toBe(400);
    expect((await pk.json()).error.message).toContain('publishable key');
    expect((await send('PUT', `/v1/projects/${projectId}/settings/stripe`, { key: 'hello' })).status).toBe(400);

    const saved = await send('PUT', `/v1/projects/${projectId}/settings/stripe`, { key: KEY });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(JSON.parse(text)).toEqual({ stripe: { mode: 'test', last4: '1234' }, canStore: true });
    expect(text).not.toContain(KEY);
    expect(await (await send('GET', `/v1/projects/${projectId}/settings`)).text()).not.toContain(KEY);
  });

  it('stores it encrypted', async () => {
    const rows = await db.query<Record<string, unknown>>('SELECT * FROM secrets');
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(KEY);
    expect(JSON.stringify(rows)).not.toContain('51AbCdEf');
  });

  it('hands it to the app’s live server only, and tells the sandbox to hide it from the agent', async () => {
    const res = await send('POST', `/v1/projects/${projectId}/live`);
    expect(await res.json()).toEqual({ url: 'https://sb-test.vercel.run' });
    expect(seen.previews.at(-1)).toEqual({ STRIPE_SECRET_KEY: KEY });
    expect(seen.redacted.at(-1)).toEqual([KEY]);
  });

  it('can be removed, and goes with the project', async () => {
    expect(await (await send('DELETE', `/v1/projects/${projectId}/settings/stripe`)).json()).toEqual({ stripe: null, canStore: true });
    await send('POST', `/v1/projects/${projectId}/live`);
    expect(seen.previews.at(-1)).toEqual({});

    await send('PUT', `/v1/projects/${projectId}/settings/stripe`, { key: KEY.replace('_test_', '_live_') });
    expect((await (await send('GET', `/v1/projects/${projectId}/settings`)).json()).stripe).toEqual({ mode: 'live', last4: '1234' });
    expect((await send('DELETE', `/v1/projects/${projectId}`)).status).toBe(204);
    expect(await db.query("SELECT ref FROM secrets WHERE ref LIKE 'app-secrets:%'")).toEqual([]);
  });
});
