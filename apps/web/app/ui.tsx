import Link from 'next/link';
import type { ReactNode } from 'react';
import type { NormalizedMetrics, Platform } from '@harbor/core';
import type { PostStatus } from './api';

/** Small shared pieces. Everything styles through the tokens in globals.css. */

export const PLATFORM_NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };

export const STATUS_LABEL: Record<PostStatus, string> = {
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  pending: 'Processing',
  published: 'Published',
  failed: 'Failed',
  unknown: 'Check platform',
};

export function StatusPill({ status }: { status: PostStatus }) {
  return <span className={`pill s-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function PlatformTag({ platform, handle }: { platform: Platform; handle?: string }) {
  return (
    <span className={`ptag p-${platform}`}>
      {PLATFORM_NAME[platform]}
      {handle ? <span className="muted"> @{handle}</span> : null}
    </span>
  );
}

export const when = (iso?: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) =>
  iso ? new Date(iso).toLocaleString('en-US', opts) : '';

export const compact = (n?: number) => (n === undefined ? '–' : Intl.NumberFormat('en-US', { notation: 'compact' }).format(n));

export function MetricLine({ metrics }: { metrics?: NormalizedMetrics }) {
  if (!metrics) return <span className="muted">No metrics yet</span>;
  const items: [string, number | undefined][] = [
    ['views', metrics.views],
    ['likes', metrics.likes],
    ['replies', metrics.comments],
    ['reposts', metrics.reposts],
  ];
  return (
    <span className="metric-line num">
      {items.filter(([, v]) => v !== undefined).map(([k, v]) => (
        <span key={k}>
          <strong>{compact(v)}</strong> {k}
        </span>
      ))}
    </span>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="muted">{sub}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

/** A section that isn't built yet: says what will be here and why it's empty. */
export function Upcoming({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="upcoming">
      <span className="upcoming-tag">Coming next</span>
      <strong>{title}</strong>
      <p className="muted">{children}</p>
    </div>
  );
}

export function Flash({ params }: { params: { notice?: string; error?: string; connected?: string } }) {
  return (
    <>
      {params.connected ? <p className="notice" role="status">Connected {params.connected}.</p> : null}
      {params.notice ? <p className="notice" role="status">{params.notice}</p> : null}
      {params.error ? <p className="error" role="alert">{params.error}</p> : null}
    </>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <div className="stack">
      <p className="error" role="alert">{message}</p>
      <p className="muted">
        Start everything with <code>pnpm dev</code> from the repo root. <Link href="/">Back to Home</Link>
      </p>
    </div>
  );
}
