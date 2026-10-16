'use client';

import { useEffect, useState } from 'react';
import { PlatformIcon } from '../platform-icon';
import { useInView, useReducedMotion } from '../reveal';
import type { Platform } from '../../lib/site';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = [7, 9, 11, 13, 15, 17, 19];
/** Best-time scores for this demo brand (0–1). Weekday mornings and Sunday evening are strongest. */
const score = (d: number, h: number) => {
  const morning = h === 9 ? 0.85 : h === 7 || h === 11 ? 0.55 : 0.2;
  const evening = h === 19 ? (d === 6 ? 0.95 : 0.35) : 0;
  const weekday = d < 5 ? 1 : 0.45;
  return Math.max(morning * weekday, evening, h === 13 && d === 3 ? 0.7 : 0);
};
const POSTS: { d: number; h: number; platform: Platform }[] = [
  { d: 1, h: 9, platform: 'x' }, { d: 2, h: 9, platform: 'linkedin' }, { d: 3, h: 13, platform: 'threads' }, { d: 0, h: 9, platform: 'instagram' }, { d: 6, h: 19, platform: 'x' }, { d: 4, h: 11, platform: 'linkedin' },
];
const heat = (v: number) => `color-mix(in oklab, #7c4ddb ${Math.round(Math.pow(v, 1.5) * 42)}%, #ffffff)`;

/** A week, shaded by this brand's best times (one hue, darker is better), with scheduled posts landing in the best slots. */
export function CalendarPreview() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    setN(0);
    const id = setInterval(() => setN((x) => (x > POSTS.length + 4 ? 0 : x + 1)), 600);
    return () => clearInterval(id);
  }, [inView, reduced]);
  const shown = reduced ? POSTS.length : n;

  return (
    <div ref={ref} style={{ padding: 18, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="a-label">Hub · Week of Oct 19</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="a-label">
          <span style={{ display: 'inline-flex' }}>{[0.1, 0.35, 0.6, 0.85, 1].map((v) => <i key={v} style={{ width: 12, height: 8, background: heat(v), display: 'inline-block' }} />)}</span>better →
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(7, minmax(0, 1fr))`, gap: 1, background: 'var(--a-line)', border: '1px solid var(--a-line)' }}>
        <span style={{ background: '#fff' }} />
        {DAYS.map((d) => <span key={d} className="a-label" style={{ background: '#fff', padding: '6px 4px', textAlign: 'center' }}>{d}</span>)}
        {HOURS.map((h) => (
          <div key={h} style={{ display: 'contents' }}>
            <span className="a-label" style={{ background: '#fff', padding: '8px 4px', fontSize: 9.5 }}>{h % 12 || 12}{h < 12 ? 'a' : 'p'}</span>
            {DAYS.map((_, d) => {
              const i = POSTS.findIndex((p) => p.d === d && p.h === h);
              const post = i >= 0 ? POSTS[i] : undefined;
              const visible = i >= 0 && i < shown;
              return (
                <span key={d} style={{ background: heat(score(d, h)), minHeight: 30, display: 'grid', placeItems: 'center', position: 'relative' }}>
                  {post ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid var(--a-line-strong)', padding: '2px 5px', fontSize: 10, opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-8px) scale(0.96)', transition: 'opacity 380ms cubic-bezier(.2,.7,.2,1), transform 380ms cubic-bezier(.2,.7,.2,1)' }}>
                      <PlatformIcon platform={post.platform} size={10} />{h % 12 || 12}:00
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--a-muted)' }}>From this brand’s own posts, blended with platform norms. Drag a post to move it.</span>
    </div>
  );
}
