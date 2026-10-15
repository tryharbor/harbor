import postgres from 'postgres';
import { MIGRATIONS } from './migrations.ts';

/** The only database surface the app uses: parameterized SQL in, rows out. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
  /** Which engine is behind this handle. Jobs (pg-boss) need a real Postgres. */
  readonly kind: 'postgres' | 'pglite';
}

export const isPostgresUrl = (url?: string): url is string => !!url && /^postgres(ql)?:\/\//.test(url);

/**
 * DATABASE_URL is a postgres:// URL → real Postgres (Supabase in production). Otherwise embedded Postgres (PGlite):
 * on disk under `.pglite/` for local dev, or in memory for tests (`memory://`). Same SQL either way.
 */
export async function openDb(url = process.env.DATABASE_URL, opts: { migrate?: boolean } = {}): Promise<Db> {
  let db: Db;
  if (isPostgresUrl(url)) {
    // prepare:false keeps us compatible with transaction-mode poolers (Supabase :6543, PgBouncer).
    // The app passes JSON already stringified (as with PGlite), so don't let postgres-js encode it a second time.
    const passThrough = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
    const sql = postgres(url, {
      max: 5, prepare: false, idle_timeout: 20, onnotice: () => {},
      types: {
        json: { to: 114, from: [114], serialize: passThrough, parse: (v: string) => JSON.parse(v) },
        jsonb: { to: 3802, from: [3802], serialize: passThrough, parse: (v: string) => JSON.parse(v) },
      },
    });
    db = {
      kind: 'postgres',
      query: async <T>(text: string, params: unknown[] = []) => (await sql.unsafe(text, params as never[])) as unknown as T[],
      close: () => sql.end(),
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const lite = new PGlite(url || '.pglite');
    db = {
      kind: 'pglite',
      query: async <T>(text: string, params: unknown[] = []) => (await lite.query<T>(text, params)).rows,
      close: () => lite.close(),
    };
  }
  if (opts.migrate ?? process.env.HARBOR_AUTO_MIGRATE !== '0') await migrate(db);
  return db;
}

/**
 * Apply pending migrations in order, recording each in schema_migrations. Every statement is idempotent
 * (IF NOT EXISTS / ON CONFLICT), so a migration interrupted halfway can simply run again.
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const done = new Set((await db.query<{ id: string }>('SELECT id FROM schema_migrations')).map((r) => r.id));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    for (const statement of m.statements) await db.query(statement);
    await db.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [m.id]);
    applied.push(m.id);
  }
  return applied;
}
