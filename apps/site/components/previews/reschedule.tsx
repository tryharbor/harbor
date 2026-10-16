'use client';

import { useEffect, useRef, useState } from 'react';
import { PlatformIcon } from '../platform-icon';
import type { Platform } from '../../lib/site';
import { useSteps } from './motion';
import { Reserve } from './reserve';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = [7, 9, 11, 13, 15, 17, 19, 21];
const LABEL_W = 34, HEAD_H = 26, ROW_H = 30;
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
const longHour = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
/** Demo best-time scores (0–1): weekday mornings, Thursday lunch and Sunday evening. */
const score = (d: number, h: number) => {
  const morning = h === 9 ? 0.9 : h === 7 || h === 11 ? 0.55 : 0.18;
  const weekday = d < 5 ? 1 : 0.4;
  return Math.max(morning * weekday, h === 19 && d === 6 ? 0.95 : 0, h === 13 && d === 3 ? 0.8 : 0, h === 21 ? 0.1 : 0);
};
const heat = (v: number) => `color-mix(in oklab, var(--stage-drafting) ${Math.round(Math.pow(v, 1.4) * 70)}%, #ffffff)`;

type Post = { id: string; platform: Platform; d: number; h: number; live?: boolean };
const START: Post[] = [
  { id: 'a', platform: 'x', d: 0, h: 9 },
  { id: 'b', platform: 'x', d: 1, h: 9, live: true },
  { id: 'c', platform: 'linkedin', d: 2, h: 9 },
  { id: 'd', platform: 'threads', d: 3, h: 15 },
  { id: 'e', platform: 'instagram', d: 6, h: 19 },
];
const DEMO = { id: 'd', d: 3, h: 13 };
const IDLE = 'From this brand’s own posts, blended with platform norms.';
const LIVE = 'Published posts stay where they went out.';
const TAKEN = 'This demo keeps one post per slot. Pick another.';
const moved = (d: number, h: number) => `Moved to ${DAYS[d]} ${longHour(h)}. Saved.`;
/** Every line the status can show, laid out under it so a new message never re-wraps the preview. */
const MESSAGES = [IDLE, LIVE, TAKEN, ...DAYS.flatMap((_, d) => HOURS.map((h) => moved(d, h)))];

/**
 * The calendar shaded by this brand's best times. Scheduled posts drag to a new slot (try it); the demo moves a
 * Thursday post out of a weak afternoon slot into the lunch slot that works. Published posts stay put.
 */
export function RescheduleCalendarPreview() {
  const { ref, step, reduced } = useSteps<HTMLDivElement>(4, 900, { loop: false, final: 3 });
  const [posts, setPosts] = useState(START);
  const [touched, setTouched] = useState(false);
  const [drag, setDrag] = useState<{ id: string; d: number; h: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (touched) return;
    if (step >= 2 || reduced) {
      setPosts((ps) => ps.map((p) => (p.id === DEMO.id ? { ...p, d: DEMO.d, h: DEMO.h } : p)));
      setMsg(moved(DEMO.d, DEMO.h));
    }
  }, [step, reduced, touched]);

  const cellAt = (x: number, y: number) => {
    const r = grid.current?.getBoundingClientRect();
    if (!r) return null;
    const colW = (r.width - LABEL_W) / 7;
    const d = Math.floor((x - r.left - LABEL_W) / colW);
    const hi = Math.floor((y - r.top - HEAD_H) / ROW_H);
    if (d < 0 || d > 6 || hi < 0 || hi >= HOURS.length) return null;
    return { d, h: HOURS[hi]! };
  };

  const onDown = (p: Post) => (e: React.PointerEvent) => {
    setTouched(true);
    if (p.live) { setMsg(LIVE); return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: p.id, d: p.d, h: p.h });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const c = cellAt(e.clientX, e.clientY);
    if (c && (c.d !== drag.d || c.h !== drag.h)) setDrag({ ...drag, ...c });
  };
  const onUp = () => {
    if (!drag) return;
    const taken = posts.some((p) => p.id !== drag.id && p.d === drag.d && p.h === drag.h);
    if (taken) setMsg(TAKEN);
    else {
      setPosts((ps) => ps.map((p) => (p.id === drag.id ? { ...p, d: drag.d, h: drag.h } : p)));
      setMsg(moved(drag.d, drag.h));
    }
    setDrag(null);
  };

  const highlight = !touched && step === 1 ? DEMO.id : drag?.id;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 380 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Hub · Calendar · Harbor</span><strong className="pv-title">Drag a post to a better slot</strong></div>
        <span className="a-label pv-row" style={{ gap: 6 }}>
          <span style={{ display: 'inline-flex' }}>{[0.1, 0.35, 0.6, 0.85, 1].map((v) => <i key={v} style={{ width: 12, height: 8, background: heat(v), display: 'inline-block' }} />)}</span>better →
        </span>
      </div>
      <div ref={grid} className="pv-cal" style={{ ['--lw' as string]: `${LABEL_W}px`, ['--hh' as string]: `${HEAD_H}px`, ['--rh' as string]: `${ROW_H}px` }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
        <div className="pv-cal-grid">
          <span />
          {DAYS.map((d) => <span key={d} className="a-label pv-cal-day">{d}</span>)}
          {HOURS.map((h) => (
            <div key={h} style={{ display: 'contents' }}>
              <span className="a-label pv-cal-hour">{hourLabel(h)}</span>
              {DAYS.map((_, d) => {
                const target = drag && drag.d === d && drag.h === h;
                return <span key={d} className={`pv-cal-cell${target ? ' target' : ''}`} style={{ background: heat(score(d, h)) }} title={`${DAYS[d]} ${hourLabel(h)} · score ${Math.round(score(d, h) * 100)}`} />;
              })}
            </div>
          ))}
        </div>
        {posts.map((p) => {
          const at = drag?.id === p.id ? drag : p;
          return (
            <button
              key={p.id}
              type="button"
              className={`pv-cal-post${p.live ? ' live' : ''}${highlight === p.id ? ' lifted' : ''}${drag?.id === p.id ? ' dragging' : ''}`}
              style={{ left: `calc(var(--lw) + (100% - var(--lw)) * ${at.d} / 7)`, top: `calc(var(--hh) + var(--rh) * ${HOURS.indexOf(at.h)})` }}
              onPointerDown={onDown(p)}
              aria-label={`${p.platform} post, ${DAYS[at.d]} ${longHour(at.h)}${p.live ? ', published' : ', drag to move'}`}
            >
              <span><PlatformIcon platform={p.platform} size={10} />{hourLabel(at.h)}</span>
            </button>
          );
        })}
      </div>
      <Reserve all={MESSAGES} className="pv-sub"><span role="status">{msg ?? IDLE}</span></Reserve>
    </div>
  );
}
