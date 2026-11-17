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
      'How to run social content for several brands without them blurring together: a memory and baseline per brand, one approvals inbox, and a weekly plan for each, in Harbor.',
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
      { q: 'How many brands can Harbor handle?', a: 'Harbor Cloud plans are priced per brand: 2 on Starter, 6 on Builder, 25 on Agency.' },
      { q: 'Can one brand post to several platforms?', a: 'Yes. A brand is the thing you post for, and it can connect X, LinkedIn, Instagram and Threads. Each platform keeps its own limits, previews and best times.' },
      { q: 'Will a viral post on one brand change another brand’s recommendations?', a: 'No. Baselines, verdicts, best times and the voice refresh are all computed per brand.' },
      { q: 'Can someone else review drafts?', a: 'Today approvals happen inside Harbor. Client review links are planned for the Agency plan.' },
    ],
    related: [
      { href: '/product/business', label: 'Your business' },
      { href: '/product/market', label: 'Market' },
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
    ],
    related: [
      { href: '/developers', label: 'MCP tools and API' },
      { href: '/product/market', label: 'Market' },
      { href: '/blog/how-harbors-approvals-inbox-works', label: "How Harbor's approvals inbox works" },
    ],
  },
];

export const useCase = (slug: string) => USE_CASES.find((u) => u.slug === slug);
