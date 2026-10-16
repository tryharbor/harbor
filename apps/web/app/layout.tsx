import Link from 'next/link';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { getBrands, getMode, type BrandView, type Mode } from './api';
import { NavLink } from './nav-link';
import { ThemeToggle, type Theme } from './theme-toggle';
import { HarborMark } from './ui';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata = { title: 'Harbor', description: 'The open-source content strategist for builders who run more than one brand.' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  let brands: BrandView[] = [];
  let mode: Mode | undefined;
  try {
    [brands, mode] = await Promise.all([getBrands(), getMode().catch(() => undefined)]);
  } catch {
    // Pages show the connection error themselves; the sidebar renders without brands.
  }
  const live = mode?.publish === 'live';
  // Light by default; dark only when chosen with the toggle.
  const theme: Theme = (await cookies()).get('harbor-theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} data-theme={theme === 'dark' ? 'dark' : undefined}>
      <body>
        <div className="shell">
          <aside className="sidebar" aria-label="Main">
            <Link href="/" className="wordmark"><HarborMark /> Harbor</Link>
            <Link href="/compose" className="button primary new-post">New post</Link>
            <nav className="nav-group" aria-label="Workspace">
              <NavLink href="/" exact>Home</NavLink>
              <NavLink href="/hub">Hub</NavLink>
              <NavLink href="/studio">Studio</NavLink>
              <NavLink href="/performance">Performance</NavLink>
            </nav>
            <nav className="nav-group" aria-label="Brands">
              <div className="nav-label">Brands</div>
              {brands.map((b) => (
                <NavLink key={b.id} href={`/brands/${b.id}`}>
                  <span className="brand-dot" aria-hidden="true">{b.name.slice(0, 1).toUpperCase()}</span>
                  {b.name}
                </NavLink>
              ))}
              <NavLink href="/brands/new">+ Add brand</NavLink>
            </nav>
            <div className="nav-group nav-bottom">
              {mode ? (
                <div className="mode-badge" title="Sandbox and Simulated spend nothing. Switch in .env when you're ready.">
                  <span className="label">Mode</span>
                  <span className="row">
                    <span className={`pill ${live ? 's-live' : 'plain'}`}>{live ? 'Live publishing' : 'Sandbox'}</span>
                    <span className="pill plain">{mode.model === 'simulated' ? 'Simulated AI' : 'Claude'}</span>
                  </span>
                </div>
              ) : null}
              <div className="spread">
                <NavLink href="/settings">Settings</NavLink>
                <ThemeToggle initial={theme} />
              </div>
            </div>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
