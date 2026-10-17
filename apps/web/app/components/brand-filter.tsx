'use client';

import { useRouter } from 'next/navigation';
import { BrandMark } from '../ui';
import { Select } from './select';

export interface BrandFilterItem { id: string; name: string; logoUrl?: string; kind?: 'brand' | 'person' }

/** Four small squares: "every brand". */
const AllMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="brand-mark" style={{ background: 'none' }}>
    <rect x="1" y="1" width="7" height="7" fill="currentColor" opacity="0.85" />
    <rect x="10" y="1" width="7" height="7" fill="currentColor" opacity="0.5" />
    <rect x="1" y="10" width="7" height="7" fill="currentColor" opacity="0.5" />
    <rect x="10" y="10" width="7" height="7" fill="currentColor" opacity="0.25" />
  </svg>
);

/**
 * Which brand a page shows: Harbor's own dropdown with each brand's logo. The page builds the links (`hrefs` by brand
 * id, `allHref` for every brand) so filters it keeps in the URL survive the switch.
 */
export function BrandFilter({ brands, current, hrefs, allHref, width = 240 }: { brands: BrandFilterItem[]; current?: string; hrefs: Record<string, string>; allHref: string; width?: number }) {
  const router = useRouter();
  return (
    <Select
      ariaLabel="Brand"
      width={width}
      value={current && brands.some((b) => b.id === current) ? current : ''}
      onChange={(v) => router.push(v ? (hrefs[v] ?? allHref) : allHref)}
      options={[
        { value: '', text: 'All brands', label: <span className="brand-option"><AllMark />All brands</span> },
        ...brands.map((b) => ({
          value: b.id,
          text: b.name,
          label: <span className="brand-option"><BrandMark name={b.name} logoUrl={b.logoUrl} size={18} /><span className="truncate">{b.name}</span>{b.kind === 'person' ? <span className="dim small">You</span> : null}</span>,
        })),
      ]}
    />
  );
}
