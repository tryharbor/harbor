/** Form parsing shared by the server actions (a plain module: 'use server' files may only export actions). */

export type MediaField = { kind: 'image' | 'video'; url?: string; alt?: string; assetId?: string; variant?: string };
/**
 * Media for part 1, in post order (a carousel when there's more than one): the `media` field's JSON list from the
 * media list. Library items go by asset, and the API fills the public URL (the browser's may be a local one).
 */
export const mediaFrom = (form: FormData): MediaField[] => {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get('media') ?? '[]'));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return raw.flatMap((m): MediaField[] => {
    const assetId = str(m?.assetId);
    const url = str(m?.url);
    const kind = m?.kind === 'video' || (url && /\.(mp4|mov)(\?|$)/i.test(url)) ? 'video' : 'image';
    if (assetId) return [{ kind, assetId, variant: str(m?.variant) }];
    return url ? [{ kind, url, alt: str(m?.alt) }] : [];
  });
};
