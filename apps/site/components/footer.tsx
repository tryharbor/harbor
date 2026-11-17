import Link from 'next/link';
import { COMPARISONS } from '../lib/compare';
import { FEATURES, SITE } from '../lib/site';
import { Mark } from './ui';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="stack" style={{ gap: 12 }}>
            <Link href="/" className="brand" style={{ color: 'var(--ink)' }}><Mark size={20} />Harbor</Link>
            <p style={{ margin: 0, maxWidth: '32ch' }}>{SITE.tagline}.</p>
            <span className="pixels" aria-hidden="true" />
          </div>
          <div>
            <span className="label">Product</span>
            <Link href="/product">How it works</Link>
            {FEATURES.map((f) => <Link key={f.slug} href={f.href}>{f.name}</Link>)}
            <Link href="/pricing">Pricing</Link>
          </div>
          <div>
            <span className="label">Resources</span>
            <Link href="/guides">Guides</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/developers">Developers</Link>
            <Link href="/use-cases">Use cases</Link>
          </div>
          <div>
            <span className="label">Compare</span>
            {COMPARISONS.map((c) => <Link key={c.slug} href={`/compare/${c.slug}`}>Harbor vs {c.name}</Link>)}
          </div>
          <div>
            <span className="label">Company</span>
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            <a href={SITE.x}>X / @tryharbor</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
        <p className="footer-big" aria-hidden="true">Harbor</p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>© {new Date().getFullYear()} Harbor Labs LLC. Built in public.</span>
          <span className="mono small">Build · Market · Money</span>
        </div>
      </div>
    </footer>
  );
}
