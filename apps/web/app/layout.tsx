import Link from 'next/link';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { getApprovals, getBrands, getMemoryProposals, getMode, type BrandView, type Mode } from './api';
import { authEnabled, currentSession } from './auth';
import { Icon } from './icons';
import { NavLink } from './nav-link';
import { SidebarToggle } from './sidebar-toggle';
import { ThemeToggle, type Theme } from './theme-toggle';
import { BrandMark, HarborMark } from './ui';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata = { title: 'Harbor', description: 'The open-source content strategist for builders who run more than one brand.' };
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/', label: 'Home', icon: Icon.home, exact: true },
  { href: '/hub', label: 'Hub', icon: Icon.hub },
  { href: '/approvals', label: 'Approvals', icon: Icon.approvals, count: 'approvals' as const },
  { href: '/campaigns', label: 'Campaigns', icon: Icon.campaigns },
  { href: '/studio', label: 'Studio', icon: Icon.studio },
  { href: '/agents', label: 'Agents', icon: Icon.agents },
  { href: '/media', label: 'Media', icon: Icon.media },
  { href: '/performance', label: 'Performance', icon: Icon.performance },
  { href: '/insights', label: 'Insights', icon: Icon.insights },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  const jar = await cookies();
  // Light by default; dark only when chosen with the toggle.
  const theme: Theme = jar.get('harbor-theme')?.value === 'dark' ? 'dark' : 'light';
  // Signed out (only the sign-in page gets this far): a bare page, and no API calls.
  if (!session) {
    return (
      <html lang="en" className={`${geist.variable} ${geistMono.variable}`} data-theme={theme === 'dark' ? 'dark' : undefined}>
        <body>{children}</body>
      </html>
    );
  }
  let brands: BrandView[] = [];
  let mode: Mode | undefined;
  let pending = 0;
  try {
    [brands, mode, pending] = await Promise.all([
      getBrands(),
      getMode().catch(() => undefined),
      Promise.all([
        getApprovals({ status: 'pending' }).then((r) => r.counts.pending).catch(() => 0),
        getMemoryProposals({ status: 'pending' }).then((r) => r.counts.pending).catch(() => 0),
      ]).then(([a, b]) => a + b),
    ]);
  } catch {
    // Pages show the connection error themselves; the sidebar renders without brands.
  }
  const live = mode?.publish === 'live';
  const collapsed = jar.get('harbor-sidebar')?.value === 'collapsed';

  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} data-theme={theme === 'dark' ? 'dark' : undefined}>
      <body>
        <div className={`shell${collapsed ? ' collapsed' : ''}`}>
          <aside className="sidebar" aria-label="Main">
            <div className="sidebar-top">
              <Link href="/" className="wordmark" title="Harbor"><HarborMark /> <span className="nav-text">Harbor</span><span className="pixels nav-text" aria-hidden="true" style={{ width: 20, height: 4 }} /></Link>
              <SidebarToggle initial={collapsed} />
            </div>
            <Link href="/compose" className="button primary new-post" title="New post"><Icon.plus /><span className="nav-text">New post</span></Link>
            <nav className="nav-group" aria-label="Workspace">
              {NAV.map((n) => (
                <NavLink key={n.href} href={n.href} exact={n.exact} title={n.count && pending ? `${n.label} · ${pending} waiting` : n.label}>
                  <n.icon /><span className="nav-text">{n.label}</span>
                  {n.count && pending ? <span className="nav-count" aria-label={`${pending} waiting`}>{pending}</span> : null}
                </NavLink>
              ))}
            </nav>
            <nav className="nav-group" aria-label="Brands">
              <div className="nav-label nav-text">Brands</div>
              {brands.map((b) => (
                <NavLink key={b.id} href={`/brands/${b.id}`} title={b.name}>
                  <BrandMark name={b.name} logoUrl={b.logoUrl} size={20} />
                  <span className="nav-text">{b.name}</span>
                </NavLink>
              ))}
              <NavLink href="/brands/new" title="Add brand"><Icon.plus /><span className="nav-text">Add brand</span></NavLink>
            </nav>
            <div className="nav-group nav-bottom">
              {mode ? (
                <div className="mode-badge nav-text" title="Sandbox and Simulated spend nothing. Switch in .env when you're ready.">
                  <span className="label">Mode</span>
                  <span className="row">
                    <span className={`pill ${live ? 's-live' : 'plain'}`}>{live ? 'Live publishing' : 'Sandbox'}</span>
                    <span className="pill plain">{mode.model === 'simulated' ? 'Simulated AI' : 'Claude'}</span>
                  </span>
                </div>
              ) : null}
              <div className="sidebar-foot">
                <NavLink href="/settings" title="Settings"><Icon.settings /><span className="nav-text">Settings</span></NavLink>
                <span className="nav-text"><ThemeToggle initial={theme} /></span>
              </div>
              {authEnabled() ? (
                <form action="/auth/logout" method="post">
                  <button type="submit" className="nav-link sign-out" title={`Sign out @${session.login}`}>
                    <Icon.signOut /><span className="nav-text">Sign out <span className="dim">@{session.login}</span></span>
                  </button>
                </form>
              ) : null}
            </div>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
