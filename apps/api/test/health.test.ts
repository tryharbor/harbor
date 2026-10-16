import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.ts';
import { migrate, openDb, type Db } from '../src/db/client.ts';

let db: Db;
let app: App;

beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db);
});
afterAll(() => db.close());

describe('health', () => {
  it('reports ok and the database engine', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: 'pglite' });
    expect(res.headers.get('Harbor-Request-Id')).toMatch(/^req_/);
  });

  it('answers unknown routes with a typed 404', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });
});

describe('migrations', () => {
  it('creates every core table and is safe to re-run', async () => {
    expect(await migrate(db)).toEqual([]);
    const rows = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'agent_events', 'agent_runs', 'api_keys', 'approvals', 'automation_refs', 'automations', 'brands', 'campaigns', 'canvas_edges', 'canvas_items', 'channels',
      'competitors', 'digests', 'drafts', 'ideas', 'insights', 'oauth_states',
      'outcomes', 'posts', 'schema_migrations', 'secrets', 'signals', 'snapshot_jobs', 'snapshots', 'workspaces',
    ]);
  });
});
