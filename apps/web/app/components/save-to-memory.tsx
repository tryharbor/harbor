'use client';

import { useActionState, useState } from 'react';
import { saveToMemory, type SaveState } from '../learn-actions';

type As = 'knowledge' | 'excerpt' | 'example' | 'do' | 'avoid';
const AS_LABEL: Record<As, { label: string; help: string }> = {
  example: { label: 'Example post', help: 'A post that sounds exactly like the brand.' },
  excerpt: { label: 'Voice excerpt', help: 'A verbatim line drafts should sound like.' },
  knowledge: { label: 'Knowledge note', help: 'A fact, question or objection worth remembering.' },
  do: { label: 'Do rule', help: 'Something drafts should keep doing.' },
  avoid: { label: 'Avoid rule', help: 'Something drafts should stop doing.' },
};

/** "Save to Brand Memory" on any post, reply, theme, signal or draft (Jasper's "Add to Knowledge Base", with the source linked). */
export function SaveToMemory({ brandId, kind, id, options, defaultText, compact = false }: { brandId: string; kind: 'post' | 'reply' | 'theme' | 'signal' | 'draft'; id: string; options: As[]; defaultText?: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveToMemory, {});
  const [as, setAs] = useState<As>(options[0]!);
  const rule = as === 'do' || as === 'avoid';
  return (
    <details className="save-memory">
      <summary className={compact ? 'link-button small' : 'button mono-button'}>{state.ok ? '✓ Saved' : 'Save to Brand Memory'}</summary>
      <form action={action} className="save-memory-panel stack">
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Save as</legend>
          {options.map((o) => (
            <label key={o} className="radio-row">
              <input type="radio" name="as" value={o} checked={as === o} onChange={() => setAs(o)} />
              <span><strong>{AS_LABEL[o].label}</strong> <span className="dim">{AS_LABEL[o].help}</span></span>
            </label>
          ))}
        </fieldset>
        {rule ? (
          <label className="field"><span className="label">Rule</span><input name="text" placeholder={as === 'do' ? 'e.g. Open with the number' : 'e.g. Don’t lead with the product name'} required /></label>
        ) : (
          <label className="field"><span className="label">Text · edit if you like</span><textarea name="text" defaultValue={defaultText} style={{ minHeight: 90 }} /></label>
        )}
        <label className="field"><span className="label">Note · optional</span><input name="note" placeholder="Why it matters" /></label>
        {state.error ? <p className="error small" role="alert">{state.error}</p> : null}
        {state.ok ? <p className="notice small" role="status">{state.ok} Linked to its source.</p> : null}
        <div><button type="submit" className="primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button></div>
      </form>
    </details>
  );
}
