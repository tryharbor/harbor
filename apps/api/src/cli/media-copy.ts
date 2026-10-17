import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { mediaDirFromEnv } from '../lib/media-store.ts';

// HARBOR_INTERNAL_TOKEN=… pnpm --filter @harbor/api media:copy -- --to https://api.example.com [--from .media]
// Uploads every media library file to another Harbor API (PUT /v1/media-files/…), keeping its path, so the rows that
// db:copy moved find their files. --from defaults to HARBOR_MEDIA_DIR (apps/api/.media); relative paths are from apps/api.
const USAGE = 'Usage: HARBOR_INTERNAL_TOKEN=… pnpm --filter @harbor/api media:copy -- --to <api url> [--from <media dir>]';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: { from: { type: 'string' }, to: { type: 'string' } },
});
const to = values.to?.replace(/\/$/, '');
const token = process.env.HARBOR_INTERNAL_TOKEN;
if (!to || !/^https?:\/\//.test(to)) {
  console.error(USAGE);
  process.exit(2);
}
if (!token) {
  console.error(`Set HARBOR_INTERNAL_TOKEN to the target API's token.\n${USAGE}`);
  process.exit(2);
}

const root = resolve(values.from ?? mediaDirFromEnv());

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? files(join(dir, e.name)) : Promise.resolve(e.isFile() && !e.name.endsWith('.tmp') ? [join(dir, e.name)] : []))));
  return nested.flat();
}

const all = await files(root);
console.log(`Copying ${all.length} files from ${root} → ${to}`);
let copied = 0;
let bytes = 0;
const failed: string[] = [];
for (const path of all) {
  const key = relative(root, path).split(sep).join('/');
  const body = await readFile(path);
  const res = await fetch(`${to}/v1/media-files/${key.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
    body,
  }).catch((err: unknown) => ({ ok: false, status: 0, text: async () => String(err) }) as const);
  if (res.ok) {
    copied += 1;
    bytes += body.length;
  } else {
    failed.push(`${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
console.log(`Copied ${copied} of ${all.length} files (${(bytes / (1024 * 1024)).toFixed(1)} MB).`);
if (failed.length) {
  console.error(`Failed:\n  ${failed.join('\n  ')}`);
  process.exitCode = 1;
}
