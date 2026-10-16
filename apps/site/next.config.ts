import type { NextConfig } from 'next';

/** useharbor.io: the marketing site. Fully static; deployed on its own (Vercel), separate from the app. */
const config: NextConfig = {
  poweredByHeader: false,
};

export default config;
