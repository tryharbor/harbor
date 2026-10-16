'use client';

import { useState, type ReactNode } from 'react';
import { useSteps } from './motion';
import { Cell, Layer } from './reserve';

type Section = { key: string; label: string; detail: string; body: ReactNode };

const SECTIONS: Section[] = [
  {
    key: 'voice', label: 'Voice', detail: '3 values · 4 do · 3 avoid',
    body: (
      <>
        <div className="pv-kv"><span className="a-label">Personality and style</span><p>Personal, punchy and data-led, with a candid streak. One builder sharing what they shipped and what it did.</p></div>
        <div className="pv-two">
          <div className="pv-kv"><span className="a-label">Do</span><ul className="pv-ul"><li>Lead with a number, and only real ones.</li><li>Write in the first person.</li><li>Short lines, one idea each.</li></ul></div>
          <div className="pv-kv"><span className="a-label">Avoid</span><ul className="pv-ul"><li>A link in the first part.</li><li>Hedging: “might”, “kind of”.</li></ul></div>
        </div>
        <div className="pv-kv"><span className="a-label">Banned words</span><span className="pv-chips"><span className="pv-chip">leverage</span><span className="pv-chip">seamless</span><span className="pv-chip">game-changing</span></span></div>
      </>
    ),
  },
  {
    key: 'audiences', label: 'Audiences', detail: 'Serial builders',
    body: (
      <>
        <div className="pv-kv"><span className="a-label">Name</span><strong style={{ fontWeight: 500 }}>Serial builders</strong></div>
        <div className="pv-kv"><span className="a-label">Who they are</span><p>Founders running more than one product, plus a personal account on the side.</p></div>
        <div className="pv-two">
          <div className="pv-kv"><span className="a-label">Pain points</span><ul className="pv-ul"><li>Switching voice between brands</li><li>No time to work out what worked</li></ul></div>
          <div className="pv-kv"><span className="a-label">Goals</span><ul className="pv-ul"><li>Post every week without a marketer</li><li>Know which posts to repeat</li></ul></div>
        </div>
      </>
    ),
  },
  {
    key: 'products', label: 'Products', detail: 'Harbor',
    body: (
      <>
        <div className="pv-kv"><span className="a-label">Name</span><strong style={{ fontWeight: 500 }}>Harbor</strong></div>
        <div className="pv-kv"><span className="a-label">What it is, in a sentence</span><p>The open-source content strategist for builders.</p></div>
        <div className="pv-two">
          <div className="pv-kv"><span className="a-label">Call to action</span><p>Star it on GitHub</p></div>
          <div className="pv-kv"><span className="a-label">Proof points</span><ul className="pv-ul"><li>AGPL, self-host free</li><li>Publishes direct to 4 platforms</li></ul></div>
        </div>
      </>
    ),
  },
  {
    key: 'knowledge', label: 'Knowledge', detail: '3 items',
    body: (
      <div className="pv-list">
        <div><strong>Why AGPL</strong><span className="pv-sub">Owner note · the trade-offs we weighed</span></div>
        <div><strong>3 people asked how the growth curve is measured</strong><span className="pv-sub">Saved from a reply theme · linked to 2 posts</span></div>
        <div><strong>Pricing is per brand, not per seat</strong><span className="pv-sub">Owner note</span></div>
      </div>
    ),
  },
  {
    key: 'style', label: 'Style rules', detail: '2 terms · 2 formatting',
    body: (
      <>
        <div className="pv-kv"><span className="a-label">Terms · use ⇒ instead of</span><ul className="pv-ul mono-ish"><li>brand ⇒ workspace</li><li>open source ⇒ free software</li></ul></div>
        <div className="pv-kv"><span className="a-label">Formatting</span><ul className="pv-ul"><li>At most two hashtags.</li><li>Sentence case, never Title Case.</li></ul></div>
      </>
    ),
  },
];

/** Brand Memory as typed sections. The selection walks through them while on screen; click any to look yourself. */
export function MemoryOverviewPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(SECTIONS.length, 2600, { final: 0 });
  const [picked, setPicked] = useState<number | null>(null);
  const i = picked ?? step;

  return (
    <div ref={ref} className="pv pv-memory">
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Harbor · Brand Memory</span><strong className="pv-title">What every draft knows about this brand</strong></div>
        <span className="a-pill good">5 of 5 set</span>
      </div>
      <div className="pv-mem-grid">
        <nav className="pv-mem-nav" aria-label="Brand Memory sections">
          {SECTIONS.map((x, n) => (
            <button key={x.key} type="button" aria-pressed={n === i} onClick={() => setPicked(n)}>
              <span className="pv-ok" aria-hidden="true">✓</span>
              <span className="pv-stack2"><span>{x.label}</span><span className="pv-sub">{x.detail}</span></span>
            </button>
          ))}
        </nav>
        {/* Every section's body shares one cell, sized to the largest; only the picked one shows. */}
        <Cell>
          {SECTIONS.map((x, n) => <Layer key={x.key} on={n === i} lift className="pv-mem-body a-card">{x.body}</Layer>)}
        </Cell>
      </div>
    </div>
  );
}
