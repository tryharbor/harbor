'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FEATURES } from '../../lib/site';
import { useSteps } from '../previews/motion';

const NODES = [
  { verb: 'Remember', slug: 'brand-memory', reads: ['Posts you pick, paste or import', 'Voice-refresh changes you approve', 'Anything you save from a post or reply'], writes: ['Voice, audiences, products, knowledge and style rules', 'Evidence: the posts behind each rule'] },
  { verb: 'Plan', slug: 'agents', reads: ['Last week’s digest', 'Best times and open slots', 'Brand Memory and reply themes'], writes: ['Ideas, each citing its signals', 'Drafts and voice checks', 'Approvals with a proposed slot'] },
  { verb: 'Draft', slug: 'studio', reads: ['Brand Memory', 'The idea’s cited signals', 'Cards connected on the canvas'], writes: ['One draft per platform', 'Rewrites and saved versions'] },
  { verb: 'Publish', slug: 'publishing', reads: ['Posts you approved', 'Each platform’s rules', 'Media crops from the library'], writes: ['Posts on X, LinkedIn, Instagram and Threads', 'A post_published event'] },
  { verb: 'Learn', slug: 'insights', reads: ['Snapshots at 1h, 6h, 24h, 3d and 7d', 'Replies, where the platform allows'], writes: ['A verdict against the brand median', 'The weekly digest and reply themes', 'Proposed Brand Memory changes'] },
];
const FLOWS = ['voice and offers', 'approved drafts', 'approved posts', 'snapshots'];

/**
 * Remember → Plan → Draft → Publish → Learn, and back. A pulse walks the loop while on screen; pick a stage to see what
 * it reads and writes. Reduced motion: no pulse, the first stage selected.
 */
export function LoopDiagram() {
  const { ref, step, reduced } = useSteps<HTMLDivElement>(NODES.length + 1, 1100);
  const [picked, setPicked] = useState(0);
  const pulse = reduced ? -1 : step;

  return (
    <div ref={ref} className="pp-loop">
      <ol className="pp-loop-row" aria-label="Harbor's loop">
        {NODES.map((n, i) => {
          const feat = FEATURES.find((x) => x.slug === n.slug)!;
          return (
            <li key={n.verb} className={`c-${feat.color}`}>
              <button type="button" className={`pp-loop-node${picked === i ? ' on' : ''}${pulse === i ? ' pulse' : ''}`} aria-pressed={picked === i} onClick={() => setPicked(i)}>
                <span className="mono small ink-c">{String(i + 1).padStart(2, '0')}</span>
                <span className="pp-loop-verb">{n.verb}</span>
                <span className="pp-loop-name"><span className="swatch" />{feat.name}</span>
                <span className="pp-loop-pass mono">{i < FLOWS.length ? `→ ${FLOWS[i]}` : '↺ back to the start'}</span>
              </button>
              {i < NODES.length - 1 ? <span className="pp-loop-arrow" aria-hidden="true">→</span> : null}
            </li>
          );
        })}
      </ol>
      <div className={`pp-loop-back${pulse === NODES.length ? ' pulse' : ''}`} aria-hidden="true">
        <span className="mono">↺ Learn feeds Remember (rules you approve) and Plan (the digest and reply themes)</span>
      </div>
      {/* Every stage's detail shares one cell, sized to the largest; only the picked one shows. */}
      <div className="pp-cell" aria-live="polite">
        {NODES.map((node, i) => {
          const f = FEATURES.find((x) => x.slug === node.slug)!;
          return (
            <div key={node.verb} className={`pp-loop-detail pp-layer c-${f.color}${picked === i ? ' on' : ''}`} aria-hidden={picked === i ? undefined : true}>
              <div className="stack" style={{ gap: 8 }}>
                <span className="eyebrow"><span className="swatch" />{node.verb} · {f.name}</span>
                <p className="muted" style={{ margin: 0, maxWidth: '40ch' }}>{f.short}</p>
                <Link className="link-arrow" href={f.href}>Explore {f.name} →</Link>
              </div>
              <div className="stack" style={{ gap: 10 }}>
                <span className="label">Reads</span>
                <ul className="check-list">{node.reads.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
              <div className="stack" style={{ gap: 10 }}>
                <span className="label">Writes</span>
                <ul className="check-list">{node.writes.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
