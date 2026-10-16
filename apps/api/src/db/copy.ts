import { migrate, type Db } from './client.ts';
import { MIGRATIONS } from './migrations.ts';

/** Rows a fresh migrate() creates by itself. They don't make a target "non-empty". */
const SEEDED_ROWS: Record<string, string> = { workspaces: `id = 'ws_default'` };
const SKIP = new Set(['schema_migrations']);

interface Column {
  name: string;
  /** format_type(): e.g. `jsonb`, `timestamp with time zone`, `text[]`. Used as the insert cast. */
  type: string;
  /** 'a' = GENERATED ALWAYS AS IDENTITY, 'd' = BY DEFAULT, '' = not an identity column. */
  identity: string;
  /** The sequence behind an identity or serial column, if any. */
  sequence: string | null;
}

interface Table {
  name: string;
  columns: Column[];
  primaryKey: string[];
  /** Columns that reference this same table (canvas_items.parent_id, agent_runs.parent_run_id). Filled in a second pass. */
  selfRefs: string[];
}

export interface TableCount {
  table: string;
  source: number;
  target: number;
}

export class CopyRefused extends Error {}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
const count = async (db: Db, table: string, where?: string) =>
  Number((await db.query<{ n: number | string }>(`SELECT count(*) AS n FROM ${q(table)}${where ? ` WHERE NOT (${where})` : ''}`))[0]?.n ?? 0);

/** Every user table in `public`, in an order where each table comes after the tables it references. */
export async function listTables(db: Db): Promise<Table[]> {
  const names = (
    await db.query<{ name: string }>(`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
  ).map((r) => r.name).filter((n) => !SKIP.has(n));

  const fks = await db.query<{ child: string; parent: string; column: string }>(
    `SELECT c.relname AS child, p.relname AS parent, a.attname AS "column"
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_class p ON p.oid = k.confrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
      WHERE k.contype = 'f' AND n.nspname = 'public'`,
  );

  const tables = new Map<string, Table>();
  for (const name of names) {
    const columns = await db.query<Column>(
      `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attidentity::text AS identity,
              pg_get_serial_sequence(quote_ident($1), a.attname) AS sequence
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        ORDER BY a.attnum`,
      [name],
    );
    const primaryKey = (
      await db.query<{ name: string }>(
        `SELECT a.attname AS name
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
          WHERE i.indisprimary AND n.nspname = 'public' AND c.relname = $1`,
        [name],
      )
    ).map((r) => r.name);
    const selfRefs = fks.filter((f) => f.child === name && f.parent === name).map((f) => f.column);
    if (selfRefs.length && !primaryKey.length) throw new Error(`${name} references itself but has no primary key.`);
    tables.set(name, { name, columns, primaryKey, selfRefs });
  }

  // Topological sort on foreign keys (self-references are handled by the second pass, so they don't count).
  const deps = new Map(names.map((n) => [n, new Set(fks.filter((f) => f.child === n && f.parent !== n && tables.has(f.parent)).map((f) => f.parent))]));
  const ordered: Table[] = [];
  const placed = new Set<string>();
  while (ordered.length < names.length) {
    const ready = names.filter((n) => !placed.has(n) && [...deps.get(n)!].every((d) => placed.has(d)));
    if (!ready.length) throw new Error(`Foreign keys form a cycle between: ${names.filter((n) => !placed.has(n)).join(', ')}.`);
    for (const n of ready) {
      placed.add(n);
      ordered.push(tables.get(n)!);
    }
  }
  return ordered;
}

/** Applied migration ids, or [] for a database Harbor never touched. */
async function appliedMigrations(db: Db): Promise<string[]> {
  const [exists] = await db.query<{ ok: boolean }>(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`);
  if (!exists?.ok) return [];
  return (await db.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id')).map((r) => r.id);
}

/** Tables in `db` holding rows other than the ones migrate() seeds. */
export async function nonEmptyTables(db: Db): Promise<string[]> {
  const out: string[] = [];
  for (const t of await listTables(db)) if ((await count(db, t.name, SEEDED_ROWS[t.name])) > 0) out.push(t.name);
  return out;
}

/**
 * Copy every Harbor table from `source` to `target`:
 * - migrates the target (the source must already be on this version's schema);
 * - refuses a target that holds data unless `force` (which replaces it);
 * - inserts in foreign-key-safe order, inside one transaction on the target;
 * - returns the row counts per table on both sides.
 * Values travel as Postgres text (`col::text` out, `$1::text::<type>` in), so JSON, arrays, timestamps and bigints
 * round-trip exactly and neither driver re-encodes them. Tokens stay encrypted, so the target must run with the same HARBOR_SECRET_KEY.
 */
export async function copyDatabase(source: Db, target: Db, opts: { force?: boolean; log?: (line: string) => void } = {}): Promise<TableCount[]> {
  const log = opts.log ?? (() => {});
  const known = MIGRATIONS.map((m) => m.id);
  const applied = await appliedMigrations(source);
  const missing = known.filter((id) => !applied.includes(id));
  const unknown = applied.filter((id) => !known.includes(id));
  if (missing.length) throw new CopyRefused(`The source is missing migrations ${missing.join(', ')}. Run db:migrate against it (or start the API on it once), then copy.`);
  if (unknown.length) throw new CopyRefused(`The source has migrations this code doesn't know (${unknown.join(', ')}). Update Harbor first.`);

  const ran = await migrate(target);
  if (ran.length) log(`Migrated the target: ${ran.join(', ')}.`);

  const busy = await nonEmptyTables(target);
  if (busy.length && !opts.force) throw new CopyRefused(`The target already has data (${busy.join(', ')}). Pass --force to replace it.`);

  const tables = await listTables(target);
  const sourceTables = new Map((await listTables(source)).map((t) => [t.name, t]));
  for (const t of tables) {
    const s = sourceTables.get(t.name);
    if (!s) throw new CopyRefused(`The source has no ${t.name} table.`);
    const extra = s.columns.filter((c) => !t.columns.some((tc) => tc.name === c.name)).map((c) => c.name);
    if (extra.length) throw new CopyRefused(`${t.name} has columns the target lacks: ${extra.join(', ')}.`);
  }

  const sourceCounts = new Map<string, number>();
  await target.transaction(async (tx) => {
    if (tables.length) await tx.query(`TRUNCATE ${tables.map((t) => q(t.name)).join(', ')} RESTART IDENTITY CASCADE`);
    for (const t of tables) {
      const cols = t.columns.filter((c) => sourceTables.get(t.name)!.columns.some((sc) => sc.name === c.name));
      const rows = await source.query<Record<string, string | null>>(
        `SELECT ${cols.map((c) => `${q(c.name)}::text AS ${q(c.name)}`).join(', ')} FROM ${q(t.name)}`,
      );
      sourceCounts.set(t.name, rows.length);
      if (!rows.length) continue;

      // Pass 1: every row, with self-references left NULL so parent/child order within the table doesn't matter.
      const overriding = cols.some((c) => c.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : '';
      const perBatch = Math.max(1, Math.min(500, Math.floor(30_000 / cols.length)));
      for (let i = 0; i < rows.length; i += perBatch) {
        const batch = rows.slice(i, i + perBatch);
        const params: (string | null)[] = [];
        const values = batch.map((row) =>
          `(${cols.map((c) => {
            params.push(t.selfRefs.includes(c.name) ? null : row[c.name] ?? null);
            return `$${params.length}::text::${c.type}`;
          }).join(', ')})`,
        );
        await tx.query(`INSERT INTO ${q(t.name)} (${cols.map((c) => q(c.name)).join(', ')})${overriding} VALUES ${values.join(', ')}`, params);
      }

      // Pass 2: restore the self-references.
      for (const ref of t.selfRefs) {
        const refType = cols.find((c) => c.name === ref)!.type;
        const keyCols = t.primaryKey.map((k) => cols.find((c) => c.name === k)!);
        for (const row of rows) {
          if (row[ref] == null) continue;
          const where = keyCols.map((k, j) => `${q(k.name)} = $${j + 2}::text::${k.type}`).join(' AND ');
          await tx.query(`UPDATE ${q(t.name)} SET ${q(ref)} = $1::text::${refType} WHERE ${where}`, [row[ref], ...keyCols.map((k) => row[k.name])]);
        }
      }

      // Identity and serial columns: continue after the copied values.
      for (const c of cols) {
        if (!c.sequence) continue;
        await tx.query(`SELECT setval($1::regclass, COALESCE((SELECT max(${q(c.name)}) FROM ${q(t.name)}), 0) + 1, false)`, [c.sequence]);
      }
    }
  });

  const counts: TableCount[] = [];
  for (const t of tables) counts.push({ table: t.name, source: sourceCounts.get(t.name) ?? 0, target: await count(target, t.name) });
  return counts;
}
