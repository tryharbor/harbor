'use client';

import { PlatformIcon } from '../platform-icon';
import type { Platform } from '../../lib/site';
import { useSteps } from './motion';
import { Reserve } from './reserve';

const MAX = 2.6;
const POSTS: { platform: Platform; text: string; ratio: number }[] = [
  { platform: 'x', text: '3 weeks, 2 rewrites, 1 feature.', ratio: 2.4 },
  { platform: 'linkedin', text: 'Most founders with several products hit the same wall…', ratio: 1.4 },
  { platform: 'x', text: 'Pricing is per brand, not per seat. Here’s why.', ratio: 1.0 },
  { platform: 'linkedin', text: 'What we look for in a design partner', ratio: 0.8 },
  { platform: 'x', text: 'New changelog is up: harbor.example/changelog', ratio: 0.55 },
];
const verdict = (r: number) => (r >= 1.3 ? { cls: 'up', label: 'Outperformed', mark: '↑' } : r >= 0.7 ? { cls: 'met', label: 'Met', mark: '·' } : { cls: 'down', label: 'Underperformed', mark: '↓' });
const pos = (r: number) => `${(Math.min(r, MAX) / MAX) * 100}%`;

/** Each post's ratio to the brand median, placed on the scale with its verdict. Too few comparable posts: no verdict. */
export function VerdictsPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(POSTS.length + 4, 800, { final: POSTS.length + 2 });
  const shown = Math.min(step, POSTS.length);
  const inconclusive = step > POSTS.length;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 440 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Performance · Harbor · views at 24h</span><strong className="pv-title">Ratio to the brand median</strong></div>
      </div>
      <div className="pv-scale" aria-hidden="true">
        <span className="pv-zone down" style={{ left: 0, width: pos(0.7) }}><span>Under · &lt; 0.7×</span></span>
        <span className="pv-zone met" style={{ left: pos(0.7), width: `calc(${pos(1.3)} - ${pos(0.7)})` }}><span>Met</span></span>
        <span className="pv-zone up" style={{ left: pos(1.3), right: 0 }}><span>Outperformed · ≥ 1.3×</span></span>
        {POSTS.slice(0, shown).map((p, i) => (
          <span key={p.text} className={`pv-pin ${verdict(p.ratio).cls}`} style={{ left: pos(p.ratio), top: 34 + (i % 2) * 18 }}><i />{p.ratio.toFixed(1)}×</span>
        ))}
        {[0, 0.7, 1, 1.3, 2].map((t) => <span key={t} className="pv-tick pv-mono" style={{ left: pos(t) }}>{t}×</span>)}
      </div>
      <ul className="pv-vlist">
        {POSTS.map((p, i) => {
          const v = verdict(p.ratio);
          return (
            <li key={p.text} style={{ opacity: i < shown ? 1 : 0.25, transition: 'opacity 300ms' }}>
              <PlatformIcon platform={p.platform} size={11} />
              <span className="pv-ellipsis">{p.text}</span>
              <Reserve all={[`${v.mark} ${v.label} · ${p.ratio.toFixed(1)}×`, 'Waiting for 24h']} className={`pv-verdict ${i < shown ? v.cls : 'inc'}`}>{i < shown ? `${v.mark} ${v.label} · ${p.ratio.toFixed(1)}×` : 'Waiting for 24h'}</Reserve>
            </li>
          );
        })}
        <li style={{ opacity: inconclusive ? 1 : 0.25, transition: 'opacity 300ms' }}>
          <PlatformIcon platform="threads" size={11} />
          <span className="pv-ellipsis">This brand’s third post on Threads</span>
          <Reserve all={['Inconclusive · 2 comparable posts, needs 3', 'Waiting for 24h']} className="pv-verdict inc">{inconclusive ? 'Inconclusive · 2 comparable posts, needs 3' : 'Waiting for 24h'}</Reserve>
        </li>
      </ul>
    </div>
  );
}
