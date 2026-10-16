import Link from 'next/link';
import { getAgents, getRuns, loadAll, type AgentDef, type AgentRun } from '../../api';
import { LoadError, PageHeader, SimTag, when } from '../../ui';
import { RunStatus, SOURCE, duration, runName, tokens } from '../agent-ui';

export const dynamic = 'force-dynamic';

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ agent?: string; source?: string }> }) {
  const s = await searchParams;
  const res = await loadAll<[AgentDef[], AgentRun[]]>([getAgents(), getRuns({ agentId: s.agent, source: s.source, topLevel: 'true', limit: '100' })]);
  if (!res.ok) return (<><PageHeader title="Runs" /><LoadError message={res.error} /></>);
  const [agents, runs] = res.data;
  const byId = new Map(agents.map((a) => [a.id, a]));
  const link = (p: { agent?: string; source?: string }) => {
    const q = new URLSearchParams(Object.entries({ agent: s.agent, source: s.source, ...p }).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `/agents/runs?${q}` : '/agents/runs';
  };

  return (
    <>
      <PageHeader eyebrow="Agents" title="Runs" sub="Every agent run, whoever started it: you, an automation, the canvas or an MCP client. Open one for its step-by-step log." />
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <nav className="segmented" aria-label="Agent">
          <Link href={link({ agent: '' })} aria-current={!s.agent ? 'page' : undefined}>All agents</Link>
          {agents.map((a) => <Link key={a.id} href={link({ agent: a.id })} aria-current={s.agent === a.id ? 'page' : undefined}>{a.name}</Link>)}
        </nav>
        <nav className="segmented" aria-label="Started by">
          <Link href={link({ source: '' })} aria-current={!s.source ? 'page' : undefined}>Anyone</Link>
          {(['ui', 'automation', 'mcp', 'canvas'] as const).map((src) => <Link key={src} href={link({ source: src })} aria-current={s.source === src ? 'page' : undefined}>{SOURCE[src]}</Link>)}
        </nav>
      </div>
      {runs.length ? (
        <section className="scroll" style={{ padding: 0 }}>
          <table className="runs-table">
            <thead><tr><th>Status</th><th>Agent</th><th>Brand</th><th>Started by</th><th>Summary</th><th className="num">Approvals</th><th>Started</th><th className="num">Took</th><th>Model</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td><RunStatus status={r.status} /></td>
                  <td><Link href={`/agents/runs/${r.id}`}>{runName(r, byId)}</Link></td>
                  <td className="muted">{r.brandName ?? '–'}</td>
                  <td><span className="tag">{SOURCE[r.source]}</span></td>
                  <td className="small muted" style={{ maxWidth: 340 }}>{r.error ? <span className="bad-ink">{r.error}</span> : r.summary ?? '–'}</td>
                  <td className="num">{r.approvalCount || '–'}</td>
                  <td className="small dim" style={{ whiteSpace: 'nowrap' }}>{when(r.startedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="num small dim">{duration(r.startedAt, r.finishedAt)}</td>
                  <td className="small dim" style={{ whiteSpace: 'nowrap' }}>{r.simulated ? <SimTag model="simulated" /> : `${r.model ?? '–'} · ${tokens(r.usage)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <div className="empty"><span className="muted">No runs{s.agent || s.source ? ' match these filters' : ' yet'}. Run an agent from the library, or let an automation start one.</span><Link className="button" href="/agents">Open the library</Link></div>
      )}
    </>
  );
}
