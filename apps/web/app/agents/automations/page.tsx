import Link from 'next/link';
import { deleteAutomation, runAutomationNow, toggleAutomation } from '../../agent-actions';
import { getAgents, getAutomations, getBrands, loadAll, type AgentDef, type Automation, type BrandView } from '../../api';
import { Flash, LoadError, PageHeader, when } from '../../ui';
import { RunStatus, triggerText } from '../agent-ui';
import { NewAutomation } from './new-automation';

export const dynamic = 'force-dynamic';

const STATUS: Record<Automation['status'], { cls: string; label: string }> = {
  active: { cls: 's-published', label: 'On' },
  paused: { cls: 'plain', label: 'Paused' },
  failing: { cls: 's-failed', label: 'Paused · failing' },
};

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ agent?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const res = await loadAll<[Automation[], AgentDef[], BrandView[]]>([getAutomations(), getAgents(), getBrands()]);
  if (!res.ok) return (<><PageHeader title="Automations" /><LoadError message={res.error} /></>);
  const [automations, agents, brands] = res.data;
  const agentName = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader eyebrow="Agents" title="Automations" sub="Agents that start themselves on a schedule or when something happens to a post. They draft and propose. Approving stays with you." />
      <Flash params={s} />

      {automations.length ? (
        <div className="stack" style={{ gap: 10 }}>
          {automations.map((a) => (
            <article key={a.id} className="automation">
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className={`pill ${STATUS[a.status].cls}`}>{STATUS[a.status].label}</span>
                  <strong style={{ fontWeight: 500 }}>{a.name}</strong>
                </div>
                <span className="small muted">
                  {agentName.get(a.agentId) ?? a.agentId} · {a.brandName} · <span className="ink">{triggerText(a.trigger)}</span>
                </span>
                {a.status === 'failing' ? <span className="small bad-ink">Failed {a.consecutiveFailures} times in a row, so it paused. Check the last run, then turn it back on.</span> : null}
              </div>
              <dl className="automation-facts small">
                <div><dt className="label">Last run</dt><dd>{a.lastRunId ? <Link href={`/agents/runs/${a.lastRunId}`} className="row" style={{ gap: 6 }}>{a.lastRunStatus ? <RunStatus status={a.lastRunStatus} /> : null}{when(a.lastRunAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Link> : <span className="dim">Never</span>}</dd></div>
                <div><dt className="label">Next</dt><dd>{a.trigger.type === 'event' ? <span className="dim">On the event</span> : a.enabled && a.nextRunAt ? when(a.nextRunAt, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' }) : <span className="dim">–</span>}</dd></div>
                <div><dt className="label">Today</dt><dd className="mono">{a.runsToday} / {a.maxRunsPerDay}</dd></div>
              </dl>
              <div className="row" style={{ gap: 6 }}>
                <form action={runAutomationNow}><input type="hidden" name="automationId" value={a.id} /><button type="submit">Run now</button></form>
                <form action={toggleAutomation}>
                  <input type="hidden" name="automationId" value={a.id} />
                  <input type="hidden" name="enabled" value={String(!a.enabled)} />
                  <button type="submit">{a.enabled ? 'Pause' : 'Turn on'}</button>
                </form>
                <form action={deleteAutomation}><input type="hidden" name="automationId" value={a.id} /><button type="submit" className="link-button">Delete</button></form>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty"><span className="muted">No automations yet. A good first one: the weekly plan, every Monday morning.</span></div>
      )}

      <section className="stack" id="new">
        <h2>New automation</h2>
        <NewAutomation agents={agents} brands={brands} initialAgent={s.agent} />
      </section>
    </>
  );
}
