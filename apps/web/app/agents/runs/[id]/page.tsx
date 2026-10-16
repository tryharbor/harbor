import Link from 'next/link';
import { getAgents, getAutomations, getRun, loadAll, type AgentDef, type AgentRunDetail, type Automation } from '../../../api';
import { LoadError, PageHeader, PlatformTag, SimTag, when } from '../../../ui';
import { Checks, RefLink, RunStatus, SOURCE, duration, refHref, runName, tokens, triggerText } from '../../agent-ui';

export const dynamic = 'force-dynamic';

/** One run as a log (Sanity Functions style): what started it, each step with its timing and output, then what it left for you. */
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadAll<[AgentRunDetail, AgentDef[], Automation[]]>([getRun(id), getAgents(), getAutomations()]);
  if (!res.ok) return (<><PageHeader title="Run" /><LoadError message={res.error} /></>);
  const [run, agents, automations] = res.data;
  const byId = new Map(agents.map((a) => [a.id, a]));
  const automation = automations.find((a) => a.id === run.automationId);
  const ideaByDraft = new Map(run.approvals.filter((a) => a.ideaId).map((a) => [a.draft.id, a.ideaId!]));
  const pending = run.approvals.filter((a) => a.status === 'pending').length;
  const agent = run.agentId ? byId.get(run.agentId) : undefined;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/agents/runs">Runs</Link>}
        title={runName(run, byId)}
        sub={run.summary ?? (run.brandName ? `For ${run.brandName}` : undefined)}
        actions={
          <>
            {agent ? <Link className="button" href={`/agents/${agent.id}${run.brandId ? `?brand=${run.brandId}` : ''}`}>Run again</Link> : null}
            {pending ? <Link className="button primary" href={`/approvals?run=${run.id}`}>Review {pending} in Approvals</Link> : null}
          </>
        }
      />

      <div className="run-meta">
        <div className="stat"><span className="label">Status</span><RunStatus status={run.status} /></div>
        <div className="stat">
          <span className="label">Started by</span>
          <span>
            {SOURCE[run.source]}
            {automation ? <> · <Link href="/agents/automations">{automation.name}</Link> <span className="dim small">({triggerText(automation.trigger)})</span></> : null}
          </span>
        </div>
        <div className="stat"><span className="label">Started</span><span>{when(run.startedAt)}</span></div>
        <div className="stat"><span className="label">Took</span><span className="mono">{duration(run.startedAt, run.finishedAt)}</span></div>
        <div className="stat"><span className="label">Model</span><span className="row" style={{ gap: 8 }}>{run.simulated ? <SimTag model="simulated" /> : run.model ?? '–'}<span className="dim small">{tokens(run.usage)}</span></span></div>
      </div>
      {run.error ? <p className="error" role="alert">{run.error}</p> : null}

      <div className="grid-2">
        <section className="stack">
          <span className="label">Log</span>
          {run.steps.length ? (
            <ol className="timeline">
              {run.steps.map((st, i) => (
                <li key={`${st.key}-${i}`} className={`tl-step t-${st.status}`}>
                  <span className="tl-marker" aria-hidden="true">{st.status === 'succeeded' ? '✓' : st.status === 'failed' ? '✕' : st.status === 'skipped' ? '–' : '…'}</span>
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="spread" style={{ alignItems: 'baseline' }}>
                      <strong style={{ fontWeight: 500 }}>{st.label}</strong>
                      <span className="mono dim small">{st.status === 'skipped' ? 'skipped' : duration(st.startedAt, st.finishedAt)}</span>
                    </div>
                    {st.detail ? <p className="small muted" style={{ margin: 0, maxWidth: '70ch' }}>{st.detail}</p> : null}
                    {st.refs?.length ? (
                      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                        {st.refs.slice(0, 12).map((r) => <RefLink key={`${r.kind}${r.id}`} r={r} href={refHref(r, { brandId: run.brandId, ideaByDraft })} />)}
                        {st.refs.length > 12 ? <span className="small dim">+{st.refs.length - 12} more</span> : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : <span className="small dim">This run has no steps logged (it was a single model call).</span>}
        </section>

        <aside className="stack">
          <section className="stack">
            <span className="label">Inputs</span>
            <dl className="kv-list small">
              {Object.entries(run.inputs).map(([k, v]) => (
                <div key={k}><dt className="dim mono">{k}</dt><dd>{k === 'brandId' && run.brandName ? run.brandName : Array.isArray(v) ? v.join(', ') : String(v)}</dd></div>
              ))}
            </dl>
          </section>
          {run.children.length ? (
            <section className="stack">
              <span className="label">Model calls</span>
              <ul className="list small">
                {run.children.map((c) => (
                  <li key={c.id} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                    <RunStatus status={c.status} />
                    <span>{runName(c, byId)}</span>
                    <span className="dim mono">{c.simulated ? 'simulated' : tokens(c.usage)} · {duration(c.startedAt, c.finishedAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      {run.approvals.length ? (
        <section className="stack">
          <div className="spread">
            <span className="label">Left for you · {run.approvals.length} proposed post{run.approvals.length === 1 ? '' : 's'}</span>
            <Link href={`/approvals?run=${run.id}`} className="small">Open in Approvals →</Link>
          </div>
          <div className="scroll">
            <table>
              <thead><tr><th>Status</th><th>Channel</th><th>Proposed for</th><th>Draft</th><th>Checks</th></tr></thead>
              <tbody>
                {run.approvals.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`pill ${a.status === 'approved' ? 's-published' : a.status === 'rejected' ? 'plain' : 's-scheduled'}`}>{a.status}</span></td>
                    <td><PlatformTag platform={a.channel.platform} handle={a.channel.handle} /></td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>{when(a.proposedFor, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="small" style={{ maxWidth: 420 }}><Link href={`/approvals#${a.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{(a.draft.parts[0]?.text ?? '').slice(0, 140)}</Link></td>
                    <td><Checks checks={a.checks} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
