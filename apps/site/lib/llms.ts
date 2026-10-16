import { getPosts } from './blog';
import { PRICING } from './pricing';
import { FEATURES, SITE } from './site';

/**
 * llms.txt (llmstxt.org): a plain-markdown summary of the site for AI assistants and answer engines. The same facts as
 * the pages, stated plainly, with links to the pages that hold the detail.
 */
export function llmsTxt(): string {
  const posts = getPosts();
  return `# Harbor

> ${SITE.description}

Harbor is open-source software (AGPL-3.0) for builders who run more than one brand: a product, a side project, their own name or clients. It is a content strategist, not just a scheduler: it keeps a memory per brand, plans each week from what actually performed, drafts posts for each platform, publishes directly to X, LinkedIn, Instagram and Threads, and measures every post against the brand's own median. AI agents in Harbor propose posts; a person approves every post before it is published.

Key facts:
- License: AGPL-3.0. Source: ${SITE.github}
- Self-hosting is free, with every feature and no brand limit. It runs in a sandbox mode with a simulated model, with no API keys and no cost.
- Harbor Cloud (opening soon, early pricing): ${PRICING.filter((p) => p.per).map((p) => `${p.name} ${p.price}${p.per} (${p.brands.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())})`).join('; ')}. Priced per brand, not per seat.
- Platforms: X, LinkedIn, Instagram and Threads, published directly through the user's own developer apps.
- Measurement: each post is measured at 1 hour, 6 hours, 24 hours, 3 days and 7 days, and compared with the brand's median for the same platform at the same age. 1.3x or more is "outperformed", under 0.7x "underperformed", fewer than 3 comparable posts "inconclusive".
- Agents: weekly plan, repurpose a winner, voice check, weekly digest and voice refresh. Automations run them on a schedule or when a post outperforms. Agents never publish on their own.
- MCP server: AI agents such as Claude can read Brand Memory, check best times, draft and propose posts with an API key. Proposals wait for approval.

## Product

- [Product overview](${SITE.url}/product): how the pieces fit
${FEATURES.map((f) => `- [${f.name}](${SITE.url}${f.href}): ${f.short}`).join('\n')}

## Use it

- [Pricing](${SITE.url}/pricing): self-host free; Cloud plans per brand; FAQ
- [Open source and self-hosting](${SITE.url}/open-source): the license in plain words, setup steps, architecture
- [Developers](${SITE.url}/developers): MCP server, tools and scopes, REST API, API keys
- [Platform setup guide](${SITE.github}/blob/main/docs/setup/platform-apps.md): registering X, LinkedIn, Instagram and Threads developer apps

## Blog

${posts.map((p) => `- [${p.title}](${SITE.url}/blog/${p.slug}): ${p.description}`).join('\n')}

## Optional

- [Changelog](${SITE.url}/changelog)
- [Full text of this site for language models](${SITE.url}/llms-full.txt)
- [Privacy](${SITE.url}/privacy) · [Terms](${SITE.url}/terms)
`;
}

/** llms.txt plus the full text of every blog post, so an assistant can answer from the source. */
export function llmsFullTxt(): string {
  const posts = getPosts();
  return `${llmsTxt()}
---

# Blog posts in full

${posts.map((p) => `## ${p.title}\n\n${SITE.url}/blog/${p.slug} · ${p.date} · ${p.author}\n\n${p.markdown.trim()}`).join('\n\n---\n\n')}
`;
}
