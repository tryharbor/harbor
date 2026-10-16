/**
 * Sample posts for "Pick posts that sound like you": six personalities, two posts each, about running a product or
 * a small business so they fit most brands. Picking a few is a faster start than writing 1,000 characters cold;
 * Harbor learns the voice from the picks and keeps refining it from real results later.
 */
export interface VoicePersonality {
  key: string;
  name: string;
  /** One line on how it reads. */
  feel: string;
  posts: string[];
}

export const VOICE_PERSONALITIES: VoicePersonality[] = [
  {
    key: 'candid',
    name: 'Candid builder',
    feel: 'First person, plain words, shows the numbers and the mistakes.',
    posts: [
      "I spent three weeks building a feature nobody asked for. 4 people used it. This week I deleted it and shipped the boring fix 40 customers had been emailing me about. Lesson relearned: read the inbox before the roadmap.",
      "Month 7 numbers: $3,140 in revenue, 212 paying customers, 9 cancellations. Two of those were my fault (a billing bug I missed for a week). Fixed it, emailed each of them, and one came back. Writing it down so I don't forget.",
    ],
  },
  {
    key: 'contrarian',
    name: 'Punchy contrarian',
    feel: 'Short lines, strong opinions, a clear "here\'s what everyone gets wrong".',
    posts: [
      "Unpopular opinion: you don't need a content calendar.\n\nYou need to know which 3 posts worked last month and why.\n\nEverything else is busywork.",
      "Stop launching on Tuesday because a blog said so.\n\nLaunch when your audience is awake.\n\nThat's different for every brand. Look at your own data.",
    ],
  },
  {
    key: 'storyteller',
    name: 'Warm storyteller',
    feel: 'A small scene first, then the point. Friendly, a little personal.',
    posts: [
      "Saturday morning, 7am. A customer emails: \"Is it okay if I order for my mom too? She loved the last batch.\" That one line made my whole week. It's why we still pack every order by hand.",
      "The first thing we ever sold was to my neighbor. She paid in cash and asked for a receipt, so I wrote one on a sticky note. We have proper invoices now, but I still keep that sticky note on my desk.",
    ],
  },
  {
    key: 'analyst',
    name: 'Data-first expert',
    feel: 'Leads with a finding, backs it up, gives one takeaway.',
    posts: [
      "We looked at 1,200 posts across 6 brands. Posts that opened with a number got 1.7× the median views at 24 hours. Posts with a link in the first line got 0.6×. Takeaway: lead with the number, put the link at the end.",
      "Best time to post isn't a universal answer. For one of our brands it's Tuesday 9am; for another it's Sunday 7pm, by a 2× margin. Measure your own: compare each post with your median at the same age, not with total likes.",
    ],
  },
  {
    key: 'playful',
    name: 'Playful and light',
    feel: 'Casual, a joke or two, the occasional emoji.',
    posts: [
      "Shipped a new feature today 🎉 It does exactly one thing and it does it well. (Unlike me before coffee.) Go poke at it and tell me what breaks.",
      "Our team meeting today: 12 minutes, 3 decisions, 0 slides. A personal best. Celebrating with the leftover launch-day cookies 🍪",
    ],
  },
  {
    key: 'calm',
    name: 'Calm and considered',
    feel: 'Measured, thoughtful, no hype. Explains the why.',
    posts: [
      "We're raising prices next month for new customers. Existing customers keep their current price for as long as they stay. Here's the reasoning: costs went up, and we'd rather charge fairly than cut corners on support.",
      "A note on how we decide what to build. We keep a list of every request, group them by the problem behind them, and work on the problem that comes up most. It's slower than chasing ideas, but we waste less.",
    ],
  },
];

/** How much writing the voice is learned from: a hint, not a gate (the API needs 200 characters). */
export function voiceStrength(chars: number): { label: 'Not enough yet' | 'Rough' | 'Good' | 'Strong'; ok: boolean; pct: number } {
  if (chars < 200) return { label: 'Not enough yet', ok: false, pct: Math.round((chars / 1500) * 100) };
  if (chars < 600) return { label: 'Rough', ok: true, pct: Math.round((chars / 1500) * 100) };
  if (chars < 1500) return { label: 'Good', ok: true, pct: Math.round((chars / 1500) * 100) };
  return { label: 'Strong', ok: true, pct: 100 };
}
