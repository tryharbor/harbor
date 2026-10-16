'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setFocal } from '../../media-actions';
import type { MediaAsset, MediaVariant } from '../../api';

const CROPS: { variant: MediaVariant; label: string; ratio: number; where: string }[] = [
  { variant: 'portrait', label: '4:5', ratio: 4 / 5, where: 'Instagram feed · Threads' },
  { variant: 'square', label: '1:1', ratio: 1, where: 'Instagram grid' },
  { variant: 'wide', label: '16:9', ratio: 16 / 9, where: 'X' },
  { variant: 'landscape', label: '1.91:1', ratio: 1.91, where: 'LinkedIn' },
  { variant: 'story', label: '9:16', ratio: 9 / 16, where: 'Stories · Reels cover' },
];

/** The crop a ratio takes from the original around the focal point, in 0–1 coordinates (mirrors the API). */
function cropBox(w: number, h: number, ratio: number, fx: number, fy: number) {
  const src = w / h;
  const cw = src > ratio ? ratio / src : 1;
  const ch = src > ratio ? 1 : src / ratio;
  const x = Math.min(1 - cw, Math.max(0, fx - cw / 2));
  const y = Math.min(1 - ch, Math.max(0, fy - ch / 2));
  return { x, y, w: cw, h: ch };
}

/** Click the image to set its focal point; every platform crop recenters on it. Crops preview live, then save. */
export function FocalPicker({ asset }: { asset: MediaAsset }) {
  const router = useRouter();
  const [focal, setLocal] = useState(asset.focal);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [hover, setHover] = useState<MediaVariant | null>(null);
  const w = asset.width ?? 1, h = asset.height ?? 1;

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    setLocal({ x, y });
    start(async () => {
      const res = await setFocal(asset.id, x, y);
      if (!res.ok) setError(res.error);
      else { setError(undefined); router.refresh(); }
    });
  };
  const shown = hover ? CROPS.find((c) => c.variant === hover) : undefined;
  const box = shown ? cropBox(w, h, shown.ratio, focal.x, focal.y) : undefined;

  return (
    <div className="stack">
      <div className="focal-stage" onClick={pick} style={{ aspectRatio: `${w} / ${h}` }} role="button" aria-label="Set the focal point">
        <img src={asset.variants.original ?? asset.url} alt={asset.alt ?? ''} />
        {box ? <span className="crop-box" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} /> : null}
        <span className="focal-dot" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} aria-hidden="true" />
      </div>
      <span className="small dim">{pending ? 'Saving focal point…' : 'Click the part that must stay in frame. Hover a crop below to see what it keeps.'}</span>
      {error ? <p className="error small" role="alert">{error}</p> : null}
      <div className="crop-grid">
        {CROPS.map((c) => {
          const b = cropBox(w, h, c.ratio, focal.x, focal.y);
          return (
            <figure key={c.variant} className="crop" onMouseEnter={() => setHover(c.variant)} onMouseLeave={() => setHover(null)}>
              <span className="crop-frame" style={{ aspectRatio: String(c.ratio) }}>
                {/* Live preview from the original, so it moves with the focal point before the server re-renders. */}
                <img
                  src={asset.variants.original ?? asset.url}
                  alt=""
                  style={{ width: `${100 / b.w}%`, height: `${100 / b.h}%`, left: `${(-b.x / b.w) * 100}%`, top: `${(-b.y / b.h) * 100}%` }}
                />
              </span>
              <figcaption className="small"><span className="mono">{c.label}</span> <span className="dim">{c.where}</span></figcaption>
              {asset.variants[c.variant] ? <a className="small" href={asset.variants[c.variant]} target="_blank" rel="noreferrer">Open JPEG</a> : null}
            </figure>
          );
        })}
      </div>
    </div>
  );
}
