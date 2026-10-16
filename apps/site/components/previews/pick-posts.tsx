'use client';

import { useSteps } from './motion';
import { Cell, Layer, Reserve } from './reserve';

/** A few of the app's own sample posts (apps/web voice-samples.ts), one card each. */
const POSTS = [
  { who: 'Candid builder', text: 'I spent three weeks building a feature nobody asked for. 4 people used it. This week I deleted it and shipped the boring fix 40 customers had been emailing me about. Lesson relearned: read the inbox before the roadmap.' },
  { who: 'Data-first expert', text: 'We looked at 1,200 posts across 6 brands. Posts that opened with a number got 1.7× the median views at 24 hours. Posts with a link in the first line got 0.6×. Takeaway: lead with the number, put the link at the end.' },
  { who: 'Warm storyteller', text: 'Saturday morning, 7am. A customer emails: “Is it okay if I order for my mom too? She loved the last batch.” That one line made my whole week. It’s why we still pack every order by hand.' },
  { who: 'Candid builder', text: 'Month 7 numbers: $3,140 in revenue, 212 paying customers, 9 cancellations. Two of those were my fault (a billing bug I missed for a week). Fixed it, emailed each of them, and one came back.' },
];
const ORDER = [0, 1, 3];
const STAGES = ['Reading your picks', 'Finding sentence patterns', 'Writing values and rules', 'Applying your mix'];

const strength = (chars: number) => (chars < 200 ? 'Not enough yet' : chars < 600 ? 'Rough' : chars < 1500 ? 'Good' : 'Strong');
const STRENGTHS = ['Not enough yet', 'Rough', 'Good', 'Strong'];

/**
 * "Pick posts that sound like you": three sample posts get ticked, the strength meter fills, Harbor reads them in
 * stages and proposes a voice. Nothing is saved until "Use this voice".
 */
export function PickPostsPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(11, 850);
  const picked = new Set(ORDER.slice(0, Math.min(step, 3)));
  const chars = [...picked].reduce((n, i) => n + POSTS[i]!.text.length, 0);
  const learning = step >= 4 && step < 8;
  const stage = step - 4;
  const proposed = step >= 8;

  return (
    <div ref={ref} className="pv">
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Learn the voice</span><strong className="pv-title">Show Harbor how this brand sounds</strong></div>
        <span className="pv-seg" aria-hidden="true"><button type="button" aria-pressed="true" tabIndex={-1}>Pick posts</button><button type="button" tabIndex={-1}>Paste your own</button><button type="button" tabIndex={-1}>Import</button></span>
      </div>
      {/* Picking and the proposed voice share one cell, sized to the larger, and cross-fade. */}
      <Cell style={{ alignItems: 'start' }}>
        <Layer on={!proposed} style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="pv-picks">
            {POSTS.map((p, i) => (
              <div key={i} className={`pv-pick${picked.has(i) ? ' on' : ''}`}>
                <span className="pv-box" aria-hidden="true">{picked.has(i) ? '✓' : ''}</span>
                <span className="pv-stack2"><span className="a-label">{p.who}</span><span className="pv-clamp">{p.text}</span></span>
              </div>
            ))}
          </div>
          <div className="pv-head">
            <span className="pv-row">
              <span className="pv-meter" aria-hidden="true"><i style={{ width: `${Math.max(4, Math.min(100, (chars / 1500) * 100))}%` }} className={chars < 200 ? 'low' : ''} /></span>
              <span style={{ fontSize: 12 }}><Reserve all={STRENGTHS} as="strong" style={{ fontWeight: 500 }}>{strength(chars)}</Reserve> <span className="pv-dim">· {picked.size} picked</span></span>
            </span>
            <span className={`a-btn primary${learning ? ' pressed' : ''}`} style={{ opacity: picked.size ? 1 : 0.5 }}><Reserve all={['Learning…', 'Learn the voice']}>{learning ? 'Learning…' : 'Learn the voice'}</Reserve></span>
          </div>
          <Cell style={{ alignItems: 'start' }}>
            <Layer on={learning} as="ol" className="pv-stages">
              {STAGES.map((s, n) => <li key={s} className={n < stage ? 'done' : n === stage ? 'on' : ''}><span aria-hidden="true">{n < stage ? '✓' : n === stage ? '…' : '·'}</span>{s}</li>)}
            </Layer>
            <Layer on={!learning}><span className="pv-sub">Proposes a voice; nothing is saved until you choose to use it.</span></Layer>
          </Cell>
        </Layer>
        <Layer on={proposed} lift className="a-card pv-staging" style={{ gap: 10 }}>
          <div className="pv-head"><span className="a-label">Proposed voice</span><span className="pv-tag">Built-in model</span></div>
          <div className="pv-kv"><span className="a-label">Personality</span><p>Personal, data-led, serious and candid.</p></div>
          <div className="pv-two">
            <div className="pv-kv"><span className="a-label">Do</span><ul className="pv-ul"><li>Write in the first person.</li><li>Lead with a number, never an invented one.</li><li>Share real numbers and mistakes.</li></ul></div>
            <div className="pv-kv"><span className="a-label">Avoid</span><ul className="pv-ul"><li>A corporate “we” voice.</li><li>Emoji.</li><li>Exclamation marks.</li></ul></div>
          </div>
          <div className="pv-head"><span className="pv-chips"><span className="pv-chip">Sample style: Candid builder</span><span className="pv-chip">Sample style: Data-first expert</span></span><span className="a-btn primary">Use this voice</span></div>
        </Layer>
      </Cell>
    </div>
  );
}
