'use client';

import { useState } from 'react';

/** A terminal-style code panel with a title bar and a Copy button (uses the global .terminal styles). */
export function CodeBlock({ title, code, copy = true }: { title: string; code: string; copy?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="terminal" style={{ minWidth: 0 }}>
      <div className="window-bar" style={{ background: 'var(--raised)', color: 'var(--dim)', borderColor: 'var(--line)' }}>
        <i /><i /><i />
        <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {copy ? (
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}
            aria-label={`Copy ${title}`}
            className="hit"
            style={{ all: 'unset', position: 'relative', cursor: 'pointer', color: done ? 'var(--good)' : 'var(--muted)', minWidth: 39, textAlign: 'right' }}
          >
            {done ? 'Copied' : 'Copy'}
          </button>
        ) : <span style={{ width: 39 }} />}
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
