'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * The submit row for a plain server form (the composer): "Post now" asks once more before sending, since it's
 * public and immediate, and Schedule needs a time. Same pattern as the Studio publish box. The form itself carries
 * the `tz` field (TzInput) so the server reads the time as the viewer's wall clock.
 */
export function PostOrSchedule() {
  const { pending } = useFormStatus();
  const [confirming, setConfirming] = useState(false);
  // Schedule waits for a time, so a missing one can't bounce the form (and its text) back with an error.
  const [when, setWhen] = useState('');
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {/* Distinct keys: reusing one <button> would turn it into a submit during the first click, which then posts. */}
        {confirming ? (
          <button key="confirm" className="primary" type="submit" name="intent" value="now" disabled={pending}>{pending ? 'Posting…' : 'Confirm: post now'}</button>
        ) : (
          <button key="ask" className="primary" type="button" onClick={() => setConfirming(true)} disabled={pending}>Post now</button>
        )}
        <span className="dim small">or</span>
        <input name="scheduledFor" type="datetime-local" aria-label="Schedule for" value={when} onChange={(e) => setWhen(e.target.value)} style={{ width: 'auto' }} />
        <button type="submit" name="intent" value="schedule" disabled={pending || !when} title={when ? undefined : 'Pick a date and time first'}>{pending ? 'Saving…' : 'Schedule'}</button>
      </div>
      {confirming ? <span className="small muted">This publishes publicly to every selected account right away. Click again to confirm.</span> : null}
    </div>
  );
}
