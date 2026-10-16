'use client';

import { useState } from 'react';
import { useProgress } from './motion';
import { Reserve } from './reserve';

/**
 * The voice mixer, interactive. The dials, rules and sample post follow the app's own logic
 * (apps/web/app/components/voice-mixer.tsx): a dial pushed past a third of the way adds a plain rule, and the sample
 * post, on a fixed topic, rewrites itself so only the style changes.
 */
type Key = 'personal' | 'punchy' | 'data' | 'playful' | 'candid';
type Mix = Record<Key, number>;

const AXES: { key: Key; low: string; high: string; lowWord: string; highWord: string }[] = [
  { key: 'personal', low: 'Company', high: 'Personal', lowWord: 'speaks as the team', highWord: 'personal' },
  { key: 'punchy', low: 'Calm', high: 'Punchy', lowWord: 'calm', highWord: 'punchy' },
  { key: 'data', low: 'Story-led', high: 'Data-led', lowWord: 'story-led', highWord: 'data-led' },
  { key: 'playful', low: 'Serious', high: 'Playful', lowWord: 'serious', highWord: 'playful' },
  { key: 'candid', low: 'Polished', high: 'Candid', lowWord: 'polished', highWord: 'candid' },
];
const PRESETS: { name: string; mix: Mix }[] = [
  { name: 'Candid builder', mix: { personal: 85, punchy: 45, data: 65, playful: 30, candid: 90 } },
  { name: 'Punchy contrarian', mix: { personal: 60, punchy: 90, data: 55, playful: 35, candid: 55 } },
  { name: 'Warm storyteller', mix: { personal: 80, punchy: 30, data: 20, playful: 50, candid: 65 } },
  { name: 'Playful and light', mix: { personal: 70, punchy: 60, data: 25, playful: 90, candid: 55 } },
  { name: 'Calm and considered', mix: { personal: 30, punchy: 15, data: 50, playful: 15, candid: 50 } },
];
const NEUTRAL: Mix = { personal: 50, punchy: 50, data: 50, playful: 50, candid: 50 };
const TARGET: Mix = { personal: 80, punchy: 70, data: 85, playful: 40, candid: 75 };
const LOW = 35, HIGH = 65;

function rulesFor(m: Mix) {
  const d: string[] = [], a: string[] = [];
  if (m.personal >= HIGH) { d.push('Write in the first person (“I”): one person sharing what they did.'); a.push('A corporate “we” voice.'); }
  if (m.personal <= LOW) d.push('Speak as the team (“we”), not as one person.');
  if (m.punchy >= HIGH) d.push('Short lines, one idea each. Take a clear position.');
  if (m.punchy >= 85) a.push('Hedging (“might”, “maybe”, “kind of”).');
  if (m.punchy <= LOW) { d.push('Measured sentences that explain the why.'); a.push('Hype and hot takes.'); }
  if (m.data >= HIGH) d.push('Lead with a number and back claims with real figures (never invented ones).');
  if (m.data <= LOW) d.push('Open with a small, concrete scene before making the point.');
  if (m.playful >= HIGH) d.push('A light joke or an emoji now and then is welcome.');
  if (m.playful <= LOW) { a.push('Emoji.'); a.push('Exclamation marks.'); }
  if (m.candid >= HIGH) d.push('Share real numbers, mistakes and what you’d do differently.');
  if (m.candid <= LOW) d.push('Keep it polished: lead with what’s useful and skip the backstory.');
  return { do: d, avoid: a };
}

function styleLine(m: Mix) {
  const words = AXES.flatMap((ax) => (m[ax.key] >= HIGH ? [ax.highWord] : m[ax.key] <= LOW ? [ax.lowWord] : []));
  if (!words.length) return 'Balanced: no strong lean in any direction yet.';
  const list = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
  return `${list[0]!.toUpperCase()}${list.slice(1)}.`;
}

/** The sample post as its five paragraph slots (null: the slot is empty for this mix). */
function sampleSlots(m: Mix): (string | null)[] {
  const me = m.personal >= 50;
  const I = me ? 'I' : 'we', my = me ? 'my' : 'our', Me = me ? 'me' : 'us';
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  return [
    m.data >= HIGH ? '3 weeks, 2 rewrites, 1 new feature.' : m.data <= LOW ? `Last night at 11pm, ${I} hit deploy and just sat there watching the logs.` : `${cap(I)} just shipped something new.`,
    m.punchy >= HIGH ? 'It does one thing.\nIt does it well.' : m.punchy <= LOW ? `It does one thing well, and ${I} kept it that small on purpose: fewer moving parts, fewer surprises for the people using it.` : 'It does one thing, and it does it well.',
    m.data >= HIGH ? 'Testers finished setup in 4 minutes instead of 15.' : null,
    m.candid >= HIGH ? `Honest note: ${my} first version broke on mobile, so it shipped a week late.` : null,
    m.playful >= HIGH ? `Go poke at it and tell ${Me} what breaks 🎉` : m.playful <= LOW ? 'Feedback is welcome.' : `Try it and let ${Me} know what you think.`,
  ];
}
const samplePost = (m: Mix) => sampleSlots(m).filter((l): l is string => l !== null).join('\n\n');

/*
 * Space for the largest mix, from the real copy. Each axis only ever adds its own lines, so the tallest rules list
 * is each axis at whichever end writes more; the tallest sample is every slot at its longest variant. Both are laid
 * out invisibly under the live text, so dragging a dial never resizes the mixer.
 */
const EXTREMES: Mix[] = Array.from({ length: 2 ** AXES.length }, (_, n) => Object.fromEntries(AXES.map((a, i) => [a.key, n & (1 << i) ? 100 : 0])) as Mix);
const MIXES: Mix[] = [0, 50, 100].flatMap((personal) => [0, 50, 100].flatMap((punchy) => [0, 50, 100].flatMap((data) => [0, 50, 100].flatMap((playful) => [0, 100].map((candid) => ({ personal, punchy, data, playful, candid }))))));
const AXIS_RULES = AXES.map((ax) => [0, 100].map((v) => rulesFor({ ...NEUTRAL, [ax.key]: v })));
const SLOT_VARIANTS = sampleSlots(NEUTRAL).map((_, i) => [...new Set(MIXES.map((m) => sampleSlots(m)[i]).filter((l): l is string => l !== null))]);
const STYLE_LINES = [...new Set([NEUTRAL, ...EXTREMES].map(styleLine))];

function RuleItems({ rules }: { rules: { do: string[]; avoid: string[] } }) {
  return (
    <>
      {rules.do.map((r) => <li key={r}><span aria-hidden="true">+</span>{r}</li>)}
      {rules.avoid.map((r) => <li key={r}><span aria-hidden="true">−</span>Avoid: {r}</li>)}
    </>
  );
}

export function VoiceMixerPreview() {
  const { ref, p } = useProgress<HTMLDivElement>(1800, 0.4);
  const [own, setOwn] = useState<Mix | null>(null);
  const mix: Mix = own ?? (Object.fromEntries(AXES.map((a) => [a.key, Math.round((NEUTRAL[a.key] + (TARGET[a.key] - NEUTRAL[a.key]) * p) / 5) * 5])) as Mix);
  const rules = rulesFor(mix);
  const sample = samplePost(mix);
  const set = (k: Key, v: number) => setOwn({ ...mix, [k]: v });

  return (
    <div ref={ref} className="pv">
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Brand Memory · Voice mixer</span><strong className="pv-title">Drag toward how the brand should sound</strong></div>
        <span className="pv-tag">Try it</span>
      </div>
      <div className="pv-presets" role="group" aria-label="Start from a personality">
        {PRESETS.map((pr) => (
          <button key={pr.name} type="button" className="a-btn" aria-pressed={own !== null && AXES.every((a) => own[a.key] === pr.mix[a.key])} onClick={() => setOwn(pr.mix)}>{pr.name}</button>
        ))}
        <button type="button" className="a-btn" onClick={() => setOwn(NEUTRAL)}>Reset</button>
      </div>
      <div className="pv-mixer">
        <div className="pv-dials">
          {AXES.map((ax) => {
            const v = mix[ax.key];
            return (
              <label key={ax.key} className="pv-dial">
                <span className={`a-label${v <= LOW ? ' on' : ''}`}>{ax.low}</span>
                <input
                  type="range" min={0} max={100} step={5} value={v}
                  style={{ ['--v' as string]: `${v}%` }}
                  onChange={(e) => set(ax.key, Number(e.target.value))}
                  aria-label={`${ax.low} to ${ax.high}`}
                  aria-valuetext={v >= HIGH ? ax.high : v <= LOW ? ax.low : 'In between'}
                />
                <span className={`a-label right${v >= HIGH ? ' on' : ''}`}>{ax.high}</span>
              </label>
            );
          })}
          <div className="pv-kv" style={{ marginTop: 4 }}>
            <span className="a-label">Rules this mix adds</span>
            <div className="pv-cell" style={{ alignItems: 'start' }}>
              <div className="pv-ghost pv-rules" aria-hidden="true">
                {AXIS_RULES.map((ends, n) => (
                  <div key={n} className="pv-cell">{ends.map((r, e) => <ul key={e} className="pv-rules"><RuleItems rules={r} /></ul>)}</div>
                ))}
              </div>
              {rules.do.length + rules.avoid.length ? (
                <ul className="pv-rules"><RuleItems rules={rules} /></ul>
              ) : <span className="pv-sub">Every dial is in the middle, so the mix adds no rules yet.</span>}
            </div>
          </div>
        </div>
        <div className="pv-sample">
          <span className="a-label">Sounds like</span>
          <div className="pv-cell">
            <p className="pv-ghost" aria-hidden="true">
              {SLOT_VARIANTS.map((vs, i) => (
                <span key={i} className="pv-cell">{vs.map((v) => <span key={v}>{i ? `\n${v}` : v}</span>)}</span>
              ))}
            </p>
            <p key={sample} className="pv-fadein">{sample}</p>
          </div>
          <Reserve all={STYLE_LINES} className="pv-sub">{styleLine(mix)}</Reserve>
        </div>
      </div>
    </div>
  );
}
