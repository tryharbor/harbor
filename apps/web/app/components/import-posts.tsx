'use client';

import { useActionState, useState } from 'react';
import { importPosts, refreshVoice, scanChannel, type ScanState } from '../learn-actions';
import { TZ } from '../ui';

const compact = (n?: number) => (n === undefined ? '–' : Intl.NumberFormat('en-US', { notation: 'compact' }).format(n));

/**
 * Import a channel's past posts so a new brand isn't starting cold. Scan, review (uncheck anything that isn't
 * representative), then import (Jasper's "We found N sources, uncheck any to exclude" step).
 */
export function ImportPosts({ channelId, brandId, supported }: { channelId: string; brandId: string; supported: boolean }) {
  const [scanState, scan, scanning] = useActionState<ScanState, FormData>(scanChannel, {});
  const [importState, doImport, importing] = useActionState<ScanState, FormData>(importPosts, {});
  const found = scanState.scan?.found ?? [];
  const fresh = found.filter((f) => !f.alreadyImported);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!supported) return <span className="small dim">Importing isn't available for this platform yet.</span>;

  if (importState.imported !== undefined) {
    return (
      <div className="key-reveal" role="status">
        <span className="small"><strong>Imported {importState.imported} post{importState.imported === 1 ? '' : 's'}.</strong>{importState.skipped ? <span className="muted"> {importState.skipped} were already in Harbor.</span> : null} They count toward verdicts, best times and the voice refresh.</span>
        <form action={refreshVoice}>
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="returnTo" value={`/brands/${brandId}/channels`} />
          <button type="submit" className="primary">Refresh the voice from these</button>
        </form>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {!scanState.scan ? (
        <form action={scan} className="row" style={{ gap: 6 }}>
          <input type="hidden" name="channelId" value={channelId} />
          <input type="hidden" name="limit" value="30" />
          <button type="submit" disabled={scanning}>{scanning ? 'Scanning…' : 'Import past posts'}</button>
        </form>
      ) : (
        <form action={doImport} className="stack" style={{ gap: 8 }}>
          <input type="hidden" name="channelId" value={channelId} />
          <input type="hidden" name="scanId" value={scanState.scan.scanId} />
          <span className="small">
            <strong>Found {found.length} post{found.length === 1 ? '' : 's'}</strong>
            <span className="muted">{found.length - fresh.length ? ` (${found.length - fresh.length} already in Harbor)` : ''}. Uncheck anything that isn't representative: reposts, giveaways, one-off announcements.</span>
          </span>
          <ul className="scan-list">
            {found.map((f) => (
              <li key={f.platformPostId} className={f.alreadyImported ? 'dim' : undefined}>
                <input
                  type="checkbox"
                  name="include"
                  value={f.platformPostId}
                  checked={!f.alreadyImported && !excluded.has(f.platformPostId)}
                  disabled={f.alreadyImported}
                  onChange={() => toggle(f.platformPostId)}
                  aria-label={`Import: ${f.text.slice(0, 60)}`}
                />
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="scan-text">{f.text}</span>
                <span className="mono dim small">
                  {new Date(f.publishedAt).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}
                  {f.metrics?.views !== undefined ? ` · ${compact(f.metrics.views)} views` : f.metrics?.likes !== undefined ? ` · ${compact(f.metrics.likes)} likes` : ''}
                  {f.alreadyImported ? ' · in Harbor' : ''}
                </span>
                </span>
              </li>
            ))}
          </ul>
          {importState.error ? <p className="error small" role="alert">{importState.error}</p> : null}
          <div><button type="submit" className="primary" disabled={importing || fresh.length - excluded.size <= 0}>{importing ? 'Importing…' : `Import ${Math.max(0, fresh.length - [...excluded].filter((id) => fresh.some((f) => f.platformPostId === id)).length)}`}</button></div>
        </form>
      )}
      {scanState.error ? <p className="error small" role="alert">{scanState.error}</p> : null}
    </div>
  );
}
