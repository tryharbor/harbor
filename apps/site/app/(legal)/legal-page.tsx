import type { ReactNode } from 'react';
import { Reveal } from '../../components/reveal';
import { SITE } from '../../lib/site';
import { formatDate } from '../../lib/blog';
import './legal.css';

/** The frame for /privacy and /terms: title, draft note, an index of sections, then the text. */
export function LegalPage({ eyebrow, title, updated, sections, children }: { eyebrow: string; title: string; updated: string; sections: { id: string; title: string }[]; children: ReactNode }) {
  return (
    <section className="section legal">
      <div className="container">
        <header className="legal-head">
          <Reveal><span className="eyebrow"><span className="pixels" />{eyebrow}</span></Reveal>
          <Reveal delay={60}><h1 className="h1">{title}</h1></Reveal>
          <Reveal delay={120}>
            <div className="legal-draft c-amber" role="note">
              <span className="swatch" aria-hidden="true" />
              <p><strong>Draft, under review.</strong> This is a plain-language draft that hasn’t had a final legal review yet, and it will change before Harbor Cloud opens. Questions: <a href={`mailto:${SITE.email}`} style={{ color: 'var(--pink)' }}>{SITE.email}</a>. Last updated <time dateTime={updated}>{formatDate(updated)}</time>.</p>
            </div>
          </Reveal>
        </header>
        <div className="legal-layout">
          <nav className="legal-toc" aria-label="On this page">
            <span className="label">On this page</span>
            {sections.map((s) => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}
          </nav>
          <Reveal delay={160}><div className="prose">{children}</div></Reveal>
        </div>
      </div>
    </section>
  );
}
