'use client';

import { useEffect, useState } from 'react';
import { useInView, useReducedMotion } from '../reveal';
import { ART_H, ART_W, Artwork, SUBJECTS, cropBox } from './artwork';
import { Cell, Layer } from './reserve';

const CROPS = [
  { variant: 'portrait', label: '4:5', ratio: 4 / 5, where: 'Instagram · Threads' },
  { variant: 'square', label: '1:1', ratio: 1, where: 'Instagram grid' },
  { variant: 'wide', label: '16:9', ratio: 16 / 9, where: 'X' },
  { variant: 'landscape', label: '1.91:1', ratio: 1.91, where: 'LinkedIn' },
  { variant: 'story', label: '9:16', ratio: 9 / 16, where: 'Stories · Reels cover' },
];
const A = { x: SUBJECTS.mark.x / ART_W, y: SUBJECTS.mark.y / ART_H };
const B = { x: SUBJECTS.sun.x / ART_W, y: SUBJECTS.sun.y / ART_H };
const CYCLE = 6000;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The media library's focal point: it drifts between the two subjects and every platform crop follows it, the way
 * the API recenters each variant. Click the image to set it yourself. Reduced motion: it stays on the first subject.
 */
export function FocalCropsPreview() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const [focal, setFocal] = useState(A);
  const [own, setOwn] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView || reduced || own) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // A frame's timestamp can be a little older than `start`; never let the clock run backwards.
      const ms = Math.max(0, now - start);
      const t = (ms % CYCLE) / CYCLE;
      // Hold on each subject for a moment, then glide to the other.
      const k = t < 0.2 ? 0 : t < 0.5 ? ease((t - 0.2) / 0.3) : t < 0.7 ? 1 : 1 - ease((t - 0.7) / 0.3);
      setFocal({ x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k });
      setShown(Math.floor(ms / 1500) % CROPS.length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, own]);

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOwn(true);
    setFocal({ x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) });
  };
  const box = cropBox(CROPS[shown]!.ratio, focal.x, focal.y);

  return (
    <div ref={ref} className="pv" style={{ minHeight: 470 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Media · launch-art.png · 1600 × 1000</span><strong className="pv-title">Set the focal point once. Every crop follows.</strong></div>
        <Cell style={{ justifyItems: 'end', alignItems: 'center' }}>
          <Layer on={own}><button type="button" className="a-btn" onClick={() => { setOwn(false); }}>Resume demo</button></Layer>
          <Layer on={!own}><span className="pv-tag">Click the image</span></Layer>
        </Cell>
      </div>
      <div className="pv-focal" onClick={pick} role="button" tabIndex={0} aria-label="Set the focal point" onKeyDown={(e) => { if (e.key === 'Enter') setOwn(true); }}>
        <Artwork />
        <span className="pv-crop-box" style={{ left: `${(box.x / ART_W) * 100}%`, top: `${(box.y / ART_H) * 100}%`, width: `${(box.w / ART_W) * 100}%`, height: `${(box.h / ART_H) * 100}%` }} />
        <span className="pv-focal-dot" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />
      </div>
      <div className="pv-crops">
        {CROPS.map((c, i) => (
          <figure key={c.variant} className={`pv-crop${i === shown ? ' on' : ''}`} onMouseEnter={() => setShown(i)}>
            <div className="pv-crop-img" style={{ aspectRatio: `${c.ratio}` }}><Artwork box={cropBox(c.ratio, focal.x, focal.y)} /></div>
            <figcaption><span className="pv-mono" style={{ color: 'var(--a-ink)' }}>{c.label}</span> <span className="pv-sub">{c.where}</span></figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
