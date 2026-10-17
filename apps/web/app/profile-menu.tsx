'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { ThemeToggle, type Theme } from './theme-toggle';
import { BrandMark } from './ui';

/**
 * Bottom-left of the sidebar: who's signed in, with Settings, the theme and Sign out in a menu that opens upward.
 * Closes on Escape, a click outside, or navigating.
 */
export function ProfileMenu({ name, detail, avatarUrl, theme, canSignOut }: { name: string; detail: string; avatarUrl?: string; theme: Theme; canSignOut: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="profile" ref={root}>
      {open ? (
        <div className="profile-menu" role="menu" aria-label="Account">
          <div className="profile-head">
            <BrandMark name={name} logoUrl={avatarUrl} size={28} />
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <strong className="truncate">{name}</strong>
              <span className="small dim truncate">{detail}</span>
            </span>
          </div>
          <Link role="menuitem" href="/settings" className="profile-item" aria-current={path === '/settings' ? 'page' : undefined}><Icon.settings />Settings</Link>
          <div className="profile-item theme-item"><span className="row" style={{ gap: 10 }}><Icon.theme />Theme</span><ThemeToggle initial={theme} /></div>
          {canSignOut ? (
            <form action="/auth/logout" method="post">
              <button role="menuitem" type="submit" className="profile-item"><Icon.signOut />Sign out</button>
            </form>
          ) : null}
        </div>
      ) : null}
      <button ref={button} type="button" className="nav-link profile-button" aria-haspopup="menu" aria-expanded={open} title={name} onClick={() => setOpen((o) => !o)}>
        <BrandMark name={name} logoUrl={avatarUrl} size={22} />
        <span className="nav-text truncate">{name}</span>
        <span className="nav-text profile-caret" aria-hidden="true"><Icon.updown /></span>
      </button>
    </div>
  );
}
