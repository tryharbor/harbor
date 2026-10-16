/** Early pricing (docs/decisions/0002-pricing-shape.md): self-host free; Cloud per brand. Still being tested. */
export const PRICING = [
  { name: 'Self-host', price: '$0', per: '', brands: 'Unlimited brands on your own server. AGPL.', cta: 'Self-host guide', href: '/open-source', features: ['Everything in Harbor', 'Sandbox mode and built-in model', 'Your own platform apps and keys', 'Community support on GitHub'] },
  { name: 'Starter', price: '$19', per: '/mo', brands: 'Up to 2 brands, hosted.', cta: 'Get early access', href: 'mailto:hello@useharbor.io?subject=Harbor%20Cloud%20Starter', features: ['2 brands, all four platforms', 'Agents, approvals and the digest', 'Hosted media and backups', 'Email support'] },
  { name: 'Builder', price: '$49', per: '/mo', brands: 'Up to 6 brands, hosted.', cta: 'Get early access', href: 'mailto:hello@useharbor.io?subject=Harbor%20Cloud%20Builder', features: ['6 brands', 'Automations and MCP access', 'Higher AI and metrics limits', 'Priority email support'], featured: true },
  { name: 'Agency', price: '$149', per: '/mo', brands: 'Up to 25 brands, hosted.', cta: 'Get early access', href: 'mailto:hello@useharbor.io?subject=Harbor%20Cloud%20Agency', features: ['25 brands', 'Everything in Builder', 'Cross-brand reporting: every brand side by side', 'Client review links (coming)'] },
];
