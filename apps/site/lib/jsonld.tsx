import { PRICING } from './pricing';
import { SITE } from './site';

/**
 * Structured data (schema.org JSON-LD) so search engines and AI answer engines read the same facts the page shows:
 * what Harbor is, what it costs, that it's open source, and who publishes it.
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
  sameAs: [SITE.github, SITE.x],
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

/** The product: open-source software you can self-host free, with Cloud plans priced per brand. */
export const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: 'Harbor',
  description: SITE.description,
  url: SITE.url,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Social media management and content strategy',
  operatingSystem: 'Web; self-hosted on Linux, macOS or any server with Node.js 22 and Postgres',
  license: 'https://www.gnu.org/licenses/agpl-3.0.html',
  isAccessibleForFree: true,
  publisher: { '@id': ORG_ID },
  featureList: [
    'Brand Memory per brand: voice, audiences, products, knowledge, style rules',
    'Voice learned from sample posts and refined from what performs',
    'Agents that plan and draft the week; every post waits for approval',
    'Direct publishing to X, LinkedIn, Instagram and Threads',
    'Growth curves at 1h, 6h, 24h, 3 days and 7 days against the brand median',
    'Weekly digest, best-time heatmap and reply themes',
    'MCP server and API keys for AI agents',
    'Media library with focal-point crops per platform',
  ],
  offers: PRICING.map((p) => ({
    '@type': 'Offer',
    name: p.name,
    price: p.price.replace('$', ''),
    priceCurrency: 'USD',
    description: p.brands,
    url: `${SITE.url}/pricing`,
    ...(p.per ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: p.price.replace('$', ''), priceCurrency: 'USD', unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } } } : {}),
  })),
};

export const sourceCode = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: 'Harbor',
  codeRepository: SITE.github,
  license: 'https://www.gnu.org/licenses/agpl-3.0.html',
  programmingLanguage: ['TypeScript'],
  runtimePlatform: 'Node.js',
  targetProduct: { '@id': APP_ID },
  publisher: { '@id': ORG_ID },
};

export function faqPage(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
  };
}

export function blogPosting(post: { slug: string; title: string; description: string; date: string; author: string; tags: string[] }) {
  const url = `${SITE.url}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: url,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Person', name: post.author, url: SITE.url },
    publisher: { '@id': ORG_ID },
    image: `${SITE.url}/opengraph-image`,
    keywords: post.tags.join(', '),
    about: { '@id': APP_ID },
  };
}
