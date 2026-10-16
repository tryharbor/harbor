'use client';

import { useEffect, useState } from 'react';
import { useInView, useReducedMotion } from '../reveal';

const STEPS = [
  { label: 'Read last week', detail: 'Digest: 9 posts, median 2.9K views at 24h (+22%).', ms: '3ms' },
  { label: 'Find open slots', detail: '6 open slots over the next 7 days on X, LinkedIn, Threads.', ms: '11ms' },
  { label: 'Suggest ideas', detail: '3 ideas guided by 4 recommendations.', ms: '1.2s' },
  { label: 'Draft every idea', detail: '6 drafts, one per platform, in the brand’s voice.', ms: '3.4s' },
  { label: 'Voice check', detail: '6 of 6 pass: banned words, length, hashtags, media.', ms: '8ms' },
  { label: 'Queue for approval', detail: '6 posts waiting for you. Nothing published.', ms: '4ms' },
];

/** An agent run as a log (Sanity Functions style): steps tick through with timing and output, then wait for you. */
export function AgentRunPreview() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    setN(0);
    const id = setInterval(() => setN((x) => (x >= STEPS.length + 3 ? 0 : x + 1)), 650);
    return () => clearInterval(id);
  }, [inView, reduced]);
  const done = reduced ? STEPS.length : Math.min(n, STEPS.length);

  return (
    <div ref={ref} style={{ padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <span className="a-label">Agent · Weekly plan</span>
          <strong style={{ fontWeight: 500, fontSize: 15 }}>Monday 8:00 AM · automation</strong>
        </div>
        <span style={{ display: 'grid', justifyItems: 'end' }}>
          <span className="a-pill good" style={{ gridArea: '1 / 1', opacity: done === STEPS.length ? 1 : 0, transition: 'opacity 250ms' }}>Done</span>
          <span className="a-pill sched" style={{ gridArea: '1 / 1', opacity: done === STEPS.length ? 0 : 1, transition: 'opacity 250ms' }}>Running</span>
        </span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
        {STEPS.map((s, i) => {
          const state = i < done ? 'done' : i === done ? 'run' : 'wait';
          return (
            <li key={s.label} style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, paddingBottom: 10, position: 'relative', opacity: state === 'wait' ? 0.4 : 1, transition: 'opacity 300ms' }}>
              <span style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, background: state === 'done' ? 'var(--a-good-soft)' : state === 'run' ? 'var(--a-amber-soft)' : 'transparent', color: state === 'done' ? 'var(--a-good)' : 'var(--a-amber-ink)', border: state === 'wait' ? '1px solid var(--a-line-strong)' : '1px solid transparent' }}>{state === 'done' ? '✓' : state === 'run' ? '…' : ''}</span>
              <span style={{ display: 'grid', gap: 2 }}>
                <span style={{ fontWeight: 500 }}>{s.label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--a-muted)', opacity: state === 'done' ? 1 : 0, transition: 'opacity 300ms' }}>{s.detail}</span>
              </span>
              <span className="a-label" style={{ opacity: state === 'done' ? 1 : 0 }}>{s.ms}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
