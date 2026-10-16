'use client';

import { useFormStatus } from 'react-dom';

/** Submit button that says what's happening while the agent works (runs are synchronous). */
export function RunButton({ label = 'Run agent', steps }: { label?: string; steps?: string[] }) {
  const { pending } = useFormStatus();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="submit" className="primary" disabled={pending} aria-busy={pending}>{pending ? 'Running…' : label}</button>
      {pending && steps?.length ? <span className="small dim" role="status">Working through {steps.length} steps: {steps.join(' → ')}</span> : null}
    </div>
  );
}
