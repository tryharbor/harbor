/** Everything the site links to or lists, in one place. */

export const SITE = {
  name: 'Harbor',
  url: 'https://useharbor.io',
  tagline: 'Build it, sell it, see it pay',
  description:
    'Describe your business once. Harbor builds your website or app, writes your posts, and shows you the money coming in.',
  /** The code repo. Only the Terms page links it (the license); it isn't part of the positioning. */
  github: 'https://github.com/tryharbor/harbor',
  x: 'https://x.com/tryharbor',
  email: 'hello@useharbor.io',
  /** Where "Get early access" goes. Pricing offers Cloud early access; point this at Cloud signup once it opens. */
  start: '/pricing',
};

export type Feature = {
  slug: string;
  href: string;
  name: string;
  /** The pixel-palette color that marks this feature across the site. */
  color: 'pink' | 'violet' | 'coral' | 'amber' | 'yellow';
  short: string;
  pitch: string;
};

/** The four parts of Harbor, in the order a business uses them: describe it, build it, market it, get paid. */
export const FEATURES: Feature[] = [
  { slug: 'business', href: '/product/business', name: 'Your business', color: 'pink', short: 'Describe it once: what you sell, who buys it, what it costs, how it looks. Everything starts from here.', pitch: 'Tell Harbor once. Never type it again.' },
  { slug: 'build', href: '/product/build', name: 'Build', color: 'coral', short: 'A website that gets you booked, or the app your customers sign in to, from a plain description.', pitch: 'Your website, or the product itself.' },
  { slug: 'market', href: '/product/market', name: 'Market', color: 'violet', short: 'Posts that sound like you, for Instagram, LinkedIn, X and Threads. Pick the ones you like.', pitch: 'Posts that already know your business.' },
  { slug: 'money', href: '/product/money', name: 'Money', color: 'yellow', short: 'What came in this month, from Stripe and what you add, next to everything else.', pitch: 'See it pay, without a spreadsheet.' },
];

export const NAV = {
  product: FEATURES,
  top: [
    { href: '/pricing', name: 'Pricing' },
    { href: '/guides', name: 'Guides' },
    { href: '/blog', name: 'Blog' },
  ],
};

export const PLATFORMS = ['x', 'linkedin', 'instagram', 'threads'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
