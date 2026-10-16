'use client';

import { PlatformIcon } from '../platform-icon';
import type { Platform } from '../../lib/site';
import { useSteps } from './motion';
import { Cell, Layer, Reserve, arrive } from './reserve';

type Change = { op: 'add' | 'remove'; target: string; text: string; why: string; lift?: number; evidence?: { platform: Platform; text: string; ratio: number }[] };

const CHANGES: Change[] = [
  {
    op: 'add', target: 'Voice · Do', text: 'Open with a number.', lift: 1.6, why: 'Posts opening with a number did 1.6× the median (7 vs 11 posts).',
    evidence: [
      { platform: 'x', text: '3 weeks, 2 rewrites, 1 feature. It does one thing…', ratio: 2.4 },
      { platform: 'linkedin', text: '4 minutes to set up a brand, down from 15. Here’s what we cut…', ratio: 1.8 },
      { platform: 'threads', text: '6 brands, 1 inbox: how I keep the voices apart', ratio: 1.4 },
    ],
  },
  { op: 'add', target: 'Voice · Avoid', text: 'A link in the first part; put it in a reply.', lift: 0.6, why: 'Posts with a link up top did 0.6× the median (4 vs 14 posts).' },
  { op: 'remove', target: 'Voice · Do', text: 'End with a question.', lift: 0.8, why: 'Posts ending with a question did 0.8× the median (6 vs 12 posts).' },
  { op: 'add', target: 'Voice · Excerpt', text: '3 weeks, 2 rewrites, 1 feature.', why: 'The best line of this month’s top post (2.4× the median).' },
];
const DROPPED = 2;
const selected = (kept: number) => `${kept} of ${CHANGES.length} selected. Unticked changes are rejected.`;
const apply = (kept: number) => `Apply ${kept} to Brand Memory`;
const SUBS = ['Comparing winners and losers…', selected(CHANGES.length), selected(CHANGES.length - 1)];
const APPLY = [apply(CHANGES.length), apply(CHANGES.length - 1)];

/**
 * The voice refresh's proposal in Approvals: each change arrives with its lift and the posts behind it. One gets
 * unticked, the rest are applied to Brand Memory. Loops while on screen; reduced motion shows the decided card.
 */
export function VoiceRefreshPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(11, 900, { final: 9 });
  const shown = Math.min(CHANGES.length, step + 1);
  const open = step >= 5;
  const unticked = step >= 6;
  const applied = step >= 8;
  const kept = CHANGES.length - (unticked ? 1 : 0);

  return (
    <div ref={ref} className="pv">
      <div className="pv-head">
        <div className="pv-stack2">
          <span className="a-label pv-row"><span className="pv-glyph" style={{ ['--k' as string]: 'var(--pink)' }} />Voice refresh · Harbor</span>
          <strong className="pv-title">{CHANGES.length} proposed changes to Brand Memory</strong>
        </div>
        <span className="pv-sub">From 41 posts in the last 90 days</span>
      </div>
      <ol className="pv-changes">
        {/* Every change, and its evidence, is laid out from the start and fades in as it's found. */}
        {CHANGES.map((c, i) => {
          const dropped = unticked && i === DROPPED;
          return (
            <li key={c.text + c.target} className={`pv-change ${arrive(i < shown)}${applied && dropped ? ' dropped' : ''}`}>
              <span className="pv-box" aria-hidden="true">{applied ? (dropped ? '–' : '✓') : dropped ? '' : '✓'}</span>
              <div className="pv-stack2" style={{ gap: 6, minWidth: 0 }}>
                <span className="pv-row" style={{ flexWrap: 'wrap' }}>
                  <span className={`pv-op ${c.op}`}>{c.op === 'add' ? '+ Add' : '− Remove'}</span>
                  <span className="a-label">{c.target}</span>
                  {c.lift !== undefined ? <span className={`pv-verdict ${c.lift >= 1 ? 'up' : 'down'}`}>{c.lift >= 1 ? '↑' : '↓'} {c.lift.toFixed(1)}× median</span> : null}
                </span>
                <span className={`pv-change-text${c.op === 'remove' ? ' struck' : ''}`}>{c.text}</span>
                <span className="pv-sub">{c.why}</span>
                {c.evidence ? (
                  <div className="pv-evidence">
                    <span className="pv-sub" style={{ color: 'var(--a-ink)' }}>{open ? '▾' : '▸'} Evidence · {c.evidence.length} posts</span>
                    {c.evidence.map((e) => (
                      <span key={e.text} className={`pv-ev-row ${arrive(open)}`}>
                        <PlatformIcon platform={e.platform} size={11} />
                        <span className="pv-ellipsis">{e.text}</span>
                        <span className="pv-verdict up">↑ {e.ratio.toFixed(1)}×</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="pv-foot">
        {/* The applied note and the selection controls share one cell in the foot. */}
        <Cell style={{ flex: 1, alignItems: 'center' }}>
          <Layer on={applied}>
            <span style={{ fontSize: 12 }}><strong style={{ fontWeight: 500 }}>Applied 3 of 4</strong> <span className="pv-dim">· evidence saved with each rule</span></span>
          </Layer>
          <Layer on={!applied} className="pv-foot-row">
            <Reserve all={SUBS} className="pv-sub">{shown < CHANGES.length ? SUBS[0] : selected(kept)}</Reserve>
            <span className="pv-row"><span className="a-btn" style={{ border: 0, background: 'none' }}>Reject all</span><span className={`a-btn primary${step === 7 ? ' pressed' : ''}`}><Reserve all={APPLY}>{apply(kept)}</Reserve></span></span>
          </Layer>
        </Cell>
      </div>
    </div>
  );
}
