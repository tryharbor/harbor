'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Tab link: current only on an exact path match. */
export function TabLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  return (
    <Link href={href} aria-current={path === href ? 'page' : undefined}>
      {children}
    </Link>
  );
}

/** Sidebar link that marks itself current. `exact` for Home, prefix match for everything else. */
export function NavLink({ href, children, exact = false, title }: { href: string; children: ReactNode; exact?: boolean; title?: string }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className="nav-link" aria-current={active ? 'page' : undefined} title={title}>
      {children}
    </Link>
  );
}
