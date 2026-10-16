'use client';

import { PlatformIcon } from '../platform-icon';
import type { Platform } from '../../lib/site';
import { useSteps } from './motion';
import { Reserve } from './reserve';

type Row = { platform: Platform; handle: string; when: string; text: string; shape?: string; phases: { status: string; note: string }[] };
const ROWS: Row[] = [
  { platform: 'x', handle: '@tryharbor', when: 'Tue 9:00 AM', text: '3 weeks, 2 rewrites, 1 feature.', shape: 'Thread · 3 posts', phases: [{ status: 'publishing', note: 'Posting 1 of 3' }, { status: 'publishing', note: 'Posting 3 of 3, each a reply to the last' }, { status: 'published', note: 'Live · first snapshot in 1h' }] },
  { platform: 'linkedin', handle: 'Harbor', when: 'Wed 8:00 AM', text: 'Most founders with several products hit the same wall…', phases: [{ status: 'publishing', note: 'Sending to LinkedIn' }, { status: 'published', note: 'Live · metrics need LinkedIn partner access' }] },
  { platform: 'threads', handle: '@tryharbor', when: 'Thu 1:00 PM', text: 'Every post, measured against your own median.', phases: [{ status: 'pending', note: 'Threads is still processing it' }, { status: 'published', note: 'Live · first snapshot in 1h' }] },
  { platform: 'instagram', handle: '@tidewatercoffee', when: 'Sun 7:00 PM', text: 'Three roasts, one Sunday. Swipe for the cupping notes.', shape: 'Carousel · 4 images', phases: [{ status: 'publishing', note: 'A container per image, portrait crop' }, { status: 'pending', note: 'Instagram is still processing it' }, { status: 'published', note: 'Live · first snapshot in 1h' }] },
];
const NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const STARTS = ROWS.reduce<number[]>((a, r, i) => [...a, i ? a[i - 1]! + ROWS[i - 1]!.phases.length : 1], []);
const TOTAL = STARTS.at(-1)! + ROWS.at(-1)!.phases.length + 3;
const PILL: Record<string, string> = { scheduled: 'sched', publishing: 'run', pending: 'run', published: 'good' };
const pillText = (status: string) => (status === 'published' ? '✓ Published' : status);
/** Every status and note a row goes through, laid out under the live one so a row never re-wraps as it goes out. */
const PILLS = Object.keys(PILL).map(pillText);
const notes = (r: Row) => [`Scheduled for ${r.when}`, ...r.phases.map((p) => p.note)].map((n) => `${r.shape ? `${r.shape} · ` : ''}${n}`);

/** The week's queue going out, one post at a time, straight to each platform's API: threads part by part, carousels after processing. */
export function PublishQueuePreview() {
  const { ref, step } = useSteps<HTMLDivElement>(TOTAL, 900, { final: TOTAL - 2 });

  return (
    <div ref={ref} className="pv" style={{ minHeight: 400 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Hub · Week of Oct 19</span><strong className="pv-title">Scheduled to live, direct to each platform</strong></div>
        <span className="pv-row" style={{ gap: 6 }}>{(['x', 'linkedin', 'instagram', 'threads'] as const).map((p) => <span key={p} className="pv-chip pv-row" style={{ gap: 5 }}><PlatformIcon platform={p} size={10} />Connected</span>)}</span>
      </div>
      <div className="pv-queue">
        {ROWS.map((r, i) => {
          const k = step - STARTS[i]!;
          const phase = k < 0 ? { status: 'scheduled', note: `Scheduled for ${r.when}` } : r.phases[Math.min(k, r.phases.length - 1)]!;
          return (
            <div key={r.platform} className={`pv-qrow${k >= 0 && phase.status !== 'published' ? ' lit' : ''}`}>
              <span className="pv-row" style={{ gap: 6, minWidth: 0 }}><PlatformIcon platform={r.platform} size={12} /><span className="a-label" style={{ color: 'var(--a-ink)' }}>{NAME[r.platform]}</span><span className="pv-sub pv-ellipsis">{r.handle}</span></span>
              <span className="pv-stack2" style={{ minWidth: 0 }}>
                <span className="pv-ellipsis">{r.text}</span>
                <Reserve all={notes(r)} className="pv-sub">{r.shape ? `${r.shape} · ` : ''}{phase.note}</Reserve>
              </span>
              <span className="pv-mono pv-dim pv-qwhen">{r.when}</span>
              <span className={`a-pill ${PILL[phase.status]}`}><Reserve all={PILLS}>{pillText(phase.status)}</Reserve></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
