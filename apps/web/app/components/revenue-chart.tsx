'use client';

import { useState } from 'react';
import type { MoneyWeek } from '../api';

/**
 * Weekly revenue, 12 weeks, as ink bars (Trace style: one series in ink, 2px tops) with the business's normal week
 * as a dashed reference line. This week is incomplete, so its bar is lighter and labelled "so far" (not colour
 * alone). Each bar has a hover tooltip; the same numbers are in the table under the chart.
 */
export function RevenueChart({ weeks, normalCents, currency }: { weeks: MoneyWeek[]; normalCents?: number; currency: string }) {
  const [hover, setHover] = useState<number | undefined>();
  const money = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(c / 100);
  const W = 640;
  const H = 200;
  const pad = { top: 16, right: 8, bottom: 26, left: 52 };
  const max = Math.max(1, normalCents ?? 0, ...weeks.map((w) => w.revenueCents));
  // A round top for the axis: 1, 2 or 5 × a power of ten.
  const step = (() => {
    const raw = max / 4;
    const pow = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  })();
  const top = step * Math.ceil(max / step);
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.min(28, slot - 6);
  const y = (c: number) => pad.top + plotH - (c / top) * plotH;
  const label = (start: string) => new Date(`${start}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const last = weeks.length - 1;
  const h = hover !== undefined ? weeks[hover] : undefined;

  return (
    <div className="revenue-chart">
      {normalCents ? (
        <div className="rc-key small muted"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" className="rc-normal" /></svg>Normal week {money(normalCents)} (median of the last 8)</div>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly revenue for the last ${weeks.length} weeks${normalCents ? `; a normal week is ${money(normalCents)}` : ''}.`} onMouseLeave={() => setHover(undefined)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => {
          const v = step * i;
          return (
            <g key={i}>
              <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className="rc-grid" />
              <text x={pad.left - 8} y={y(v) + 4} textAnchor="end" className="rc-tick">{money(v)}</text>
            </g>
          );
        })}
        {weeks.map((w, i) => {
          const x = pad.left + slot * i + (slot - barW) / 2;
          const bh = Math.max(0, y(0) - y(w.revenueCents));
          const r = Math.min(2, bh / 2);
          const yy = y(w.revenueCents);
          return (
            <g key={w.start} onMouseEnter={() => setHover(i)}>
              {/* Hit target: the whole column, bigger than the bar. */}
              <rect x={pad.left + slot * i} y={pad.top} width={slot} height={plotH} fill="transparent" />
              {bh > 0 ? (
                <path
                  d={`M${x},${y(0)} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${y(0)} Z`}
                  className={i === last ? 'rc-bar rc-now' : hover === i ? 'rc-bar rc-hover' : 'rc-bar'}
                />
              ) : null}
              {i % 2 === last % 2 ? <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="rc-tick">{i === last ? 'This week' : label(w.start)}</text> : null}
            </g>
          );
        })}
        {normalCents ? <line x1={pad.left} x2={W - pad.right} y1={y(normalCents)} y2={y(normalCents)} className="rc-normal" /> : null}
      </svg>
      {h ? (
        <div className="rc-tip" style={{ left: `${((pad.left + slot * hover! + slot / 2) / W) * 100}%` }} role="status">
          <strong>{money(h.revenueCents)}</strong>
          <span>{hover === last ? 'This week so far' : `Week of ${label(h.start)}`}</span>
          {h.expenseCents ? <span>Spent {money(h.expenseCents)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
