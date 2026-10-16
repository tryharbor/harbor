'use client';

import type { ReactNode } from 'react';
import { useSteps } from './motion';
import { Cell, Layer, Reserve, arrive } from './reserve';

const OPTIONS = [
  { key: 'knowledge', label: 'Knowledge note', help: 'A fact, question or objection worth remembering.' },
  { key: 'do', label: 'Do rule', help: 'Something drafts should keep doing.' },
  { key: 'avoid', label: 'Avoid rule', help: 'Something drafts should stop doing.' },
];
const REPLY = 'How is the growth curve measured? Views, or likes? Would love a post on this.';

/** "Save to Brand Memory" on a reply: pick what it becomes, save, and it lands in Knowledge linked to its source. */
export function SaveToMemoryPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(9, 900, { final: 7 });
  const open = step >= 2 && step < 6;
  const saving = step === 5;
  const saved = step >= 6;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 420 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Performance · Replies · 12</span><strong className="pv-title">“3 weeks, 2 rewrites, 1 feature.”</strong></div>
        <span className="pv-sub">Save from a post, reply, theme, signal or draft</span>
      </div>
      {/*
        Before and after saving share one cell, sized to the larger. The panel's place inside the card is kept from
        the start, so opening it never pushes anything; saving cross-fades to the card with Knowledge below it.
      */}
      <Cell style={{ alignItems: 'start' }}>
        <Layer on={!saved}>
          <Reply label="Save to Brand Memory" pressed={step === 1}>
            <div className={`pv-save-panel ${arrive(open)}`}>
              <span className="a-label">Save as</span>
              {OPTIONS.map((o) => (
                <span key={o.key} className="pv-radio">
                  <span className={`pv-dot${o.key === 'knowledge' ? ' on' : ''}`} aria-hidden="true" />
                  <span><strong style={{ fontWeight: 500 }}>{o.label}</strong> <span className="pv-dim">{o.help}</span></span>
                </span>
              ))}
              <span className="a-label">Text · edit if you like</span>
              <span className="pv-input" style={{ whiteSpace: 'normal' }}>{REPLY}</span>
              <span className="pv-row"><span className={`a-btn primary${saving ? ' pressed' : ''}`}><Reserve all={['Saving…', 'Save']}>{saving ? 'Saving…' : 'Save'}</Reserve></span></span>
            </div>
          </Reply>
        </Layer>
        <Layer on={saved} style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <Reply label="✓ Saved" pressed={false} />
          <div className={`pv-kv ${arrive(saved)}`}>
            <span className="a-label">Brand Memory · Knowledge</span>
            <div className="pv-list">
              <div className="pv-new"><strong>How is the growth curve measured? Views, or likes?</strong><span className="pv-sub">Saved from reply · linked to “3 weeks, 2 rewrites, 1 feature.”</span></div>
              <div><strong>Why AGPL</strong><span className="pv-sub">Owner note</span></div>
            </div>
          </div>
        </Layer>
      </Cell>
    </div>
  );
}

function Reply({ label, pressed, children }: { label: string; pressed: boolean; children?: ReactNode }) {
  return (
    <div className="a-card">
      <div className="pv-row">
        <span className="pv-mark" style={{ ['--k' as string]: 'var(--stage-drafting)' }} aria-hidden="true">?</span>
        <span className="a-label">Question</span>
        <span className="pv-sub" style={{ marginLeft: 'auto' }}>@mara_builds · 1d</span>
      </div>
      <p style={{ margin: 0, fontSize: 13 }}>{REPLY}</p>
      <div className="pv-row">
        <span className={`a-btn${pressed ? ' pressed' : ''}`}><Reserve all={['✓ Saved', 'Save to Brand Memory']}>{label}</Reserve></span>
      </div>
      {children}
    </div>
  );
}
