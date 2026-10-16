import { parseArgs } from 'node:util';
import { isPostgresUrl, openDb } from '../db/client.ts';
import { CopyRefused, copyDatabase } from '../db/copy.ts';

// pnpm --filter @harbor/api db:copy -- --from <pglite dir or postgres url> --to <postgres url> [--force]
// Paths are relative to apps/api (e.g. --from .pglite). Stop the API that uses a PGlite source first: PGlite
// directories don't take a second process. The target must run with the same HARBOR_SECRET_KEY as the source.
const USAGE = 'Usage: pnpm --filter @harbor/api db:copy -- --from <pglite dir or postgres url> --to <postgres url> [--force]';

/** postgres://user:secret@host/db → postgres://user:***@host/db, so passwords stay out of the terminal. */
const redact = (url: string) => (isPostgresUrl(url) ? url.replace(/(\/\/[^:/@]+:)[^@]*@/, '$1***@') : url);

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: { from: { type: 'string' }, to: { type: 'string' }, force: { type: 'boolean', default: false } },
});
const { from, to, force } = values;
if (!from || !to) {
  console.error(USAGE);
  process.exit(2);
}
if (!isPostgresUrl(to)) {
  console.error(`--to must be a postgres:// URL.\n${USAGE}`);
  process.exit(2);
}
if (from === to) {
  console.error('--from and --to are the same database.');
  process.exit(2);
}

console.log(`Copying ${redact(from)} → ${redact(to)}${force ? ' (--force: replacing the target)' : ''}`);
const source = await openDb(from, { migrate: false });
const target = await openDb(to, { migrate: false });
try {
  const counts = await copyDatabase(source, target, { force, log: (line) => console.log(line) });
  const width = Math.max(...counts.map((c) => c.table.length), 5);
  console.log(`\n${'table'.padEnd(width)}  ${'source'.padStart(7)}  ${'target'.padStart(7)}`);
  for (const c of counts) console.log(`${c.table.padEnd(width)}  ${String(c.source).padStart(7)}  ${String(c.target).padStart(7)}${c.source === c.target ? '' : '  MISMATCH'}`);
  const total = (k: 'source' | 'target') => counts.reduce((n, c) => n + c[k], 0);
  console.log(`${'total'.padEnd(width)}  ${String(total('source')).padStart(7)}  ${String(total('target')).padStart(7)}`);
  if (counts.some((c) => c.source !== c.target)) process.exitCode = 1;
  else console.log('\nDone. Copy media files (HARBOR_MEDIA_DIR) separately; the target needs the same HARBOR_SECRET_KEY.');
} catch (err) {
  console.error(err instanceof CopyRefused ? err.message : err);
  process.exitCode = 1;
} finally {
  await source.close();
  await target.close();
}
