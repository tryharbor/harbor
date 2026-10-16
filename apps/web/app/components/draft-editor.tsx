'use client';

import { useActionState, useMemo, useState } from 'react';
import type { Platform } from '@harbor/core';
import { rewriteDraft, saveDraft, scheduleDraft, type RewriteState } from '../actions';
import type { DraftView } from '../api';
import { PlatformIcon } from '../platform-icon';
import { CheckIssues, MediaPicker, type PickedMedia } from './media-picker';

const NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const LIMIT: Record<Platform, number> = { x: 280, linkedin: 3000, instagram: 2200, threads: 500 };
const THREADS: Record<Platform, boolean> = { x: true, threads: true, linkedin: false, instagram: false };
const SPLIT = /^\s*---\s*$/m;

export interface ChannelOption { id: string; handle: string }

/** One platform's pane in the Studio: edit, preview, rewrite, save a version, schedule. */
export function DraftEditor({
  brandId, brandName, ideaId, platform, draft, versions, channels, apiUrl,
}: {
  brandId: string; brandName: string; ideaId: string; platform: Platform; draft?: DraftView; versions: DraftView[]; channels: ChannelOption[]; apiUrl: string;
}) {
  const initial = draft ? draft.parts.map((p) => p.text).join('\n---\n') : '';
  const [body, setBody] = useState(initial);
  const [media, setMedia] = useState(draft?.parts[0]?.media[0]?.url ?? '');
  const saved = draft?.parts[0]?.media[0] as (DraftView['parts'][number]['media'][number] & { assetId?: string; variant?: string }) | undefined;
  const [picked, setPicked] = useState<Pick<PickedMedia, 'assetId' | 'variant' | 'kind'> & { check?: PickedMedia['check'] } | undefined>(
    saved?.assetId ? { assetId: saved.assetId, variant: (saved.variant ?? 'original') as PickedMedia['variant'], kind: saved.kind } : undefined,
  );
  const [picking, setPicking] = useState(false);
  const [rewrite, rewriteAction, rewriting] = useActionState<RewriteState, FormData>(rewriteDraft, undefined);
  const parts = useMemo(() => body.split(SPLIT).map((t) => t.trim()).filter(Boolean), [body]);
  const limit = LIMIT[platform];
  const over = parts.some((p) => [...p].length > limit);
  const dirty = body !== initial || media !== (draft?.parts[0]?.media[0]?.url ?? '');
  const handle = channels[0]?.handle ?? brandName.toLowerCase().replace(/\W+/g, '');
  const returnTo = `/studio/${ideaId}`;

  /** Variations come back as complete draft bodies (parts separated by `---`), so they replace the editor text. */
  const applyVariation = (v: string) => setBody(v);

  return (
    <div className="pane">
      <div className="pane-head">
        <span className="row"><span className="ptag"><PlatformIcon platform={platform} size={13} />{NAME[platform]}</span>{draft ? <span className="dim small mono">v{draft.version} · {draft.author === 'agent' ? 'drafted by Harbor' : 'edited by you'}</span> : <span className="dim small">No draft yet</span>}</span>
        {draft?.author === 'agent' ? <span className="tag">Simulated</span> : null}
      </div>

      <form action={saveDraft} className="stack">
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="ideaId" value={ideaId} />
        <input type="hidden" name="platform" value={platform} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="field">
          <label htmlFor={`body-${platform}`}>{THREADS[platform] ? <>Text. <code>---</code> on its own line starts the next post in the thread.</> : 'Text'}</label>
          <textarea id={`body-${platform}`} name="body" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 170 }} />
          <span className={`char-count${over ? ' over' : ''}`}>
            {parts.length > 1 ? parts.map((p, i) => `${i + 1}: ${[...p].length}`).join(' · ') : [...(parts[0] ?? '')].length} / {limit.toLocaleString('en-US')}
          </span>
        </div>
        <div className="field">
          <span className="label">Image or video{platform === 'instagram' ? ' · required' : ''}</span>
          <input type="hidden" name="mediaUrl" value={media} />
          <input type="hidden" name="mediaAssetId" value={picked?.assetId ?? ''} />
          <input type="hidden" name="mediaVariant" value={picked?.variant ?? ''} />
          <input type="hidden" name="mediaKind" value={picked?.kind ?? ''} />
          {media ? (
            <div className="attached">
              {picked?.kind === 'video' || /\.(mp4|mov)(\?|$)/i.test(media) ? <span className="media-video mono">▶</span> : <img src={media} alt="" />}
              <span className="stack" style={{ gap: 4, minWidth: 0 }}>
                <span className="small">{picked ? <>From the library · <span className="mono">{picked.variant}</span> crop</> : <span className="evidence-text">{media}</span>}</span>
                <CheckIssues check={picked?.check} />
              </span>
              <button type="button" className="link-button small" onClick={() => { setMedia(''); setPicked(undefined); }}>Remove</button>
            </div>
          ) : null}
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="mono-button" onClick={() => setPicking(true)}>{media ? 'Replace' : 'Choose from library'}</button>
            {!picked ? <input aria-label="Or paste a media URL" type="url" value={media} onChange={(e) => { setMedia(e.target.value); setPicked(undefined); }} placeholder="or paste a URL" style={{ maxWidth: 260 }} /> : null}
          </div>
          {picking ? (
            <MediaPicker apiUrl={apiUrl} brandId={brandId} platform={platform} onClose={() => setPicking(false)} onPick={(m) => { setMedia(m.url); setPicked(m); setPicking(false); }} />
          ) : null}
        </div>
        <div className="row">
          <button type="submit" className={dirty ? 'inverse' : undefined} disabled={!dirty || over || !parts.length}>Save version</button>
          {dirty ? <span className="dim small">Unsaved changes</span> : null}
        </div>
      </form>

      <Preview platform={platform} handle={handle} name={brandName} parts={parts} media={media} />

      {draft ? (
        <form action={rewriteAction} className="stack" style={{ gap: 8 }}>
          <input type="hidden" name="draftId" value={draft.id} />
          <span className="label">Rewrite</span>
          <div className="row">
            {(['hook_variations', 'shorter', 'punchier', 'more_specific'] as const).map((i) => (
              <button key={i} type="submit" name="instruction" value={i} className="mono-button" disabled={rewriting}>{i.replace('_', ' ')}</button>
            ))}
          </div>
          {rewrite?.error ? <p className="error small">{rewrite.error}</p> : null}
          {rewrite?.variations && rewrite.draftId === draft.id ? (
            <div className="stack staging" style={{ padding: 12, gap: 8 }}>
              <span className="row"><span className="label">Variations</span><span className="tag">{rewrite.run?.model ?? 'simulated'}</span></span>
              {rewrite.variations.map((v, i) => (
                <div key={i} className="spread" style={{ alignItems: 'flex-start' }}>
                  <span className="small" style={{ whiteSpace: 'pre-wrap', flex: 1, minWidth: 0 }}>{v}</span>
                  <button type="button" onClick={() => applyVariation(v)}>Use</button>
                </div>
              ))}
              <span className="dim small">Use puts it in the editor; save to keep it as a new version.</span>
            </div>
          ) : null}
        </form>
      ) : null}

      {versions.length > 1 ? (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Versions</span>
          <div className="versions">
            {versions.map((v) => (
              <button key={v.id} type="button" className="mono-button" onClick={() => { setBody(v.parts.map((p) => p.text).join('\n---\n')); setMedia(v.parts[0]?.media[0]?.url ?? ''); }} title={`Load v${v.version} into the editor`}>
                v{v.version} {v.author === 'agent' ? '· Harbor' : '· you'}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {draft ? (
        <form action={scheduleDraft} className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <input type="hidden" name="draftId" value={draft.id} />
          <input type="hidden" name="ideaId" value={ideaId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <span className="label">Schedule v{draft.version}</span>
          {channels.length === 0 ? (
            <span className="dim small">No {NAME[platform]} account connected for {brandName}.</span>
          ) : (
            <div className="row">
              <select name="channelId" aria-label="Account" style={{ width: 'auto' }}>
                {channels.map((c) => <option key={c.id} value={c.id}>@{c.handle}</option>)}
              </select>
              <input name="scheduledFor" type="datetime-local" aria-label="When (empty = now)" style={{ width: 'auto' }} />
              <button className="primary" type="submit" disabled={dirty}>Schedule</button>
              {dirty ? <span className="dim small">Save the version first.</span> : <span className="dim small">Empty time = publish now.</span>}
            </div>
          )}
        </form>
      ) : null}
    </div>
  );
}

/** How the post will look. Approximations of each platform's layout, styled with Harbor's tokens. */
function Preview({ platform, handle, name, parts, media }: { platform: Platform; handle: string; name: string; parts: string[]; media: string }) {
  const initials = name.slice(0, 1).toUpperCase();
  const Media = () => (media ? <div className="preview-media">{/^https?:/.test(media) ? <img src={media} alt="" /> : 'media'}</div> : null);
  if (!parts.length) return <div className="preview dots"><span className="dim small">The {NAME[platform]} preview appears as you write.</span></div>;

  if (platform === 'instagram') {
    return (
      <div className="preview">
        <span className="label row" style={{ gap: 6 }}><PlatformIcon platform="instagram" size={11} />Preview · Instagram</span>
        <div className="preview-head"><span className="avatar">{initials}</span><strong style={{ fontWeight: 500 }}>{handle}</strong></div>
        {media ? <Media /> : <div className="preview-media">Instagram needs an image or video</div>}
        <div className="preview-body small"><strong style={{ fontWeight: 600 }}>{handle}</strong> {parts[0]}</div>
      </div>
    );
  }
  if (platform === 'linkedin') {
    const text = parts[0]!;
    const cut = text.length > 210;
    return (
      <div className="preview">
        <span className="label row" style={{ gap: 6 }}><PlatformIcon platform="linkedin" size={11} />Preview · LinkedIn</span>
        <div className="preview-head"><span className="avatar">{initials}</span><span className="stack" style={{ gap: 0 }}><strong style={{ fontWeight: 500 }}>{name}</strong><span className="dim small">Now · Public</span></span></div>
        <div className="preview-body">{cut ? <>{text.slice(0, 210)}<span className="dim">… see more</span></> : text}</div>
        <Media />
        {parts.length > 1 ? <span className="dim small">+ {parts.length - 1} comment{parts.length > 2 ? 's' : ''} posted under it</span> : null}
      </div>
    );
  }
  return (
    <div className="preview">
      <span className="label row" style={{ gap: 6 }}><PlatformIcon platform={platform} size={11} />Preview · {NAME[platform]}</span>
      {parts.map((p, i) => (
        <div key={i} className={i > 0 ? 'thread-line stack' : 'stack'} style={{ gap: 6 }}>
          <div className="preview-head"><span className="avatar">{initials}</span><span><strong style={{ fontWeight: 500 }}>{name}</strong> <span className="dim small">@{handle}</span></span></div>
          <div className="preview-body">{p}</div>
          {i === 0 ? <Media /> : null}
        </div>
      ))}
    </div>
  );
}
