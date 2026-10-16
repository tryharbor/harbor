'use client';

import { PlatformIcon } from '../platform-icon';
import { useSteps } from './motion';
import { arrive } from './reserve';

const CALLS = [
  { tool: 'get_brand_memory', scope: 'read', out: 'Tidewater Coffee · voice, 2 audiences, 3 products' },
  { tool: 'best_times', scope: 'read', out: 'Threads: Sun 7pm, Thu 1pm' },
  { tool: 'get_conversation', scope: 'read', out: '5 people asked about decaf' },
  { tool: 'create_idea', scope: 'write', out: 'Idea: How we roast decaf' },
  { tool: 'draft_idea', scope: 'write', out: '1 draft · Threads' },
  { tool: 'propose_post', scope: 'write', out: 'Approval created · next free best-time slot' },
];

/** Claude working through Harbor's MCP tools. The last call is a proposal, and it lands in Approvals like any other. */
export function McpPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(CALLS.length + 4, 750, { final: CALLS.length + 2 });
  const shown = Math.min(step, CALLS.length);
  const landed = step > CALLS.length;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 440 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">MCP · Streamable HTTP</span><strong className="pv-title">“Plan a post about decaf for Tidewater”</strong></div>
        <span className="pv-tag">key hbr_7Kq2… · read, write</span>
      </div>
      <ol className="pv-calls">
        {CALLS.map((c, i) => (
          <li key={c.tool} className={i < shown ? 'done' : i === shown ? 'on' : ''}>
            <span className="pv-tl-mark" aria-hidden="true">{i < shown ? '✓' : i === shown ? '…' : ''}</span>
            <span className="pv-mono" style={{ color: 'var(--a-ink)' }}>{c.tool}</span>
            <span className={`pv-scope ${c.scope}`}>{c.scope}</span>
            <span className={`pv-sub pv-ellipsis pv-fade${i < shown ? '' : ' off'}`}>{c.out}</span>
          </li>
        ))}
      </ol>
      <span className="pv-sub">There is no publish or schedule tool. Even the <span className="pv-mono">write</span> scope stops at proposing.</span>
      {/* The proposal's place is kept from the start; it fades in when the last call lands. */}
      <article className={`a-card ${arrive(landed)}`}>
        <div className="pv-row">
          <span className="a-label">Approvals</span>
          <span className="pv-row" style={{ marginLeft: 'auto', gap: 6 }}><PlatformIcon platform="threads" size={11} /><span className="a-label" style={{ color: 'var(--a-ink)' }}>Threads · Sun 7:00 PM</span></span>
        </div>
        <div className="pv-post-text">Five of you asked about decaf this month, so here’s how we roast it: slower, cooler, and tasted twice before it ships.</div>
        <div className="pv-foot">
          <span className="pv-sub">Proposed over MCP · Claude desktop</span>
          <span className="pv-row" style={{ gap: 6 }}><span className="a-btn">Edit</span><span className="a-btn primary">Approve</span></span>
        </div>
      </article>
    </div>
  );
}
