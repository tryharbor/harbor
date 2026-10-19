'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { platformTextLength, type Platform } from '@harbor/core';
import { publishDraft, rewriteDraft, saveDraft, type PublishState, type RewriteState } from '../actions';
import type { DraftView } from '../api';
import { PlatformIcon } from '../platform-icon';
import { MediaList, listFailures, sameMedia, toItems, type MediaItem } from './media-list';
import { Select } from './select';
import { TZ } from '../ui';

const NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const LIMIT: Record<Platform, number> = { x: 280, linkedin: 3000, instagram: 2200, threads: 500 };
const THREADS: Record<Platform, boolean> = { x: true, threads: true, linkedin: false, instagram: false };
const SPLIT = /^\s*---\s*$/m;

export interface PostedSummary { id: string; status: string; url?: string; publishedAt?: string; scheduledFor?: string }

/** A pending approval made from one of this pane's drafts. */
export interface WaitingApproval { id: string; version: number; proposedFor: string; handle: string }

export interface ChannelOption { id: string; handle: string; displayName?: string; avatarUrl?: string }

/** One platform's pane in the Studio: edit, preview, rewrite, save a version, schedule. */
export function DraftEditor({
  brandId, brandName, ideaId, platform, draft, versions, channels, apiUrl, logoUrl, posted = [], waiting = [], connectHref,
}: {
  brandId: string; brandName: string; ideaId: string; platform: Platform; draft?: DraftView; versions: DraftView[]; channels: ChannelOption[]; apiUrl: string; logoUrl?: string; posted?: PostedSummary[]; waiting?: WaitingApproval[]; connectHref?: string;
}) {
  const initial = draft ? draft.parts.map((p) => p.text).join('\n---\n') : '';
  const [body, setBody] = useState(initial);
  const savedMedia = useMemo(() => toItems(draft?.parts[0]?.media), [draft]);
  const [media, setMedia] = useState<MediaItem[]>(savedMedia);
  const [rewrite, rewriteAction, rewriting] = useActionState<RewriteState, FormData>(rewriteDraft, undefined);
  const parts = useMemo(() => body.split(SPLIT).map((t) => t.trim()).filter(Boolean), [body]);
  const limit = LIMIT[platform];
  // The platform's own count: X counts each link as 23 characters.
  const over = parts.some((p) => platformTextLength(platform, p) > limit) || listFailures([platform], media).length > 0;
  const dirty = body !== initial || !sameMedia(media, savedMedia);
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
      {waiting.map((w) => (
        <p key={w.id} className="notice small" role="status" style={{ margin: 0 }}>
          <a href="/approvals">Waiting in Approvals · {fmt(w.proposedFor)}</a> for @{w.handle}, with v{w.version}
          {draft && w.version !== draft.version ? <> (this pane shows v{draft.version})</> : null}. Saving a new version here won’t change it.
        </p>
      ))}

      <form action={saveDraft} className="stack">
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="ideaId" value={ideaId} />
        <input type="hidden" name="platform" value={platform} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="field">
          <label htmlFor={`body-${platform}`}>{THREADS[platform] ? <>Text. <code>---</code> on its own line starts the next post in the thread.</> : 'Text'}</label>
          <textarea id={`body-${platform}`} name="body" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 170 }} />
          <span className={`char-count${over ? ' over' : ''}`}>
            {parts.length > 1 ? parts.map((p, i) => `${i + 1}: ${platformTextLength(platform, p)}`).join(' · ') : platformTextLength(platform, parts[0] ?? '')} / {limit.toLocaleString('en-US')}
          </span>
        </div>
        <MediaList items={media} onChange={setMedia} platforms={[platform]} apiUrl={apiUrl} brandId={brandId} />
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
              <button key={v.id} type="button" className="mono-button" onClick={() => { setBody(v.parts.map((p) => p.text).join('\n---\n')); setMedia(toItems(v.parts[0]?.media)); }} title={`Load v${v.version} into the editor`}>
                v{v.version} {v.author === 'agent' ? '· Harbor' : '· you'}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {draft ? <PublishBox draft={draft} ideaId={ideaId} platform={platform} brandName={brandName} channels={channels} dirty={dirty} posted={posted} connectHref={connectHref} /> : null}
    </div>
  );
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/**
 * Post now or schedule, with the result shown right here. "Post now" asks once more before sending, since it's
 * public and immediate. Posts already made from this idea on this platform are listed so nothing goes out twice.
 */
function PublishBox({ draft, ideaId, platform, brandName, channels, dirty, posted, connectHref }: { draft: DraftView; ideaId: string; platform: Platform; brandName: string; channels: ChannelOption[]; dirty: boolean; posted: PostedSummary[]; connectHref?: string }) {
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
        <span className="dim small">No {NAME[platform]} account connected for {brandName}.{connectHref ? <> <a href={connectHref}>Connect {NAME[platform]}</a></> : null}</span>
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Select name="channelId" ariaLabel="Account" width="auto" options={channels.map((c) => ({ value: c.id, label: `@${c.handle}` }))} />
            {/* Distinct keys: reusing one <button> would turn it into a submit during the first click, which then posts. */}
            {confirming ? (
              <button key="confirm" className="primary" type="submit" name="intent" value="now" disabled={pending}>{pending ? 'Posting…' : `Confirm: post to ${NAME[platform]} now`}</button>
            ) : (
              <button key="ask" className="primary" type="button" onClick={() => setConfirming(true)} disabled={dirty || pending}>Post now</button>
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
function Preview({ platform, handle, name, parts, media, avatar }: { platform: Platform; handle: string; name: string; parts: string[]; media: MediaItem[]; avatar?: string }) {
  const initials = name.slice(0, 1).toUpperCase();
  const Avatar = () => (avatar ? <img className="avatar" src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{initials}</span>);
  // X lays several images out as a grid; Instagram and Threads swipe through them; LinkedIn shows one.
  const Media = () => (!media.length ? null : platform === 'x' && media.length > 1 ? <PreviewGrid media={media} /> : platform === 'linkedin' ? <div className="preview-media"><Slide m={media[0]!} /></div> : <Carousel media={media} />);
  if (!parts.length) return <div className="preview dots"><span className="dim small">The {NAME[platform]} preview appears as you write.</span></div>;

  if (platform === 'instagram') {
    return (
      <div className="preview">
        <span className="label row" style={{ gap: 6 }}><PlatformIcon platform="instagram" size={11} />Preview · Instagram</span>
        <div className="preview-head"><Avatar /><strong style={{ fontWeight: 500 }}>{handle}</strong></div>
        {media.length ? <Media /> : <div className="preview-media">Instagram needs an image or video</div>}
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

const Slide = ({ m }: { m: MediaItem }) => (m.kind === 'video' ? <span className="media-video mono">▶ video</span> : /^https?:/.test(m.url) ? <img src={m.url} alt={m.alt ?? ''} /> : <>media</>);

/** One slide at a time, with a 1/N counter and the dots that tell a carousel apart from a single image. */
function Carousel({ media }: { media: MediaItem[] }) {
  const [at, setAt] = useState(0);
  const i = Math.min(at, media.length - 1);
  return (
    <div className="preview-carousel">
      <div className="preview-media">
        <Slide m={media[i]!} />
        {media.length > 1 ? <span className="carousel-count">{i + 1}/{media.length}</span> : null}
      </div>
      {media.length > 1 ? (
        <div className="carousel-dots">
          {media.map((_, n) => <button key={n} type="button" className={n === i ? 'on' : undefined} aria-label={`Show item ${n + 1} of ${media.length}`} aria-current={n === i} onClick={() => setAt(n)} />)}
        </div>
      ) : null}
    </div>
  );
}

function PreviewGrid({ media }: { media: MediaItem[] }) {
  return <div className={`preview-grid n${media.length}`}>{media.slice(0, 4).map((m, n) => <div key={n}><Slide m={m} /></div>)}</div>;
}
