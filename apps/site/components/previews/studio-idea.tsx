'use client';

import { PlatformIcon } from '../platform-icon';
import { Mark } from '../ui';
import type { Platform } from '../../lib/site';
import { useSteps } from './motion';
import { Reserve, arrive } from './reserve';

const PANES: { platform: Platform; name: string; limit: number; text: string }[] = [
  { platform: 'x', name: 'X', limit: 280, text: '3 weeks, 2 rewrites, 1 feature.\n\nIt does one thing. It does it well.\n\nGo poke at it and tell me what breaks.' },
  { platform: 'linkedin', name: 'LinkedIn', limit: 3000, text: 'Three weeks, two rewrites, one feature.\n\nI kept it small on purpose: fewer moving parts, fewer surprises for the people using it. Honest note: the first version broke on mobile, so it shipped a week late.\n\nWhat would you have cut?' },
  { platform: 'threads', name: 'Threads', limit: 500, text: 'Shipped a new feature today. 3 weeks, 2 rewrites. It does exactly one thing.' },
];

/** The Studio for one idea: why it exists, the context the agent drafts with, and one pane per platform. */
export function StudioIdeaPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(8, 800, { final: 6 });
  const drafting = step === 1;
  const panes = Math.max(0, Math.min(PANES.length, step - 1));

  return (
    <div ref={ref} className="pv" style={{ minHeight: 520 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Harbor · drafting</span><strong className="pv-title" style={{ fontSize: 18 }}>Ship small: the feature that took three weeks</strong></div>
        <span className="a-btn" style={{ background: 'var(--a-ink)', color: '#fff', borderColor: 'var(--a-ink)' }}>Approve idea</span>
      </div>
      <div className="pv-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="a-label">Why this idea</span>
        <span className="pv-cite">Posts opening with a number did 1.7× the median</span>
        <span className="pv-cite">4 replies asked how long features take</span>
      </div>
      <div className="pv-agent-panel">
        <div className="pv-head">
          <div className="pv-stack2"><span className="a-label pv-row"><span className="pixels" style={{ width: 20, height: 4 }} />Agent · Draft for each platform</span><strong style={{ fontWeight: 500 }}>Draft this idea in the brand’s voice</strong></div>
          <span className="pv-tag">Simulated · no spend</span>
        </div>
        <div className="pv-stack2" style={{ gap: 6 }}>
          <span className="a-label">Context Harbor uses</span>
          <span className="pv-chips">
            <span className="pv-chip on">Voice · 3 excerpts</span><span className="pv-chip on">Audience · Serial builders</span><span className="pv-chip on">Product · Harbor</span><span className="pv-chip on">Style rules</span><span className="pv-chip on">2 cited signals</span>
          </span>
        </div>
        <div className="pv-head">
          <span className="pv-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {(['x', 'linkedin', 'threads', 'instagram'] as const).map((p) => (
              <span key={p} className="pv-pickbox"><span className={`pv-box sm${p === 'instagram' ? ' off' : ''}`} aria-hidden="true">{p !== 'instagram' ? '✓' : ''}</span><PlatformIcon platform={p} size={11} />{p === 'x' ? 'X' : p === 'linkedin' ? 'LinkedIn' : p === 'threads' ? 'Threads' : 'Instagram'}</span>
            ))}
          </span>
          <span className={`a-btn primary${drafting ? ' pressed' : ''}`}><Reserve all={['Drafting…', 'Draft again', 'Draft it']}>{drafting ? 'Drafting…' : panes ? 'Draft again' : 'Draft it'}</Reserve></span>
        </div>
      </div>
      <div className="pv-panes">
        {/* Each pane's place is kept from the start: the dotted placeholder and the draft share one cell. */}
        {PANES.map((d, i) => (
          <div key={d.platform} className="pv-pane-slot">
            <div className="pv-pane-empty" aria-hidden="true" />
            <div className={`a-card pv-pane ${arrive(i < panes)}`}>
              <div className="pv-row"><PlatformIcon platform={d.platform} size={12} /><span className="a-label" style={{ color: 'var(--a-ink)' }}>{d.name}</span><span className="pv-mono pv-dim" style={{ marginLeft: 'auto' }}>v1 · drafted by Harbor</span></div>
              <div className="pv-row" style={{ alignItems: 'flex-start', gap: 8 }}>
                <span className="pv-avatar"><Mark size={11} /></span>
                <span className="pv-stack2" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12 }}><strong style={{ fontWeight: 600 }}>Harbor</strong> <span className="pv-dim">@tryharbor</span></span>
                  <span className="pv-pre">{d.text}</span>
                </span>
              </div>
              <span className="pv-mono pv-dim" style={{ justifySelf: 'end' }}>{[...d.text].length} / {d.limit.toLocaleString('en-US')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
