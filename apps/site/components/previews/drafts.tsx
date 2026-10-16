'use client';

import { useEffect, useState } from 'react';
import { PlatformIcon } from '../platform-icon';
import { useInView, useReducedMotion } from '../reveal';
import { Mark } from '../ui';
import type { Platform } from '../../lib/site';

const DRAFTS: { platform: Platform; name: string; limit: number; text: string }[] = [
  { platform: 'x', name: 'X', limit: 280, text: '3 weeks, 2 rewrites, 1 feature.\n\nIt does one thing. It does it well.\n\nGo poke at it and tell me what breaks.' },
  { platform: 'linkedin', name: 'LinkedIn', limit: 3000, text: 'Three weeks, two rewrites, one feature.\n\nI kept it small on purpose: fewer moving parts, fewer surprises for the people using it. Honest note: the first version broke on mobile, so it shipped a week late.\n\nWhat would you have cut?' },
  { platform: 'threads', name: 'Threads', limit: 500, text: 'Shipped a new feature today. 3 weeks, 2 rewrites. It does exactly one thing.' },
];

/** One idea, drafted for each platform in its native shape, typing in. The character counters follow. */
export function DraftsPreview() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [chars, setChars] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    setChars(0);
    const id = setInterval(() => setChars((c) => (c > 360 ? 0 : c + 6)), 40);
    return () => clearInterval(id);
  }, [inView, reduced]);

  return (
    <div ref={ref} style={{ padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 2 }}>
        <span className="a-label">Studio · Idea</span>
        <strong style={{ fontWeight: 500, fontSize: 15 }}>Ship small: the feature that took three weeks</strong>
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {DRAFTS.map((d) => {
          const shown = reduced ? d.text : d.text.slice(0, Math.min(d.text.length, chars));
          return (
            <div key={d.platform} className="a-card" style={{ alignContent: 'start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><PlatformIcon platform={d.platform} size={12} /><span className="a-label" style={{ color: 'var(--a-ink)' }}>{d.name}</span><span className="a-label" style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{shown.length} / {d.limit.toLocaleString('en-US')}</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#0a0a0a', color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}><Mark size={12} /></span>
                <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 12 }}><strong style={{ fontWeight: 600 }}>Harbor</strong> <span style={{ color: 'var(--a-dim)' }}>@tryharbor</span></span>
                  {/* The full text (invisible) sets the size; the typed slice sits on top, so typing never resizes the card. */}
                  <span style={{ position: 'relative', whiteSpace: 'pre-wrap', fontSize: 12.5 }}>
                    <span style={{ visibility: 'hidden' }} aria-hidden="true">{d.text}▍</span>
                    <span style={{ position: 'absolute', inset: 0 }}>{shown}<span style={{ opacity: shown.length < d.text.length ? 1 : 0, color: '#7c4ddb' }}>▍</span></span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
