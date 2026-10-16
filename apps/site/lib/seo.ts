import type { Metadata } from 'next';
import { SITE } from './site';

/**
 * A page's metadata with its own canonical URL, Open Graph and Twitter card, derived from the title and
 * description it declares. Without this, pages inherit the home page's social preview.
 */
export function pageMeta(path: string, meta: Metadata): Metadata {
  const title = typeof meta.title === 'string' ? meta.title : undefined;
  const description = meta.description ?? undefined;
  const shareTitle = title ? `${title} · Harbor` : `Harbor: ${SITE.tagline}`;
  return {
    ...meta,
    alternates: { canonical: path || '/', types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: 'Harbor blog' }] }, ...(meta.alternates ?? {}) },
    openGraph: { type: 'website', siteName: 'Harbor', url: path || '/', title: shareTitle, ...(description ? { description } : {}), ...(meta.openGraph ?? {}) },
    twitter: { card: 'summary_large_image', site: '@tryharbor', title: shareTitle, ...(description ? { description } : {}), ...(meta.twitter ?? {}) },
  };
}
