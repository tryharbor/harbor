import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '../components/reveal';
import { Mark } from '../components/ui';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
};

const LINKS = [
  { href: '/', label: 'Home', note: 'What Harbor is' },
  { href: '/product', label: 'Product', note: 'How the pieces fit' },
  { href: '/developers', label: 'Developers', note: 'MCP server and API' },
  { href: '/open-source', label: 'Self-host', note: 'Run it yourself' },
  { href: '/blog', label: 'Blog', note: 'Notes from the build' },
];

export default function NotFound() {
  return (
    <section className="section dots" style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="container stack" style={{ gap: 28 }}>
        <Reveal><span className="eyebrow"><span className="pixels" />404 · not found</span></Reveal>
        <Reveal delay={60}>
          <h1 className="display" style={{ maxWidth: '12ch', display: 'flex', gap: '0.3em', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--dim)' }}><Mark size={72} /></span>Nothing at this address.
          </h1>
        </Reveal>
        <Reveal delay={120}><p className="lede" style={{ margin: 0 }}>The page may have moved, or the link has a typo. One of these should get you back on course.</p></Reveal>
        <Reveal delay={180}>
          <div className="cards" style={{ marginTop: 16 }}>
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="card">
                <strong style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.02em' }}>{l.label} →</strong>
                <span className="muted small">{l.note}</span>
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
