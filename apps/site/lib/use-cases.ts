/**
 * Use-case pages: one question people ask (a search, or a question to an AI assistant), answered first, then shown.
 * Every claim here is something Harbor does today; numbers in previews are illustrative.
 */
export type PreviewKey =
  | 'brands-overview' | 'memory-overview' | 'approvals' | 'calendar' | 'mcp' | 'agent-run' | 'safe-publish'
  | 'publish-queue' | 'checkpoint-curve' | 'digest' | 'voice-mixer' | 'platform-rules';

export interface UseCase {
  slug: string;
  /** Short label for nav and cards. */
  label: string;
  eyebrow: string;
  title: string;
  metaTitle: string;
  description: string;
  /** The answer, first: one paragraph an assistant could quote as-is. */
  answer: string;
  problem: { title: string; points: string[] };
  steps: { title: string; body: string; preview: PreviewKey; window: string }[];
  workflow: { title: string; steps: string[] };
  code?: { title: string; lines: string };
  faq: { q: string; a: string }[];
  related: { href: string; label: string }[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'multiple-brands',
    label: 'Content for several brands',
    eyebrow: 'Use case · Multiple brands',
    title: 'One content strategy per brand, run from one place.',
    metaTitle: 'Content strategy for multiple brands',
    description:
      'How to run social content for several brands without them blurring together: a memory and baseline per brand, one approvals inbox, and a weekly plan for each, in open-source Harbor.',
    answer:
      'To run content for several brands without mixing them up, keep three things separate per brand: its voice, its audience and its own performance baseline. Then review everything in one place. Harbor does exactly that. Each brand gets its own Brand Memory and its own median to measure posts against, while plans, drafts and approvals for every brand land in one inbox. A win on one brand never skews another.',
    problem: {
      title: 'Why it breaks with ordinary tools',
      points: [
        'One voice bleeds into the other: the product account starts sounding like your personal one.',
        'Results get averaged across brands, so "what works" is really what works for the biggest one.',
        'Each brand needs its own calendar, best times and ideas, and it all ends up in one cluttered doc.',
        'Switching context between brands every day is where the hours go.',
      ],
    },
    steps: [
      { title: 'A memory per brand', body: 'Voice, audiences, products, knowledge and style rules, kept per brand. Learn a voice by picking a few sample posts or tuning dials, then let the voice refresh propose rules from what actually performed for that brand.', preview: 'memory-overview', window: 'Brand Memory' },
      { title: 'Each brand against its own median', body: 'Every post is measured at 1h, 6h, 24h, 3 days and 7 days and compared with the same brand’s median on the same platform at the same age. A small brand isn’t judged by a big one’s numbers.', preview: 'brands-overview', window: 'Insights · Across your brands' },
      { title: 'One inbox for every brand', body: 'The weekly plan runs per brand and puts each brand’s drafts in Approvals, with the slot it picked and why. You review the whole week for every brand in one pass.', preview: 'approvals', window: 'Approvals' },
      { title: 'Best times per brand', body: 'Each brand gets its own best-time heatmap from its own posts, blended with platform norms until there’s enough history. The calendar shades each brand’s strongest hours.', preview: 'calendar', window: 'Hub · Calendar' },
    ],
    workflow: {
      title: 'A week with three brands',
      steps: [
        'Monday 8am: the weekly plan automation runs for each brand and reads last week’s digest.',
        'It finds open best-time slots per brand and platform, suggests ideas and drafts them in each brand’s voice.',
        'You open Approvals: every brand’s posts, each with its slot, its reason and its voice check.',
        'Approve, edit or reject. Approved posts are scheduled; nothing else goes out.',
        'Through the week each post is measured against its own brand’s median. Friday’s digest says what to keep doing.',
      ],
    },
    faq: [
      { q: 'How many brands can Harbor handle?', a: 'Self-hosted, there’s no limit. Harbor Cloud plans are priced per brand: 2 on Starter, 6 on Builder, 25 on Agency.' },
      { q: 'Can one brand post to several platforms?', a: 'Yes. A brand is the thing you post for, and it can connect X, LinkedIn, Instagram and Threads. Each platform keeps its own limits, previews and best times.' },
      { q: 'Will a viral post on one brand change another brand’s recommendations?', a: 'No. Baselines, verdicts, best times and the voice refresh are all computed per brand.' },
      { q: 'Can someone else review drafts?', a: 'Today approvals happen inside Harbor. Client review links are planned for the Agency plan.' },
    ],
    related: [
      { href: '/product/brand-memory', label: 'Brand Memory' },
      { href: '/product/insights', label: 'Insights' },
      { href: '/pricing', label: 'Pricing per brand' },
    ],
  },
  {
    slug: 'claude-mcp',
    label: 'Social posts from Claude (MCP)',
    eyebrow: 'Use case · Claude and MCP',
    title: 'Plan and draft your social posts from Claude.',
    metaTitle: 'Plan and schedule social media posts from Claude with MCP',
    description:
      'Connect Claude (or any MCP client) to Harbor’s MCP server to read your brand’s voice and results, draft posts and propose them for your approval. Claude can’t publish on its own.',
    answer:
      'You can plan and draft social posts from Claude by connecting it to Harbor’s MCP server with an API key. Claude can then read a brand’s memory, best times and last week’s digest, suggest ideas, draft posts and propose them for a slot. Proposals land in Harbor’s Approvals inbox; nothing is published until you approve it there. It works with Claude Code, Claude Desktop and any other MCP client.',
    problem: {
      title: 'Why not just ask a chatbot?',
      points: [
        'A chat doesn’t know your brand’s voice, so every session starts from scratch.',
        'It has no idea what performed last week, so its ideas are guesses.',
        'Copying drafts into a scheduler by hand is the busywork you wanted gone.',
        'And you don’t want an AI posting to your accounts unsupervised.',
      ],
    },
    steps: [
      { title: 'Claude reads what Harbor knows', body: 'Tools like get_brand_memory, get_digest and best_times give Claude the brand’s voice rules, last week’s results and its strongest hours, so drafts start from evidence instead of a blank page.', preview: 'mcp', window: 'Claude Code · Harbor MCP' },
      { title: 'It drafts and proposes', body: 'draft_idea writes per platform; propose_post asks for a slot (or takes the next free best-time slot) and creates an approval with the reason. Write tools need a key with the write scope.', preview: 'agent-run', window: 'Agents · Run log' },
      { title: 'You approve in Harbor', body: 'Every proposal waits in Approvals with its voice checks. Approve, edit or reject. There is no MCP tool that publishes or schedules directly.', preview: 'approvals', window: 'Approvals' },
    ],
    workflow: {
      title: 'Planning a week from Claude',
      steps: [
        'Create an API key in Harbor’s Settings (read and write scopes).',
        'Add Harbor to Claude Code with one command, or to Claude Desktop through the stdio bridge.',
        'Ask: "Plan next week for my coffee brand."',
        'Claude reads the brand memory, best times and digest, drafts posts and proposes each for a slot.',
        'Open Harbor’s Approvals and decide. Approved posts are scheduled and measured like any other.',
      ],
    },
    code: {
      title: 'Connect Claude Code',
      lines: 'claude mcp add --transport http harbor https://your-harbor/mcp \\\n  --header "Authorization: Bearer hbr_…"',
    },
    faq: [
      { q: 'Can Claude publish posts through Harbor?', a: 'No. Harbor’s MCP server can propose posts, which wait in Approvals. Only a person approving them schedules anything.' },
      { q: 'Which MCP clients work?', a: 'Any client that speaks MCP over Streamable HTTP, such as Claude Code. Clients that only speak stdio, like Claude Desktop, use Harbor’s stdio bridge.' },
      { q: 'What can a read-only key do?', a: 'List brands, read Brand Memory, posts, digests, best times, campaigns, ideas, approvals and agent runs. Anything that creates or proposes needs the write scope.' },
      { q: 'Does it work with a self-hosted Harbor?', a: 'Yes. The MCP server is part of Harbor’s API, at /mcp. Self-hosted, it’s your own server and your own keys.' },
    ],
    related: [
      { href: '/developers', label: 'MCP tools and API' },
      { href: '/product/agents', label: 'Agents & Approvals' },
      { href: '/blog/why-harbor-never-posts-without-you', label: 'Why Harbor never posts without you' },
    ],
  },
  {
    slug: 'self-hosted-social-media-scheduler',
    label: 'Self-hosted social media scheduler',
    eyebrow: 'Use case · Self-hosted',
    title: 'A self-hosted social media scheduler that also learns.',
    metaTitle: 'Open-source, self-hosted social media scheduler',
    description:
      'Harbor is an open-source (AGPL), self-hosted way to schedule and publish to X, LinkedIn, Instagram and Threads through your own developer apps, then measure every post against your own median.',
    answer:
      'Harbor is an open-source, self-hosted social media scheduler for X, LinkedIn, Instagram and Threads. It runs on your own server with Postgres (or an embedded database for local use), publishes through your own developer apps, and keeps your tokens encrypted in your own database. Beyond scheduling, it measures every post at 1h, 6h, 24h, 3 days and 7 days against your own median and uses the results to plan the next week. It’s free under the AGPL, and it runs in a sandbox mode with no keys at all.',
    problem: {
      title: 'Why self-host',
      points: [
        'Your account tokens, drafts and analytics stay on a server you control.',
        'No per-seat or per-channel bill: self-hosted Harbor has every feature and no brand limit.',
        'You can read the code that touches your accounts, and change it.',
        'Hosted schedulers stop at scheduling. Harbor keeps going after the post is out.',
      ],
    },
    steps: [
      { title: 'Publish straight to the platforms', body: 'Harbor talks to each platform’s own API through developer apps you register, so there’s no middleman API. Each platform’s rules are checked before sending: text limits, media counts, aspect ratios.', preview: 'platform-rules', window: 'Voice check · Platform rules' },
      { title: 'No double posts', body: 'If a publish times out after the platform may have accepted it, Harbor marks it "check platform" and waits for you. It never retries an unknown outcome on its own.', preview: 'safe-publish', window: 'Did it go out?' },
      { title: 'Measured after it’s out', body: 'Five checkpoints per post, compared with your own median at the same age, so you see what actually worked rather than vanity totals.', preview: 'checkpoint-curve', window: 'Performance' },
    ],
    workflow: {
      title: 'From clone to first post',
      steps: [
        'Clone the repo, run pnpm install and pnpm dev. It starts in sandbox mode with a simulated model: no keys, no spend.',
        'Explore with demo data, or add your own brand.',
        'When you’re ready, set HARBOR_SECRET_KEY, a stable HTTPS URL and your platform app keys in .env.',
        'Connect each account through the platform’s own consent screen.',
        'Schedule your first post, then watch its growth curve fill in over the first week.',
      ],
    },
    code: {
      title: 'Run it locally',
      lines: 'git clone https://github.com/tryharbor/harbor && cd harbor\npnpm install\npnpm dev     # API on :4800, app on :4801, sandbox mode',
    },
    faq: [
      { q: 'What do I need to self-host Harbor?', a: 'Node.js 22.12+ and pnpm. Postgres for production (set DATABASE_URL), or the embedded PGlite database for local use. To go live, developer apps on each platform you want to post to.' },
      { q: 'Which platforms does it support?', a: 'X, LinkedIn, Instagram and Threads. That’s fewer than most hosted schedulers; Harbor goes deep on those four rather than wide.' },
      { q: 'Does self-hosting cost anything?', a: 'Harbor is free. You pay for your own server and database, and X bills its API per post and per read (about 4 cents to publish and track a post). LinkedIn, Instagram and Threads don’t charge.' },
      { q: 'Is there Docker support?', a: 'A one-command Docker setup is next on the roadmap. Today you run it with Node and pnpm.' },
    ],
    related: [
      { href: '/open-source', label: 'Self-host guide' },
      { href: '/product/publishing', label: 'Publishing' },
      { href: '/blog/what-every-social-api-gives-you-in-2026', label: 'What every social API gives you' },
    ],
  },
];

export const useCase = (slug: string) => USE_CASES.find((u) => u.slug === slug);
