import type { ReactNode } from 'react';
import { TabLink } from '../nav-link';

export default function AgentsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="tabs" aria-label="Agents">
        <TabLink href="/agents">Library</TabLink>
        <TabLink href="/agents/automations">Automations</TabLink>
        <TabLink href="/agents/runs">Runs</TabLink>
      </nav>
      {children}
    </>
  );
}
