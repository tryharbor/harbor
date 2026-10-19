'use client';

import { useState } from 'react';
import { MEDIA_RULES, checkMedia, type MediaCheck, type MediaRef, type MediaVariant, type Platform } from '@harbor/core';
import { CheckIssues, MediaPicker } from './media-picker';

/** One attached image or video, in post order. Library items carry their asset; pasted ones only a URL. */
export interface MediaItem { url: string; kind: 'image' | 'video'; assetId?: string; variant?: MediaVariant; alt?: string; check?: MediaCheck }

const NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const isVideoUrl = (url: string) => /\.(mp4|mov)(\?|$)/i.test(url);

/** Saved media (a draft part's) as editor items. */
export const toItems = (media: MediaRef[] = []): MediaItem[] => media.map((m) => ({ url: m.url, kind: m.kind, assetId: m.assetId, variant: m.variant, alt: m.alt }));

/** The form value the server actions read: library items by asset (the API fills the URL), others by URL. */
export const mediaValue = (items: MediaItem[]) =>
  JSON.stringify(items.map((m) => (m.assetId ? { kind: m.kind, assetId: m.assetId, variant: m.variant } : { kind: m.kind, url: m.url, alt: m.alt })));

/** Same items in the same order (what decides whether the media changed). */
export const sameMedia = (a: MediaItem[], b: MediaItem[]) => mediaValue(a) === mediaValue(b);

/** Items one post can carry on every one of `platforms` (the smallest limit). */
export const maxItems = (platforms: Platform[]) => (platforms.length ? Math.min(...platforms.map((p) => MEDIA_RULES[p].maxImages)) : 10);

/** Count, mixing and video rules for the whole list on each platform (per-item crop checks come from the library fit). */
export function listFailures(platforms: Platform[], items: MediaItem[]): string[] {
  const out = new Set<string>();
  for (const p of platforms) {
    if (!items.length) continue;
    for (const i of checkMedia(p, items.map((m) => ({ kind: m.kind }))).issues) if (i.level === 'fail') out.add(i.message);
  }
  return [...out];
}

/**
 * The ordered media of a post: add from the library (the picker stays open to add several) or by URL, reorder,
 * remove. The first item is the cover. `platforms` sets the limit shown and enforced: one platform in the Studio,
 * every selected channel's in the composer. Posts the list as JSON in the hidden field `name` (none when it's '',
 * for a caller that places the field in its own forms with `mediaValue`).
 */
export function MediaList({ items, onChange, platforms, apiUrl, brandId, name = 'media', libraryNote, crop = true }: {
  items: MediaItem[]; onChange: (items: MediaItem[]) => void; platforms: Platform[]; apiUrl: string; brandId?: string; name?: string; libraryNote?: string;
  /** Crop library picks for the one platform; off where the post may go to several (the API crops per platform). */
  crop?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [url, setUrl] = useState('');
  const max = maxItems(platforms);
  const full = items.length >= max;
  const only = platforms.length === 1 ? platforms[0] : undefined;
  const fit = crop ? only : undefined;
  const required = platforms.some((p) => MEDIA_RULES[p].required);
  const failures = listFailures(platforms, items);

  const move = (from: number, to: number) => {
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m!);
    onChange(next);
  };
  const addUrl = () => {
    const u = url.trim();
    if (!/^https?:\/\/\S+$/.test(u) || full) return;
    onChange([...items, { url: u, kind: isVideoUrl(u) ? 'video' : 'image' }]);
    setUrl('');
  };

  return (
    <div className="field">
      <span className="label">
        {max === 1 ? 'Image or video' : 'Images and video'}{required ? ' · required' : ''}
        <span className="dim"> · {items.length} of {max}</span>
      </span>
      <span className="dim small">
        {only
          ? max === 1 ? `${NAME[only]} takes one per post.` : `${NAME[only]} takes up to ${max}${items.length > 1 ? only === 'x' ? ', shown as a grid' : ', posted as a carousel' : ''}. The first is the cover.`
          : (['instagram', 'threads', 'x', 'linkedin'] as const).map((p) => `${NAME[p]} ${MEDIA_RULES[p].maxImages}`).join(' · ')}
      </span>
      {name ? <input type="hidden" name={name} value={mediaValue(items)} /> : null}
      {items.length ? (
        <ol className="media-list">
          {items.map((m, i) => (
            <li key={`${m.assetId ?? m.url}-${i}`} className="media-row">
              <span className="mono small dim">{i + 1}</span>
              {m.kind === 'video' ? <span className="media-video mono">▶</span> : <img src={m.url} alt={m.alt ?? ''} />}
              <span className="stack" style={{ gap: 4, minWidth: 0 }}>
                <span className="small evidence-text">{m.assetId ? m.alt || 'From the library' : m.url}</span>
                {m.variant ? <span className="dim small"><span className="mono">{m.variant}</span> crop</span> : null}
                <CheckIssues check={m.check} />
              </span>
              <span className="media-row-actions">
                <button type="button" className="square-button" aria-label={`Move item ${i + 1} up`} title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                <button type="button" className="square-button" aria-label={`Move item ${i + 1} down`} title="Move down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                <button type="button" className="square-button" aria-label={`Remove item ${i + 1}`} title="Remove" onClick={() => onChange(items.filter((_, n) => n !== i))}>✕</button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {failures.length ? (
        <ul className="checks">
          {failures.map((f) => <li key={f} className="check fail"><span aria-hidden="true">✕</span><span>{f}</span></li>)}
        </ul>
      ) : null}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="mono-button" onClick={() => setPicking(true)} disabled={full || !brandId}>{items.length ? 'Add from library' : 'Choose from library'}</button>
        <input aria-label="Or paste a media URL" type="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} placeholder="or paste a URL" style={{ maxWidth: 260 }} disabled={full} />
        {url ? <button type="button" onClick={addUrl} disabled={full || !/^https?:\/\/\S+$/.test(url.trim())}>Add</button> : null}
      </div>
      {libraryNote ? <span className="dim small">{libraryNote}</span> : null}
      {picking && brandId ? (
        <MediaPicker
          apiUrl={apiUrl} brandId={brandId} platform={fit} onClose={() => setPicking(false)}
          selected={items.map((m) => m.assetId).filter((id): id is string => !!id)} full={full}
          onPick={(m) => {
            // Picking a tile that's already in the post (it shows its number) takes it out again.
            if (items.some((i) => i.assetId === m.assetId)) return onChange(items.filter((i) => i.assetId !== m.assetId));
            const next = [...items,{ url: m.url, kind: m.kind, assetId: m.assetId, variant: m.variant, alt: m.alt, check: m.check }];
            onChange(next);
            if (next.length >= max) setPicking(false);
          }}
        />
      ) : null}
    </div>
  );
}
