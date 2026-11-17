import { PRICING } from './pricing';
import { SITE } from './site';

/**
 * Structured data (schema.org JSON-LD) so search engines and AI answer engines read the same facts the page shows:
 * what Harbor is, what it costs, and who publishes it.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  // JSON in a script tag: escape "<" so a value can never close the tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

const ORG_ID = `${SITE.url}/#organization`;
const APP_ID = `${SITE.url}/#software`;

export const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Harbor',
  url: SITE.url,
  logo: `${SITE.url}/icon.svg`,
  email: SITE.email,
  sameAs: [SITE.x],
};

export const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE.url}/#website`,
  name: 'Harbor',
  url: SITE.url,
  description: SITE.description,
  publisher: { '@id': ORG_ID },
  inLanguage: 'en',
};

/** The product: Harbor, priced per business. */
export const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: 'Harbor',
  description: SITE.description,
  url: SITE.url,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Website and app builder, marketing and money for small businesses',
  operatingSystem: 'Web',
  publisher: { '@id': ORG_ID },
  featureList: [
    'Websites written from your business, with three designs to pick from, hosted',
    'Apps with customer accounts, a database and payments, built from a plain-language description',
    'Social posts for X, LinkedIn, Instagram and Threads, with options to pick from',
    'Money: Stripe revenue and what you add by hand, in one view',
    'Choice of Claude, ChatGPT or Gemini, or your own AI account',
  ],
  offers: PRICING.map((p) => ({
    '@type': 'Offer',
    name: p.name,
    price: p.price.replace('$', ''),
    priceCurrency: 'USD',
    description: `${p.summary} ${p.limit}`,
    url: `${SITE.url}/pricing`,
    ...(p.per ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: p.price.replace('$', ''), priceCurrency: 'USD', unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } } } : {}),
  })),
};

export function faqPage(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
  };
}

export function blogPosting(post: { slug: string; title: string; description: string; date: string; updated?: string; author: string; tags: string[] }) {
  const url = `${SITE.url}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: url,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { '@type': 'Person', name: post.author, url: SITE.url },
    publisher: { '@id': ORG_ID },
    image: `${SITE.url}/opengraph-image`,
    keywords: post.tags.join(', '),
    about: { '@id': APP_ID },
  };
}

/** Breadcrumbs from the home page down: [['Use cases', '/use-cases'], ['Harbor vs Buffer', '/compare/buffer']]. */
export function breadcrumbs(trail: [string, string][]) {
  const items: [string, string][] = [['Home', '/'], ...trail];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE.url}${path === '/' ? '' : path}` })),
  };
}
