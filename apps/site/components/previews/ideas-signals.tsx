'use client';

import { useSteps } from './motion';
import { Cell, Layer, Reserve, arrive } from './reserve';

const SIGNALS = [
  { kind: 'Post performance', text: 'Posts opening with a number did 1.7× the median at 24h' },
  { kind: 'Reply theme', text: '4 people asked how long a feature really takes' },
  { kind: 'Competitor post', text: 'A rival’s changelog thread did 3× their usual' },
  { kind: 'Trend', text: 'Build-in-public threads are up this week' },
];
const IDEAS = [
  { title: 'Ship small: the feature that took three weeks', angle: 'Lead with the numbers, then the cut list.', cites: [0] },
  { title: 'How long a feature really takes: our last five, timed', angle: 'Answer the question people keep asking.', cites: [1, 0] },
  { title: 'Our changelog, as a thread', angle: 'What shipped this month and why each one mattered.', cites: [2, 3] },
];

/** Ideas never come from nowhere: each one cites the signals behind it. The cited signals light up as ideas arrive. */
export function IdeasSignalsPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(7, 1000, { final: 5 });
  const shown = Math.max(0, Math.min(IDEAS.length, step - 1));
  const latest = IDEAS[shown - 1];
  const lit = new Set(step >= 5 ? [] : latest?.cites ?? []);

  return (
    <div ref={ref} className="pv" style={{ minHeight: 430 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Hub · Harbor</span><strong className="pv-title">Ideas from what Harbor noticed</strong></div>
        <span className={`a-btn primary${step === 1 ? ' pressed' : ''}`}><Reserve all={['Suggesting…', 'Suggest ideas']}>{step === 1 ? 'Suggesting…' : 'Suggest ideas'}</Reserve></span>
      </div>
      <div className="pv-ideas">
        <div className="pv-stack2" style={{ gap: 6 }}>
          <span className="a-label">Signals · {SIGNALS.length}</span>
          {SIGNALS.map((s, i) => (
            <div key={s.text} className={`pv-signal${lit.has(i) ? ' lit' : ''}`}>
              <span className="pv-kind" style={{ ['--k' as string]: 'var(--stage-approved)' }}>{s.kind}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
        <div className="pv-stack2" style={{ gap: 6 }}>
          <span className="a-label">Ideas · {shown}</span>
          {/* The ideas' places are kept from the start; the empty state sits in the same cell until the first lands. */}
          <Cell style={{ alignItems: 'start' }}>
            <Layer on={shown === 0} className="pv-empty dots-light"><span className="pv-sub">Suggested ideas appear here, each with its reasons.</span></Layer>
            <div className="pv-stack2" style={{ gap: 6 }}>
              {IDEAS.map((idea, n) => (
                <div key={idea.title} className={`a-card ${arrive(n < shown)}`} style={{ gap: 6 }}>
                  <div className="pv-head" style={{ alignItems: 'flex-start' }}><strong style={{ fontWeight: 500 }}>{idea.title}</strong><span className="pv-stage s-idea">Idea</span></div>
                  <span className="pv-sub">{idea.angle}</span>
                  <span className="pv-row" style={{ gap: 6, flexWrap: 'wrap' }}>{idea.cites.map((c) => <span key={c} className="pv-cite pv-ellipsis" style={{ maxWidth: '100%' }}>{SIGNALS[c]!.text}</span>)}</span>
                </div>
              ))}
            </div>
          </Cell>
        </div>
      </div>
    </div>
  );
}
