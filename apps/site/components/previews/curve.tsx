'use client';

import { useEffect, useState } from 'react';
import { useInView, useReducedMotion } from '../reveal';

const AGES = [1, 6, 24, 72, 168];
const POST = [180, 1240, 4200, 6100, 6900];
const MEDIAN = [150, 720, 1900, 2600, 2900];
const W = 520, H = 220, L = 44, R = 92, T = 16, B = 28;
const x = (h: number) => L + (Math.log(h / 0.8) / Math.log(168 / 0.8)) * (W - L - R);
const y = (v: number) => T + (1 - v / 7600) * (H - T - B);
const label = (h: number) => (h >= 24 ? `${h / 24}d` : `${h}h`);
const fmt = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** A post's growth curve drawing in against the brand's median at the same age, ending on its verdict. */
export function CurvePreview() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { setP(Math.min(1, (now - start) / 1800)); if (now - start < 1800) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);
  const k = reduced ? 1 : p;
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(AGES[i]!).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <div ref={ref} style={{ padding: 18, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <span className="a-label">Performance · X</span>
          <strong style={{ fontWeight: 500, fontSize: 14 }}>“3 weeks, 2 rewrites, 1 feature.”</strong>
        </div>
        <span className="up" style={{ opacity: k > 0.9 ? 1 : 0, transition: 'opacity 400ms', background: 'var(--a-good-soft)', padding: '3px 8px' }}>↑ 2.4× median at 7d</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Views by post age: this post against the brand median" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="pv-grad" x1={L} x2={W - R} y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e05bb4" /><stop offset="35%" stopColor="#7c4ddb" /><stop offset="65%" stopColor="#f2734f" /><stop offset="100%" stopColor="#cfa600" />
          </linearGradient>
          <clipPath id="pv-clip"><rect x="0" y="0" width={L + (W - L - R) * k + 8} height={H} /></clipPath>
        </defs>
        {[0, 3500, 7000].map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(10,10,10,0.07)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#71717a" fontFamily="var(--font-mono)">{fmt(t)}</text></g>
        ))}
        {AGES.map((h) => <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize="10" fill="#71717a" fontFamily="var(--font-mono)">{label(h)}</text>)}
        <g clipPath="url(#pv-clip)">
          <path d={path(MEDIAN)} fill="none" stroke="#a1a1aa" strokeWidth="2" strokeDasharray="5 5" />
          <path d={path(POST)} fill="none" stroke="url(#pv-grad)" strokeWidth="2.5" />
          {POST.map((v, i) => <circle key={i} cx={x(AGES[i]!)} cy={y(v)} r="4" fill="#fff" stroke="#7c4ddb" strokeWidth="2" />)}
        </g>
        <g style={{ opacity: k > 0.95 ? 1 : 0, transition: 'opacity 300ms' }}>
          <text x={x(168) + 8} y={y(6900) + 4} fontSize="11" fill="#0a0a0a">6.9K views</text>
          <text x={x(168) + 8} y={y(2900) + 4} fontSize="11" fill="#71717a">median 2.9K</text>
        </g>
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--a-muted)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 16, height: 3, background: 'linear-gradient(90deg,#e05bb4,#7c4ddb,#f2734f,#cfa600)', display: 'inline-block' }} />This post</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 16, height: 0, borderTop: '2px dashed #a1a1aa', display: 'inline-block' }} />Brand median, same platform, same age</span>
      </div>
    </div>
  );
}
