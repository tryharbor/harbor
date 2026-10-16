import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Brand } from '@harbor/core';
import { getBrands } from './api';
import { NavLink } from './nav-link';
import './globals.css';

export const metadata = { title: 'Harbor', description: 'Content strategist for builders who run several brands.' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  let brands: Brand[] = [];
  try {
    brands = await getBrands();
  } catch {
    // Pages show the connection error themselves; the sidebar just renders without brands.
  }

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar" aria-label="Main">
            <Link href="/" className="wordmark">Harbor</Link>
            <Link href="/compose" className="button primary new-post">New post</Link>
            <nav className="nav-group">
              <NavLink href="/" exact>Home</NavLink>
              <NavLink href="/hub">Hub</NavLink>
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
            <nav className="nav-group nav-bottom">
              <NavLink href="/settings">Settings</NavLink>
            </nav>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
