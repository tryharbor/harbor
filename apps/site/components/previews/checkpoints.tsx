'use client';

import { useId, useState } from 'react';
import { CurveGradient } from './curve-gradient';
import { useProgress, useSteps } from './motion';
import { Reserve } from './reserve';

const AGES = [1, 6, 24, 72, 168];
const LABEL = ['1h', '6h', '24h', '3d', '7d'];
const POST = [180, 1240, 4200, 6100, 6900];
const MEDIAN = [150, 720, 1900, 2600, 2900];
const W = 520, H = 220, L = 44, R = 20, T = 16, B = 28;
const x = (h: number) => L + (Math.log(h / 0.8) / Math.log(168 / 0.8)) * (W - L - R);
const y = (v: number) => T + (1 - v / 7600) * (H - T - B);
const fmt = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const verdict = (r: number) => (r >= 1.3 ? 'outperformed' : r >= 0.7 ? 'met' : 'underperformed');
const ratioAt = (n: number) => POST[n]! / MEDIAN[n]!;
const summary = (n: number) => `Median of 14 comparable X posts at the same age. At ${LABEL[n]} this post ${verdict(ratioAt(n)) === 'outperformed' ? 'is ahead of' : 'is level with'} the brand’s usual.`;
/** Every checkpoint's copy, laid out under the live one so picking a checkpoint never re-wraps anything. */
const ALL = (f: (n: number) => string) => AGES.map((_, n) => f(n));

/** The five snapshots of one post against the brand's median at the same age. Pick a checkpoint, or let it step through. */
export function CheckpointCurvePreview() {
  const draw = useProgress<HTMLDivElement>(1600, 0.3);
  const cycle = useSteps<HTMLDivElement>(AGES.length, 2000, { final: 2 });
  const [own, setOwn] = useState<number | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const i = own ?? cycle.step;
  const k = draw.p;
  const ratio = ratioAt(i);
  const path = (vs: number[]) => vs.map((v, n) => `${n ? 'L' : 'M'}${x(AGES[n]!).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <div ref={draw.ref} className="pv" style={{ minHeight: 430 }}>
      <div ref={cycle.ref} className="pv-head">
        <div className="pv-stack2"><span className="a-label">Performance · X · views</span><strong className="pv-title">“3 weeks, 2 rewrites, 1 feature.”</strong></div>
        <span className="pv-seg" role="group" aria-label="Checkpoint">
          {LABEL.map((l, n) => <button key={l} type="button" aria-pressed={n === i} onClick={() => setOwn(n)}>{l}</button>)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Views by post age: this post against the brand median" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <CurveGradient id={gid} x1={L} x2={W - R} />
          <clipPath id={`${gid}c`}><rect x="0" y="0" width={L + (W - L - R) * k + 8} height={H} /></clipPath>
        </defs>
        {[0, 3500, 7000].map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--a-line)' }} /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="10" style={{ fill: 'var(--a-dim)', fontFamily: 'var(--font-mono)' }}>{fmt(t)}</text></g>
        ))}
        {AGES.map((h, n) => <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize="10" style={{ fill: n === i ? 'var(--a-ink)' : 'var(--a-dim)', fontFamily: 'var(--font-mono)' }}>{LABEL[n]}</text>)}
        <line x1={x(AGES[i]!)} x2={x(AGES[i]!)} y1={T} y2={H - B} style={{ stroke: 'var(--a-line-strong)', strokeDasharray: '2 3', transition: 'all 300ms' }} />
        <g clipPath={`url(#${gid}c)`}>
          <path d={path(MEDIAN)} style={{ fill: 'none', stroke: '#a1a1aa', strokeWidth: 2, strokeDasharray: '5 5' }} />
          <path d={path(POST)} style={{ fill: 'none', stroke: `url(#${gid})`, strokeWidth: 2.5 }} />
          {POST.map((v, n) => <circle key={n} cx={x(AGES[n]!)} cy={y(v)} r={n === i ? 5.5 : 3.5} style={{ fill: '#fff', stroke: 'var(--stage-drafting)', strokeWidth: 2, transition: 'r 200ms' }} />)}
          {MEDIAN.map((v, n) => <circle key={n} cx={x(AGES[n]!)} cy={y(v)} r={n === i ? 4 : 0} style={{ fill: '#a1a1aa' }} />)}
        </g>
      </svg>
      <div className="pv-cp-facts">
        <div><Reserve all={ALL((n) => `This post at ${LABEL[n]}`)} className="a-label">This post at {LABEL[i]}</Reserve><Reserve all={ALL((n) => fmt(POST[n]!))} as="strong">{fmt(POST[i]!)}</Reserve></div>
        <div><Reserve all={ALL((n) => `Brand median at ${LABEL[n]}`)} className="a-label">Brand median at {LABEL[i]}</Reserve><Reserve all={ALL((n) => fmt(MEDIAN[n]!))} as="strong" className="pv-dim">{fmt(MEDIAN[i]!)}</Reserve></div>
        <div><span className="a-label">Ratio</span><Reserve all={ALL((n) => `${ratioAt(n).toFixed(1)}×`)} as="strong" className={`pv-verdict ${ratio >= 1.3 ? 'up' : ratio < 0.7 ? 'down' : 'met'}`} style={{ fontSize: 22 }}>{ratio.toFixed(1)}×</Reserve></div>
      </div>
      <Reserve all={ALL(summary)} className="pv-sub">{summary(i)}</Reserve>
    </div>
  );
}
