'use client';

import { useEffect, useRef, useState } from 'react';
import type { Platform } from '@harbor/core';
import { MediaList, type MediaItem } from './media-list';

export interface ComposeChannel { id: string; platform: Platform; brandId: string }

/**
 * The composer's media: the ordered list, limited by every account ticked in the same form (the smallest limit
 * wins, since one list goes to all of them). The library is the brand's, so it needs accounts of one brand;
 * library picks aren't cropped here, the API gives each platform its own crop.
 */
export function ComposeMedia({ apiUrl, channels }: { apiUrl: string; channels: ComposeChannel[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [libraryBrand, setLibraryBrand] = useState<string>();

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const read = () => setSelected([...form.querySelectorAll<HTMLInputElement>('input[name="channelId"]:checked')].map((i) => i.value));
    read();
    form.addEventListener('change', read);
    return () => form.removeEventListener('change', read);
  }, []);

  const picked = channels.filter((c) => selected.includes(c.id));
  const platforms = [...new Set(picked.map((c) => c.platform))];
  const brands = [...new Set((picked.length ? picked : channels).map((c) => c.brandId))];
  const brandId = brands.length === 1 ? brands[0] : undefined;
  const fromLibrary = items.some((m) => m.assetId);
  const wrongBrand = fromLibrary && libraryBrand && picked.some((c) => c.brandId !== libraryBrand);

  return (
    <div ref={ref} className="stack" style={{ gap: 6 }}>
      <MediaList
        items={items}
        onChange={(next) => { setItems(next); if (next.some((m) => m.assetId) && !fromLibrary) setLibraryBrand(brandId); }}
        platforms={platforms}
        apiUrl={apiUrl}
        brandId={brandId}
        crop={false}
        libraryNote={brandId ? undefined : 'Tick accounts of one brand to use its media library.'}
      />
      {wrongBrand ? <p className="error small" role="alert" style={{ margin: 0 }}>Library media belongs to one brand. Post it to that brand’s accounts, or remove it.</p> : null}
    </div>
  );
}
