/** Everything the site links to or lists, in one place. */

export const SITE = {
  name: 'Harbor',
  url: 'https://useharbor.io',
  tagline: 'The open-source content strategist for builders',
  description:
    'Harbor learns what works for each of your brands, plans the week, drafts it in your voice and waits for your OK. Open source: self-host it free, or use Harbor Cloud.',
  /** The public repo (goes public at launch). */
  github: 'https://github.com/tryharbor/harbor',
  x: 'https://x.com/tryharbor',
  email: 'hello@useharbor.io',
  /** Where "Get started" goes. Pricing lets visitors pick self-host (free) or Cloud (early access); point this at
   *  Cloud signup once it opens. */
  start: '/pricing',
};

export const CLONE = 'git clone https://github.com/tryharbor/harbor && cd harbor && pnpm install && pnpm dev';

export type Feature = {
  slug: string;
  href: string;
  name: string;
  /** The pixel-palette color that marks this feature across the site. */
  color: 'pink' | 'violet' | 'coral' | 'amber' | 'yellow';
  short: string;
  pitch: string;
};

/** The five features, in the order of Harbor's loop: remember → plan → draft → publish → learn. */
export const FEATURES: Feature[] = [
  { slug: 'brand-memory', href: '/product/brand-memory', name: 'Brand Memory', color: 'pink', short: 'Every brand’s voice, audiences and offers, learned from what actually performs.', pitch: 'A memory per brand that gets sharper with every post.' },
  { slug: 'agents', href: '/product/agents', name: 'Agents & Approvals', color: 'violet', short: 'Agents plan the week and draft it. Nothing posts until you approve.', pitch: 'The strategist’s homework, done before Monday.' },
  { slug: 'studio', href: '/product/studio', name: 'Studio & Canvas', color: 'coral', short: 'Draft for every platform at once, on a canvas per campaign.', pitch: 'One idea, every platform, in each one’s native shape.' },
  { slug: 'publishing', href: '/product/publishing', name: 'Publishing', color: 'amber', short: 'Schedule to X, LinkedIn, Instagram and Threads at each brand’s best times.', pitch: 'Direct to the platforms, at the hours that work.' },
  { slug: 'insights', href: '/product/insights', name: 'Insights', color: 'yellow', short: 'Growth curves against your own median, and a weekly digest that says what to do next.', pitch: 'Not vanity totals. What worked, and why.' },
];

export const NAV = {
  product: FEATURES,
  more: [
    { href: '/developers', name: 'Developers', short: 'MCP server, API keys and the API' },
    { href: '/open-source', name: 'Open source', short: 'AGPL. Self-host in minutes, own your data' },
    { href: '/use-cases', name: 'Use cases', short: 'Several brands, Claude over MCP, self-hosting, and comparisons' },
  ],
  top: [
    { href: '/pricing', name: 'Pricing' },
    { href: '/blog', name: 'Blog' },
    { href: '/changelog', name: 'Changelog' },
  ],
};

export const PLATFORMS = ['x', 'linkedin', 'instagram', 'threads'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
