'use client';

import Link from 'next/link';
import { useActionState, useMemo } from 'react';
import type { Platform } from '@harbor/core';
import { previewMemory, type PreviewState } from '../../../learn-actions';
import type { AppliedRule, IdeaView } from '../../../api';
import { PlatformIcon } from '../../../platform-icon';
import { Select } from '../../../components/select';

const NAMES: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const RULE: Record<AppliedRule['kind'], string> = { do: 'Do', avoid: 'Avoid', banned: 'Banned word', excerpt: 'Excerpt', term: 'Term', product: 'Product', audience: 'Audience', value: 'Value' };
const SOURCE = { learned: 'learned from examples', refresh: 'from results', saved: 'saved by you', owner: 'written by you' } as const;

/** Words in `text` that don't appear in `other`, so the with-memory column shows what Brand Memory changed. */
function marked(text: string, other: string) {
  const seen = new Set(other.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []);
  return text.split(/(\s+)/).map((tok, i) => {
    const w = tok.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, '');
    return w && !seen.has(w) ? <mark key={i}>{tok}</mark> : <span key={i}>{tok}</span>;
  });
}

export function PreviewForm({ brandId, brandName, ideas, platforms }: { brandId: string; brandName: string; ideas: IdeaView[]; platforms: Platform[] }) {
  const [state, action, pending] = useActionState<PreviewState, FormData>(previewMemory, { platform: platforms[0] });
  const p = state.preview;
  const withText = p?.with.parts.map((x) => x.text).join('\n\n') ?? '';
  const withoutText = p?.without.parts.map((x) => x.text).join('\n\n') ?? '';
  const withMarked = useMemo(() => marked(withText, withoutText), [withText, withoutText]);

  return (
    <div className="stack-lg">
      <form action={action} className="card stack">
        <input type="hidden" name="brandId" value={brandId} />
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <label className="field">
            <span className="label">An idea</span>
            <Select name="ideaId" defaultValue={state.ideaId ?? ''} ariaLabel="An idea" options={[{ value: '', label: 'None: write a brief →' }, ...ideas.map((i) => ({ value: i.id, label: i.title }))]} />
          </label>
          <label className="field">
            <span className="label">A one-line brief</span>
            <input name="brief" defaultValue={state.brief} placeholder="Why we track growth curves instead of totals" />
          </label>
        </div>
        <fieldset className="row" style={{ border: 0, padding: 0, margin: 0, gap: 6, flexWrap: 'wrap' }}>
          <legend className="label" style={{ marginBottom: 8 }}>Platform</legend>
          {platforms.map((pl) => (
            <label key={pl} className="channel-pick"><input type="radio" name="platform" value={pl} defaultChecked={pl === (state.platform ?? platforms[0])} /><PlatformIcon platform={pl} size={13} /> {NAMES[pl]}</label>
          ))}
        </fieldset>
        {state.error ? <p className="error small" role="alert">{state.error}</p> : null}
        <div><button type="submit" className="primary" disabled={pending}>{pending ? 'Drafting both…' : 'Draft with and without'}</button></div>
      </form>

      {p ? (
        <>
          <div className="compare">
            <section className="stack">
              <span className="label">Without Brand Memory</span>
              <div className="compare-text muted">{withoutText}</div>
              <span className="small dim">Same model, same brief, an empty memory.</span>
            </section>
            <section className="stack compare-with">
              <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />With {brandName}'s Brand Memory</span>
              <div className="compare-text">{withMarked}</div>
              <span className="small dim"><mark>Highlighted</mark> words aren't in the version without memory.</span>
            </section>
          </div>
          <section className="stack">
            <span className="label">What Brand Memory changed · {p.applied.length} rule{p.applied.length === 1 ? '' : 's'}</span>
            {p.applied.length ? (
              <ul className="rule-evidence">
                {p.applied.map((r, i) => (
                  <li key={i}>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="label">{RULE[r.kind]}</span>
                      {r.evidence ? <span className="tag">{SOURCE[r.evidence.source]}</span> : null}
                    </div>
                    <p className="rule-text">{r.text}</p>
                    {r.evidence?.note ? <p className="small muted" style={{ margin: 0 }}>{r.evidence.note}</p> : null}
                    {r.evidence?.posts.length ? (
                      <span className="row small" style={{ gap: 8, flexWrap: 'wrap' }}>
                        {r.evidence.posts.slice(0, 4).map((id, n) => <Link key={id} href={`/performance/${id}`} className="cite">post {n + 1}</Link>)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <p className="small muted">No rule changed this draft. Add voice rules or excerpts, or run a voice refresh.</p>}
          </section>
        </>
      ) : null}
    </div>
  );
}
