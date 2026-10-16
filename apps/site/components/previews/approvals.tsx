'use client';

import { useEffect, useState } from 'react';
import { PlatformIcon } from '../platform-icon';
import { useInView, useReducedMotion } from '../reveal';
import type { Platform } from '../../lib/site';

type Item = { platform: Platform; when: string; text: string; why: string };
const ITEMS: Item[] = [
  { platform: 'x', when: 'Tue 9:00 AM', text: '3 weeks, 2 rewrites, 1 feature. It does one thing, and it does it well.', why: 'Tue 9am is one of your best X slots. Last week: posts opening with a number did 1.7× your median.' },
  { platform: 'linkedin', when: 'Wed 8:00 AM', text: 'Most founders with several products hit the same wall: switching context between brands. Here’s the workaround I use.', why: 'Wed 8am is your #2 LinkedIn slot. Replies keep asking about multi-brand workflows.' },
  { platform: 'threads', when: 'Thu 1:00 PM', text: 'Every post is measured at 1h, 6h, 24h, 3d and 7d against your own median, not vanity totals.', why: 'Threads midday posts did 1.3× your median last week.' },
];

/**
 * The Approvals inbox: proposed posts arrive one by one with their slot and reason, the voice checks tick, then
 * each is approved and becomes "Scheduled". Loops while on screen; reduced motion shows the finished state.
 */
export function ApprovalsPreview({ compact = false }: { compact?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => setT((x) => (x + 1) % 14), 700);
    return () => clearInterval(id);
  }, [inView, reduced]);
  const step = reduced ? 13 : t;
  const shown = (i: number) => step >= i * 2;
  const approved = (i: number) => step >= 7 + i * 2;

  return (
    <div ref={ref} style={{ padding: compact ? 12 : 18, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="a-label">Approvals</span>
        <span className="a-label">{ITEMS.length - ITEMS.filter((_, i) => approved(i)).length} waiting</span>
      </div>
      {/* Every card is always laid out; arriving only fades and lifts it, so the window never changes size. */}
      {ITEMS.map((it, i) => (
        <div key={it.platform} className="a-card" style={{ opacity: shown(i) ? 1 : 0, transform: shown(i) ? 'none' : 'translateY(10px)', transition: 'opacity 420ms cubic-bezier(.2,.7,.2,1), transform 420ms cubic-bezier(.2,.7,.2,1)' }} aria-hidden={!shown(i)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PlatformIcon platform={it.platform} size={12} />
            <span className="a-label" style={{ color: 'var(--a-ink)' }}>{it.platform === 'x' ? 'X' : it.platform === 'linkedin' ? 'LinkedIn' : 'Threads'}</span>
            <span className="a-label" style={{ marginLeft: 'auto' }}>{it.when}</span>
          </div>
          <div style={{ background: 'var(--a-sunken)', padding: '8px 10px', fontSize: 12.5 }}>{it.text}</div>
          {compact ? null : <div style={{ fontSize: 11.5, color: 'var(--a-muted)' }}><span className="a-label">Why </span>{it.why}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--a-good)' }}>✓ Voice · ✓ Length · ✓ Media</span>
            <span style={{ marginLeft: 'auto', display: 'grid', justifyItems: 'end', alignItems: 'center' }}>
              <span style={{ gridArea: '1 / 1', display: 'flex', gap: 6, opacity: approved(i) ? 0 : 1, transition: 'opacity 250ms' }}><span className="a-btn">Edit</span><span className="a-btn primary">Approve</span></span>
              <span className="a-pill sched" style={{ gridArea: '1 / 1', opacity: approved(i) ? 1 : 0, transition: 'opacity 250ms' }}>Scheduled</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
