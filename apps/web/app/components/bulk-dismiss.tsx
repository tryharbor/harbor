'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * The Ideas column's bulk bar. Cards carry checkboxes tied to this form by `form={formId}`; "Dismiss selected" asks
 * once more before removing them. Only ideas still in the Ideas stage can be dismissed this way.
 */
export function BulkDismiss({ formId }: { formId: string }) {
  const [selected, setSelected] = useState(0);
  const [total, setTotal] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const { pending } = useFormStatus();
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${formId}"]`)];

  useEffect(() => {
    const count = () => { const b = boxes(); setTotal(b.length); setSelected(b.filter((x) => x.checked).length); };
    count();
    document.addEventListener('change', count);
    return () => document.removeEventListener('change', count);
  }, [formId]);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(t);
  }, [confirming]);
  useEffect(() => { if (selected === 0) setConfirming(false); }, [selected]);

  const all = selected === total && total > 0;
  const toggleAll = () => { for (const b of boxes()) b.checked = !all; setSelected(all ? 0 : total); };
  if (total < 2) return null;

  return (
    <div className="row small" style={{ gap: 8, padding: '0 4px' }}>
      <button type="button" className="link-button small" onClick={toggleAll}>{all ? 'Clear selection' : 'Select all'}</button>
      {selected ? (
        confirming ? (
          <button key="confirm" type="submit" disabled={pending}>{pending ? 'Dismissing…' : `Confirm: dismiss ${selected}`}</button>
        ) : (
          <button key="ask" type="button" onClick={() => setConfirming(true)}>Dismiss {selected} selected</button>
        )
      ) : <span className="dim">Tick ideas to dismiss several at once.</span>}
    </div>
  );
}
