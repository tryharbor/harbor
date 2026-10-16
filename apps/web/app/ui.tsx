import Link from 'next/link';
import type { ReactNode } from 'react';
import type { NormalizedMetrics, Platform } from '@harbor/core';
import type { Outcome, PostStatus } from './api';
import { PlatformIcon } from './platform-icon';

/** Small shared pieces. Everything styles through the tokens in globals.css. */

/** The Harbor mark (docs/design/brand/harbor-mark.svg), drawn in the current text color. */
export function HarborMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <path d="M0 0H16L32 16V32H16L0 16ZM32 0H48L64 16V32H48L32 16ZM0 32H16L32 48V64H16L0 48ZM32 32H48L64 48V64H48L32 48Z" />
    </svg>
  );
}

/** Marks output from the simulated model or sandbox publishing. */
export function SimTag({ model }: { model?: string }) {
  if (model && !model.startsWith('simulated') && model !== 'demo' && model !== 'sandbox') return null;
  return <span className="tag" title="Made by the simulated model: no API spend.">Simulated</span>;
}

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

export function PlatformTag({ platform, handle, iconOnly = false }: { platform: Platform; handle?: string; iconOnly?: boolean }) {
  return (
    <span className={`ptag p-${platform}`} title={iconOnly ? PLATFORM_NAME[platform] : undefined}>
      <PlatformIcon platform={platform} size={13} />
      {iconOnly ? <span className="sr-only">{PLATFORM_NAME[platform]}</span> : PLATFORM_NAME[platform]}
      {handle ? <span className="muted"> @{handle}</span> : null}
    </span>
  );
}

/** A brand's logo when it has one, otherwise its initial in a square. */
export function BrandMark({ name, logoUrl, size = 20 }: { name: string; logoUrl?: string; size?: number }) {
  return logoUrl ? (
    <img className="brand-mark" src={logoUrl} alt="" width={size} height={size} />
  ) : (
    <span className="brand-mark brand-dot" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) }}>
      {name.trim().slice(0, 1).toUpperCase()}
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

export function PageHeader({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
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

/** How a post did against its brand's median: arrow + words (never color alone). */
export function VerdictTag({ outcome }: { outcome?: Outcome }) {
  if (!outcome) return <span className="verdict inconclusive">–</span>;
  const r = outcome.ratio >= 10 ? Math.round(outcome.ratio) : Math.round(outcome.ratio * 10) / 10;
  const text = {
    outperformed: `↑ ${r}× median`,
    met: `≈ median (${r}×)`,
    underperformed: `↓ ${r}× median`,
    inconclusive: 'Too few posts to compare',
  }[outcome.verdict];
  return (
    <span className={`verdict ${outcome.verdict}`} title={`${outcome.actual.toLocaleString('en-US')} ${outcome.metric} at ${Math.round(outcome.atAgeHours)}h vs. median ${outcome.baseline.toLocaleString('en-US')} across ${outcome.comparablePosts} posts`}>
      {text}
    </span>
  );
}
