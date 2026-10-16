'use client';

import { useId } from 'react';
import { CurveGradient } from './curve-gradient';
import { useProgress } from './motion';

const ROWS = [
  { brand: 'Harbor', published: 9, median: 2900, change: 1.22, above: 3, below: 1, headline: 'Posts that open with a number keep winning.' },
  { brand: 'Tidewater Coffee', published: 6, median: 3200, change: 1.26, above: 2, below: 1, headline: 'Sunday evening carousels did 1.8× the median.' },
  { brand: 'Fieldnotes', published: 4, median: 1400, change: 1.02, above: 0, below: 0, headline: 'Too few posts to call it yet.' },
];
const fmt = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const AGES = [1, 6, 24, 72, 168];
const POST = [210, 1300, 3900, 5600, 6200];
const MED = [160, 760, 1900, 2500, 2700];

/** Insights across brands: each brand against its own median, then the selected brand's digest and its best post's curve. */
export function BrandsOverviewPreview() {
  const { ref, p } = useProgress<HTMLDivElement>(1600, 0.3);
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const X = (h: number) => 8 + (Math.log(h) / Math.log(168)) * 224;
  const Y = (v: number) => 92 - (v / 6600) * 84;
  const line = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${X(AGES[i]!).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');

  return (
    <div ref={ref} className="pv" style={{ minHeight: 420 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Insights</span><strong className="pv-title">What’s working, and why</strong></div>
        <span className="pv-sub">Across your brands · last 7 days</span>
      </div>
      <div className="pv-table" role="table" aria-label="Brands, last 7 days">
        <div className="pv-tr pv-th" role="row">
          <span role="columnheader">Brand</span><span role="columnheader" className="num">Published</span><span role="columnheader" className="num">Median at 24h</span><span role="columnheader" className="num">Vs. last week</span><span role="columnheader" className="num hide-n">Above</span><span role="columnheader" className="num hide-n">Below</span><span role="columnheader" className="hide-n">Headline</span>
        </div>
        {ROWS.map((r, i) => (
          <div key={r.brand} className="pv-tr" role="row" style={{ opacity: p > i * 0.2 ? 1 : 0, transition: 'opacity 400ms' }}>
            <span role="cell" className="pv-row" style={{ gap: 8 }}><span className="pv-brandmark">{r.brand[0]}</span>{r.brand}</span>
            <span role="cell" className="num pv-mono">{Math.round(r.published * p)}</span>
            <span role="cell" className="num pv-mono">{fmt(Math.round(r.median * p))}</span>
            <span role="cell" className="num">{Math.abs(r.change - 1) < 0.05 ? <span className="pv-verdict met">flat</span> : <span className="pv-verdict up">↑ +{Math.round((r.change - 1) * 100 * p)}%</span>}</span>
            <span role="cell" className="num pv-mono hide-n">{r.above}</span>
            <span role="cell" className="num pv-mono hide-n">{r.below}</span>
            <span role="cell" className="pv-sub hide-n">{r.headline}</span>
          </div>
        ))}
      </div>
      <div className="pv-ov-bottom">
        <div className="a-card">
          <span className="a-label pv-row"><span className="pixels" style={{ width: 20, height: 4 }} />Weekly digest · Harbor</span>
          <strong style={{ fontWeight: 400, fontSize: 18, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Number-first openers beat the median again. Links up top keep missing.</strong>
          <div className="pv-stats">
            <div><span className="a-label">Published</span><strong>9</strong></div>
            <div><span className="a-label">Median · 24h</span><strong>2.9K</strong></div>
            <div><span className="a-label">Vs. last period</span><strong>+22%</strong></div>
          </div>
        </div>
        <div className="a-card">
          <span className="a-label">Best post · X · 7 days</span>
          <svg viewBox="0 0 240 100" style={{ width: '100%', height: 'auto' }} aria-label="Best post against the brand median" role="img">
            <defs><CurveGradient id={gid} x1={X(1)} x2={X(168)} /></defs>
            <path d={line(MED)} style={{ fill: 'none', stroke: '#a1a1aa', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
            <path d={line(POST)} pathLength={1} style={{ fill: 'none', stroke: `url(#${gid})`, strokeWidth: 2, strokeDasharray: 1, strokeDashoffset: 1 - p }} />
          </svg>
          <span className="pv-verdict up" style={{ opacity: p > 0.95 ? 1 : 0, transition: 'opacity 300ms' }}>↑ 2.3× median at 7d · outperformed</span>
        </div>
      </div>
    </div>
  );
}
