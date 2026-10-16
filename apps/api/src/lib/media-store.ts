import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

/**
 * Where media library files live. Keys are relative paths like `brd_x/med_y/original.png`. The default is the local
 * disk; an S3-compatible store implements the same three calls at deploy time.
 */
export interface MediaStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** undefined when there is no such file. */
  get(key: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; bytes?: number } | undefined>;
  delete(key: string): Promise<void>;
}

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.heic': 'image/heic', '.avif': 'image/avif', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
};

/** apps/api/.media (gitignored), unless HARBOR_MEDIA_DIR says otherwise. */
export const DEFAULT_MEDIA_DIR = fileURLToPath(new URL('../../.media', import.meta.url));

export const mediaDirFromEnv = (env: Record<string, string | undefined> = process.env) => resolve(env.HARBOR_MEDIA_DIR || DEFAULT_MEDIA_DIR);

/** Files under one directory. Writes go to a temp file first, so a reader never sees half a file. */
export class LocalDiskStore implements MediaStore {
  readonly root: string;
  constructor(root: string = mediaDirFromEnv()) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root + sep)) throw new Error(`Media key escapes the store: ${key}`);
    return p;
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, p);
  }

  async get(key: string) {
    const p = this.path(key);
    const info = await stat(p).catch(() => undefined);
    if (!info?.isFile()) return undefined;
    const stream = Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>;
    return { stream, contentType: TYPES[extname(p).toLowerCase()] ?? 'application/octet-stream', bytes: info.size };
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

/** Read a stored file into memory (variants are made from the original). */
export async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
