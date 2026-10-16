'use client';

import { useMemo, type ReactNode } from 'react';
import { PlatformIcon } from '../platform-icon';
import { useSteps } from './motion';
import { Cell, Layer, Reserve, arrive } from './reserve';

const BRIEF = 'Why we track growth curves instead of totals';
const WITHOUT = 'Total likes don’t tell the whole story. That’s why we track growth curves for every post instead. Learn how it works at the link below! #analytics #socialmedia #growth';
const WITH = 'A post with 900 likes can still be a miss.\n\nI compare every post with my own median at the same age: 1h, 6h, 24h, 3d, 7d.\n\nThat’s the number I plan next week from.';
const RULES = [
  { kind: 'Do', source: 'from results', text: 'Open with a number.', note: 'Posts opening with a number did 1.6× the median (7 vs 11 posts).', posts: 3 },
  { kind: 'Do', source: 'learned from examples', text: 'Write in the first person.', posts: 0 },
  { kind: 'Avoid', source: 'from results', text: 'A link in the first part; put it in a reply.', note: 'Posts with a link up top did 0.6× the median.', posts: 2 },
  { kind: 'Formatting', source: 'written by you', text: 'At most two hashtags.', posts: 0 },
];

/** Words in `text` that aren't in `other`, marked: the same diff the app's Preview Brand Memory uses. */
function marked(text: string, other: string): ReactNode[] {
  const seen = new Set(other.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []);
  return text.split(/(\s+)/).map((tok, i) => {
    const w = tok.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, '');
    return w && !seen.has(w) ? <mark key={i}>{tok}</mark> : <span key={i}>{tok}</span>;
  });
}

/** Preview Brand Memory: one brief drafted twice, with and without memory, then the rules that fired with their evidence. */
export function MemoryComparePreview() {
  const { ref, step } = useSteps<HTMLDivElement>(9, 900, { final: 7 });
  const withMarked = useMemo(() => marked(WITH, WITHOUT), []);
  const drafted = step >= 2;
  const rules = Math.max(0, step - 2);

  return (
    <div ref={ref} className="pv">
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Preview Brand Memory</span><strong className="pv-title">Same model, same brief, with and without</strong></div>
      </div>
      <div className="pv-brief">
        <span className="pv-stack2" style={{ minWidth: 0 }}><span className="a-label">A one-line brief</span><span className="pv-input">{BRIEF}</span></span>
        <span className="pv-row"><span className="pv-chip on pv-row" style={{ gap: 5 }}><PlatformIcon platform="x" size={10} />X</span><span className={`a-btn primary${step === 1 ? ' pressed' : ''}`}><Reserve all={['Drafting both…', 'Draft with and without']}>{step === 1 ? 'Drafting both…' : 'Draft with and without'}</Reserve></span></span>
      </div>
      {/*
        The drafts and every rule that fired are laid out from the start. The empty state fills the same cell until
        both drafts land, then the rules fade in one by one in their places.
      */}
      <Cell>
        <Layer on={!drafted} className="pv-empty dots-light"><span className="pv-sub">Both drafts appear side by side. Nothing is saved.</span></Layer>
        <Layer on={drafted} lift style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="pv-compare">
            <div className="pv-stack2" style={{ gap: 6 }}>
              <span className="a-label">Without Brand Memory</span>
              <p className="pv-compare-text muted">{WITHOUT}</p>
            </div>
            <div className="pv-stack2" style={{ gap: 6 }}>
              <span className="a-label pv-row"><span className="pixels" style={{ width: 20, height: 4 }} />With Harbor’s Brand Memory</span>
              <p className="pv-compare-text">{withMarked}</p>
            </div>
          </div>
          <div className="pv-kv">
            <span className="a-label">What Brand Memory changed · {RULES.length} rules</span>
            <ul className="pv-fired">
              {RULES.map((r, n) => (
                <li key={r.text} className={arrive(n < rules)}>
                  <span className="pv-row" style={{ flexWrap: 'wrap' }}><span className="a-label" style={{ color: 'var(--a-ink)' }}>{r.kind}</span><span className="pv-tag">{r.source}</span></span>
                  <span>{r.text}</span>
                  {r.note ? <span className="pv-sub">{r.note}</span> : null}
                  {r.posts ? <span className="pv-row" style={{ gap: 6 }}>{Array.from({ length: r.posts }, (_, k) => <span key={k} className="pv-cite">post {k + 1}</span>)}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </Layer>
      </Cell>
    </div>
  );
}
