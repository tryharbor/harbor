'use client';

import { useEffect, useRef, useState } from 'react';
import { useSteps } from './motion';
import { Cell, Layer, Reserve } from './reserve';

type Instruction = 'hook_variations' | 'shorter' | 'punchier' | 'more_specific';
const LABEL: Record<Instruction, string> = { hook_variations: 'hook variations', shorter: 'shorter', punchier: 'punchier', more_specific: 'more specific' };
const BASE = 'Shipped a new feature this week. It took 3 weeks and 2 rewrites, and it does one thing well. Go poke at it and tell me what breaks.';
const VARIATIONS: Record<Instruction, string[]> = {
  hook_variations: [
    '3 weeks, 2 rewrites, 1 feature. Here’s what I cut.',
    'The smallest feature I’ve shipped took the longest: 3 weeks.',
    'I rewrote this feature twice before it did one thing well.',
  ],
  shorter: ['3 weeks. 2 rewrites. 1 feature that does one thing well.', 'Shipped: one feature, three weeks, two rewrites.'],
  punchier: ['3 weeks.\n2 rewrites.\n1 feature.\n\nIt does one thing. Go break it.'],
  more_specific: ['3 weeks, 2 rewrites, 1 feature: bulk approve. A week of drafts now takes one click instead of one per post. Go poke at it and tell me what breaks.'],
};

/** Every text the editor can hold: its box is laid out for the longest, so using a variation never resizes it. */
const BODIES = [BASE, ...Object.values(VARIATIONS).flat()];

/** Rewrites, interactive: ask for variations, use one, save it as a new version. The demo asks for hooks first. */
export function RewritesPreview() {
  const { ref, step, reduced } = useSteps<HTMLDivElement>(3, 1100, { loop: false, final: 2 });
  const [asked, setAsked] = useState<Instruction | null>(null);
  const [body, setBody] = useState(BASE);
  const [versions, setVersions] = useState<{ v: number; who: string; text: string }[]>([{ v: 1, who: 'Harbor', text: BASE }]);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched && step >= 1) setAsked('hook_variations'); }, [step, touched]);
  useEffect(() => { if (reduced) setAsked('hook_variations'); }, [reduced]);
  const saved = versions.at(-1)!.text === body;
  // Versions sit on one scrolling line, so saving more never adds a row; keep the newest in view.
  const strip = useRef<HTMLSpanElement>(null);
  useEffect(() => { const el = strip.current; if (el) el.scrollLeft = el.scrollWidth; }, [versions.length]);
  const ask = (i: Instruction) => { setTouched(true); setAsked(i); };

  return (
    <div ref={ref} className="pv" style={{ minHeight: 480 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Studio · X</span><strong className="pv-title">Ask for another take, keep every version</strong></div>
        <Reserve all={['v00 · drafted by Harbor']} className="pv-mono pv-dim">v{versions.at(-1)!.v} · {versions.at(-1)!.who === 'Harbor' ? 'drafted by Harbor' : 'edited by you'}</Reserve>
      </div>
      <div className="pv-stack2" style={{ gap: 4 }}>
        <div className="pv-post-text pv-editor pv-cell">
          {BODIES.map((b) => <span key={b} className="pv-ghost" aria-hidden="true">{b}</span>)}
          <span>{body}</span>
        </div>
        <span className="pv-row" style={{ justifyContent: 'space-between' }}>
          <button type="button" className={`a-btn${saved ? '' : ' ink'}`} disabled={saved} onClick={() => { setTouched(true); setVersions((vs) => [...vs, { v: vs.length + 1, who: 'you', text: body }]); }}>Save version</button>
          <span className="pv-mono pv-dim">{[...body].length} / 280{saved ? '' : ' · unsaved'}</span>
        </span>
      </div>
      <div className="pv-stack2" style={{ gap: 6 }}>
        <span className="a-label">Rewrite</span>
        <span className="pv-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(LABEL) as Instruction[]).map((i) => (
            <button key={i} type="button" className="a-btn pv-mono-btn" aria-pressed={asked === i} onClick={() => ask(i)}>{LABEL[i]}</button>
          ))}
        </span>
      </div>
      {/* Every instruction's variations share one cell, sized to the largest; only the one asked for shows. */}
      <Cell style={{ alignItems: 'start' }}>
        {(Object.keys(VARIATIONS) as Instruction[]).map((ins) => (
          <Layer key={ins} on={asked === ins} lift className="pv-variations">
            <span className="pv-row"><span className="a-label">Variations</span><span className="pv-tag">Simulated</span></span>
            {VARIATIONS[ins].map((v) => (
              <div key={v} className="pv-variation">
                <span className="pv-pre" style={{ flex: 1, minWidth: 0 }}>{v}</span>
                <button type="button" className="a-btn" onClick={() => { setTouched(true); setBody(v); }}>Use</button>
              </div>
            ))}
            <span className="pv-sub">Use puts it in the editor; save to keep it as a new version.</span>
          </Layer>
        ))}
      </Cell>
      <div className="pv-stack2" style={{ gap: 6 }}>
        <span className="a-label">Versions</span>
        <span ref={strip} className="pv-row pv-strip" style={{ gap: 6 }}>
          {versions.map((v) => (
            <button key={v.v} type="button" className="a-btn pv-mono-btn" aria-pressed={body === v.text} onClick={() => { setTouched(true); setBody(v.text); }}>v{v.v} · {v.who}</button>
          ))}
        </span>
      </div>
    </div>
  );
}
