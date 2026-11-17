import type { NextConfig } from 'next';

/** useharbor.io: the marketing site. Fully static; deployed on its own (Vercel), separate from the app. */
const config: NextConfig = {
  poweredByHeader: false,
  // One canonical host: www.useharbor.io redirects permanently to useharbor.io, path and query kept.
  async redirects() {
    return [
      { source: '/:path*', has: [{ type: 'host', value: 'www.useharbor.io' }], destination: 'https://useharbor.io/:path*', permanent: true },
      // Comparisons are listed with the use cases.
      { source: '/compare', destination: '/use-cases', permanent: true },
      // Open source isn't part of the positioning; its pages are gone.
      { source: '/open-source', destination: '/', permanent: true },
      { source: '/use-cases/self-hosted-social-media-scheduler', destination: '/use-cases', permanent: true },
      { source: '/blog/why-harbor-never-posts-without-you', destination: '/blog/how-harbors-approvals-inbox-works', permanent: true },
      // The old social-strategist feature pages; Harbor is now Your business, Build, Market and Money.
      { source: '/product/brand-memory', destination: '/product/business', permanent: true },
      { source: '/product/agents', destination: '/product/market', permanent: true },
      { source: '/product/studio', destination: '/product/market', permanent: true },
      { source: '/product/publishing', destination: '/product/market', permanent: true },
      { source: '/product/insights', destination: '/product/market', permanent: true },
    ];
  },
};

export default config;
