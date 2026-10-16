import { brandSchema, type Brand, type Signal } from '@harbor/core';

export const EXAMPLES = [
  `Every Monday I used to open Notion, stare at four content calendars, and feel behind before I wrote a word. So I stopped. I picked one brand per day. That's it. Output went from 3 posts a week to 11, and I spend 40 minutes less on Mondays.`,
  `I run four businesses. Two make money, one breaks even, one is a hobby I pretend is a business. The mistake I made for two years: treating them all like they needed the same content plan. They don't. What would you cut first?`,
  `Shipped the snapshot poller today. Harbor now checks every post at 1h, 6h, 24h, 72h and 7 days. Why? Because the final number lies. A post that gets 80% of its views in the first 6 hours is a different post from one that keeps growing for a week.`,
  `Honest numbers from last month: 1,240 visitors, 61 waitlist signups, 0 revenue. Not great. But 9 of those signups replied to the welcome email with a real problem, and that's worth more to me than the other 52. I'm building for those 9.`,
  `You don't need a content strategy for each brand. You need one place that knows what each brand sounds like, what worked last time, and what's due this week. That's the whole idea behind Harbor. I'll keep posting what I learn as I build it.`,
];

const now = '2026-10-01T00:00:00.000Z';
export function makeBrand(memory: unknown = {}): Brand {
  return brandSchema.parse({ id: 'brd_test', workspaceId: 'ws_default', name: 'Harbor', slug: 'harbor', memory, createdAt: now, updatedAt: now });
}

export const RICH_MEMORY = {
  voice: { summary: 'First person ("I"), plain, specific.', values: [{ name: 'Personal', meaning: '' }], do: ['Ask the reader one direct question.'], avoid: ['Hype words: leverage, unlock.', 'Exclamation marks.'], bannedWords: ['synergy'] },
  audiences: [{ id: 'aud1', name: 'Indie hackers', description: 'Builders running 2+ products', painPoints: ['Context switching between brands', 'No time to write'], goals: ['Post consistently without burning out'] }],
  products: [{ id: 'prd1', name: 'Harbor', summary: 'The open-source content strategist', cta: 'Join the waitlist', url: 'https://harbor.example', proofPoints: ['Tracks every post at 1h, 6h, 24h, 72h and 7d'] }],
  styleRules: { terms: [{ use: 'customers', insteadOf: 'users' }], formatting: ['No hashtags'] },
};

export const signal = (id: string, kind: Signal['kind'], summary: string, data: Record<string, unknown> = {}): Signal => ({
  id, brandId: 'brd_test', kind, summary, source: {}, data, observedAt: now, createdAt: now,
});
