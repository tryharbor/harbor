'use client';

import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { saveLogo } from '../actions';
import { BrandMark } from '../ui';

/** The brand mark in the header doubles as the logo upload: click it, choose a file, done. */
export function LogoButton({ brandId, name, logoUrl, size = 40 }: { brandId: string; name: string; logoUrl?: string; size?: number }) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const path = usePathname();
  return (
    <form ref={form} action={saveLogo} className="logo-button">
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="returnTo" value={path} />
      <button type="button" onClick={() => input.current?.click()} title={logoUrl ? 'Change logo' : 'Add a logo'} aria-label={logoUrl ? `Change ${name}'s logo` : `Add a logo for ${name}`}>
        <BrandMark name={name} logoUrl={logoUrl} size={size} />
        <span className="logo-button-hint" aria-hidden="true">{logoUrl ? 'Change' : '+ Logo'}</span>
      </button>
      <input ref={input} type="file" name="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden onChange={() => form.current?.requestSubmit()} />
    </form>
  );
}
