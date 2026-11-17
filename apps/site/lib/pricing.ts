/**
 * Early pricing for Harbor Cloud, per business (docs/decisions/0002 for the shape, 0004 for builds). Prices match the
 * Stripe products in docs/setup/stripe-plans.md. Build credit is AI build time at the provider's list price.
 */
export const PRICING = [
  {
    name: 'Starter', price: '$19', per: '/mo', summary: 'Get a business off the ground.', limit: 'Up to 2 businesses.',
    cta: 'Get early access', href: 'mailto:hello@useharbor.io?subject=Harbor%20Starter',
    features: ['A website, written from your business and hosted', 'Marketing: an AI assistant, post options and approvals', 'Money: revenue from Stripe in one view', '$5 of app builds a month to try the builder'],
  },
  {
    name: 'Builder', price: '$49', per: '/mo', summary: 'Build the product itself.', limit: 'Up to 6 businesses.',
    cta: 'Get early access', href: 'mailto:hello@useharbor.io?subject=Harbor%20Builder', featured: true,
    features: ['Everything in Starter', 'Full apps with sign-in, a database and payments', '$25 of app builds a month', 'Automations and API access'],
  },
  {
    name: 'Agency', price: '$149', per: '/mo', summary: 'For people who build for clients.', limit: 'Up to 25 businesses.',
    cta: 'Get early access', href: 'mailto:hello@useharbor.io?subject=Harbor%20Agency',
    features: ['Everything in Builder', '$75 of app builds a month', 'Every business side by side', 'Client review links (coming)'],
  },
];
