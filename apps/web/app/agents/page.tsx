import Link from 'next/link';
import { getAgents, getApprovals, getMode, loadAll, type AgentDef, type ApprovalCounts, type Mode } from '../api';
import { Flash, LoadError, PageHeader, SimTag, when } from '../ui';
import { CATEGORY, PRODUCES, RunStatus, SOURCE, TRIGGER } from './agent-ui';

export const dynamic = 'force-dynamic';

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const s = await searchParams;
  const res = await loadAll<[AgentDef[], { counts: ApprovalCounts }, Mode]>([getAgents(), getApprovals({ status: 'pending' }), getMode()]);
  if (!res.ok) return (<><PageHeader title="Agents" /><LoadError message={res.error} /></>);
  const [agents, { counts }, mode] = res.data;

  return (
    <>
      <PageHeader
        eyebrow="Agents"
        title="Agents that do the strategist's homework"
        sub="Each one chains what Harbor already knows: Brand Memory, the digest, best times and every post's growth curve. Nothing posts on its own. What an agent drafts waits in Approvals until you say yes."
        actions={
          <>
            <Link className="button" href="/settings#mcp">Connect Claude (MCP)</Link>
            <Link className="button primary" href="/approvals">Approvals{counts.pending ? ` · ${counts.pending}` : ''}</Link>
          </>
        }
      />
      <Flash params={s} />
      {mode.model === 'simulated' ? (
        <p className="small dim row" style={{ gap: 8 }}><SimTag model="simulated" /> Agents run on the simulated model: real steps and real data, no API spend.</p>
      ) : null}

      <div className="agent-grid">
        {agents.map((a) => (
          <article key={a.id} className="agent-card">
            <div className="spread">
              <span className="label row" style={{ gap: 8 }}><span className={`agent-glyph g-${a.category}`} aria-hidden="true" />{CATEGORY[a.category]}</span>
              {a.automations ? <Link href="/agents/automations" className="tag signal">{a.automations} automation{a.automations === 1 ? '' : 's'}</Link> : null}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <h2 style={{ margin: 0 }}>{a.name}</h2>
              <p className="muted small" style={{ margin: 0 }}>{a.tagline}</p>
            </div>
            <ol className="agent-steps">
              {a.steps.map((st) => <li key={st.key}>{st.label}</li>)}
            </ol>
            <div className="kv">
              <span className="label">Produces</span>
              <span className="chips">{a.produces.map((p) => <span key={p} className="chip">{PRODUCES[p]}</span>)}</span>
            </div>
            <div className="kv">
              <span className="label">Runs</span>
              <span className="small muted">{a.triggers.map((t) => TRIGGER[t]).join(' · ')}</span>
            </div>
            <div className="spread agent-card-foot">
              {a.lastRun ? (
                <Link href={`/agents/runs/${a.lastRun.id}`} className="row small" style={{ gap: 8, textDecoration: 'none' }}>
                  <RunStatus status={a.lastRun.status} />
                  <span className="dim">{SOURCE[a.lastRun.source]} · {when(a.lastRun.startedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </Link>
              ) : <span className="small dim">Not run yet</span>}
              <span className="row" style={{ gap: 6 }}>
                {a.triggers.some((t) => t !== 'manual') ? <Link className="button" href={`/agents/automations?agent=${a.id}#new`}>Automate</Link> : null}
                <Link className="button primary" href={`/agents/${a.id}`}>Run</Link>
              </span>
            </div>
          </article>
        ))}
      </div>

      <section className="stack staging dots" style={{ background: 'transparent' }}>
        <span className="label">Bring your own agent</span>
        <p className="muted small" style={{ margin: 0, maxWidth: '72ch' }}>
          Claude, or any MCP client, can read Brand Memory, suggest ideas, draft and propose posts through Harbor's MCP server. The same rule applies: proposals land in Approvals.
        </p>
        <Link href="/settings#mcp" className="small">Create an API key and connect →</Link>
      </section>
    </>
  );
}
