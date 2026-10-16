/**
 * Comparison pages. Facts about other products come from their own sites, with sources and the date they were
 * checked; pages say plainly where the other product is the better choice. Keep them current or take them down.
 */
export interface Comparison {
  slug: string;
  name: string;
  url: string;
  /** One line for cards. */
  summary: string;
  metaTitle: string;
  description: string;
  checkedOn: string;
  /** The answer, first. */
  answer: string;
  rows: { label: string; harbor: string; them: string }[];
  chooseHarbor: string[];
  chooseThem: string[];
  differences: { title: string; body: string }[];
  faq: { q: string; a: string }[];
  sources: { label: string; url: string }[];
}

export const COMPARISONS: Comparison[] = [
  {
    slug: 'postiz',
    name: 'Postiz',
    url: 'https://postiz.com',
    summary: 'Both open source and AGPL. Postiz goes wide on platforms and generative media; Harbor goes deep on four platforms and learns from results.',
    metaTitle: 'Harbor vs Postiz: open-source social media tools compared',
    description: 'Harbor and Postiz are both open-source (AGPL) and self-hostable. Postiz covers 30+ platforms with AI media generation; Harbor covers 4 and learns each brand’s voice and best times from results, with approval required for every post.',
    checkedOn: '2026-10-16',
    answer:
      'Postiz and Harbor are both open source under the AGPL and both can be self-hosted. Choose Postiz if you need many platforms (30+, including TikTok, YouTube, Facebook and Pinterest), AI image and video generation, or a hosted plan you can buy today. Choose Harbor if you run several brands on X, LinkedIn, Instagram and Threads and want a strategist rather than only a scheduler: a memory per brand, posts measured against each brand’s own median, best times learned from your results, and an approval step that nothing can skip.',
    rows: [
      { label: 'What it is', harbor: 'An open-source content strategist for builders with more than one brand', them: '“The agentic social media scheduler”: AI agents plan, generate and schedule posts' },
      { label: 'License', harbor: 'AGPL-3.0', them: 'AGPL-3.0 (about 37k GitHub stars)' },
      { label: 'Self-hosting', harbor: 'Node.js and Postgres (or embedded PGlite for local use); free, every feature', them: 'Docker Compose with Postgres, Redis and Temporal; free' },
      { label: 'Hosted plan', harbor: 'Harbor Cloud opening soon: $19 (2 brands), $49 (6), $149 (25) a month', them: 'Available now: $29 (5 channels), $39 (10), $49 (30), $99 (100) a month; 7-day trial' },
      { label: 'Priced by', harbor: 'Brand', them: 'Connected channel' },
      { label: 'Platforms', harbor: 'X, LinkedIn, Instagram, Threads', them: '30+, including TikTok, YouTube, Facebook, Pinterest, Bluesky, Mastodon, Reddit' },
      { label: 'Brand voice', harbor: 'Per brand, learned from sample posts or dials, then refined from what performed, with evidence', them: 'No brand voice feature found in its docs' },
      { label: 'Best times', harbor: 'Learned per brand from its own posts, shown as a heatmap and used for scheduling', them: 'Time slots set by hand per channel' },
      { label: 'Measurement', harbor: 'Every post at 1h, 6h, 24h, 3d and 7d against the brand’s median at the same age, with verdicts and a weekly digest', them: 'Per-post metrics from each platform; account analytics on about 10 platforms' },
      { label: 'Approvals', harbor: 'Required: agents, automations and MCP clients can only propose', them: 'Preview links for comments; its docs say no “approved” flag blocks publishing' },
      { label: 'AI media', harbor: 'None (a media library with platform crops)', them: 'AI image and video generation, video-to-clips' },
      { label: 'MCP and API', harbor: 'MCP server (23 tools) and REST API; proposals only', them: 'MCP server, API and CLI on every plan' },
    ],
    chooseHarbor: [
      'You run several brands and want each one to keep its own voice, baseline and best times.',
      'You want to know which posts worked, measured against your own median, not totals.',
      'You want agents to do the planning but never post without your approval.',
      'You post mainly to X, LinkedIn, Instagram and Threads.',
    ],
    chooseThem: [
      'You need TikTok, YouTube, Facebook, Pinterest or any of 30+ other platforms.',
      'You want AI image or video generation built in.',
      'You want a hosted plan you can pay for today.',
      'You want a large, established open-source community behind the tool.',
    ],
    differences: [
      { title: 'Breadth vs depth', body: 'Postiz connects to 30+ networks. Harbor supports four and goes deeper on each: per-platform rules, previews, crops and growth curves.' },
      { title: 'What happens after posting', body: 'Harbor compares every post with the brand’s median at the same age and turns that into a weekly digest, best times and voice rules. Postiz shows each platform’s metrics.' },
      { title: 'How safe the agent is', body: 'Harbor’s agents and MCP clients can only propose; a person approves every post. In Postiz, approval is a shared preview for comments rather than a gate.' },
      { title: 'How you pay', body: 'Postiz Cloud scales with channels; Harbor Cloud will scale with brands, so one brand on four platforms counts once.' },
    ],
    faq: [
      { q: 'Are Harbor and Postiz both open source?', a: 'Yes. Both are licensed under the AGPL-3.0 and can be self-hosted for free.' },
      { q: 'Which supports more platforms?', a: 'Postiz, by a wide margin: 30+ against Harbor’s 4 (X, LinkedIn, Instagram and Threads).' },
      { q: 'Can I use Harbor instead of Postiz for a hosted plan?', a: 'Not yet. Harbor Cloud is opening soon; today Harbor is self-hosted. Postiz Cloud is available now.' },
      { q: 'Which is better for running several brands?', a: 'Harbor is built around brands: each has its own memory, baseline and best times, and Cloud pricing is per brand. Postiz groups channels by organisation and prices by channel count.' },
    ],
    sources: [
      { label: 'Postiz pricing', url: 'https://postiz.com/pricing' },
      { label: 'Postiz on GitHub (license, stars)', url: 'https://github.com/gitroomhq/postiz-app' },
      { label: 'Postiz docs: supported platforms', url: 'https://docs.postiz.com/general/platforms/overview.md' },
      { label: 'Postiz docs: approvals', url: 'https://docs.postiz.com/general/approvals' },
      { label: 'Postiz docs: time slots', url: 'https://docs.postiz.com/general/channels/time-slots' },
      { label: 'Postiz docs: analytics', url: 'https://docs.postiz.com/general/analytics.md' },
      { label: 'Postiz docs: agents', url: 'https://docs.postiz.com/general/agents.md' },
      { label: 'Postiz docs: MCP', url: 'https://docs.postiz.com/mcp/introduction.md' },
      { label: 'Postiz docs: Docker Compose install', url: 'https://docs.postiz.com/installation/docker-compose' },
    ],
  },
  {
    slug: 'buffer',
    name: 'Buffer',
    url: 'https://buffer.com',
    summary: 'Buffer is the established, hosted scheduler with apps and a free tier. Harbor is open source, self-hosted, and plans from what performed.',
    metaTitle: 'Harbor vs Buffer: an open-source Buffer alternative',
    description: 'Buffer is an established hosted scheduler with 12 platforms, mobile apps and a free tier, priced per channel. Harbor is open source and self-hostable, priced per brand, and learns each brand’s voice and best times from results.',
    checkedOn: '2026-10-16',
    answer:
      'Buffer is the better choice if you want a polished hosted scheduler today: 12 platforms including TikTok and YouTube Shorts, mobile apps, a free tier, and team approvals on its Team plan. Harbor is the better choice if you want an open-source tool you can self-host, run several brands with a separate voice and baseline for each, and have agents plan the week from what actually performed, with every post waiting for your approval.',
    rows: [
      { label: 'What it is', harbor: 'An open-source content strategist for builders with more than one brand', them: '“Social media management for everyone”, a hosted scheduler' },
      { label: 'Open source', harbor: 'Yes, AGPL-3.0; self-hostable', them: 'No; hosted only' },
      { label: 'Price', harbor: 'Self-host free; Cloud opening soon at $19 (2 brands), $49 (6), $149 (25) a month', them: 'Free for 3 channels; Essentials about $5 and Team about $10 per channel a month on annual billing' },
      { label: 'Priced by', harbor: 'Brand', them: 'Connected channel' },
      { label: 'Platforms', harbor: 'X, LinkedIn, Instagram, Threads', them: '12, including TikTok, YouTube Shorts, Facebook, Pinterest, Bluesky, Mastodon' },
      { label: 'Mobile apps', harbor: 'No (web app)', them: 'iOS and Android' },
      { label: 'Brand voice', harbor: 'Per brand, learned and refined from what performed, with evidence', them: 'Business description and manual tone controls' },
      { label: 'Best times', harbor: 'Learned per brand from its own posts', them: 'Recommended times from when your audience is active' },
      { label: 'Measurement', harbor: 'Every post at 1h, 6h, 24h, 3d and 7d against the brand’s median at the same age; weekly digest', them: 'Reach, engagement and top posts; advanced analytics on 4 channel types' },
      { label: 'Approvals', harbor: 'Required for everything agents propose, on every plan', them: 'Approval workflows on the Team plan' },
      { label: 'Agents and MCP', harbor: 'Built-in agents plus an MCP server; proposals only', them: 'AI Assistant in the composer; MCP server and API' },
    ],
    chooseHarbor: [
      'You want open-source software you can self-host, with your tokens and data on your server.',
      'You run several brands and want each judged against its own baseline.',
      'You want the week planned from what performed, not just a queue to fill.',
      'You want pricing that counts brands, not every connected channel.',
    ],
    chooseThem: [
      'You want a hosted product that works today, with no developer apps to register.',
      'You post to TikTok, YouTube Shorts, Facebook or Pinterest.',
      'You want native mobile apps.',
      'You want a free plan to start, or a team of collaborators with roles.',
    ],
    differences: [
      { title: 'Hosted vs your own server', body: 'Buffer runs everything for you. Harbor runs where you choose, under the AGPL, with Harbor Cloud coming for those who’d rather not host.' },
      { title: 'A queue vs a plan', body: 'Buffer fills a queue at recommended times. Harbor’s weekly plan reads last week’s results, picks open best-time slots, drafts and proposes, and waits for you.' },
      { title: 'How results are judged', body: 'Harbor compares each post with the brand’s own median at the same age, so a 6-hour-old post isn’t compared with a week-old one.' },
      { title: 'Breadth', body: 'Buffer supports 12 platforms and mobile apps. Harbor supports 4, deliberately.' },
    ],
    faq: [
      { q: 'Is Harbor an open-source alternative to Buffer?', a: 'Yes. Harbor is open source under the AGPL and can be self-hosted, and it schedules and publishes to X, LinkedIn, Instagram and Threads.' },
      { q: 'Does Harbor have a free plan?', a: 'Self-hosting is free with every feature. Harbor Cloud, when it opens, has no free tier; Buffer has a free plan for 3 channels.' },
      { q: 'Does Harbor support TikTok or YouTube?', a: 'No. Harbor supports X, LinkedIn, Instagram and Threads. Buffer covers TikTok and YouTube Shorts.' },
      { q: 'Which is cheaper for several brands?', a: 'It depends on channels per brand. Buffer charges per channel; Harbor Cloud will charge per brand, so a brand on four platforms counts once.' },
    ],
    sources: [
      { label: 'Buffer pricing', url: 'https://buffer.com/pricing' },
      { label: 'Buffer: supported channels', url: 'https://support.buffer.com/en-us/articles/supported-channels-LM3P7Y4zsp' },
      { label: 'Buffer: posting schedules and recommended times', url: 'https://support.buffer.com/en-us/articles/setting-up-your-timezones-and-posting-schedules-P4iSag90Fl' },
      { label: 'Buffer: approving draft posts', url: 'https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA' },
      { label: 'Buffer: AI Assistant', url: 'https://support.buffer.com/en-us/articles/using-buffers-ai-assistant-qbBulfw9sn' },
      { label: 'Buffer: API', url: 'https://support.buffer.com/en-us/articles/using-buffers-api-GtIYIQilz5' },
      { label: 'Buffer: Insights', url: 'https://buffer.com/insights' },
      { label: 'Buffer: about', url: 'https://buffer.com/about' },
    ],
  },
  {
    slug: 'jasper',
    name: 'Jasper',
    url: 'https://www.jasper.ai',
    summary: 'Jasper writes marketing content across formats for teams; it doesn’t publish to social. Harbor plans, publishes and measures social posts.',
    metaTitle: 'Harbor vs Jasper: AI content tools for social compared',
    description: 'Jasper is a per-seat AI marketing content platform with brand voices and 100+ agents, but no social scheduling, publishing or post analytics. Harbor is open source and publishes to X, LinkedIn, Instagram and Threads, measuring every post and learning from it.',
    checkedOn: '2026-10-16',
    answer:
      'Jasper and Harbor solve different problems. Jasper is an AI marketing content platform for teams: blogs, landing pages, emails and ads, with brand voices, governance and a large agent library, priced per seat. It doesn’t schedule or publish social posts, or measure them. Harbor is an open-source social content strategist: it drafts in each brand’s voice, publishes directly to X, LinkedIn, Instagram and Threads, measures every post against the brand’s median and plans the next week from the results.',
    rows: [
      { label: 'What it is', harbor: 'An open-source content strategist for social, for builders with more than one brand', them: 'An AI marketing content and agents platform for teams' },
      { label: 'Open source', harbor: 'Yes, AGPL-3.0; self-hostable', them: 'No; hosted only' },
      { label: 'Price', harbor: 'Self-host free; Cloud opening soon at $19 (2 brands), $49 (6), $149 (25) a month', them: 'Pro $69 per seat a month ($59 billed yearly); Business custom' },
      { label: 'Priced by', harbor: 'Brand', them: 'Seat' },
      { label: 'Brand voices', harbor: 'One per brand, no cap self-hosted', them: '2 on Pro; unlimited on Business' },
      { label: 'Learns from results', harbor: 'Yes: voice rules and best times from each post’s performance', them: 'No social performance loop documented' },
      { label: 'Social publishing', harbor: 'Direct to X, LinkedIn, Instagram, Threads', them: 'None (exports and integrations)' },
      { label: 'Social analytics', harbor: 'Growth curves, verdicts, digest, best times, reply themes', them: 'None for social; GEO visibility and Search Console data' },
      { label: 'Content range', harbor: 'Short social posts and threads', them: 'Long and short form, 27 languages' },
      { label: 'Enterprise', harbor: 'Early: self-host or Cloud soon', them: 'SSO, audit logs, governance, compliance claims' },
    ],
    chooseHarbor: [
      'Your job is social content for a few brands, and you want it published and measured.',
      'You want the voice to learn from what actually performed.',
      'You want open source and self-hosting, or pricing per brand instead of per seat.',
      'You’re a builder or small team, not a marketing department.',
    ],
    chooseThem: [
      'You need long-form content: blogs, landing pages, email sequences, ads.',
      'You need enterprise governance: SSO, audit logs, compliance rules.',
      'You want GEO tooling for AI search visibility.',
      'You want a large library of marketing agents across formats.',
    ],
    differences: [
      { title: 'Writing vs the whole loop', body: 'Jasper produces content. Harbor plans, drafts, publishes, measures and learns, for social only.' },
      { title: 'What the voice learns from', body: 'Jasper’s brand voice comes from what you give it. Harbor’s starts there and then proposes rules from which posts beat the brand’s median, each linked to its evidence.' },
      { title: 'Who it’s priced for', body: 'Jasper is per seat, built for marketing teams. Harbor is per brand, built for builders who run several.' },
      { title: 'Publishing', body: 'Jasper hands content to other tools. Harbor publishes directly through your own developer apps, after you approve.' },
    ],
    faq: [
      { q: 'Does Jasper schedule or publish social media posts?', a: 'Not directly, per its own site. It writes social copy and connects to other tools; Harbor publishes to X, LinkedIn, Instagram and Threads itself.' },
      { q: 'Can I use Jasper and Harbor together?', a: 'Yes. Some teams write long-form in Jasper and run social in Harbor. Harbor’s Brand Memory can hold the same voice rules.' },
      { q: 'Is Harbor cheaper than Jasper?', a: 'Self-hosted Harbor is free. Harbor Cloud is planned at $19 to $149 a month by brand count; Jasper Pro is $59 to $69 per seat a month.' },
      { q: 'Does Harbor write blog posts?', a: 'No. Harbor is for social posts and threads. Jasper covers long-form formats.' },
    ],
    sources: [
      { label: 'Jasper pricing', url: 'https://www.jasper.ai/pricing' },
      { label: 'Jasper agents', url: 'https://www.jasper.ai/agents' },
      { label: 'Jasper integrations', url: 'https://www.jasper.ai/integrations' },
      { label: 'Jasper GEO', url: 'https://www.jasper.ai/geo' },
      { label: 'Jasper MCP', url: 'https://www.jasper.ai/mcp' },
      { label: 'Jasper trust and security', url: 'https://www.jasper.ai/trust' },
      { label: 'Jasper product update, August 2026', url: 'https://www.jasper.ai/blog/august-2026-product-update' },
    ],
  },
];

export const comparison = (slug: string) => COMPARISONS.find((c) => c.slug === slug);
