'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { reschedulePost } from '../actions';
import type { BestTimes, PostView } from '../api';
import { PlatformIcon } from '../platform-icon';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00–23:00
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
const movable = (p: PostView) => p.status === 'scheduled' || p.status === 'failed';
const when = (p: PostView) => new Date(p.publishedAt ?? p.scheduledFor ?? p.createdAt);

/**
 * A week of posts by day and hour. Scheduled posts drag to a new slot (saved immediately). When a brand is
 * selected, its best posting times shade the grid: one hue (violet), lighter to darker = better.
 */
export function WeekCalendar({ weekStart, posts: initial, best, brandName }: { weekStart: string; posts: PostView[]; best?: BestTimes; brandName?: string }) {
  const [posts, setPosts] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const start = useMemo(() => new Date(`${weekStart}T00:00:00`), [weekStart]);
  const days = useMemo(() => DAYS.map((_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)), [start]);
  const today = new Date();

  const score = useMemo(() => {
    const m = new Map<string, BestTimes['slots'][number]>();
    for (const s of best?.slots ?? []) m.set(`${s.weekday}:${s.hour}`, s);
    return m;
  }, [best]);
  const top = useMemo(() => new Set((best?.top ?? []).map((t) => `${t.weekday}:${t.hour}`)), [best]);
  // Shade relative to this brand's own range, so the best slots stand out even when every score is high.
  const range = useMemo(() => {
    const xs = (best?.slots ?? []).map((s) => s.score);
    return { min: Math.min(...xs, 1), max: Math.max(...xs, 0) };
  }, [best]);
  const rel = (v: number) => (range.max > range.min ? (v - range.min) / (range.max - range.min) : 0);

  const inCell = (day: Date, hour: number) =>
    posts.filter((p) => {
      const d = when(p);
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate() && (d.getHours() === hour || (hour === 6 && d.getHours() < 6) || (hour === 23 && d.getHours() > 23));
    });

  const drop = async (day: Date, hour: number) => {
    const id = dragging;
    setDragging(null);
    if (!id) return;
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    const old = when(post);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, old.getMinutes());
    if (next.getTime() < Date.now()) return setMessage({ kind: 'error', text: "That slot is in the past. Pick a time that's still ahead." });
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, scheduledFor: next.toISOString(), status: 'scheduled' } : p)));
    const res = await reschedulePost(id, next.toISOString());
    if (!res.ok) {
      setPosts((ps) => ps.map((p) => (p.id === id ? post : p)));
      return setMessage({ kind: 'error', text: res.error });
    }
    const s = score.get(`${next.getDay()}:${hour}`);
    setMessage({ kind: 'info', text: `Moved to ${DAYS[next.getDay()]} ${hourLabel(hour)}${s ? ` · best-time score ${Math.round(s.score * 100)}` : ''}.` });
  };

  return (
    <div className="stack">
      <div className="spread small">
        {best ? (
          <span className="row" style={{ gap: 10 }}>
            <span className="label">Best times · {brandName}</span>
            <span className="heat-legend" aria-hidden="true">{[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => <i key={v} style={{ background: heat(v) }} />)}</span>
            <span className="dim">better →</span>
            <span className="dim">{best.slots.some((s) => s.basis === 'history') ? 'From this brand’s posts, blended with platform norms.' : 'Platform norms until this brand has more posts.'}</span>
          </span>
        ) : (
          <span className="dim">Pick a brand above to shade its best posting times.</span>
        )}
        <span className="dim">Drag a scheduled post to move it.</span>
      </div>
      {message ? <p className={message.kind === 'error' ? 'error' : 'notice'} role="status">{message.text}</p> : null}
      <div className="scroll">
        <div className="week" role="grid" aria-label="Week calendar">
          <div className="week-corner" />
          {days.map((d) => {
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={d.toISOString()} className={`week-day${isToday ? ' today' : ''}`} role="columnheader">
                <span className="label">{DAYS[d.getDay()]}</span> <span className="mono">{d.getDate()}</span>
              </div>
            );
          })}
          {HOURS.map((h) => (
            <Row key={h} hour={h}>
              {days.map((d) => {
                const s = score.get(`${d.getDay()}:${h}`);
                const isTop = top.has(`${d.getDay()}:${h}`);
                const items = inCell(d, h);
                return (
                  <div
                    key={d.toISOString()}
                    className={`week-cell${dragging ? ' droppable' : ''}`}
                    role="gridcell"
                    style={s ? { background: heat(rel(s.score)) } : undefined}
                    title={s ? `${DAYS[d.getDay()]} ${hourLabel(h)} · score ${Math.round(s.score * 100)} (${s.basis === 'history' ? `${s.posts} past posts` : 'platform norm'})` : undefined}
                    onDragOver={(e) => { if (dragging) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); void drop(d, h); }}
                  >
                    {isTop ? <span className="best-tag">Best</span> : null}
                    {items.map((p) => (
                      <Link
                        key={p.id}
                        href={`/performance/${p.id}`}
                        className={`week-post s-${p.status}${movable(p) ? ' movable' : ''}`}
                        draggable={movable(p)}
                        onDragStart={(e) => { setDragging(p.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => setDragging(null)}
                        title={`${p.brandName} · ${p.status}: ${p.parts[0]?.text ?? ''}`}
                      >
                        <PlatformIcon platform={p.channel.platform} size={11} />
                        <span className="mono">{when(p).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                        <span className="week-post-text">{p.parts[0]?.text}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ hour, children }: { hour: number; children: React.ReactNode }) {
  return (
    <>
      <div className="week-hour mono" role="rowheader">{hourLabel(hour)}</div>
      {children}
    </>
  );
}

/** Sequential ramp: one hue (violet), from the panel color to 38% violet; weak slots stay near-blank. Never a rainbow. */
function heat(v: number) {
  const pct = Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1.6) * 38);
  return `color-mix(in oklab, var(--stage-drafting) ${pct}%, var(--panel))`;
}
