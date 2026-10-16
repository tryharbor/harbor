'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState } from 'react';
import { importMediaUrl, refreshMedia } from '../media-actions';
import type { MediaAsset } from '../api';

type Item = { name: string; progress: number; error?: string; done?: boolean };
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/quicktime';

/** Upload one XHR per file straight to the API (server actions cap request bodies), with progress. */
function upload(apiUrl: string, brandId: string, file: File, onProgress: (p: number) => void): Promise<MediaAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl}/v1/brands/${brandId}/media`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const json = (() => { try { return JSON.parse(xhr.responseText); } catch { return {}; } })();
      if (xhr.status >= 200 && xhr.status < 300) resolve(json as MediaAsset);
      else reject(new Error(json?.error?.message ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error(`Can't reach the API at ${apiUrl}.`));
    const fd = new FormData();
    fd.set('file', file);
    xhr.send(fd);
  });
}

export function MediaUploader({ apiUrl, brandId, onUploaded, compact = false }: { apiUrl: string; brandId: string; onUploaded?: (a: MediaAsset) => void; compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [urlState, urlAction, fetching] = useActionState(importMediaUrl, {});

  const send = async (files: File[]) => {
    if (!files.length) return;
    const start = items.length;
    setItems((xs) => [...xs, ...files.map((f) => ({ name: f.name, progress: 0 }))]);
    await Promise.all(files.map(async (f, i) => {
      const set = (patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === start + i ? { ...x, ...patch } : x)));
      try {
        const asset = await upload(apiUrl, brandId, f, (p) => set({ progress: p }));
        set({ progress: 1, done: true });
        onUploaded?.(asset);
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Upload failed.' });
      }
    }));
    await refreshMedia();
    router.refresh();
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className={`dropzone${over ? ' over' : ''}${compact ? ' compact' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void send([...e.dataTransfer.files]); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
      >
        <span className="pixels" aria-hidden="true" />
        <span><strong>Drop images or video</strong> <span className="muted">or click to choose</span></span>
        {compact ? null : <span className="small dim">JPEG, PNG, WebP, GIF or HEIC up to 25 MB · MP4 or MOV up to 300 MB. Harbor crops for each platform.</span>}
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { void send([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      {items.length ? (
        <ul className="upload-list small">
          {items.map((it, i) => (
            <li key={i}>
              <span className="evidence-text">{it.name}</span>
              {it.error ? <span className="bad-ink">{it.error}</span> : it.done ? <span className="dim">✓ added</span> : <progress max={1} value={it.progress} />}
            </li>
          ))}
        </ul>
      ) : null}
      {compact ? null : (
        <form action={urlAction} className="row" style={{ gap: 6 }}>
          <input type="hidden" name="brandId" value={brandId} />
          <input name="url" type="url" placeholder="Or paste an image URL to import" required />
          <button type="submit" disabled={fetching}>{fetching ? 'Fetching…' : 'Import'}</button>
        </form>
      )}
      {urlState.error ? <p className="error small" role="alert">{urlState.error}</p> : null}
    </div>
  );
}
