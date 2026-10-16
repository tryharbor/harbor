'use client';

import { useState } from 'react';
import { Icon } from './icons';

/** Collapses the sidebar to an icon rail. Saved in the `harbor-sidebar` cookie so the next load renders it the same way. */
export function SidebarToggle({ initial }: { initial: boolean }) {
  const [collapsed, setCollapsed] = useState(initial);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.querySelector('.shell')?.classList.toggle('collapsed', next);
    document.cookie = `harbor-sidebar=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" className="sidebar-toggle" onClick={toggle} aria-pressed={collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      {collapsed ? <Icon.expand /> : <Icon.collapse />}
    </button>
  );
}
