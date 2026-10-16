'use client';

import { useState } from 'react';

const AGES = [1, 6, 24, 72, 168];
const ageLabel = (h: number) => (h >= 24 ? `${h / 24}d` : `${h}h`);
const compact = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/**
 * One post's growth curve against the brand's median for the same platform, by post age (log-spaced so the early
 * hours stay readable). Two series, one axis: the post (Harbor gradient, early → mature) and the median (dashed gray).
 */
export function CurveChart({ points, baseline, metric }: { points: { ageHours: number; value: number }[]; baseline: { ageHours: number; value: number }[]; metric: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 230, L = 48, R = 96, T = 16, B = 30;
  const maxY = Math.max(1, ...points.map((p) => p.value), ...baseline.map((p) => p.value)) * 1.08;
  // Rounded so server and client render identical attributes (no hydration mismatch from float noise).
  const x = (h: number) => Math.round((L + (Math.log(Math.max(h, 0.5) / 0.5) / Math.log(168 / 0.5)) * (W - L - R)) * 10) / 10;
  const y = (v: number) => T + (1 - v / maxY) * (H - T - B);
  const path = (ps: { ageHours: number; value: number }[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.ageHours).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map((f) => Math.round((maxY / 1.08) * f));
  const nearest = (ps: { ageHours: number; value: number }[], age: number) =>
    ps.reduce<{ ageHours: number; value: number } | undefined>((best, p) => (!best || Math.abs(Math.log(p.ageHours / age)) < Math.abs(Math.log(best.ageHours / age)) ? p : best), undefined);
  const last = points.at(-1);
  const lastBase = baseline.at(-1);
  const hp = hover !== null ? nearest(points, hover) : undefined;
  const hb = hover !== null ? nearest(baseline, hover) : undefined;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row small" aria-hidden="true">
        <span className="legend-swatch gradient" /> This post
        {baseline.length ? <><span className="legend-swatch dashed" style={{ marginLeft: 12 }} /> Brand median, same platform</> : null}
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${metric} by post age, this post vs. the brand median`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const age = AGES.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a));
          setHover(age);
        }}
      >
        <defs>
          <linearGradient id="growth-gradient" x1={L} x2={W - R} y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--stage-idea)" />
            <stop offset="35%" stopColor="var(--stage-drafting)" />
            <stop offset="65%" stopColor="var(--stage-approved)" />
            <stop offset="100%" stopColor="var(--stage-live)" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
          </g>
        ))}
        {AGES.map((h) => <text key={h} x={x(h)} y={H - 8} textAnchor="middle">{ageLabel(h)}</text>)}
        {baseline.length ? <path className="baseline" d={path(baseline)} /> : null}
        {points.length ? <path className="series" d={path(points)} /> : null}
        {points.map((p) => <circle key={p.ageHours} className="dot" cx={x(p.ageHours)} cy={y(p.value)} r={4} />)}
        {last ? <text className="direct" x={x(last.ageHours) + 8} y={y(last.value) + 4}>{compact(last.value)} {metric}</text> : null}
        {lastBase ? <text className="direct dim-label" x={x(lastBase.ageHours) + 8} y={y(lastBase.value) + 4}>median {compact(lastBase.value)}</text> : null}
        {hover !== null ? (
          <g pointerEvents="none">
            <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />
            <g transform={`translate(${Math.min(x(hover) + 8, W - 150)} ${T + 4})`}>
              <rect className="tip" width="140" height={hb ? 52 : 36} />
              <text className="tip-title" x="10" y="16">at {ageLabel(hover)}</text>
              <text className="tip-text" x="10" y="32">{hp ? `${compact(hp.value)} ${metric}` : 'not measured yet'}</text>
              {hb ? <text className="tip-text dim-label" x="10" y="46">median {compact(hb.value)}</text> : null}
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
