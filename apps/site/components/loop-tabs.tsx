'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FEATURES } from '../lib/site';
import { AgentRunPreview } from './previews/agent-run';
import { CalendarPreview } from './previews/calendar';
import { CurvePreview } from './previews/curve';
import { DraftsPreview } from './previews/drafts';
import { MemoryPreview } from './previews/memory';
import { useInView, useReducedMotion } from './reveal';
import { Window } from './ui';

const STEPS: { verb: string; slug: string; title: string; body: string; preview: ReactNode; window: string }[] = [
  { verb: 'Remember', slug: 'brand-memory', title: 'Each brand keeps its own memory', body: 'Voice, audiences, offers and knowledge per brand, refined from what actually performed and linked to the posts that prove it.', preview: <MemoryPreview />, window: 'Brand Memory' },
  { verb: 'Plan', slug: 'agents', title: 'Agents plan the week for you', body: 'The weekly plan reads last week’s results, finds open best-time slots, suggests ideas and drafts them. Every step is logged.', preview: <AgentRunPreview />, window: 'Agents · Run log' },
  { verb: 'Draft', slug: 'studio', title: 'One idea, every platform', body: 'Drafts in each platform’s native shape and limits, in the brand’s voice. Rewrite, version and compare side by side.', preview: <DraftsPreview />, window: 'Studio' },
  { verb: 'Publish', slug: 'publishing', title: 'Out at the hours that work', body: 'Direct to X, LinkedIn, Instagram and Threads, scheduled into the slots where this brand’s posts do best.', preview: <CalendarPreview />, window: 'Hub · Calendar' },
  { verb: 'Learn', slug: 'insights', title: 'What worked, and why', body: 'Every post is measured at 1h, 6h, 24h, 3 days and 7 days against the brand’s own median. The digest turns it into next week’s plan.', preview: <CurvePreview />, window: 'Performance' },
];
const DWELL = 7000;

/** Harbor's loop as numbered tabs (Sanity's 01–05 pattern). Auto-advances while on screen; click to jump. */
export function LoopTabs() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!inView || paused || reduced) return;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const p = (now - start) / DWELL;
      setTick(Math.min(1, p));
      if (p >= 1) setI((x) => (x + 1) % STEPS.length);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [i, inView, paused, reduced]);
  // On narrow screens the strip scrolls sideways; keep the active tab visible without moving the page.
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current, tab = el?.children[i] as HTMLElement | undefined;
    if (el && tab && el.scrollWidth > el.clientWidth) el.scrollTo({ left: tab.offsetLeft - 16, behavior: 'smooth' });
  }, [i]);

  return (
    <div ref={ref} className="loop" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div ref={strip} className="loop-tabs" role="tablist" aria-label="Harbor's loop">
        {STEPS.map((s, n) => {
          const f = FEATURES.find((x) => x.slug === s.slug)!;
          return (
            <button key={s.verb} role="tab" type="button" aria-selected={n === i} className={`loop-tab c-${f.color}${n === i ? ' on' : ''}`} onClick={() => { setI(n); setTick(0); }}>
              <span className="mono">{String(n + 1).padStart(2, '0')}</span>
              <span>{s.verb}</span>
              <span className="loop-progress" style={{ transform: `scaleX(${n === i ? (reduced ? 1 : tick) : n < i ? 1 : 0})` }} />
            </button>
          );
        })}
      </div>
      <div className="split wide-right" style={{ alignItems: 'start', marginTop: 40 }} role="tabpanel">
        {/* Every step's copy and preview is rendered in one grid cell, sized to the largest; only the active one shows.
            Switching tabs fades between them and never changes the section's height. */}
        <div className="loop-stack">
          {STEPS.map((st, n) => {
            const f = FEATURES.find((x) => x.slug === st.slug)!;
            return (
              <div key={st.verb} className={`loop-layer stack${n === i ? ' on' : ''}`} style={{ gap: 18 }} aria-hidden={n !== i}>
                <span className={`eyebrow c-${f.color}`}><span className="swatch" />{f.name}</span>
                <h3 className="h2" style={{ fontSize: 'clamp(28px, 3.6vw, 44px)' }}>{st.title}</h3>
                <p className="lede" style={{ margin: 0 }}>{st.body}</p>
                <Link className="link-arrow" href={f.href} tabIndex={n === i ? undefined : -1}>Explore {f.name} →</Link>
              </div>
            );
          })}
        </div>
        <div className="loop-stack">
          {STEPS.map((st, n) => (
            <div key={st.verb} className={`loop-layer${n === i ? ' on' : ''}`} aria-hidden={n !== i}>
              <Window title={st.window}>{st.preview}</Window>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
