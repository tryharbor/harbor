'use client';

import { useState } from 'react';
import { saveListItem } from '../actions';
import type { Audience } from '../api';

type Draft = Pick<Audience, 'name' | 'description' | 'painPoints' | 'goals'>;

/** Common starting points. Each one fills the form with an example to edit, not a finished answer. */
const STARTERS: Draft[] = [
  {
    name: 'Indie hackers',
    description: 'Solo founders or tiny teams building software products on the side or full time. Technical, busy, allergic to marketing fluff.',
    painPoints: ['Not enough time to market while building', "Don't know what to post or when", 'Posting feels like shouting into the void'],
    goals: ['First 100 paying customers', 'A steady audience that follows the build', 'Marketing that takes an hour a week'],
  },
  {
    name: 'Early-stage founders',
    description: 'Founders of seed-stage startups who need traction, hiring pull and investor visibility, often doing marketing themselves.',
    painPoints: ['No marketing hire yet', 'Inconsistent posting', "Can't tell what content drives signups"],
    goals: ['Grow inbound leads', 'Build credibility with investors and hires', 'Find a repeatable channel'],
  },
  {
    name: 'Small business owners',
    description: 'People running a local or online shop who know their customers well but have little time for social media.',
    painPoints: ["Too busy running the business to post", 'Not sure which platform matters', 'Ideas run dry after a few weeks'],
    goals: ['More repeat customers', 'Show up consistently without hiring someone', 'Know what is worth the time'],
  },
  {
    name: 'Creators',
    description: 'Writers, educators and makers who earn from an audience: newsletters, courses, sponsorships or products.',
    painPoints: ['Algorithm swings', 'Burning out on daily posting', 'Repurposing the same idea for every platform'],
    goals: ['Grow followers who convert to subscribers', 'Post less but better', 'Understand what resonates'],
  },
  {
    name: 'Developers',
    description: 'Engineers evaluating tools. Skeptical of claims, want specifics, code and honest trade-offs.',
    painPoints: ['Marketing-speak instead of details', 'Tools that lock data in', 'Pricing that scales badly'],
    goals: ['Ship faster', 'Tools they can self-host or extend', 'Clear docs and examples'],
  },
  {
    name: 'Customers who already love it',
    description: 'Existing customers and fans: they buy again, refer friends, and like seeing what goes on behind the scenes.',
    painPoints: ['Miss launches and restocks', 'Feel like just another customer'],
    goals: ['Hear about new things first', 'Feel part of the story'],
  },
];

const join = (xs: string[]) => xs.join('\n');

/**
 * The onboarding audience step: pick a starting point (or start blank), edit it in plain fields, save. Every field
 * shows an example of the kind of answer that helps, so nobody has to invent an audience persona from nothing.
 */
export function AudienceStep({ brandId, returnTo, existing }: { brandId: string; returnTo: string; existing: Audience[] }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [key, setKey] = useState(0);
  const start = (d: Draft | null) => { setDraft(d ?? { name: '', description: '', painPoints: [], goals: [] }); setKey((k) => k + 1); };

  return (
    <div className="stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <h2 style={{ margin: 0 }}>Who is it for?</h2>
        <p className="muted small" style={{ margin: 0 }}>One or two groups of people you post for. Ideas and drafts aim at one of them at a time. Start from an example and make it yours; a rough answer beats none, and you can refine it later.</p>
      </div>

      {existing.length ? (
        <ul className="list">
          {existing.map((a) => (
            <li key={a.id}><strong style={{ fontWeight: 500 }}>{a.name}</strong><span className="muted small">{a.description || `${a.painPoints.length} pain points`}</span></li>
          ))}
        </ul>
      ) : null}

      <div className="stack" style={{ gap: 8 }}>
        <span className="label">{existing.length ? 'Add another' : 'Start from'}</span>
        <div className="chips">
          {STARTERS.map((s) => (
            <button key={s.name} type="button" className={`chip${draft?.name === s.name ? ' on' : ''}`} onClick={() => start(s)}>{s.name}</button>
          ))}
          <button type="button" className="chip" onClick={() => start(null)}>Start blank</button>
        </div>
      </div>

      {draft ? (
        <form key={key} action={saveListItem} className="card stack">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="list" value="audiences" />
          <div className="field">
            <label htmlFor="aud-name">A short name for them</label>
            <input id="aud-name" name="name" required defaultValue={draft.name} placeholder="e.g. Indie hackers with several products" />
          </div>
          <div className="field">
            <label htmlFor="aud-desc">Who they are, in a sentence or two</label>
            <textarea id="aud-desc" name="description" defaultValue={draft.description} style={{ minHeight: 80 }} placeholder="e.g. Solo founders running 2–4 small products, posting for each one themselves." />
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label htmlFor="aud-pains">What frustrates them · one per line · optional</label>
              <textarea id="aud-pains" name="painPoints" defaultValue={join(draft.painPoints)} style={{ minHeight: 110 }} placeholder={'e.g. Switching context between brands\nNo idea which posts worked'} />
            </div>
            <div className="field">
              <label htmlFor="aud-goals">What they want · one per line · optional</label>
              <textarea id="aud-goals" name="goals" defaultValue={join(draft.goals)} style={{ minHeight: 110 }} placeholder={'e.g. Post consistently for every product\nKnow what to post next'} />
            </div>
          </div>
          <span className="field-help">Write it the way they'd say it. Harbor uses these lines in hooks ("If switching between brands sounds familiar…").</span>
          <div className="row"><button type="submit" className="primary">Save audience</button><button type="button" className="link-button" onClick={() => setDraft(null)}>Cancel</button></div>
        </form>
      ) : null}
    </div>
  );
}
