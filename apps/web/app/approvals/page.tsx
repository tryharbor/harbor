import Link from 'next/link';
import { bulkApprovals } from '../agent-actions';
import { API_BROWSER_URL, getAgents, getApprovals, getBrands, getMemoryProposals, loadAll, type AgentDef, type Approval, type ApprovalCounts, type BrandView, type MemoryProposal, type ProposalCounts } from '../api';
import { checksPass } from '../agents/agent-ui';
import { Flash, LoadError, PageHeader, TZ } from '../ui';
import { ApprovalCard } from './approval-card';
import { ProposalCard } from './proposal-card';
import { BrandFilter } from '../components/brand-filter';

export const dynamic = 'force-dynamic';

type Status = 'pending' | 'approved' | 'rejected';

type Params = { tab?: string; status?: string; brand?: string; run?: string; notice?: string; error?: string };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await searchParams;
  if (s.tab === 'memory') return <MemoryTab s={s} />;
  const status: Status = s.status === 'approved' || s.status === 'rejected' ? s.status : 'pending';
  const res = await loadAll<[{ data: Approval[]; counts: ApprovalCounts }, AgentDef[], BrandView[], { counts: ProposalCounts }]>([
    getApprovals({ status, brandId: s.brand, runId: s.run }),
    getAgents(),
    getBrands(),
    getMemoryProposals({ status: 'pending' }),
  ]);
  if (!res.ok) return (<><PageHeader title="Approvals" /><LoadError message={res.error} /></>);
  const [{ data: approvals, counts }, agents, brands, { counts: memoryCounts }] = res.data;
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const params = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ status: status === 'pending' ? undefined : status, brand: s.brand, run: s.run, ...p }).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `/approvals?${q}` : '/approvals';
  };
  const here = params({});
  const passing = approvals.filter((a) => checksPass(a.checks) && new Date(a.proposedFor).getTime() > Date.now());

  // Pending posts grouped by the day they'd go out.
  const groups = new Map<string, Approval[]>();
  for (const a of approvals) {
    const key = status === 'pending' ? new Date(a.proposedFor).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }) : 'all';
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Approvals"
        title={counts.pending ? `${counts.pending} post${counts.pending === 1 ? '' : 's'} waiting for you` : 'Nothing waiting'}
        sub="Agents propose; you decide. Each post comes with the slot it was given, why, and how it did against Brand Memory. Approving schedules it."
      />
      <Flash params={s} />
      <KindTabs posts={counts.pending} memory={memoryCounts.pending} current="posts" />

      <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <nav className="segmented" aria-label="Status">
            <Link href={params({ status: undefined })} aria-current={status === 'pending' ? 'page' : undefined}>Waiting · {counts.pending}</Link>
            <Link href={params({ status: 'approved' })} aria-current={status === 'approved' ? 'page' : undefined}>Approved · {counts.approved}</Link>
            <Link href={params({ status: 'rejected' })} aria-current={status === 'rejected' ? 'page' : undefined}>Rejected · {counts.rejected}</Link>
          </nav>
          {brands.length > 1 ? (
            <BrandFilter
              brands={brands.map((b) => ({ id: b.id, name: b.name, logoUrl: b.logoUrl, kind: b.kind }))}
              current={s.brand}
              hrefs={Object.fromEntries(brands.map((b) => [b.id, params({ brand: b.id })]))}
              allHref={params({ brand: undefined })}
              width={220}
            />
          ) : null}
          {s.run ? <Link href={params({ run: undefined })} className="tag signal">From one run · clear ✕</Link> : null}
        </div>
        {status === 'pending' && approvals.length ? (
          <form id="bulk" action={bulkApprovals} className="row" style={{ gap: 6 }}>
            <input type="hidden" name="returnTo" value={here} />
            <button type="submit" name="action" value="reject">Reject selected</button>
            <button type="submit" name="action" value="approve">Approve selected</button>
          </form>
        ) : null}
      </div>

      {status === 'pending' && passing.length > 1 ? (
        <form action={bulkApprovals} className="approve-all">
          <input type="hidden" name="returnTo" value={here} />
          <input type="hidden" name="action" value="approve" />
          {passing.map((a) => <input key={a.id} type="hidden" name="ids" value={a.id} />)}
          <span className="small"><strong>{passing.length} of {approvals.length}</strong> <span className="muted">pass every voice check and have a slot still ahead.</span></span>
          <button type="submit" className="primary">Approve those {passing.length}</button>
        </form>
      ) : null}

      {approvals.length ? (
        [...groups].map(([day, items]) => (
          <div key={day} className="stack" style={{ gap: 10 }}>
            {status === 'pending' ? <span className="label">{day}</span> : null}
            <div className="approval-list">
              {items.map((a) => <ApprovalCard key={a.id} a={a} agentName={a.agentId ? agentName.get(a.agentId) : undefined} returnTo={here} selectable={status === 'pending'} apiUrl={API_BROWSER_URL} />)}
            </div>
          </div>
        ))
      ) : (
        <div className="empty">
          <span className="muted">
            {status === 'pending' ? 'Nothing to review. Run the weekly plan, or set it to run every Monday, and its drafts will wait here.' : `No ${status} posts${s.brand || s.run ? ' for this filter' : ''} yet.`}
          </span>
          {status === 'pending' ? <span className="row" style={{ gap: 6 }}><Link className="button primary" href="/agents/weekly_plan">Run the weekly plan</Link><Link className="button" href="/agents/automations?agent=weekly_plan#new">Automate it</Link></span> : null}
        </div>
      )}
    </>
  );
}

function KindTabs({ posts, memory, current }: { posts: number; memory: number; current: 'posts' | 'memory' }) {
  return (
    <nav className="tabs" aria-label="What's waiting">
      <Link href="/approvals" aria-current={current === 'posts' ? 'page' : undefined}>Posts{posts ? ` · ${posts}` : ''}</Link>
      <Link href="/approvals?tab=memory" aria-current={current === 'memory' ? 'page' : undefined}>Brand Memory{memory ? ` · ${memory}` : ''}</Link>
    </nav>
  );
}

/** Proposed Brand Memory changes from the voice refresh: same rule as posts, nothing changes until you apply it. */
async function MemoryTab({ s }: { s: Params }) {
  const status = s.status === 'applied' || s.status === 'rejected' ? s.status : 'pending';
  const res = await loadAll<[{ data: MemoryProposal[]; counts: ProposalCounts }, { counts: ApprovalCounts }]>([
    getMemoryProposals({ status, brandId: s.brand }),
    getApprovals({ status: 'pending' }),
  ]);
  if (!res.ok) return (<><PageHeader title="Approvals" /><LoadError message={res.error} /></>);
  const [{ data: proposals, counts }, { counts: postCounts }] = res.data;
  const here = `/approvals?tab=memory${status === 'pending' ? '' : `&status=${status}`}`;
  return (
    <>
      <PageHeader
        eyebrow="Approvals"
        title={counts.pending ? `${counts.pending} Brand Memory update${counts.pending === 1 ? '' : 's'} to review` : 'Brand Memory is up to date'}
        sub="The voice refresh compares what beat your median with what didn't, then proposes rules. Every change shows its numbers and the posts behind it."
      />
      <Flash params={s} />
      <KindTabs posts={postCounts.pending} memory={counts.pending} current="memory" />
      <nav className="segmented" aria-label="Status">
        <Link href="/approvals?tab=memory" aria-current={status === 'pending' ? 'page' : undefined}>Waiting · {counts.pending}</Link>
        <Link href="/approvals?tab=memory&status=applied" aria-current={status === 'applied' ? 'page' : undefined}>Applied · {counts.applied}</Link>
        <Link href="/approvals?tab=memory&status=rejected" aria-current={status === 'rejected' ? 'page' : undefined}>Rejected · {counts.rejected}</Link>
      </nav>
      {proposals.length ? (
        <div className="stack">{proposals.map((p) => <ProposalCard key={p.id} p={p} returnTo={here} />)}</div>
      ) : (
        <div className="empty">
          <span className="muted">{status === 'pending' ? 'Nothing to review. Run a voice refresh on a brand with a few weeks of posts, or automate it weekly.' : `No ${status} updates yet.`}</span>
          {status === 'pending' ? <span className="row" style={{ gap: 6 }}><Link className="button primary" href="/agents/voice_refresh">Run a voice refresh</Link><Link className="button" href="/agents/automations?agent=voice_refresh#new">Automate it</Link></span> : null}
        </div>
      )}
    </>
  );
}
