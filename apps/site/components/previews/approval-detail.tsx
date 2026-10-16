'use client';

import { useState } from 'react';
import { PlatformIcon } from '../platform-icon';
import { useProgress } from './motion';
import { Cell, Layer } from './reserve';

const TEXT = 'Most founders with several products hit the same wall: switching voice between brands.\n\nHere’s the workaround I use, and the one number I check every Monday.';
const CHECKS = [
  { label: 'Banned words', ok: true },
  { label: `Length · ${[...TEXT].length} / 3,000`, ok: true },
  { label: 'Hashtags', ok: true },
  { label: 'Hook', ok: true },
  { label: 'Media', ok: true, note: 'Text only is fine on LinkedIn' },
];

/**
 * One approval, interactive: Approve schedules it, Edit saves a new draft version first, Reject keeps the record
 * with a note. Below it, an Instagram proposal that can't be approved until it has an image.
 */
export function ApprovalDetailPreview() {
  const { ref, p } = useProgress<HTMLDivElement>(1400, 0.4);
  const [mode, setMode] = useState<'view' | 'edit' | 'approved' | 'rejected' | 'reject'>('view');
  const [text, setText] = useState(TEXT);
  const edited = text !== TEXT;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 470 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Approvals · 2 waiting</span><strong className="pv-title">Agents propose. You publish.</strong></div>
        <Cell style={{ justifyItems: 'end', alignItems: 'center' }}>
          <Layer on={mode !== 'view'}><button type="button" className="a-btn" onClick={() => { setMode('view'); setText(TEXT); }}>Reset</button></Layer>
          <Layer on={mode === 'view'}><span className="pv-tag">Click a button</span></Layer>
        </Cell>
      </div>
      <article className="a-card">
        <div className="pv-row">
          <PlatformIcon platform="linkedin" size={12} /><span className="a-label" style={{ color: 'var(--a-ink)' }}>LinkedIn · Harbor</span>
          <span className="a-label" style={{ marginLeft: 'auto' }}>Wed, Oct 21, 8:00 AM</span>
        </div>
        {/* Editing and reading share one cell: the textarea's box, or the original post, whichever is larger. */}
        <Cell>
          <Layer on={mode === 'edit'} className="pv-stack2" style={{ gap: 4 }}>
            <textarea className="pv-textarea" value={text} onChange={(e) => setText(e.target.value)} aria-label="Post text" rows={5} />
            <span className="pv-mono pv-dim" style={{ justifySelf: 'end' }}>{[...text].length} / 3,000</span>
          </Layer>
          <div className="pv-post-text pv-ghost" aria-hidden="true">{TEXT}</div>
          <Layer on={mode !== 'edit'} style={{ position: 'relative' }}>
            <div className="pv-post-text" style={{ position: 'absolute', inset: '0 0 auto 0', maxHeight: '100%', overflow: 'hidden' }}>{text}</div>
          </Layer>
        </Cell>
        <span className="pv-sub"><span className="a-label">Why </span>Wed 8am is this brand’s #2 LinkedIn slot. Replies keep asking about multi-brand workflows (theme: 4 questions).</span>
        <ul className="pv-checks">
          {CHECKS.map((c, i) => (
            <li key={c.label} className="pv-check ok" style={{ opacity: p > (i + 1) / (CHECKS.length + 1) ? 1 : 0.15 }}>
              <span aria-hidden="true">✓</span><span>{c.label}{c.note ? <span className="pv-dim"> · {c.note}</span> : null}</span>
            </li>
          ))}
        </ul>
        <div className="pv-foot">
          <span className="pv-sub">Weekly plan · run log · idea: Multi-brand workflows</span>
          <Cell style={{ justifyItems: 'end', alignItems: 'center' }}>
            <Layer on={mode === 'approved'}><span className="a-pill sched">Scheduled · Wed 8:00 AM{edited ? ' · v2' : ''}</span></Layer>
            <span className="pv-ghost a-pill sched" aria-hidden="true">Scheduled · Wed 8:00 AM · v2</span>
            <Layer on={mode === 'rejected'}><span className="pv-sub" style={{ color: 'var(--a-ink)' }}>Rejected: “Not this week”</span></Layer>
            <Layer on={mode === 'reject'}><span className="pv-row" style={{ gap: 6 }}><span className="pv-input" style={{ minWidth: 0 }}>Not this week</span><button type="button" className="a-btn" onClick={() => setMode('rejected')}>Reject</button></span></Layer>
            <Layer on={mode === 'edit'}><span className="pv-row" style={{ gap: 6 }}><button type="button" className="a-btn" onClick={() => { setMode('view'); setText(TEXT); }}>Cancel</button><button type="button" className="a-btn primary" onClick={() => setMode('approved')}>Approve with changes</button></span></Layer>
            <Layer on={mode === 'view'}>
              <span className="pv-row" style={{ gap: 6 }}>
                <button type="button" className="a-btn" style={{ border: 0, background: 'none' }} onClick={() => setMode('reject')}>Reject</button>
                <button type="button" className="a-btn" onClick={() => setMode('edit')}>Edit</button>
                <button type="button" className="a-btn primary" onClick={() => setMode('approved')}>Approve</button>
              </span>
            </Layer>
          </Cell>
        </div>
      </article>
      <article className="a-card pv-dim-card">
        <div className="pv-row">
          <PlatformIcon platform="instagram" size={12} /><span className="a-label" style={{ color: 'var(--a-ink)' }}>Instagram · Tidewater Coffee</span>
          <span className="a-label" style={{ marginLeft: 'auto' }}>Sun, Oct 25, 7:00 PM</span>
        </div>
        <ul className="pv-checks"><li className="pv-check fail"><span aria-hidden="true">✕</span><span>Media <span className="pv-dim">· Instagram needs an image or video. Attach one first.</span></span></li></ul>
        <div className="pv-foot"><span className="pv-sub">Repurpose a winner</span><span className="pv-row" style={{ gap: 6 }}><span className="a-btn primary">Attach</span><span className="a-btn" style={{ opacity: 0.45 }}>Approve</span></span></div>
      </article>
    </div>
  );
}
