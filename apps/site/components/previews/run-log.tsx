'use client';

import { useSteps } from './motion';
import { Reserve, arrive } from './reserve';

const STEPS = [
  { label: 'Read the winner', ms: '2ms', detail: 'X post at 2.4× the brand median at 24h.', refs: ['post · 3 weeks, 2 rewrites'] },
  { label: 'Turn it into an idea', ms: '1.1s', detail: 'Idea: “Ship small, then measure it.”', refs: ['idea · Ship small', 'run · Ideas run'] },
  { label: 'Draft for other platforms', ms: '2.8s', detail: '2 drafts, one per platform, in the brand’s voice.', refs: ['draft · LinkedIn', 'draft · Threads'] },
  { label: 'Voice check', ms: '6ms', detail: '2 of 2 pass: banned words, length, hashtags, media, hook.', refs: [] },
  { label: 'Find open slots', ms: '9ms', detail: 'LinkedIn Wed 8:00 AM · Threads Thu 1:00 PM.', refs: [] },
  { label: 'Queue for approval', ms: '3ms', detail: '2 posts waiting for you. Nothing published.', refs: ['approval · LinkedIn', 'approval · Threads'] },
];

/** A run's log as a step timeline: what each step did, how long it took and what it made, linked. */
export function RunLogPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(STEPS.length + 3, 800, { final: STEPS.length + 2 });
  const done = Math.min(step, STEPS.length);
  const finished = done === STEPS.length;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 470 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Run log · Repurpose a winner</span><strong className="pv-title">Harbor · started by an automation</strong></div>
        <span className={`a-pill ${finished ? 'good' : 'sched'}`}><Reserve all={['Done', 'Running']}>{finished ? 'Done' : 'Running'}</Reserve></span>
      </div>
      <dl className="pv-meta">
        <div><dt className="a-label">Trigger</dt><dd>When a post outperforms its median</dd></div>
        <div><dt className="a-label">Took</dt><dd className="pv-mono"><Reserve all={['3.9s', '…']}>{finished ? '3.9s' : '…'}</Reserve></dd></div>
        <div><dt className="a-label">Model</dt><dd><span className="pv-tag">Simulated</span></dd></div>
      </dl>
      <ol className="pv-timeline">
        {STEPS.map((s, i) => {
          const state = i < done ? 'done' : i === done ? 'on' : 'wait';
          return (
            <li key={s.label} className={`t-${state}`}>
              <span className="pv-tl-mark" aria-hidden="true">{state === 'done' ? '✓' : state === 'on' ? '…' : ''}</span>
              <div className="pv-stack2" style={{ gap: 4, minWidth: 0 }}>
                <span className="pv-head" style={{ alignItems: 'baseline' }}><strong style={{ fontWeight: 500 }}>{s.label}</strong><span className={`pv-mono pv-dim pv-fade${state === 'done' ? '' : ' off'}`}>{s.ms}</span></span>
                {/* What the step did is laid out from the start and fades in when it's done. */}
                <span className={`pv-sub ${arrive(state === 'done')}`}>{s.detail}</span>
                {s.refs.length ? <span className={`pv-row ${arrive(state === 'done')}`} style={{ gap: 6, flexWrap: 'wrap' }}>{s.refs.map((r) => <span key={r} className="pv-cite">{r}</span>)}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
