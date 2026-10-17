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
      { source: '/blog/why-harbor-never-posts-without-you', destination: '/blog/how-harbors-approvals-inbox-works', permanent: true },
    ];
  },
};

export default config;
