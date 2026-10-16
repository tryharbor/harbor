import type { NextConfig } from 'next';

/** useharbor.io: the marketing site. Fully static; deployed on its own (Vercel), separate from the app. */
const config: NextConfig = {
  poweredByHeader: false,
  // One canonical host: www.useharbor.io redirects permanently to useharbor.io, path and query kept.
  async redirects() {
    return [{ source: '/:path*', has: [{ type: 'host', value: 'www.useharbor.io' }], destination: 'https://useharbor.io/:path*', permanent: true }];
  },
};

export default config;
