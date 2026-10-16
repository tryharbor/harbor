'use client';

import { useState } from 'react';
import { PlatformIcon } from '../platform-icon';
import { useSteps } from './motion';
import { Cell, Layer, Reserve, arrive } from './reserve';

const LOG = [
  { t: '9:00:00', text: 'Sent to X', mark: '→' },
  { t: '9:00:20', text: 'No answer from X: the request timed out', mark: '!' },
  { t: '9:00:20', text: 'Outcome unknown. Not retried.', mark: '?' },
];

/**
 * Two safety nets. Sandbox mode publishes to practice accounts with each platform's real rules and no network. And a
 * publish whose result is unclear is never retried on its own: a person checks, then tells Harbor (try the buttons).
 */
export function SafePublishPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(LOG.length + 2, 900, { loop: false, final: LOG.length + 1 });
  const [resolved, setResolved] = useState<'published' | 'retry' | null>(null);
  const shown = Math.min(step, LOG.length);
  const asking = step > LOG.length && !resolved;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 470 }}>
      <div className="pv-mode">
        <div className="pv-stack2" style={{ gap: 6 }}>
          <span className="a-label">Mode</span>
          <span className="pv-row" style={{ gap: 6, flexWrap: 'wrap' }}><span className="pv-tag strong">Sandbox</span><span style={{ fontSize: 12 }}>Publishing to practice accounts</span></span>
          <span className="pv-row" style={{ gap: 6, flexWrap: 'wrap' }}><span className="pv-tag strong">Simulated</span><span style={{ fontSize: 12 }}>Built-in model, no API spend</span></span>
        </div>
        <div className="pv-stack2 pv-sbx" style={{ gap: 6 }}>
          <span className="pv-head"><span className="a-label">Sandbox account</span><span className="pv-tag">No real platform</span></span>
          <span className="pv-row" style={{ gap: 6 }}><span className="pv-input pv-row" style={{ gap: 6 }}><PlatformIcon platform="x" size={10} />X ▾</span><span className="pv-input" style={{ flex: 1 }}>@yourbrand</span></span>
          <span className="pv-sub">Same length and media rules as the real X. Metrics are simulated.</span>
        </div>
      </div>

      <article className="a-card">
        <div className="pv-row"><PlatformIcon platform="x" size={12} /><span className="a-label" style={{ color: 'var(--a-ink)' }}>X · @tryharbor</span><span className={`a-pill ${resolved === 'published' ? 'good' : resolved === 'retry' ? 'sched' : 'warn'}`} style={{ marginLeft: 'auto' }}><Reserve all={['Published', 'Scheduled', 'Unknown']}>{resolved === 'published' ? 'Published' : resolved === 'retry' ? 'Scheduled' : 'Unknown'}</Reserve></span></div>
        <div className="pv-post-text">3 weeks, 2 rewrites, 1 feature.</div>
        <ol className="pv-log">
          {LOG.map((l, i) => (
            <li key={l.text} className={arrive(i < shown)}><span className="pv-mono pv-dim">{l.t}</span><span className="pv-mono" aria-hidden="true">{l.mark}</span><span>{l.text}</span></li>
          ))}
        </ol>
        {/*
          The question and both answers share one cell, kept from the start; it stays empty until the log has run,
          and answering swaps the text in place.
        */}
        <Cell>
          <Layer on={asking} lift className="pv-attention">
            <strong style={{ fontWeight: 500 }}>Did it go out?</strong>
            <span className="pv-sub">Harbor sent this post but couldn’t confirm it landed. Check the account, then tell Harbor. It never retries these on its own, so you won’t get a double post.</span>
            <span className="pv-row" style={{ gap: 6 }}>
              <button type="button" className="a-btn primary" onClick={() => setResolved('published')}>It went out</button>
              <button type="button" className="a-btn" onClick={() => setResolved('retry')}>It didn’t, retry</button>
            </span>
          </Layer>
          {(['published', 'retry'] as const).map((r) => (
            <Layer key={r} on={resolved === r} lift className="pv-attention" style={{ alignContent: 'start' }}>
              <span style={{ fontSize: 12.5 }}>{r === 'published' ? '✓ Marked as published. Harbor starts measuring it.' : 'Back in the queue to send now, since you checked and it isn’t there.'} <button type="button" className="pv-link" onClick={() => setResolved(null)}>Reset</button></span>
            </Layer>
          ))}
        </Cell>
      </article>
      <span className="pv-sub">Retried automatically only when the error proves nothing went out, like a rate limit.</span>
    </div>
  );
}
