'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NAV, SITE } from '../lib/site';
import { GitHubIcon, Mark } from './ui';

/** Sticky header: Product menu (the five features plus Developers and Open source), top links, GitHub. */
export function Header() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // A short grace period before closing, so a diagonal path from "Product" to the panel doesn't close it.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openMenu = () => { clearTimeout(closeTimer.current); setMenu(true); };
  const closeSoon = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setMenu(false), 220); };
  useEffect(() => { setMenu(false); setMobile(false); }, [path]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);
  useEffect(() => { document.body.style.overflow = mobile ? 'hidden' : ''; }, [mobile]);
  const current = (href: string) => (path === href || path.startsWith(`${href}/`) ? 'page' : undefined);

  // The mobile nav sits outside <header>: the header's backdrop-filter makes it the containing block for
  // position: fixed children, which on iOS Safari collapsed the menu to the header's 60px.
  return (
    <>
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand" aria-label="Harbor home"><Mark size={20} />Harbor<span className="pixels" aria-hidden="true" style={{ width: 20, height: 4 }} /></Link>
        <nav className="nav" aria-label="Main">
          <div className="menu" ref={menuRef} onMouseEnter={openMenu} onMouseLeave={closeSoon}>
            <button type="button" aria-expanded={menu} aria-haspopup="true" onClick={() => setMenu((m) => !m)} style={{ color: path.startsWith('/product') ? 'var(--ink)' : undefined }}>Product ▾</button>
            {menu ? (
              <div className="menu-panel">
                <div>
                  <span className="label" style={{ padding: '0 10px 6px' }}>The loop</span>
                  {NAV.product.map((f) => (
                    <Link key={f.slug} href={f.href} className={`menu-item c-${f.color}`}>
                      <span className="swatch" />
                      <span><strong>{f.name}</strong><span className="small dim">{f.short}</span></span>
                    </Link>
                  ))}
                </div>
                <div>
                  <span className="label" style={{ padding: '0 10px 6px' }}>Platform</span>
                  <Link href="/product" className="menu-item"><span /><span><strong>Overview</strong><span className="small dim">How the pieces fit together</span></span></Link>
                  {NAV.more.map((m) => (
                    <Link key={m.href} href={m.href} className="menu-item"><span /><span><strong>{m.name}</strong><span className="small dim">{m.short}</span></span></Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {NAV.more.map((m) => <Link key={m.href} href={m.href} aria-current={current(m.href)}>{m.name}</Link>)}
          {NAV.top.map((m) => <Link key={m.href} href={m.href} aria-current={current(m.href)}>{m.name}</Link>)}
        </nav>
        <div className="header-actions">
          <a className="btn sm hide-sm icon-btn" href={SITE.github} aria-label="Harbor on GitHub" title="Harbor on GitHub"><GitHubIcon size={16} /></a>
          <Link className="btn sm primary hide-sm" href={SITE.start}>Get started</Link>
          <button type="button" className="btn sm burger" aria-expanded={mobile} aria-label={mobile ? 'Close menu' : 'Open menu'} onClick={() => setMobile((m) => !m)}>{mobile ? 'Close' : 'Menu'}</button>
        </div>
      </div>
    </header>
      {mobile ? (
        <nav className="mobile-nav" aria-label="Mobile">
          <span className="label" style={{ marginTop: 8 }}>Product</span>
          <Link href="/product">Overview</Link>
          {NAV.product.map((f) => <Link key={f.slug} href={f.href} className={`c-${f.color}`}><span className="swatch" style={{ marginRight: 12 }} />{f.name}</Link>)}
          <span className="label" style={{ marginTop: 20 }}>More</span>
          {[...NAV.more, ...NAV.top].map((m) => <Link key={m.href} href={m.href}>{m.name}</Link>)}
          <div className="mobile-actions">
            <Link className="btn primary" href={SITE.start}>Get started</Link>
            <a className="btn" href={SITE.github}><GitHubIcon />GitHub</a>
          </div>
        </nav>
      ) : null}
    </>
  );
}
