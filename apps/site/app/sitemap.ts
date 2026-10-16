import type { MetadataRoute } from 'next';
import { getPosts } from '../lib/blog';
import { COMPARISONS } from '../lib/compare';
import { FEATURES, SITE } from '../lib/site';
import { USE_CASES } from '../lib/use-cases';

export const dynamic = 'force-static';

/** Every public page. Product pages come from FEATURES; blog posts from content/blog. */
export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getPosts();
  const latest = posts[0]?.date;
  // Pages without a date of their own change with each release; the build date is an honest stand-in.
  const built = new Date().toISOString().slice(0, 10);
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'], lastModified?: string) => ({
    url: `${SITE.url}${path}`,
    priority,
    changeFrequency,
    lastModified: lastModified ?? built,
  });
  return [
    page('', 1, 'weekly'),
    page('/product', 0.9, 'weekly'),
    ...FEATURES.map((f) => page(f.href, 0.8, 'monthly')),
    page('/pricing', 0.8, 'monthly'),
    page('/open-source', 0.8, 'monthly'),
    page('/developers', 0.8, 'monthly'),
    page('/use-cases', 0.7, 'monthly'),
    ...USE_CASES.map((u) => page(`/use-cases/${u.slug}`, 0.7, 'monthly')),
    ...COMPARISONS.map((c) => page(`/compare/${c.slug}`, 0.7, 'monthly', c.checkedOn)),
    page('/blog', 0.7, 'weekly', latest),
    ...posts.map((p) => page(`/blog/${p.slug}`, 0.6, 'yearly', p.date)),
    page('/changelog', 0.6, 'weekly'),
    page('/privacy', 0.2, 'yearly'),
    page('/terms', 0.2, 'yearly'),
  ];
}
