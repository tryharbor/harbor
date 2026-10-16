import Link from 'next/link';
import type { AgentDef, AgentRun, Check, RunRef, RunSource, Trigger, TriggerKind } from '../api';

/** Pieces shared by the Agents, Runs, Automations and Approvals pages. */

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

export const CATEGORY: Record<AgentDef['category'], string> = { plan: 'Plan', repurpose: 'Repurpose', review: 'Review', insights: 'Insights' };
export const PRODUCES: Record<AgentDef['produces'][number], string> = { digest: 'Digest', ideas: 'Ideas', drafts: 'Drafts', approvals: 'Approvals', report: 'Report' };
export const TRIGGER: Record<TriggerKind, string> = { manual: 'Run by hand', schedule: 'On a schedule', post_published: 'When a post goes out', post_outperformed: 'When a post outperforms' };
export const SOURCE: Record<RunSource, string> = { ui: 'You', mcp: 'MCP', automation: 'Automation', canvas: 'Canvas', studio: 'Studio' };

/** Agent names for runs whose agent isn't in the library (model runs inside an agent). */
export const KIND_LABEL: Record<string, string> = { ideas: 'Suggest ideas', draft: 'Draft', rewrite: 'Rewrite', voice: 'Learn voice', insights: 'Digest', outcome: 'Outcomes', agent: 'Agent' };

export const triggerText = (t: Trigger) =>
  t.type === 'schedule' ? `Every ${DAYS[t.weekday]} at ${hourLabel(t.hour)}` : t.event === 'post_outperformed' ? 'When a post outperforms its median' : 'When a post goes out';

export function RunStatus({ status }: { status: string }) {
  const cls = status === 'succeeded' ? 's-published' : status === 'failed' ? 's-failed' : status === 'skipped' ? 'plain' : 's-scheduled';
  const label = { succeeded: 'Done', failed: 'Failed', running: 'Running', skipped: 'Skipped' }[status] ?? status;
  return <span className={`pill ${cls}`}>{label}</span>;
}

export const duration = (from: string, to?: string) => {
  if (!to) return '–';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return ms < 1000 ? `${Math.max(ms, 1)}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)}m`;
};

export const tokens = (u?: { inputTokens: number; outputTokens: number }) =>
  u ? `${Intl.NumberFormat('en-US', { notation: 'compact' }).format(u.inputTokens + u.outputTokens)} tokens` : '–';

export const runName = (r: Pick<AgentRun, 'agentId' | 'kind'>, agents: Map<string, AgentDef>) =>
  (r.kind === 'agent' && r.agentId ? agents.get(r.agentId)?.name : undefined) ?? KIND_LABEL[r.kind] ?? r.kind;

/** Where a step's output lives in the app. */
export function refHref(ref: RunRef, ctx: { brandId?: string; ideaByDraft?: Map<string, string> } = {}): string | undefined {
  switch (ref.kind) {
    case 'idea': return `/studio/${ref.id}`;
    case 'draft': { const idea = ctx.ideaByDraft?.get(ref.id); return idea ? `/studio/${idea}` : undefined; }
    case 'post': return `/performance/${ref.id}`;
    case 'digest': return ctx.brandId ? `/insights?brand=${ctx.brandId}` : '/insights';
    case 'approval': return `/approvals#${ref.id}`;
    case 'run': return `/agents/runs/${ref.id}`;
    case 'campaign': return `/campaigns/${ref.id}`;
    case 'proposal': return `/approvals?tab=memory#${ref.id}`;
  }
}

export function RefLink({ r, href }: { r: RunRef; href?: string }) {
  const label = r.label ?? r.id;
  return href ? <Link href={href} className="cite">{r.kind} · {label}</Link> : <span className="cite">{r.kind} · {label}</span>;
}

/** Voice-check results: a mark and words for each, so state is never color alone. */
export function Checks({ checks, compact = false }: { checks: Check[]; compact?: boolean }) {
  if (!checks.length) return null;
  const shown = compact ? checks.filter((c) => !c.ok) : checks;
  if (compact && !shown.length) return <span className="check ok small">✓ Passes every voice check</span>;
  return (
    <ul className="checks">
      {shown.map((c) => (
        <li key={c.key} className={`check ${c.ok ? 'ok' : c.severity}`} title={c.detail}>
          <span aria-hidden="true">{c.ok ? '✓' : c.severity === 'fail' ? '✕' : '!'}</span>
          <span><strong>{c.label}</strong>{c.ok ? null : <span className="muted"> · {c.detail}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export const checksPass = (checks: Check[]) => checks.every((c) => c.ok || c.severity === 'info');
