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

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Sidebar link that marks itself current. `exact` for Home, prefix match for everything else; `match` adds more
 * prefixes (Market is current on every page in its section).
 */
export function NavLink({ href, children, exact = false, title, match }: { href: string; children: ReactNode; exact?: boolean; title?: string; match?: readonly string[] }) {
  const path = usePathname();
  const active = exact ? path === href : under(path, href) || (match ?? []).some((m) => under(path, m));
  return (
    <Link href={href} className="nav-link" aria-current={active ? 'page' : undefined} title={title}>
      {children}
    </Link>
  );
}
