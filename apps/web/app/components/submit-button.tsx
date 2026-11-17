'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** A submit button that says what's happening while its form's server action runs. */
export function SubmitButton({ children, pending: pendingLabel = 'Working…', className, name, value, title }: { children: ReactNode; pending?: string; className?: string; name?: string; value?: string; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} name={name} value={value} title={title}>
      {pending ? pendingLabel : children}
    </button>
  );
}
