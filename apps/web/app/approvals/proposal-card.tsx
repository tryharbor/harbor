'use client';

import Link from 'next/link';
import { useState } from 'react';
import { applyProposal } from '../learn-actions';
import type { MemoryChange, MemoryProposal } from '../api';
import { PlatformTag, TZ } from '../ui';

export const TARGET_LABEL: Record<MemoryChange['target'], string> = {
  'voice.do': 'Voice · Do',
  'voice.avoid': 'Voice · Avoid',
  'voice.excerpts': 'Voice · Excerpt',
  'voice.bannedWords': 'Voice · Banned word',
  knowledge: 'Knowledge',
  examplePosts: 'Example post',
};

/** A proposed set of Brand Memory changes. Each change shows its numbers and the posts behind it; tick the ones to keep. */
export function ProposalCard({ p, returnTo }: { p: MemoryProposal; returnTo: string }) {
  const pending = p.status === 'pending';
  const [checked, setChecked] = useState(() => new Set(p.changes.filter((c) => c.status !== 'rejected').map((c) => c.id)));
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <form action={applyProposal} id={p.id} className={`proposal${pending ? '' : ' decided'}`}>
      <input type="hidden" name="proposalId" value={p.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <header className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="label row" style={{ gap: 8 }}><span className="agent-glyph g-review" aria-hidden="true" />Voice refresh · {p.brandName}</span>
          <strong style={{ fontWeight: 500 }}>{p.changes.length} proposed change{p.changes.length === 1 ? '' : 's'} to Brand Memory</strong>
        </div>
        <span className="small dim">
          {new Date(p.createdAt).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}
          {p.runId ? <> · <Link href={`/agents/runs/${p.runId}`}>run log</Link></> : null}
          {' · '}<Link href={`/brands/${p.brandId}/memory`}>open Brand Memory</Link>
        </span>
      </header>

      <ol className="changes">
        {p.changes.map((c) => (
          <li key={c.id} className={`change op-${c.op}${!pending && c.status === 'rejected' ? ' dropped' : ''}`}>
            {pending ? (
              <input type="checkbox" name="accept" value={c.id} checked={checked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Keep: ${c.text}`} />
            ) : (
              <span className="mono small" aria-label={c.status}>{c.status === 'accepted' ? '✓' : '–'}</span>
            )}
            <div className="stack" style={{ gap: 8, minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className={`op-tag ${c.op}`}>{c.op === 'add' ? '+ Add' : '− Remove'}</span>
                <span className="label">{TARGET_LABEL[c.target]}</span>
                {c.lift !== undefined ? <span className={`verdict ${c.lift >= 1 ? 'outperformed' : 'underperformed'}`}>{c.lift >= 1 ? '↑' : '↓'} {c.lift.toFixed(1)}× median</span> : null}
              </div>
              <p className={`change-text${c.op === 'remove' ? ' struck' : ''}`}>{c.text}</p>
              <p className="small muted" style={{ margin: 0 }}>{c.why}</p>
              {c.evidence.posts.length ? (
                <details className="evidence">
                  <summary className="small">Evidence · {c.evidence.posts.length} post{c.evidence.posts.length === 1 ? '' : 's'}{c.evidence.signals.length ? ` · ${c.evidence.signals.length} signal${c.evidence.signals.length === 1 ? '' : 's'}` : ''}</summary>
                  <ul className="evidence-list">
                    {c.evidence.posts.map((e) => (
                      <li key={e.id}>
                        <PlatformTag platform={e.platform} iconOnly />
                        <Link href={`/performance/${e.id}`} className="evidence-text">{e.text}</Link>
                        {e.ratio !== undefined ? <span className={`verdict ${e.verdict ?? (e.ratio >= 1.3 ? 'outperformed' : e.ratio < 0.7 ? 'underperformed' : 'met')}`}>{e.ratio >= 1 ? '↑' : '↓'} {e.ratio.toFixed(1)}×</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {pending ? (
        <footer className="approval-foot">
          <span className="small dim">{checked.size} of {p.changes.length} selected. Unticked changes are rejected.</span>
          <span className="row" style={{ gap: 6 }}>
            <button type="submit" name="intent" value="reject" className="link-button">Reject all</button>
            <button type="submit" name="intent" value="apply" className="primary" disabled={!checked.size}>Apply {checked.size} to Brand Memory</button>
          </span>
        </footer>
      ) : (
        <footer className="approval-foot"><span className="small">{p.status === 'applied' ? `Applied ${p.changes.filter((c) => c.status === 'accepted').length} of ${p.changes.length}` : 'Rejected'}{p.decidedAt ? ` · ${new Date(p.decidedAt).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}` : ''}</span></footer>
      )}
    </form>
  );
}
