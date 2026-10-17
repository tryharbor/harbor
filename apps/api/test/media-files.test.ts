import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import type { MediaStore } from '../src/lib/media-store.ts';

const TOKEN = 'test-internal-token-0123456789abcdef';
const written = new Map<string, Uint8Array>();
const store: MediaStore = {
  put: async (key, bytes) => void written.set(key, bytes),
  get: async () => undefined,
  delete: async (key) => void written.delete(key),
};

let db: Db;
let app: App;
beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated', internalToken: TOKEN, mediaStore: store });
});
afterAll(async () => db.close());

const put = (key: string, body: BodyInit | null, token: string | null = TOKEN) =>
  app.request(`https://api.example.com/v1/media-files/${key}`, {
    method: 'PUT',
    headers: { host: 'api.example.com', 'x-forwarded-for': '203.0.113.9', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });

describe('PUT /v1/media-files/* (media:copy)', () => {
  it('writes the bytes at the same path', async () => {
    const res = await put('brd_abc/med_def/original.png', new Uint8Array([1, 2, 3]));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ key: 'brd_abc/med_def/original.png', bytes: 3 });
    expect([...written.get('brd_abc/med_def/original.png')!]).toEqual([1, 2, 3]);
  });

  it('needs the internal token', async () => {
    expect((await put('brd_abc/med_def/original.png', new Uint8Array([1]), null)).status).toBe(401);
    expect((await put('brd_abc/med_def/original.png', new Uint8Array([1]), 'wrong')).status).toBe(401);
  });

  it('only takes brd_…/med_…/<file> paths', async () => {
    for (const key of ['original.png', 'brd_abc/original.png', 'brd_abc/med_def/sub/x.png', 'brd_abc/med_def/..%2F..%2Fetc', 'other/med_def/x.png', 'brd_abc/med_def/.hidden']) {
      expect((await put(key, new Uint8Array([1]))).status, key).toBe(400);
    }
  });

  it('refuses an empty body', async () => {
    expect((await put('brd_abc/med_def/original.png', new Uint8Array())).status).toBe(400);
  });
});
