import Link from 'next/link';
import type { ReactNode } from 'react';
import { Reveal } from './reveal';

/** Shared pieces of the compare and use-case pages: the answer box, an FAQ, a related-links row. */

/** The direct answer, first, in a box an assistant (or a skimming reader) can lift as-is. */
export function Answer({ label = 'The short answer', children }: { label?: string; children: ReactNode }) {
  return (
    <Reveal>
      <div className="answer">
        <span className="label">{label}</span>
        <p>{children}</p>
      </div>
    </Reveal>
  );
}

export function Faq({ items, name }: { items: { q: string; a: string }[]; name: string }) {
  return (
    <div className="guide-faq">
      {items.map((it, i) => (
        <details key={it.q} name={name} open={i === 0}>
          <summary>{it.q}</summary>
          <p>{it.a}</p>
        </details>
      ))}
    </div>
  );
}

export function Related({ items }: { items: { href: string; label: string }[] }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="label">Related</span>
      {items.map((r) => <Link key={r.href} href={r.href} className="btn sm">{r.label} →</Link>)}
    </div>
  );
}
