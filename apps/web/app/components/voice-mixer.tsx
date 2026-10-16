'use client';

import type { BrandVoice } from '../api';
import { VOICE_PERSONALITIES } from './voice-samples';

/**
 * The voice mixer: five dials between two poles each. They start from the sample posts the owner picked, and each
 * dial pushed past a third of the way adds a plain rule to the voice. A sample post rewrites itself as the dials move,
 * so the effect is visible before anything is saved.
 */
export type AxisKey = 'personal' | 'punchy' | 'data' | 'playful' | 'candid';
export type Mix = Record<AxisKey, number>;

export const AXES: { key: AxisKey; low: string; high: string; lowWord: string; highWord: string }[] = [
  { key: 'personal', low: 'Company', high: 'Personal', lowWord: 'speaks as the team', highWord: 'personal' },
  { key: 'punchy', low: 'Calm', high: 'Punchy', lowWord: 'calm', highWord: 'punchy' },
  { key: 'data', low: 'Story-led', high: 'Data-led', lowWord: 'story-led', highWord: 'data-led' },
  { key: 'playful', low: 'Serious', high: 'Playful', lowWord: 'serious', highWord: 'playful' },
  { key: 'candid', low: 'Polished', high: 'Candid', lowWord: 'polished', highWord: 'candid' },
];

/** Where each sample personality sits on the dials (0 = low pole, 100 = high pole). */
const PERSONALITY_MIX: Record<string, Mix> = {
  candid: { personal: 85, punchy: 45, data: 65, playful: 30, candid: 90 },
  contrarian: { personal: 60, punchy: 90, data: 55, playful: 35, candid: 55 },
  storyteller: { personal: 80, punchy: 30, data: 20, playful: 50, candid: 65 },
  analyst: { personal: 35, punchy: 50, data: 95, playful: 15, candid: 45 },
  playful: { personal: 70, punchy: 60, data: 25, playful: 90, candid: 55 },
  calm: { personal: 30, punchy: 15, data: 50, playful: 15, candid: 50 },
};

export const NEUTRAL: Mix = { personal: 50, punchy: 50, data: 50, playful: 50, candid: 50 };

/** The average position of the picked posts' personalities, or neutral with no picks. */
export function mixFromPicks(picked: Set<string>): Mix {
  const mixes = VOICE_PERSONALITIES.flatMap((p) => p.posts.filter((t) => picked.has(t)).map(() => PERSONALITY_MIX[p.key]!));
  if (!mixes.length) return NEUTRAL;
  const avg = (k: AxisKey) => Math.round(mixes.reduce((n, m) => n + m[k], 0) / mixes.length);
  return { personal: avg('personal'), punchy: avg('punchy'), data: avg('data'), playful: avg('playful'), candid: avg('candid') };
}

const LOW = 35, HIGH = 65;

/** The rules a mix adds. Nothing for a dial left near the middle. */
export function rulesFor(mix: Mix): { do: string[]; avoid: string[] } {
  const d: string[] = [], a: string[] = [];
  if (mix.personal >= HIGH) { d.push('Write in the first person ("I"): one person sharing what they did.'); a.push('A corporate "we" voice.'); }
  if (mix.personal <= LOW) d.push('Speak as the team ("we"), not as one person.');
  if (mix.punchy >= HIGH) d.push('Short lines, one idea each. Take a clear position.');
  if (mix.punchy >= 85) a.push('Hedging ("might", "maybe", "kind of").');
  if (mix.punchy <= LOW) { d.push('Measured sentences that explain the why.'); a.push('Hype and hot takes.'); }
  if (mix.data >= HIGH) d.push('Lead with a number and back claims with real figures (never invented ones).');
  if (mix.data <= LOW) d.push('Open with a small, concrete scene before making the point.');
  if (mix.playful >= HIGH) d.push('A light joke or an emoji now and then is welcome.');
  if (mix.playful <= LOW) { a.push('Emoji.'); a.push('Exclamation marks.'); }
  if (mix.candid >= HIGH) d.push("Share real numbers, mistakes and what you'd do differently.");
  if (mix.candid <= LOW) d.push("Keep it polished: lead with what's useful and skip the backstory.");
  return { do: d, avoid: a };
}

/** "Personal, punchy and data-led, with a candid streak." Empty when every dial sits in the middle. */
export function styleLine(mix: Mix): string {
  const words = AXES.flatMap((ax) => (mix[ax.key] >= HIGH ? [ax.highWord] : mix[ax.key] <= LOW ? [ax.lowWord] : []));
  if (!words.length) return '';
  const list = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
  return `${list[0]!.toUpperCase()}${list.slice(1)}.`;
}

/** Learned rules that a dial now contradicts are dropped (e.g. "avoid emoji" once Playful is up). */
const CONFLICTS: { when: (m: Mix) => boolean; list: 'do' | 'avoid'; test: RegExp }[] = [
  { when: (m) => m.playful >= HIGH, list: 'avoid', test: /emoji|exclamation/i },
  { when: (m) => m.personal <= LOW, list: 'do', test: /first person/i },
  { when: (m) => m.personal <= LOW, list: 'avoid', test: /corporate "?we"?/i },
  { when: (m) => m.personal >= HIGH, list: 'do', test: /speak as the team/i },
  { when: (m) => m.punchy <= LOW, list: 'do', test: /short lines|fragments/i },
  { when: (m) => m.data <= LOW, list: 'do', test: /real numbers|lead with a number/i },
];

const dedupe = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];

/** A learned voice with the mix applied; or, with no learned voice, a voice built from the dials alone. */
export function applyMix(mix: Mix, voice?: BrandVoice): BrandVoice {
  const rules = rulesFor(mix);
  const base: BrandVoice = voice ?? { summary: '', values: [], do: [], avoid: [], bannedWords: [], excerpts: [], sources: [] };
  const keep = (list: 'do' | 'avoid', xs: string[]) => xs.filter((x) => !CONFLICTS.some((c) => c.list === list && c.when(mix) && c.test.test(x)));
  const line = styleLine(mix);
  return {
    ...base,
    summary: voice ? (line ? `${base.summary} Style mix: ${line}` : base.summary) : line || 'Balanced: no strong lean in any direction yet.',
    do: dedupe([...rules.do, ...keep('do', base.do)]),
    avoid: dedupe([...rules.avoid, ...keep('avoid', base.avoid)]),
    sources: voice ? base.sources : [{ kind: 'example', label: 'Set with the voice mixer' }],
  };
}

/** A sample post in the current mix (a fixed topic, so only the style changes as the dials move). */
export function samplePost(mix: Mix): string {
  const me = mix.personal >= 50;
  const I = me ? 'I' : 'we', my = me ? 'my' : 'our', Me = me ? 'me' : 'us';
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const lines: string[] = [];
  if (mix.data >= HIGH) lines.push('3 weeks, 2 rewrites, 1 new feature.');
  else if (mix.data <= LOW) lines.push(`Last night at 11pm, ${I} hit deploy and just sat there watching the logs.`);
  else lines.push(`${cap(I)} just shipped something new.`);
  if (mix.punchy >= HIGH) lines.push('It does one thing.\nIt does it well.');
  else if (mix.punchy <= LOW) lines.push(`It does one thing well, and ${I} kept it that small on purpose: fewer moving parts, fewer surprises for the people using it.`);
  else lines.push('It does one thing, and it does it well.');
  if (mix.data >= HIGH) lines.push('Testers finished setup in 4 minutes instead of 15.');
  if (mix.candid >= HIGH) lines.push(`Honest note: ${my} first version broke on mobile, so it shipped a week late.`);
  if (mix.playful >= HIGH) lines.push(`Go poke at it and tell ${Me} what breaks 🎉`);
  else if (mix.playful <= LOW) lines.push('Feedback is welcome.');
  else lines.push(`Try it and let ${Me} know what you think.`);
  return lines.join('\n\n');
}

export function VoiceMixer({ mix, onChange, picksCount }: { mix: Mix; onChange: (m: Mix) => void; picksCount: number }) {
  const rules = rulesFor(mix);
  return (
    <div className="mixer">
      <div className="stack" style={{ gap: 14 }}>
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <span className="label">Fine-tune the mix</span>
          <span className="small dim">{picksCount ? 'Set from your picks. Drag to adjust.' : 'Drag toward how the brand should sound.'}</span>
        </div>
        {AXES.map((ax) => (
          <label key={ax.key} className="dial">
            <span className={`pole${mix[ax.key] <= LOW ? ' on' : ''}`}>{ax.low}</span>
            <input
              type="range" min={0} max={100} step={5} value={mix[ax.key]}
              onChange={(e) => onChange({ ...mix, [ax.key]: Number(e.target.value) })}
              aria-label={`${ax.low} to ${ax.high}`}
              aria-valuetext={mix[ax.key] >= HIGH ? ax.high : mix[ax.key] <= LOW ? ax.low : 'In between'}
            />
            <span className={`pole right${mix[ax.key] >= HIGH ? ' on' : ''}`}>{ax.high}</span>
          </label>
        ))}
        {rules.do.length + rules.avoid.length ? (
          <ul className="mix-rules small">
            {rules.do.map((r) => <li key={r}><span className="mono" aria-hidden="true">+</span> {r}</li>)}
            {rules.avoid.map((r) => <li key={r}><span className="mono" aria-hidden="true">−</span> Avoid: {r}</li>)}
          </ul>
        ) : <span className="small dim">Every dial is in the middle, so the mix adds no rules yet.</span>}
      </div>
      <div className="mix-sample">
        <span className="label">Sounds like</span>
        <p>{samplePost(mix)}</p>
        <span className="small dim">A sample on a fixed topic, so only the style changes. Not saved.</span>
      </div>
    </div>
  );
}
