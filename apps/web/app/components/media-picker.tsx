'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Platform } from '@harbor/core';
import { fitMedia, listMedia } from '../media-actions';
import type { MediaAsset, MediaCheck, MediaVariant } from '../api';
import { MediaUploader } from './media-uploader';

export type PickedMedia = { assetId: string; variant: MediaVariant; url: string; kind: 'image' | 'video'; alt?: string; check: MediaCheck };

/**
 * Pick from the brand's library (or upload into it). The pick comes back already cropped for the platform
 * (its preferred variant) with the platform's media check, so problems show before scheduling.
 */
export function MediaPicker({ apiUrl, brandId, platform, onPick, onClose }: { apiUrl: string; brandId: string; platform: Platform; onPick: (m: PickedMedia) => void; onClose: () => void }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string>();
  const [loading, startLoad] = useTransition();
  const [picking, startPick] = useTransition();

  const load = (query = q) => startLoad(async () => {
    const res = await listMedia(brandId, query);
    setAssets(res.assets);
    setError(res.error);
  });
  useEffect(() => { load(''); }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (a: MediaAsset) => startPick(async () => {
    const fit = await fitMedia(a.id, platform);
    if ('error' in fit) return setError(fit.error);
    onPick({ assetId: a.id, variant: fit.variant, url: fit.url, kind: a.kind, alt: a.alt, check: fit.check });
  });

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" role="dialog" aria-label="Media library" onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <span className="label">Media library</span>
          <button type="button" className="link-button" onClick={onClose}>Close</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); load(); } }} placeholder="Search alt text, names, tags" />
          <button type="button" onClick={() => load()}>Search</button>
        </div>
        <MediaUploader apiUrl={apiUrl} brandId={brandId} compact onUploaded={() => load()} />
        {error ? <p className="error small" role="alert">{error}</p> : null}
        <div className="media-grid small-tiles" aria-busy={loading || picking}>
          {assets.map((a) => (
            <button key={a.id} type="button" className="media-tile" onClick={() => pick(a)} disabled={picking} title={a.alt ?? a.originalName}>
              <span className="media-thumb">{a.kind === 'image' ? <img src={a.variants.square ?? a.url} alt={a.alt ?? ''} loading="lazy" /> : <span className="media-video mono">▶ video</span>}</span>
              <span className="media-meta"><span className="evidence-text small">{a.alt || a.originalName || 'No alt text'}</span></span>
            </button>
          ))}
        </div>
        {!loading && !assets.length ? <span className="small dim">Nothing in this brand’s library yet. Drop an image above.</span> : null}
      </div>
    </div>
  );
}

export function CheckIssues({ check }: { check?: MediaCheck }) {
  if (!check?.issues.length) return null;
  return (
    <ul className="checks">
      {check.issues.map((i, n) => (
        <li key={n} className={`check ${i.level === 'fail' ? 'fail' : 'warn'}`}><span aria-hidden="true">{i.level === 'fail' ? '✕' : '!'}</span><span>{i.message}</span></li>
      ))}
    </ul>
  );
}
