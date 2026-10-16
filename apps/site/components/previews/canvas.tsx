'use client';

import type { ReactNode } from 'react';
import { PlatformIcon } from '../platform-icon';
import type { Platform } from '../../lib/site';
import { useFitScale, useSteps } from './motion';
import { Cell, Layer, Reserve, arrive } from './reserve';

/*
 * Geometry is computed, not guessed: every card has the same size, frames share one height, and edges run from the
 * centre of one handle to the centre of the next, turning in the gutter between frames.
 */
const W = 1060, H = 540;
const FRAME_W = 240, FRAME_GAP = 28, FRAME_X0 = 272, FRAME_Y = 20, PAD = 14, HEAD = 40;
const CARD_W = FRAME_W - PAD * 2, CARD_H = 92, CARD_GAP = 14;
const FRAME_H = HEAD + 3 * CARD_H + 2 * CARD_GAP + PAD;
const frameX = (col: number) => FRAME_X0 + col * (FRAME_W + FRAME_GAP);
const card = (col: number, row: number) => ({ x: frameX(col) + PAD, y: FRAME_Y + HEAD + row * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H });
type Box = ReturnType<typeof card>;

const FRAMES = ['Evidence', 'Ideas', 'Drafts'];
const C = { post: card(0, 0), signal: card(0, 1), note: card(0, 2), idea: card(1, 0), idea2: card(1, 1), dx: card(2, 0), dli: card(2, 1) };

/** Right-handle centre to left-handle centre, turning (with small rounded corners) in the gutter between frames. */
function edge(a: Box, b: Box) {
  const sx = a.x + a.w, sy = a.y + a.h / 2, tx = b.x, ty = b.y + b.h / 2;
  const turn = sx + (tx - sx) / 2;
  if (sy === ty) return `M${sx} ${sy} H${tx}`;
  const r = Math.min(6, Math.abs(ty - sy) / 2);
  const dir = ty > sy ? 1 : -1;
  return `M${sx} ${sy} H${turn - r} Q${turn} ${sy} ${turn} ${sy + r * dir} V${ty - r * dir} Q${turn} ${ty} ${turn + r} ${ty} H${tx}`;
}
const EDGES = [
  { d: edge(C.post, C.idea), at: 1 },
  { d: edge(C.signal, C.idea), at: 2 },
  { d: edge(C.note, C.idea), at: 3 },
  { d: edge(C.idea, C.dx), at: 8 },
  { d: edge(C.idea, C.dli), at: 9 },
];

type Kind = 'idea' | 'draft' | 'post' | 'signal' | 'note';
type CardData = { kind: Kind; label: ReactNode; body: ReactNode; strong?: boolean; foot: ReactNode; right?: ReactNode };
const POST: CardData = { kind: 'post', label: <><PlatformIcon platform="x" size={10} /> Post · X</>, body: '3 weeks, 2 rewrites, 1 feature. It does one thing, and it does it well.', foot: <><strong>6.9K</strong> views · <strong>212</strong> likes</>, right: 'Open →' };
const SIGNAL: CardData = { kind: 'signal', label: 'Signal · reply theme', body: '4 people asked how long a feature really takes', foot: 'From 2 posts', right: '' };
const NOTE: CardData = { kind: 'note', label: 'Note', body: 'Keep it under 5 posts if it turns into a thread.', foot: 'You', right: '' };
const IDEA: CardData = { kind: 'idea', label: 'Idea', strong: true, body: 'Ship small: the feature that took three weeks', foot: <span className="pv-cv-cite">Number openers did 1.7×</span>, right: 'Studio →' };
const IDEA2: CardData = { kind: 'idea', label: 'Idea', strong: true, body: 'How long a feature really takes: our last five, timed', foot: <span className="pv-cv-cite">4 replies asked</span>, right: 'Studio →' };
const draft = (platform: Platform, name: string, text: string): CardData => ({ kind: 'draft', label: <><PlatformIcon platform={platform} size={10} /> Draft · {name} · v1</>, body: text, foot: <>Simulated · {[...text].length} chars</>, right: 'Edit →' });
const DX = draft('x', 'X', '3 weeks, 2 rewrites, 1 feature. Here’s what I cut.');
const DLI = draft('linkedin', 'LinkedIn', 'Three weeks, two rewrites, one feature: the honest breakdown.');
const STATUSES = ['Connecting', 'Agent open', 'Drafting…', '1 draft added', '2 drafts added'];
const LINKED = ['post', 'signal', 'note'];
const connected = (n: number) => `Connected: ${LINKED.slice(0, n).join(', ')}`;

/**
 * The campaign canvas, animated: evidence gets connected to an idea, the agent panel opens and drafts the selected
 * idea with the connected cards as context, and the drafts land in their frame. Narrow widths get a stacked
 * version of the same board. Reduced motion: the finished board.
 */
export function CanvasPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(15, 750, { final: 11 });
  const fit = useFitScale<HTMLDivElement>(W);
  const scale = fit.scale;
  const selected = step >= 4;
  const panel = step >= 5;
  const busy = step === 7;
  const drafts = step >= 9 ? 2 : step >= 8 ? 1 : 0;
  const links = Math.min(3, step);

  return (
    <div ref={ref} className="pv-canvas-wrap">
      {/* Wide: the board, scaled to fit. */}
      <div ref={fit.ref} className="pv-canvas-fit">
        <div style={{ width: W * scale, height: H * scale }}>
          <div className="pv-canvas" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            {FRAMES.map((t, i) => (
              <div key={t} className="pv-cv-frame" style={{ left: frameX(i), top: FRAME_Y, width: FRAME_W, height: FRAME_H }}><span className="pv-cv-frame-title">{t}</span></div>
            ))}
            <svg className="pv-cv-edges" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
              {EDGES.map((e) => <path key={e.d} d={e.d} pathLength={1} className={step >= e.at ? 'on' : ''} />)}
            </svg>
            <Card box={C.post} c={POST} />
            <Card box={C.signal} c={SIGNAL} />
            <Card box={C.note} c={NOTE} />
            <Card box={C.idea} c={IDEA} selected={selected} />
            <Card box={C.idea2} c={IDEA2} />
            {drafts >= 1 ? <Card box={C.dx} c={DX} drop /> : null}
            {drafts >= 2 ? <Card box={C.dli} c={DLI} drop /> : null}

            <aside className={`pv-cv-panel${panel ? ' open' : ''}`} aria-hidden={!panel}>
              <div className="pv-head"><span className="a-label pv-row"><span className="pixels" style={{ width: 20, height: 4 }} />Agent</span><span className="pv-tag">Simulated · no spend</span></div>
              <div className="pv-stack2" style={{ gap: 6 }}>
                <span className="a-label">Context</span>
                <span className="pv-chips"><span className="pv-chip on">Voice</span><span className="pv-chip on">Serial builders</span><span className="pv-chip on">Harbor</span></span>
                <span className="pv-sub">1 card selected</span>
              </div>
              <div className="pv-cv-step"><strong style={{ fontWeight: 500 }}>Suggest ideas</strong><span className="pv-sub">Into the Ideas frame</span></div>
              <div className={`pv-cv-step${panel ? ' lit' : ''}`}>
                <strong style={{ fontWeight: 500 }}>Draft the selected idea</strong>
                <span className="pv-sub">Ship small: the feature that took three weeks</span>
                <span className="pv-row" style={{ gap: 6 }}>
                  {(['x', 'linkedin'] as const).map((p) => <span key={p} className="pv-pickbox"><span className="pv-box sm" aria-hidden="true">✓</span><PlatformIcon platform={p} size={10} />{p === 'x' ? 'X' : 'LinkedIn'}</span>)}
                </span>
                <span className="pv-sub">Uses 3 connected cards: post, signal, note.</span>
                <span><span className={`a-btn primary${step === 6 ? ' pressed' : ''}`}>{busy ? 'Drafting…' : 'Draft'}</span></span>
              </div>
              <div className="pv-cv-step"><strong style={{ fontWeight: 500 }}>Bring in evidence</strong><span className="pv-row" style={{ gap: 6 }}><span className="a-btn">Add top posts</span><span className="a-btn">Add signals</span></span></div>
            </aside>

            {drafts >= 2 && step < 14 ? <div className="pv-cv-status pv-in" style={{ left: frameX(0), top: FRAME_Y + FRAME_H + 14 }}>Draft: added 2 cards · simulated</div> : null}
            <div className="pv-cv-dock" aria-hidden="true">
              <span className={panel ? 'on' : ''}>Agent</span><span>+ Note</span><span>+ Idea</span><span>+ Frame</span><span>Library</span><span>Fit</span>
              <i />
              <span className="pv-cv-seg"><span className="on">Board</span><span>Table</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Narrow: the same board, stacked frame by frame. */}
      <div className="pv-cv-stacked">
        <div className="pv-head"><span className="a-label">Campaign · Board</span><span className={`a-pill ${drafts ? 'good' : panel ? 'run' : ''}`}><Reserve all={STATUSES}>{drafts ? `${drafts} draft${drafts > 1 ? 's' : ''} added` : panel ? (busy ? 'Drafting…' : 'Agent open') : 'Connecting'}</Reserve></span></div>
        <section className="pv-cv-sframe">
          <span className="a-label">Evidence</span>
          {[POST, SIGNAL, NOTE].map((c, i) => <StackCard key={i} c={c} linked={i < links} />)}
        </section>
        <section className="pv-cv-sframe">
          <span className="a-label">Ideas</span>
          <StackCard c={IDEA} selected={selected} note={links} />
          <StackCard c={IDEA2} />
        </section>
        <section className="pv-cv-sframe">
          <span className="a-label">Drafts</span>
          {/* The drafts' places are kept from the start; the placeholder sits in the same cell until they land. */}
          <Cell style={{ alignItems: 'start' }}>
            <Layer on={!drafts}><span className="pv-sub">The agent drafts the selected idea here, using its connected cards.</span></Layer>
            <div className="pv-stack2" style={{ gap: 8 }}>
              <StackCard c={DX} shown={drafts >= 1} />
              <StackCard c={DLI} shown={drafts >= 2} />
            </div>
          </Cell>
        </section>
      </div>
    </div>
  );
}

function Inner({ c }: { c: CardData }) {
  return (
    <>
      <span className="pv-cv-kind">{c.label}</span>
      <span className={`pv-cv-body${c.strong ? ' strong' : ''}`}>{c.body}</span>
      <span className="pv-cv-foot"><span className="pv-cv-foot-l">{c.foot}</span>{c.right ? <span>{c.right}</span> : null}</span>
    </>
  );
}

function Card({ box, c, selected = false, drop = false }: { box: Box; c: CardData; selected?: boolean; drop?: boolean }) {
  return (
    <div className={`pv-cv-card k-${c.kind}${selected ? ' selected' : ''}${drop ? ' drop' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      <i className="pv-cv-handle l" /><i className="pv-cv-handle r" />
      <Inner c={c} />
    </div>
  );
}

/** A card in the stacked board. `shown: false` keeps its place but hides it until it lands; `note` reserves the connected line. */
function StackCard({ c, selected = false, shown, linked = false, note }: { c: CardData; selected?: boolean; shown?: boolean; linked?: boolean; note?: number }) {
  return (
    <div className={`pv-cv-card static k-${c.kind}${selected ? ' selected' : ''}${linked ? ' linked' : ''}${shown === undefined ? '' : ` ${arrive(shown, true)}`}`}>
      <Inner c={c} />
      {note !== undefined ? <Reserve all={LINKED.map((_, n) => connected(n + 1))} className={`pv-sub pv-fade${note ? '' : ' off'}`}>{connected(Math.max(1, note))}</Reserve> : null}
    </div>
  );
}
