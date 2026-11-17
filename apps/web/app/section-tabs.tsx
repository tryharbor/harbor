'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Pillars group their pages: the sidebar shows one item per pillar, and the pillar's pages sit in tabs across the
 * top. Pages keep their URLs.
 */
export const MARKET_TABS = [
  { href: '/hub', label: 'Hub' },
  { href: '/studio', label: 'Studio' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/media', label: 'Media' },
  { href: '/performance', label: 'Performance' },
  { href: '/insights', label: 'Insights' },
  { href: '/agents', label: 'Agents' },
] as const;
/** Pages that belong to Market without a tab of their own. */
export const MARKET_EXTRA = ['/compose'] as const;
export const MARKET_PATHS = [...MARKET_TABS.map((t) => t.href), ...MARKET_EXTRA];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function SectionTabs() {
  const path = usePathname();
  if (!MARKET_PATHS.some((p) => under(path, p))) return null;
  return (
    <nav className="tabs section-tabs" aria-label="Market">
      {MARKET_TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={under(path, t.href) ? 'page' : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
