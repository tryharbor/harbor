'use client';

import { useState } from 'react';
import { PlatformIcon } from '../platform-icon';
import { Mark } from '../ui';
import type { Platform } from '../../lib/site';
import { Artwork } from './artwork';
import { useSteps } from './motion';
import { Reserve } from './reserve';

const NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', threads: 'Threads', instagram: 'Instagram' };
const LIMIT: Record<Platform, number> = { x: 280, linkedin: 3000, instagram: 2200, threads: 500 };
const THREADS: Record<Platform, boolean> = { x: true, threads: true, linkedin: false, instagram: false };
const ORDER: Platform[] = ['x', 'linkedin', 'threads', 'instagram'];
const START: Record<Platform, string> = {
  x: '3 weeks, 2 rewrites, 1 feature.\n---\nIt does one thing. It does it well. The first version broke on mobile, so it shipped a week late.\n---\nGo poke at it and tell me what breaks.',
  linkedin: 'Three weeks, two rewrites, one feature.\n\nI kept it small on purpose: fewer moving parts, fewer surprises for the people using it. Honest note: the first version broke on mobile, so it shipped a week late.\n\nWhat would you have cut?',
  threads: 'Shipped a new feature today. 3 weeks, 2 rewrites. It does exactly one thing.',
  instagram: 'Three weeks, two rewrites, one feature. Swipe for what we cut, and why.',
};
const SPLIT = /^\s*---\s*$/m;
const partsOf = (body: string) => body.split(SPLIT).map((t) => t.trim()).filter(Boolean);
const LABELS = ['Text · --- on its own line starts the next post', 'Text'];

/**
 * One pane of the Studio, interactive: edit the text and the platform preview, part counts and limit follow live.
 * On X and Threads a line of --- starts the next post in the thread. Tabs cycle until you touch it.
 */
export function PlatformEditorPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(ORDER.length, 3600, { final: 0 });
  const [own, setOwn] = useState<Platform | null>(null);
  const [texts, setTexts] = useState(START);
  const platform = own ?? ORDER[step]!;
  const body = texts[platform];
  const parts = partsOf(body);
  const limit = LIMIT[platform];
  const over = parts.some((p) => [...p].length > limit);

  return (
    <div ref={ref} className="pv" style={{ minHeight: 560 }}>
      <div className="pv-head">
        <span className="pv-seg" role="tablist" aria-label="Platform">
          {ORDER.map((p) => (
            <button key={p} type="button" role="tab" aria-selected={p === platform} aria-pressed={p === platform} onClick={() => setOwn(p)}>
              <PlatformIcon platform={p} size={11} /> {NAME[p]}
            </button>
          ))}
        </span>
        <span className="pv-mono pv-dim">v2 · edited by you</span>
      </div>
      <label className="pv-stack2" style={{ gap: 4 }}>
        <Reserve all={LABELS} className="a-label">{LABELS[THREADS[platform] ? 0 : 1]}</Reserve>
        <textarea
          className="pv-textarea"
          rows={6}
          value={body}
          onChange={(e) => { setOwn(platform); setTexts({ ...texts, [platform]: e.target.value }); }}
        />
        <span className={`pv-mono pv-ellipsis ${over ? 'pv-over' : 'pv-dim'}`} style={{ justifySelf: 'end', maxWidth: '100%' }}>
          {parts.length > 1 ? parts.map((p, i) => `${i + 1}: ${[...p].length}`).join(' · ') : [...(parts[0] ?? '')].length} / {limit.toLocaleString('en-US')}
          {over ? ' · over the limit' : ''}
        </span>
      </label>
      {/*
        The preview area is laid out for every platform's own draft, so switching tabs never resizes it. Edits past
        that size scroll inside the preview instead of pushing the page.
      */}
      <div className="pv-cell pv-preview-area">
        {ORDER.map((p) => (
          <div key={p} className="pv-preview pv-ghost" aria-hidden="true">
            <span className="a-label pv-row" style={{ gap: 6 }}><PlatformIcon platform={p} size={10} />Preview · {NAME[p]}</span>
            <Preview platform={p} parts={partsOf(START[p])} />
          </div>
        ))}
        <div className="pv-preview-live">
          <div className="pv-preview" key={platform}>
            <span className="a-label pv-row" style={{ gap: 6 }}><PlatformIcon platform={platform} size={10} />Preview · {NAME[platform]}</span>
            <Preview platform={platform} parts={parts} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar() {
  return <span className="pv-avatar"><Mark size={11} /></span>;
}

function Preview({ platform, parts }: { platform: Platform; parts: string[] }) {
  if (!parts.length) return <span className="pv-sub">The {NAME[platform]} preview appears as you write.</span>;
  if (platform === 'instagram') {
    return (
      <div className="pv-stack2" style={{ gap: 8 }}>
        <span className="pv-row"><Avatar /><strong style={{ fontWeight: 500 }}>tryharbor</strong></span>
        <div className="pv-ig-media"><Artwork box={{ x: 220, y: 60, w: 760, h: 950 }} /></div>
        <span style={{ fontSize: 12.5 }}><strong style={{ fontWeight: 600 }}>tryharbor</strong> {parts[0]}</span>
      </div>
    );
  }
  if (platform === 'linkedin') {
    const text = parts[0]!;
    const cut = text.length > 210;
    return (
      <div className="pv-stack2" style={{ gap: 8 }}>
        <span className="pv-row"><Avatar /><span className="pv-stack2"><strong style={{ fontWeight: 500 }}>Harbor</strong><span className="pv-sub">Now · Public</span></span></span>
        <span className="pv-pre">{cut ? <>{text.slice(0, 210)}<span className="pv-dim">… see more</span></> : text}</span>
      </div>
    );
  }
  return (
    <div className="pv-stack2" style={{ gap: 10 }}>
      {parts.map((p, i) => (
        <div key={i} className={`pv-tweet${i < parts.length - 1 ? ' threaded' : ''}`}>
          <Avatar />
          <span className="pv-stack2" style={{ minWidth: 0 }}>
            <span style={{ fontSize: 12 }}><strong style={{ fontWeight: 500 }}>Harbor</strong> <span className="pv-dim">@tryharbor</span></span>
            <span className="pv-pre">{p}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
