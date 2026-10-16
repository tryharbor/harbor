import Link from 'next/link';
import type { Channel } from '@harbor/core';
import { runAgent } from '../../agent-actions';
import { getAgent, getBrands, getCampaigns, getChannels, getDrafts, getPosts, getRuns, loadAll, type AgentDef, type AgentRun, type BrandView, type Campaign, type DraftView, type PostView } from '../../api';
import { BrandMark, Flash, LoadError, PageHeader, PLATFORM_NAME, PlatformTag, when } from '../../ui';
import { CATEGORY, PRODUCES, RunStatus, SOURCE, TRIGGER, duration } from '../agent-ui';
import { RunButton } from '../run-button';

export const dynamic = 'force-dynamic';

type Params = { brand?: string; post?: string; draft?: string; notice?: string; error?: string };

export default async function AgentRunPage({ params, searchParams }: { params: Promise<{ agentId: string }>; searchParams: Promise<Params> }) {
  const [{ agentId }, s] = await Promise.all([params, searchParams]);
  const res = await loadAll<[AgentDef, BrandView[], AgentRun[]]>([getAgent(agentId), getBrands(), getRuns({ agentId, brandId: (await searchParams).brand, topLevel: 'true', limit: '6' })]);
  if (!res.ok) return (<><PageHeader title="Agent" /><LoadError message={res.error} /></>);
  const [agent, brands, runs] = res.data;
  const brand = brands.find((b) => b.id === s.brand) ?? brands[0];
  const needs = (t: string) => agent.inputs.some((i) => i.type === t);

  let ctx: { channels: Channel[]; campaigns: Campaign[]; posts: PostView[]; drafts: DraftView[] } = { channels: [], campaigns: [], posts: [], drafts: [] };
  if (brand) {
    const c = await loadAll<[Channel[], Campaign[], PostView[], DraftView[]]>([
      getChannels(brand.id),
      needs('campaign') ? getCampaigns(brand.id) : Promise.resolve([]),
      needs('post') ? getPosts({ brandId: brand.id, status: 'published', limit: '100' }) : Promise.resolve([]),
      needs('draft') ? getDrafts({ brandId: brand.id }) : Promise.resolve([]),
    ]);
    if (!c.ok) return (<><PageHeader title={agent.name} /><LoadError message={c.error} /></>);
    ctx = { channels: c.data[0], campaigns: c.data[1], posts: c.data[2], drafts: c.data[3] };
  }
  const connected = [...new Set(ctx.channels.filter((c) => c.status === 'connected').map((c) => c.platform))];
  // Winners first, so "Repurpose a winner" opens on the post most worth repurposing.
  const rank = { outperformed: 0, met: 1, inconclusive: 2, underperformed: 3 };
  const posts = [...ctx.posts].sort((a, b) => (rank[a.outcome?.verdict ?? 'inconclusive'] - rank[b.outcome?.verdict ?? 'inconclusive']) || (b.outcome?.ratio ?? 0) - (a.outcome?.ratio ?? 0));
  const here = `/agents/${agent.id}${brand ? `?brand=${brand.id}` : ''}`;

  return (
    <>
      <PageHeader eyebrow={<Link href="/agents">Agents</Link>} title={agent.name} sub={agent.description} />
      <Flash params={s} />
      <div className="grid-2">
        <form action={runAgent} className="agent-panel-form">
          <input type="hidden" name="agentId" value={agent.id} />
          <input type="hidden" name="returnTo" value={here} />
          {brands.length === 0 ? <div className="empty"><span className="muted">Add a brand first; agents work from its Brand Memory.</span><Link className="button" href="/brands/new">Add brand</Link></div> : null}

          {agent.inputs.map((input) => {
            const name = `in.${input.key}`;
            switch (input.type) {
              case 'brand':
                return (
                  <div key={input.key} className="field">
                    <span className="label">{input.label}</span>
                    <input type="hidden" name={name} value={brand?.id ?? ''} />
                    <div className="chips" role="radiogroup" aria-label={input.label}>
                      {brands.map((b) => (
                        <Link key={b.id} href={`/agents/${agent.id}?brand=${b.id}`} className={`chip row${b.id === brand?.id ? ' on' : ''}`} style={{ gap: 6, textDecoration: 'none' }} role="radio" aria-checked={b.id === brand?.id}>
                          <BrandMark name={b.name} logoUrl={b.logoUrl} size={16} />{b.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              case 'platforms':
                return (
                  <fieldset key={input.key} className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="label" style={{ marginBottom: 8 }}>{input.label}</legend>
                    {connected.length ? (
                      <div className="row" style={{ flexWrap: 'wrap' }}>
                        {connected.map((p) => (
                          <label key={p} className="channel-pick">
                            <input type="checkbox" name={name} value={p} defaultChecked />
                            <PlatformTag platform={p} />
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span className="small muted">{brand?.name} has no connected channels. <Link href={brand ? `/brands/${brand.id}/channels` : '/'}>Connect one</Link> (sandbox works).</span>
                    )}
                    {input.help ? <span className="field-help">{input.help}</span> : null}
                  </fieldset>
                );
              case 'number':
                return (
                  <label key={input.key} className="field" style={{ maxWidth: 220 }}>
                    <span className="label">{input.label}</span>
                    <input type="hidden" name={`num.${input.key}`} value="1" />
                    <input type="number" name={name} min={input.min} max={input.max} defaultValue={String(input.default ?? input.min ?? 1)} required={input.required} />
                    {input.help ? <span className="field-help">{input.help}</span> : null}
                  </label>
                );
              case 'campaign':
                return (
                  <label key={input.key} className="field">
                    <span className="label">{input.label}{input.required ? '' : ' · optional'}</span>
                    <select name={name} defaultValue="">
                      <option value="">No campaign</option>
                      {ctx.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <span className="field-help">{input.help ?? 'Ideas and drafts also land on this campaign’s canvas.'}</span>
                  </label>
                );
              case 'post':
                return (
                  <label key={input.key} className="field">
                    <span className="label">{input.label}</span>
                    {posts.length ? (
                      <select name={name} defaultValue={s.post ?? posts[0]?.id} required={input.required}>
                        {posts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {verdictWord(p)} · {PLATFORM_NAME[p.channel.platform]} · {(p.parts[0]?.text ?? '').slice(0, 70)}
                          </option>
                        ))}
                      </select>
                    ) : <span className="small muted">{brand?.name} has no published posts yet.</span>}
                    {input.help ? <span className="field-help">{input.help}</span> : null}
                  </label>
                );
              case 'draft':
                return (
                  <label key={input.key} className="field">
                    <span className="label">{input.label}</span>
                    {ctx.drafts.length ? (
                      <select name={name} defaultValue={s.draft ?? ctx.drafts[0]?.id} required={input.required}>
                        {ctx.drafts.map((d) => (
                          <option key={d.id} value={d.id}>{PLATFORM_NAME[d.platform]} · v{d.version} · {(d.parts[0]?.text ?? '').slice(0, 70)}</option>
                        ))}
                      </select>
                    ) : <span className="small muted">{brand?.name} has no drafts yet. Draft something in Studio first.</span>}
                  </label>
                );
            }
          })}

          <div className="agent-guard small">
            <strong>Nothing posts on its own.</strong>{' '}
            <span className="muted">{agent.produces.includes('approvals') ? 'Drafts go to Approvals with a proposed time. You approve, edit or reject each one.' : 'This agent only reads and reports.'}</span>
          </div>
          {brands.length ? <RunButton steps={agent.steps.map((st) => st.label)} /> : null}
        </form>

        <aside className="stack">
          <section className="stack">
            <span className="label row" style={{ gap: 8 }}><span className={`agent-glyph g-${agent.category}`} aria-hidden="true" />{CATEGORY[agent.category]} · how it works</span>
            <ol className="agent-steps">{agent.steps.map((st) => <li key={st.key}>{st.label}</li>)}</ol>
            <div className="kv"><span className="label">Produces</span><span className="chips">{agent.produces.map((p) => <span key={p} className="chip">{PRODUCES[p]}</span>)}</span></div>
            <div className="kv">
              <span className="label">Runs</span>
              <span className="small muted">{agent.triggers.map((t) => TRIGGER[t]).join(' · ')}</span>
              {agent.triggers.some((t) => t !== 'manual') ? <Link href={`/agents/automations?agent=${agent.id}#new`} className="small">Set up an automation →</Link> : null}
            </div>
          </section>
          <section className="stack">
            <span className="label">Recent runs</span>
            {runs.length ? (
              <ul className="list small">
                {runs.map((r) => (
                  <li key={r.id} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                    <RunStatus status={r.status} />
                    <Link href={`/agents/runs/${r.id}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary ?? r.brandName ?? r.id}</Link>
                    <span className="dim mono">{SOURCE[r.source]} · {duration(r.startedAt, r.finishedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <span className="small dim">No runs yet.</span>}
            <span className="small dim">{runs[0] ? `Last run ${when(runs[0].startedAt)}` : null}</span>
          </section>
        </aside>
      </div>
    </>
  );
}

const verdictWord = (p: PostView) => {
  const o = p.outcome;
  if (!o) return 'No verdict';
  const r = Math.round(o.ratio * 10) / 10;
  return o.verdict === 'outperformed' ? `↑ ${r}×` : o.verdict === 'underperformed' ? `↓ ${r}×` : o.verdict === 'met' ? `≈ ${r}×` : 'Too few to compare';
};
