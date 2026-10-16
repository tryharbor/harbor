'use client';

import { useState } from 'react';
import { useSteps } from './motion';
import { Cell, Layer, arrive } from './reserve';

type Kind = 'question' | 'objection' | 'praise' | 'request';
const KIND: Record<Kind, { label: string; mark: string; k: string }> = {
  question: { label: 'Questions', mark: '?', k: 'var(--stage-drafting)' },
  objection: { label: 'Objections', mark: '!', k: 'var(--stage-approved)' },
  praise: { label: 'Praise', mark: '+', k: 'var(--stage-live)' },
  request: { label: 'Requests', mark: '→', k: 'var(--stage-idea)' },
};
const COUNTS: Record<Kind, number> = { question: 14, objection: 5, praise: 9, request: 4 };
const THEMES: { kind: Kind; label: string; replies: number; posts: number; sample: string[]; on: string }[] = [
  { kind: 'question', label: '4 people asked how long a feature really takes', replies: 4, posts: 2, sample: ['How long did the first version take?', 'Is 3 weeks normal for you?'], on: '3 weeks, 2 rewrites…' },
  { kind: 'question', label: '3 people asked how the growth curve is measured', replies: 3, posts: 1, sample: ['Is it views or likes?', 'Against all posts, or just mine?'], on: 'Every post, measured…' },
  { kind: 'praise', label: '5 people liked seeing the misses too', replies: 5, posts: 3, sample: ['Love that you show the posts that flopped.'], on: 'Month 7 numbers…' },
  { kind: 'objection', label: '2 people said self-hosting sounds like work', replies: 2, posts: 1, sample: ['Not sure I want to run another server.'], on: 'Why we chose AGPL' },
  { kind: 'request', label: '3 people asked for a CSV export', replies: 3, posts: 2, sample: ['Would love to pull this into a sheet.'], on: 'Pricing is per brand…' },
];

/** Replies grouped into themes by kind, biggest first. Filter by kind; each theme can be saved to Brand Memory. */
export function ReplyThemesPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(THEMES.length + 1, 450, { loop: false, final: THEMES.length });
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const total = Object.values(COUNTS).reduce((a, b) => a + b, 0);

  return (
    <div ref={ref} className="pv" style={{ minHeight: 470 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">What people are saying · last 30 days</span><strong className="pv-title">{total} replies to Harbor, grouped by what comes up</strong></div>
      </div>
      <span className="pv-seg pv-seg-wrap" role="group" aria-label="Reply kind">
        <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>All</button>
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            <span className="pv-mark sm" style={{ ['--k' as string]: KIND[k].k }} aria-hidden="true">{KIND[k].mark}</span>{KIND[k].label} <span className="pv-mono pv-dim">{COUNTS[k]}</span>
          </button>
        ))}
      </span>
      {/*
        Every filter's grid shares one cell, sized to the largest (All); only the picked one shows. Themes arrive in
        their final places, so neither the reveal nor a filter ever resizes the preview.
      */}
      <Cell style={{ alignItems: 'start' }}>
        {(['all', ...Object.keys(KIND)] as (Kind | 'all')[]).map((f) => (
          <Layer key={f} on={kind === f} className="pv-themes">
            {THEMES.filter((t) => f === 'all' || t.kind === f).map((t) => (
              <div key={t.label} className={`a-card ${arrive(THEMES.indexOf(t) <= step)}`} style={{ gap: 6 }}>
                <span className="pv-row" style={{ gap: 6 }}>
                  <span className="pv-mark sm" style={{ ['--k' as string]: KIND[t.kind].k }} aria-hidden="true">{KIND[t.kind].mark}</span>
                  <span className="a-label">{KIND[t.kind].label}</span>
                  <span className="pv-mono pv-dim">{t.replies} replies · {t.posts} post{t.posts > 1 ? 's' : ''}</span>
                </span>
                <strong style={{ fontWeight: 500 }}>{t.label}</strong>
                {t.sample.map((q) => <span key={q} className="pv-quote">“{q}”</span>)}
                <span className="pv-row" style={{ gap: 10, flexWrap: 'wrap' }}><span className="pv-sub">On “{t.on}”</span><span className="pv-link">Save to Brand Memory</span></span>
              </div>
            ))}
          </Layer>
        ))}
      </Cell>
    </div>
  );
}
