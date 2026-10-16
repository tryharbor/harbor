'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { approve, reject } from '../agent-actions';
import type { Approval } from '../api';
import { Checks } from '../agents/agent-ui';
import { BrandMark, PlatformTag } from '../ui';
import { CheckIssues, MediaPicker, type PickedMedia } from '../components/media-picker';

const LIMIT = { x: 280, linkedin: 3000, instagram: 2200, threads: 500 } as const;
const pad = (n: number) => String(n).padStart(2, '0');
/** `datetime-local` value in the viewer's own timezone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** One proposed post: what, where, when and why, the voice checks, then approve / edit / reject. */
export function ApprovalCard({ a, agentName, returnTo, selectable, apiUrl }: { a: Approval; agentName?: string; returnTo: string; selectable: boolean; apiUrl: string }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [tz, setTz] = useState('0');
  const original = a.draft.parts.map((p) => p.text).join('\n---\n');
  const [text, setText] = useState(original);
  useEffect(() => setTz(String(new Date().getTimezoneOffset())), []);
  const longest = Math.max(...text.split(/^\s*---\s*$/m).map((t) => t.trim().length));
  const limit = LIMIT[a.channel.platform];
  const past = new Date(a.proposedFor).getTime() < Date.now();
  const decided = a.status !== 'pending';
  const current = a.draft.parts[0]?.media[0];
  const [picked, setPicked] = useState<PickedMedia>();
  const [picking, setPicking] = useState(false);
  const shownMedia = picked?.url ?? current?.url;
  const needsMedia = a.channel.platform === 'instagram' && !shownMedia;
  /** Hidden fields so whichever form submits (approve or approve with changes) carries the picked media. */
  const MediaFields = () => (picked ? <><input type="hidden" name="mediaAssetId" value={picked.assetId} /><input type="hidden" name="mediaVariant" value={picked.variant} /></> : null);

  return (
    <article id={a.id} className={`approval${decided ? ' decided' : ''}`}>
      <header className="approval-head">
        {selectable ? <input type="checkbox" name="ids" value={a.id} form="bulk" aria-label="Select for bulk action" className="approval-select" /> : null}
        <PlatformTag platform={a.channel.platform} handle={a.channel.handle} />
        <span className="row small muted" style={{ gap: 6 }}><BrandMark name={a.brandName} size={16} />{a.brandName}</span>
        <span className="approval-when mono">
          {new Date(a.proposedFor).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </span>
      </header>

      {mode === 'edit' ? (
        <form action={approve} className="stack">
          <input type="hidden" name="approvalId" value={a.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="original" value={original} />
          <input type="hidden" name="tz" value={tz} />
          <MediaFields />
          <label className="field">
            <span className="label">Post{a.draft.parts.length > 1 ? ' · separate thread parts with a line of ---' : ''}</span>
            <textarea name="text" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 160 }} />
            <span className={`char-count${longest > limit ? ' over' : ''}`}>{longest} / {limit}</span>
          </label>
          <label className="field" style={{ maxWidth: 260 }}>
            <span className="label">Post at</span>
            <input type="datetime-local" name="scheduledFor" defaultValue={toLocalInput(a.proposedFor)} required />
          </label>
          <div className="row" style={{ gap: 6 }}>
            <button type="submit" className="primary">Approve with changes</button>
            <button type="button" onClick={() => { setMode('view'); setText(original); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="approval-text">
          {a.draft.parts.map((p, i) => <p key={i}>{p.text}</p>)}
        </div>
      )}

      {shownMedia || !decided ? (
        <div className="attached">
          {shownMedia ? ((picked?.kind ?? current?.kind) === 'video' ? <span className="media-video mono">▶</span> : <img src={shownMedia} alt={picked?.alt ?? current?.alt ?? ''} />) : <span className="media-video mono">{needsMedia ? 'Needs an image' : 'No media'}</span>}
          <span className="stack" style={{ gap: 4, minWidth: 0 }}>
            <span className="small">{picked ? <>Attached · <span className="mono">{picked.variant}</span> crop</> : shownMedia ? 'Attached by the agent' : needsMedia ? 'Instagram won’t publish without an image or video.' : 'Text only.'}</span>
            <CheckIssues check={picked?.check} />
          </span>
          {!decided ? <button type="button" className={needsMedia ? 'primary' : 'mono-button'} onClick={() => setPicking(true)}>{shownMedia ? 'Replace' : 'Attach'}</button> : null}
        </div>
      ) : null}
      {picking ? <MediaPicker apiUrl={apiUrl} brandId={a.brandId} platform={a.channel.platform} onClose={() => setPicking(false)} onPick={(m) => { setPicked(m); setPicking(false); }} /> : null}

      <p className="approval-why small"><span className="label">Why</span> {a.reason}</p>
      <Checks checks={a.checks} compact={decided} />

      <footer className="approval-foot">
        <span className="small dim">
          {agentName ?? (a.source === 'mcp' ? 'Proposed over MCP' : a.source === 'ui' ? 'You' : a.source)}
          {a.runId ? <> · <Link href={`/agents/runs/${a.runId}`}>run log</Link></> : null}
          {a.ideaId ? <> · <Link href={`/studio/${a.ideaId}`}>{a.ideaTitle ? `idea: ${a.ideaTitle}` : 'idea'}</Link></> : null}
        </span>
        {decided ? (
          <span className="small">
            {a.status === 'approved' ? <>Approved {a.decidedAt ? new Date(a.decidedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}{a.postId ? <> · <Link href={`/performance/${a.postId}`}>see the post</Link></> : null}</> : <>Rejected{a.decidedNote ? <span className="muted">: “{a.decidedNote}”</span> : null}</>}
          </span>
        ) : mode === 'reject' ? (
          <form action={reject} className="row" style={{ gap: 6 }}>
            <input type="hidden" name="approvalId" value={a.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input name="note" placeholder="What was off? (optional)" style={{ width: 240 }} autoFocus />
            <button type="submit">Reject</button>
            <button type="button" className="link-button" onClick={() => setMode('view')}>Cancel</button>
          </form>
        ) : mode === 'view' ? (
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="link-button" onClick={() => setMode('reject')}>Reject</button>
            <button type="button" onClick={() => setMode('edit')}>{past ? 'Pick a new time' : 'Edit'}</button>
            {past ? null : (
              <form action={approve}>
                <input type="hidden" name="approvalId" value={a.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <MediaFields />
                <button type="submit" className="primary" disabled={needsMedia} title={needsMedia ? 'Attach an image first' : undefined}>Approve</button>
              </form>
            )}
          </span>
        ) : null}
      </footer>
      {past && !decided ? <p className="small notice" style={{ margin: 0 }}>This slot has passed. Pick a new time to approve it.</p> : null}
    </article>
  );
}
