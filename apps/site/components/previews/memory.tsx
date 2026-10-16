'use client';

import { useEffect, useState } from 'react';
import { useInView, useReducedMotion } from '../reveal';

const DIALS = [
  { low: 'Company', high: 'Personal', from: 50, to: 82 },
  { low: 'Calm', high: 'Punchy', from: 50, to: 70 },
  { low: 'Story-led', high: 'Data-led', from: 50, to: 88 },
  { low: 'Serious', high: 'Playful', from: 50, to: 30 },
  { low: 'Polished', high: 'Candid', from: 50, to: 76 },
];
const RULES = [
  { kind: 'Do', text: 'Lead with a number and back claims with real figures.', note: 'Posts opening with a number did 1.7× the median (8 vs 18 posts).' },
  { kind: 'Avoid', text: 'Links in the first part; put the link in a reply.', note: 'Posts with a link up top did 0.6× the median.' },
  { kind: 'Do', text: 'Write in the first person: one person sharing what they did.', note: 'From the posts you picked.' },
];

/** Brand Memory: the voice dials settle into place, then rules appear with the evidence behind each. */
export function MemoryPreview() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { setP(Math.min(1, (now - start) / 1600)); if (now - start < 1600) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);
  const k = reduced ? 1 : 1 - Math.pow(1 - p, 3);

  return (
    <div ref={ref} style={{ padding: 18, display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="a-label">Brand Memory · Voice</span><span className="a-label" style={{ color: 'var(--a-violet-ink)' }}>Learned from results</span></div>
      <div style={{ display: 'grid', gap: 9 }}>
        {DIALS.map((d) => {
          const v = d.from + (d.to - d.from) * k;
          return (
            <div key={d.low} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 70px', gap: 10, alignItems: 'center' }}>
              <span className="a-label" style={{ color: v <= 35 ? 'var(--a-violet-ink)' : undefined }}>{d.low}</span>
              <span style={{ position: 'relative', height: 4, background: 'var(--a-sunken)', border: '1px solid var(--a-line)' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${v}%`, background: '#c77dff' }} />
                <span style={{ position: 'absolute', top: -5, left: `calc(${v}% - 6px)`, width: 12, height: 12, background: '#fff', border: '2px solid #7c4ddb' }} />
              </span>
              <span className="a-label" style={{ textAlign: 'right', color: v >= 65 ? 'var(--a-violet-ink)' : undefined }}>{d.high}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {RULES.map((r, i) => (
          <div key={r.text} className="a-card" style={{ opacity: k > 0.4 + i * 0.18 || reduced ? 1 : 0, transform: k > 0.4 + i * 0.18 || reduced ? 'none' : 'translateY(6px)', transition: 'opacity 400ms, transform 400ms' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="a-label">{r.kind}</span><span className="a-pill">From results</span></div>
            <div style={{ fontSize: 13.5 }}>{r.text}</div>
            <div style={{ fontSize: 11.5, color: 'var(--a-muted)' }}>↳ {r.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
