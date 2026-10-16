'use client';

import { useState } from 'react';

export function CopyCommand({ command, display }: { command: string; display?: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="cmd">
      <span aria-hidden="true" style={{ color: 'var(--pink)' }}>$</span>
      <span>{display ?? command}</span>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(command).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }} aria-label="Copy command">{done ? 'Copied' : 'Copy'}</button>
    </span>
  );
}
