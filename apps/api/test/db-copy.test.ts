import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { migrate, openDb, type Db } from '../src/db/client.ts';
import { CopyRefused, copyDatabase, listTables, nonEmptyTables } from '../src/db/copy.ts';
import { sender } from './helpers.ts';

let source: Db;
let target: Db;

beforeEach(async () => {
  source = await openDb('memory://');
  target = await openDb('memory://', { migrate: false });
});
afterEach(async () => {
  await source.close();
  await target.close();
});

/** A bit of everything: JSON with unicode, text[], dates, reals, identity columns and self-references in both directions. */
async function seed(db: Db) {
  const send = sender(() => createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' }));
  const brand = await (await send('POST', '/v1/brands', { name: 'Copy Co' })).json();
  await db.query(`UPDATE brands SET memory = $1 WHERE id = $2`, [JSON.stringify({ voice: { summary: 'Plain — “quoted”, emoji ⚓' } }), brand.id]);
  await db.query(`INSERT INTO api_keys (id, workspace_id, name, prefix, hash, scopes, last_used_at) VALUES ('key_1', 'ws_default', 'k', 'hbr_x', 'h1', '{read,draft}', '2026-10-01T12:34:56.789123Z')`);
  await db.query(`INSERT INTO campaigns (id, workspace_id, brand_id, name, starts_on) VALUES ('cmp_1', 'ws_default', $1, 'Launch', '2026-11-02')`, [brand.id]);
  for (const id of ['itm_a', 'itm_b', 'itm_c']) await db.query(`INSERT INTO canvas_items (id, campaign_id, kind, x, y) VALUES ($1, 'cmp_1', 'note', 0.1, -2.5)`, [id]);
  // itm_a (inserted first) points at itm_c (inserted last), so a straight insert in scan order would break the FK.
  await db.query(`UPDATE canvas_items SET parent_id = 'itm_c' WHERE id = 'itm_a'`);
  await db.query(`INSERT INTO canvas_edges (id, campaign_id, source, target) VALUES ('edg_1', 'cmp_1', 'itm_a', 'itm_b')`);
  for (const id of ['run_child', 'run_parent']) await db.query(`INSERT INTO agent_runs (id, workspace_id, brand_id, kind, status, input) VALUES ($1, 'ws_default', $2, 'agent', 'succeeded', '{"n":1}')`, [id, brand.id]);
  await db.query(`UPDATE agent_runs SET parent_run_id = 'run_parent' WHERE id = 'run_child'`);
  return brand as { id: string };
}

const dump = async (db: Db) => {
  const out: Record<string, unknown[]> = {};
  for (const t of await listTables(db)) {
    const cols = t.columns.map((c) => `"${c.name}"::text`).join(', ');
    out[t.name] = (await db.query(`SELECT ${cols} FROM "${t.name}"`)).map((r) => JSON.stringify(Object.values(r))).sort();
  }
  return out;
};

// Each test spins up two in-memory PGlite databases; under the full parallel suite that can pass 5s.
describe('db:copy', { timeout: 30_000 }, () => {
  it('migrates the target and copies every table exactly, reporting counts on both sides', async () => {
    const brand = await seed(source);
    const counts = await copyDatabase(source, target);

    expect(counts.every((c) => c.source === c.target)).toBe(true);
    expect(counts.find((c) => c.table === 'canvas_items')).toEqual({ table: 'canvas_items', source: 3, target: 3 });
    expect(counts.map((c) => c.table)).not.toContain('schema_migrations');
    expect(await dump(target)).toEqual(await dump(source));

    // Parents come before children (brands before campaigns before canvas items).
    const order = counts.map((c) => c.table);
    expect(order.indexOf('workspaces')).toBeLessThan(order.indexOf('brands'));
    expect(order.indexOf('campaigns')).toBeLessThan(order.indexOf('canvas_items'));
    expect(order.indexOf('canvas_items')).toBeLessThan(order.indexOf('canvas_edges'));

    // The copy is a working Harbor database: the API reads it, and identity columns continue after the copied rows.
    const res = await sender(() => createApp(target, { publishMode: 'sandbox', modelMode: 'simulated' }))('GET', `/v1/brands/${brand.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).memory.voice.summary).toBe('Plain — “quoted”, emoji ⚓');
    await target.query(`INSERT INTO canvas_items (id, campaign_id, kind) VALUES ('itm_new', 'cmp_1', 'note')`);
    const [seqs] = await target.query<{ fresh: string; old: string }>(
      `SELECT (SELECT seq FROM canvas_items WHERE id = 'itm_new')::text AS fresh, (SELECT max(seq) FROM canvas_items WHERE id <> 'itm_new')::text AS old`,
    );
    expect(Number(seqs!.fresh)).toBeGreaterThan(Number(seqs!.old));
  });

  it('refuses a target with data unless forced, and --force replaces it', async () => {
    await seed(source);
    await migrate(target);
    await seed(target);
    expect(await nonEmptyTables(target)).toContain('brands');
    await expect(copyDatabase(source, target)).rejects.toThrow(CopyRefused);
    await expect(copyDatabase(source, target)).rejects.toThrow(/already has data \(.*brands.*\)\. Pass --force/);

    await source.query(`UPDATE brands SET name = 'From source'`);
    const counts = await copyDatabase(source, target, { force: true });
    expect(counts.every((c) => c.source === c.target)).toBe(true);
    expect((await target.query<{ name: string }>('SELECT name FROM brands')).map((r) => r.name)).toEqual(['From source']);
  });

  it('treats a freshly migrated target as empty', async () => {
    await seed(source);
    const fresh = await openDb('memory://');
    try {
      expect(await nonEmptyTables(fresh)).toEqual([]);
      await copyDatabase(source, fresh);
      expect(await dump(fresh)).toEqual(await dump(source));
    } finally {
      await fresh.close();
    }
  });

  it('refuses a source that is behind on migrations, and rolls back a copy that fails halfway', async () => {
    const old = await openDb('memory://', { migrate: false });
    try {
      await expect(copyDatabase(old, target)).rejects.toThrow(/missing migrations 0001_init/);
    } finally {
      await old.close();
    }

    await seed(source);
    // A NOT NULL the source can't satisfy makes the insert into agent_runs fail after earlier tables were copied.
    await migrate(target);
    await target.query(`ALTER TABLE agent_runs ADD COLUMN must_have TEXT NOT NULL`);
    await expect(copyDatabase(source, target)).rejects.toThrow();
    expect(await nonEmptyTables(target)).toEqual([]);
  });
});
