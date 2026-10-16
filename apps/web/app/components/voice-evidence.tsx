import Link from 'next/link';
import { refreshVoice } from '../learn-actions';
import type { BrandView, Evidence, MemoryProposal, PostView } from '../api';
import { PlatformTag, VerdictTag } from '../ui';

const KIND: Record<Evidence['kind'], string> = { do: 'Do', avoid: 'Avoid', banned: 'Banned', value: 'Value', excerpt: 'Excerpt' };
const SOURCE: Record<Evidence['source'], string> = { learned: 'Learned from examples', refresh: 'From results', saved: 'Saved by you', owner: 'Written by you' };

/**
 * Why the voice says what it says: each rule with the posts behind it (Jasper lists sources; Harbor links results).
 * Plus the voice refresh, which proposes new rules from what beat the median.
 */
export function VoiceEvidence({ brand, posts, proposals, returnTo }: { brand: BrandView; posts: PostView[]; proposals: MemoryProposal[]; returnTo: string }) {
  const evidence = (brand.memory.voice.evidence ?? []).filter((e) => e.posts.length || e.signals.length || e.note);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const pending = proposals.filter((p) => p.status === 'pending');
  const scored = posts.filter((p) => p.outcome && p.outcome.verdict !== 'inconclusive').length;

  return (
    <section className="stack" aria-label="Evidence">
      <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />Learned from results</span>
          <span className="small muted" style={{ maxWidth: '62ch' }}>
            Harbor compares {brand.name}'s posts that beat the median with the ones that didn't, and proposes rules. Nothing changes until you approve it.
          </span>
        </div>
        <form action={refreshVoice}>
          <input type="hidden" name="brandId" value={brand.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={pending.length ? undefined : 'primary'} disabled={scored < 6} title={scored < 6 ? 'Needs at least 6 published posts with a verdict.' : undefined}>Refresh from results</button>
        </form>
      </div>
      {pending.length ? (
        <Link href="/approvals?tab=memory" className="approve-all" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="small"><strong>{pending.reduce((n, p) => n + p.changes.length, 0)} proposed change{pending.reduce((n, p) => n + p.changes.length, 0) === 1 ? '' : 's'}</strong> <span className="muted">waiting in Approvals.</span></span>
          <span className="button primary">Review</span>
        </Link>
      ) : null}
      {scored < 6 ? <p className="small dim" style={{ margin: 0 }}>{scored} post{scored === 1 ? '' : 's'} with a verdict so far; the refresh needs 6. Importing past posts from a channel gets there faster.</p> : null}

      {evidence.length ? (
        <ul className="rule-evidence">
          {evidence.map((e, i) => (
            <li key={`${e.kind}${e.rule}${i}`}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="label">{KIND[e.kind]}</span>
                <span className="tag">{SOURCE[e.source]}</span>
              </div>
              <p className="rule-text">{e.rule}</p>
              {e.note ? <p className="small muted" style={{ margin: 0 }}>{e.note}</p> : null}
              {e.posts.length ? (
                <div className="stack" style={{ gap: 4 }}>
                  {e.posts.slice(0, 3).map((id) => {
                    const p = byId.get(id);
                    return p ? (
                      <Link key={id} href={`/performance/${id}`} className="evidence-row small">
                        <PlatformTag platform={p.channel.platform} iconOnly />
                        <span className="evidence-text">{p.parts[0]?.text}</span>
                        <VerdictTag outcome={p.outcome} />
                      </Link>
                    ) : null;
                  })}
                  {e.posts.length > 3 ? <span className="small dim">+{e.posts.length - 3} more posts</span> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small dim" style={{ margin: 0 }}>No rule is linked to evidence yet. Approved refresh changes and anything you save to Brand Memory show up here with their posts.</p>
      )}
    </section>
  );
}
