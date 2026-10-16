'use client';

import { useState } from 'react';
import { useProgress } from './motion';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
/** Demo scores (0–1) for one brand: weekday mornings, a Thursday lunch, Sunday evening; nights near zero. */
function score(d: number, h: number) {
  const weekday = d >= 1 && d <= 5;
  const curve = Math.exp(-((h - 9) ** 2) / 5) * (weekday ? 0.95 : 0.4) + Math.exp(-((h - 19.5) ** 2) / 3) * (d === 0 ? 1.1 : 0.45) + Math.exp(-((h - 13) ** 2) / 2) * (d === 4 ? 0.55 : 0.25);
  return Math.min(1, 0.03 + curve * (h < 6 ? 0.2 : 1) * (1 - ((d * 7 + h * 3) % 11) / 60));
}
const SLOTS = DAYS.flatMap((_, d) => Array.from({ length: 24 }, (_, h) => ({ d, h, s: score(d, h), posts: (h >= 8 && h <= 10) || h === 13 || h === 19 ? ((d + h) % 5) + 1 : 0 })));
const TOP = [...SLOTS].sort((a, b) => b.s - a.s).slice(0, 5);
const topKey = new Set(TOP.map((t) => `${t.d}:${t.h}`));
const heat = (v: number) => `color-mix(in oklab, var(--stage-drafting) ${Math.round(Math.pow(v, 1.4) * 80)}%, var(--a-sunken))`;

/** Best times: 7 days × 24 hours in one hue, darker is better, top 5 outlined. Hover or tap a cell for its score and basis. */
export function HeatmapPreview() {
  const { ref, p } = useProgress<HTMLDivElement>(1400, 0.3);
  const [info, setInfo] = useState<(typeof SLOTS)[number] | null>(null);
  const shown = info ?? TOP[0]!;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 400 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Insights · Best times · Harbor</span><strong className="pv-title">When this brand’s posts do best</strong></div>
      </div>
      <div className="pv-heat" role="img" aria-label="Best posting times by weekday and hour" onMouseLeave={() => setInfo(null)}>
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="pv-heat-hour">{h % 6 === 0 ? hourLabel(h) : ''}</span>)}
        {DAYS.map((day, d) => (
          <div key={day} style={{ display: 'contents' }}>
            <span className="pv-heat-day">{day}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const s = SLOTS[d * 24 + h]!;
              const visible = p >= (h + 1) / 25;
              return (
                <span
                  key={h}
                  className={`pv-heat-cell${topKey.has(`${d}:${h}`) ? ' top' : ''}${info === s ? ' on' : ''}`}
                  style={{ background: visible ? heat(s.s) : 'var(--a-sunken)' }}
                  onMouseEnter={() => setInfo(s)}
                  onClick={() => setInfo(s)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="pv-head" style={{ alignItems: 'flex-start' }}>
        <span className="pv-row pv-sub" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex' }}>{[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => <i key={v} style={{ width: 12, height: 8, background: heat(v), display: 'inline-block' }} />)}</span>
          better → · outlined = top 5
        </span>
        <span className="pv-heat-info" aria-live="polite">
          <strong style={{ fontWeight: 500 }}>{DAYS[shown.d]} {hourLabel(shown.h)}</strong> · score {Math.round(shown.s * 100)} · {shown.posts ? `${shown.posts} past post${shown.posts > 1 ? 's' : ''}` : 'platform norm'}
        </span>
      </div>
      <ol className="pv-top">
        {TOP.map((t) => <li key={`${t.d}${t.h}`}><span>{DAYS[t.d]} {hourLabel(t.h)}</span><span className="pv-mono pv-dim">{Math.round(t.s * 100)}</span></li>)}
      </ol>
    </div>
  );
}
