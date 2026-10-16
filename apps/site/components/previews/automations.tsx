'use client';

import { useSteps } from './motion';
import { Reserve } from './reserve';

/**
 * Automations: a schedule (weekday + hour) or a post event. An outperforming post arrives as an event, the
 * matching automation starts a run, and its daily count ticks up. A failing one has paused itself.
 */
const LASTS = ['Done · just now', 'Running…', 'Done · Thu 2:14 PM'];

export function AutomationsPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(8, 900, { final: 5 });
  const event = step >= 1;
  const running = step >= 2 && step < 4;
  const ran = step >= 4;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 440 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Agents · Automations</span><strong className="pv-title">They draft and propose. Approving stays with you.</strong></div>
      </div>
      <div className={`pv-event${event ? ' on' : ''}`} aria-hidden={!event}>
        <span className="a-label" style={{ color: 'var(--a-ink)' }}>Event</span>
        <span className="pv-mono">post_outperformed</span>
        <span className="pv-ellipsis pv-sub">“3 weeks, 2 rewrites, 1 feature.” · 2.4× median</span>
      </div>
      <div className="pv-autos">
        <Auto name="Weekly plan, Monday mornings" agent="Weekly plan" brand="Harbor" trigger="Every Monday at 8am" status="on" last="Done · Mon 8:00 AM" next="Mon, Oct 26, 8 AM" today="0 / 3" />
        <Auto
          name="Repurpose winners" agent="Repurpose a winner" brand="Harbor" trigger="When a post outperforms its median" status="on"
          last={ran ? LASTS[0]! : running ? LASTS[1]! : LASTS[2]!} lasts={LASTS} next="On the event" today={ran || running ? '2 / 3' : '1 / 3'} lit={running}
        />
        <Auto name="Digest before the plan" agent="Weekly digest" brand="Tidewater Coffee" trigger="Every Sunday at 9pm" status="failing" last="Failed · Sun 9:00 PM" next="–" today="0 / 3" />
      </div>
      <span className="pv-sub">Each automation runs at most 3 times a day by default, and the same post never triggers it twice.</span>
    </div>
  );
}

function Auto({ name, agent, brand, trigger, status, last, lasts = [], next, today, lit = false }: { name: string; agent: string; brand: string; trigger: string; status: 'on' | 'failing'; last: string; lasts?: string[]; next: string; today: string; lit?: boolean }) {
  return (
    <article className={`a-card pv-auto${lit ? ' lit' : ''}`}>
      <div className="pv-stack2" style={{ gap: 4, minWidth: 0 }}>
        <span className="pv-row">
          <span className={`a-pill ${status === 'on' ? 'good' : 'bad'}`}>{status === 'on' ? 'On' : 'Paused · failing'}</span>
          <strong style={{ fontWeight: 500 }}>{name}</strong>
        </span>
        <span className="pv-sub">{agent} · {brand} · <span style={{ color: 'var(--a-ink)' }}>{trigger}</span></span>
        {status === 'failing' ? <span className="pv-sub" style={{ color: 'var(--a-bad)' }}>Failed 3 times in a row, so it paused. Check the last run, then turn it back on.</span> : null}
      </div>
      <dl className="pv-facts">
        <div><dt className="a-label">Last run</dt><dd><Reserve all={lasts}>{last}</Reserve></dd></div>
        <div><dt className="a-label">Next</dt><dd>{next}</dd></div>
        <div><dt className="a-label">Today</dt><dd className="pv-mono">{today}</dd></div>
      </dl>
    </article>
  );
}
