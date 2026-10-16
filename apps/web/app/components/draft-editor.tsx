'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import type { Platform } from '@harbor/core';
import { publishDraft, rewriteDraft, saveDraft, type PublishState, type RewriteState } from '../actions';
import type { DraftView } from '../api';
import { PlatformIcon } from '../platform-icon';
import { CheckIssues, MediaPicker, type PickedMedia } from './media-picker';
import { Select } from './select';

const NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const LIMIT: Record<Platform, number> = { x: 280, linkedin: 3000, instagram: 2200, threads: 500 };
const THREADS: Record<Platform, boolean> = { x: true, threads: true, linkedin: false, instagram: false };
const SPLIT = /^\s*---\s*$/m;

export interface PostedSummary { id: string; status: string; url?: string; publishedAt?: string; scheduledFor?: string }

export interface ChannelOption { id: string; handle: string; displayName?: string; avatarUrl?: string }

/** One platform's pane in the Studio: edit, preview, rewrite, save a version, schedule. */
export function DraftEditor({
  brandId, brandName, ideaId, platform, draft, versions, channels, apiUrl, logoUrl, posted = [],
}: {
  brandId: string; brandName: string; ideaId: string; platform: Platform; draft?: DraftView; versions: DraftView[]; channels: ChannelOption[]; apiUrl: string; logoUrl?: string; posted?: PostedSummary[];
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

      <Preview platform={platform} handle={handle} name={channels[0]?.displayName ?? brandName} parts={parts} media={media} avatar={channels[0]?.avatarUrl ?? logoUrl} />

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

      {draft ? <PublishBox draft={draft} ideaId={ideaId} platform={platform} brandName={brandName} channels={channels} dirty={dirty} posted={posted} /> : null}
    </div>
  );
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/**
 * Post now or schedule, with the result shown right here. "Post now" asks once more before sending, since it's
 * public and immediate. Posts already made from this idea on this platform are listed so nothing goes out twice.
 */
function PublishBox({ draft, ideaId, platform, brandName, channels, dirty, posted }: { draft: DraftView; ideaId: string; platform: Platform; brandName: string; channels: ChannelOption[]; dirty: boolean; posted: PostedSummary[] }) {
  const [state, action, pending] = useActionState<PublishState, FormData>(publishDraft, undefined);
  const [confirming, setConfirming] = useState(false);
  const [tz, setTz] = useState('0');
  useEffect(() => setTz(String(new Date().getTimezoneOffset())), []);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(t);
  }, [confirming]);
  useEffect(() => setConfirming(false), [state]);
  const live = posted.filter((p) => p.status === 'published' || p.status === 'pending' || p.status === 'publishing');
  const queued = posted.filter((p) => p.status === 'scheduled');

  return (
    <form action={action} className="stack publish-box" style={{ gap: 10 }}>
      <input type="hidden" name="draftId" value={draft.id} />
      <input type="hidden" name="ideaId" value={ideaId} />
      <input type="hidden" name="tz" value={tz} />
      <span className="label">Post v{draft.version}</span>
      {live.length || queued.length ? (
        <ul className="posted small">
          {live.map((p) => <li key={p.id}><span className="check ok">✓</span> {p.status === 'published' ? 'Posted' : 'Posting'} {fmt(p.publishedAt)}{p.url ? <> · <a href={p.url} target="_blank" rel="noreferrer">View on {NAME[platform]} ↗</a></> : null} · <a href={`/performance/${p.id}`}>Performance</a></li>)}
          {queued.map((p) => <li key={p.id}><span className="mono">⏱</span> Scheduled for {fmt(p.scheduledFor)} · <a href={`/performance/${p.id}`}>Open</a></li>)}
        </ul>
      ) : null}
      {channels.length === 0 ? (
        <span className="dim small">No {NAME[platform]} account connected for {brandName}.</span>
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Select name="channelId" ariaLabel="Account" width="auto" options={channels.map((c) => ({ value: c.id, label: `@${c.handle}` }))} />
            {confirming ? (
              <button className="primary" type="submit" name="intent" value="now" disabled={pending}>{pending ? 'Posting…' : `Confirm: post to ${NAME[platform]} now`}</button>
            ) : (
              <button className="primary" type="button" onClick={() => setConfirming(true)} disabled={dirty || pending}>Post now</button>
            )}
            <span className="dim small">or</span>
            <input name="scheduledFor" type="datetime-local" aria-label="Schedule for" style={{ width: 'auto' }} />
            <button type="submit" name="intent" value="schedule" disabled={dirty || pending}>{pending ? 'Saving…' : 'Schedule'}</button>
          </div>
          {dirty ? <span className="dim small">Save the version first.</span> : confirming ? <span className="small muted">This publishes publicly right away. Click again to confirm.</span> : null}
        </>
      )}
      {state?.ok && state.status === 'scheduled' ? (
        <p className="notice small" role="status" style={{ margin: 0 }}>⏱ Scheduled for {fmt(state.when)}. It’s on the calendar; Harbor sends it on time.</p>
      ) : state?.ok ? (
        <p className="notice small" role="status" style={{ margin: 0 }}>
          ✓ {state.status === 'published' ? `Live on ${NAME[platform]}.` : `Sent; ${NAME[platform]} is still processing it.`}
          {state.url ? <> <a href={state.url} target="_blank" rel="noreferrer">View post ↗</a></> : null}
          {state.postId ? <> · <a href={`/performance/${state.postId}`}>Track its growth</a></> : null}
        </p>
      ) : state?.error ? (
        <p className="error small" role="alert" style={{ margin: 0 }}>{state.error}{state.postId ? <> · <a href={`/performance/${state.postId}`}>Details</a></> : null}</p>
      ) : null}
    </form>
  );
}

/** How the post will look. Approximations of each platform's layout, styled with Harbor's tokens. */
/** The connected account's own picture (what the post will show), else the brand logo, else the initial. */
function Preview({ platform, handle, name, parts, media, avatar }: { platform: Platform; handle: string; name: string; parts: string[]; media: string; avatar?: string }) {
  const initials = name.slice(0, 1).toUpperCase();
  const Avatar = () => (avatar ? <img className="avatar" src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{initials}</span>);
  const Media = () => (media ? <div className="preview-media">{/^https?:/.test(media) ? <img src={media} alt="" /> : 'media'}</div> : null);
  if (!parts.length) return <div className="preview dots"><span className="dim small">The {NAME[platform]} preview appears as you write.</span></div>;

  if (platform === 'instagram') {
    return (
      <div className="preview">
        <span className="label row" style={{ gap: 6 }}><PlatformIcon platform="instagram" size={11} />Preview · Instagram</span>
        <div className="preview-head"><Avatar /><strong style={{ fontWeight: 500 }}>{handle}</strong></div>
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
        <div className="preview-head"><Avatar /><span className="stack" style={{ gap: 0 }}><strong style={{ fontWeight: 500 }}>{name}</strong><span className="dim small">Now · Public</span></span></div>
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
          <div className="preview-head"><Avatar /><span><strong style={{ fontWeight: 500 }}>{name}</strong> <span className="dim small">@{handle}</span></span></div>
          <div className="preview-body">{p}</div>
          {i === 0 ? <Media /> : null}
        </div>
      ))}
    </div>
  );
}
