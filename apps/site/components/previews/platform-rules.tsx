'use client';

import { useState } from 'react';
import { PlatformIcon } from '../platform-icon';
import type { Platform } from '../../lib/site';
import { useSteps } from './motion';
import { Reserve } from './reserve';

type Rule = { platform: Platform; name: string; text: string; media: string; parts: string; crop: string; check: (img: boolean) => { level: 'ok' | 'warn' | 'fail'; msg: string } };
/** From packages/core media rules and each provider's limits. */
const RULES: Rule[] = [
  { platform: 'x', name: 'X', text: '280 per post', media: 'Up to 4 images, or 1 video', parts: 'Thread: each part replies to the last', crop: '16:9 wide', check: (img) => (img ? { level: 'ok', msg: 'Uses the wide crop' } : { level: 'ok', msg: 'Text only is fine' }) },
  { platform: 'linkedin', name: 'LinkedIn', text: '3,000', media: '1 image; video not yet', parts: 'Extra parts post as comments', crop: '1.91:1 landscape', check: (img) => (img ? { level: 'ok', msg: 'Uses the landscape crop' } : { level: 'ok', msg: 'Text only is fine' }) },
  { platform: 'instagram', name: 'Instagram', text: '2,200 caption', media: 'Required. JPEG, 4:5 to 1.91:1, up to 10', parts: 'Carousel of up to 10', crop: '4:5 portrait', check: (img) => (img ? { level: 'ok', msg: 'Portrait crop, JPEG' } : { level: 'fail', msg: 'Instagram needs an image or video. Attach one first.' }) },
  { platform: 'threads', name: 'Threads', text: '500 per post', media: 'Up to 10 images or 1 video', parts: 'Thread: replies, like X', crop: '4:5 portrait', check: (img) => (img ? { level: 'ok', msg: 'Uses the portrait crop' } : { level: 'ok', msg: 'Text only is fine' }) },
];
const MARK = { ok: '✓', warn: '!', fail: '✕' } as const;

/** One draft checked against every platform's own rules before anything is sent. Toggle the image to see a check fail. */
export function PlatformRulesPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(RULES.length + 3, 700, { final: RULES.length + 1 });
  const [img, setImg] = useState(true);
  const checked = Math.min(step, RULES.length);

  return (
    <div ref={ref} className="pv" style={{ minHeight: 440 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Voice check · platform rules</span><strong className="pv-title">One draft, four rulebooks</strong></div>
        <span className="pv-seg" role="group" aria-label="Media">
          <button type="button" aria-pressed={img} onClick={() => setImg(true)}>Image attached</button>
          <button type="button" aria-pressed={!img} onClick={() => setImg(false)}>Text only</button>
        </span>
      </div>
      <div className="pv-rules-table" role="table" aria-label="Platform rules">
        <div className="pv-rt-row pv-rt-head" role="row">
          <span role="columnheader" className="a-label">Platform</span><span role="columnheader" className="a-label">Text</span><span role="columnheader" className="a-label">Media</span><span role="columnheader" className="a-label">Threads</span><span role="columnheader" className="a-label">Check</span>
        </div>
        {RULES.map((r, i) => {
          const c = r.check(img);
          const done = i < checked;
          return (
            <div key={r.platform} role="row" className={`pv-rt-row${i === checked ? ' lit' : ''}`}>
              <span role="cell" className="pv-row" style={{ gap: 6 }}><PlatformIcon platform={r.platform} size={12} /><strong style={{ fontWeight: 500 }}>{r.name}</strong></span>
              <span role="cell" className="pv-mono">{r.text}</span>
              <span role="cell">{r.media}<span className="pv-sub" style={{ display: 'block' }}>Crop: {r.crop}</span></span>
              <span role="cell" className="pv-sub">{r.parts}</span>
              <span role="cell" className={`pv-check ${done ? c.level : ''}`} style={{ opacity: done ? 1 : 0.25 }}><span aria-hidden="true">{done ? MARK[c.level] : '·'}</span><Reserve all={['Checking…', r.check(true).msg, r.check(false).msg]}>{done ? c.msg : 'Checking…'}</Reserve></span>
            </div>
          );
        })}
      </div>
      <span className="pv-sub">A failed check blocks publishing on that platform. Warnings are advice.</span>
    </div>
  );
}
