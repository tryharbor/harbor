'use client';

import { useActionState, useEffect, useState } from 'react';
import { applyVoice, learnVoice, type LearnState } from '../actions';
import type { BrandVoice } from '../api';
import { VOICE_PERSONALITIES, voiceStrength } from './voice-samples';
import { NEUTRAL, VoiceMixer, applyMix, mixFromPicks, type Mix } from './voice-mixer';

/** Learning is quick on the built-in model; a short staged reveal shows what it's doing rather than flashing the result. */
const MIN_REVEAL_MS = 1600;
const STAGES = { pick: ['Reading your picks', 'Finding sentence patterns', 'Writing values and rules', 'Applying your mix'], paste: ['Reading your posts', 'Finding sentence patterns', 'Picking verbatim excerpts', 'Writing values and rules'], dials: ['Reading the dials', 'Writing values and rules'] } as const;

/**
 * Voice creation, easiest path first: pick sample posts that sound like the brand (no writing needed), or paste
 * real posts, or import them from a connected account. Harbor proposes a voice (personality → values → do/avoid →
 * excerpts → sources); nothing is saved until "Use this voice".
 */
export function VoiceLearner({ brandId, returnTo, savedExampleChars, skipHref, importHref }: { brandId: string; returnTo: string; savedExampleChars: number; skipHref?: string; importHref?: string }) {
  const [state, action, pending] = useActionState<LearnState, FormData>(learnVoice, undefined);
  const [mode, setMode] = useState<'pick' | 'paste' | 'import'>('pick');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pasted, setPasted] = useState('');
  const toggle = (t: string) => setPicked((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  // Dials follow the picks until the owner moves one themselves.
  const [mix, setMix] = useState<Mix>(NEUTRAL);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setMix(mixFromPicks(picked)); }, [picked, touched]);
  // Staged reveal: `run` marks when generating started and from which path; the proposal shows once the
  // result is in and the stages have had time to play.
  const [run, setRun] = useState<{ kind: 'pick' | 'paste' | 'dials'; at: number } | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(t);
  }, [run]);
  const elapsed = run ? Math.max(0, now - run.at) : 0;
  const resultReady = run?.kind === 'dials' || (!pending && !!state?.voice);
  const revealed = !!run && resultReady && elapsed >= MIN_REVEAL_MS;
  const generating = !!run && !revealed && !state?.error;
  const stages = run ? STAGES[run.kind] : [];
  const stageIndex = Math.min(stages.length - 1, Math.floor((elapsed / MIN_REVEAL_MS) * stages.length));

  const pastedPosts = pasted.split(/^\s*---\s*$/m).map((t) => t.trim()).filter(Boolean);
  const usingSaved = mode === 'paste' && pastedPosts.length === 0;
  const examples = mode === 'pick' ? [...picked] : pastedPosts;
  // Count the way the API does: each post trimmed, separators excluded.
  const chars = usingSaved ? savedExampleChars : examples.reduce((n, t) => n + t.length, 0);
  const strength = voiceStrength(chars);

  return (
    <div className="stack-lg">
      <form action={action} className="agent-panel" onSubmit={() => { const t = Date.now(); setRun({ kind: mode === 'pick' ? 'pick' : 'paste', at: t }); setNow(t); }}>
        <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />Learn the voice</span>
            <strong style={{ fontWeight: 500 }}>Show Harbor how this brand sounds</strong>
          </div>
          <nav className="segmented" aria-label="How to show the voice">
            <button type="button" aria-pressed={mode === 'pick'} onClick={() => setMode('pick')}>Pick posts</button>
            <button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>Paste your own</button>
            <button type="button" aria-pressed={mode === 'import'} onClick={() => setMode('import')}>Import</button>
          </nav>
        </div>
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="examples" value={usingSaved ? '' : examples.join('\n---\n')} />

        {mode === 'pick' ? (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Tick the posts that sound like something this brand would say. Mix and match: two or three is enough to start.</p>
            <div className="personalities">
              {VOICE_PERSONALITIES.map((p) => (
                <div key={p.key} className="personality">
                  <div className="stack" style={{ gap: 2 }}>
                    <strong style={{ fontWeight: 500 }}>{p.name}</strong>
                    <span className="small dim">{p.feel}</span>
                  </div>
                  {p.posts.map((t) => (
                    <label key={t} className={`sample-post${picked.has(t) ? ' on' : ''}`}>
                      <input type="checkbox" checked={picked.has(t)} onChange={() => toggle(t)} />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <VoiceMixer mix={mix} onChange={(m) => { setTouched(true); setMix(m); }} picksCount={picked.size} />
          </div>
        ) : mode === 'paste' ? (
          <div className="field">
            <label htmlFor="examples-text">Paste a few real posts, separated by a line with only <code>---</code>.{savedExampleChars ? ' Leave it empty to use the saved example posts.' : ''}</label>
            <textarea id="examples-text" value={pasted} onChange={(e) => setPasted(e.target.value)} style={{ minHeight: 180 }} placeholder={'Every Monday I used to open Notion…\n---\nShipped: …'} />
          </div>
        ) : (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Already posting? Connect an account, import your past posts, and Harbor learns the voice from the ones that actually performed (the voice refresh). It keeps refining from every new post.</p>
            {importHref ? <div><a className="button" href={importHref}>Connect and import</a></div> : null}
          </div>
        )}

        {mode !== 'import' ? (
          <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span className="row small" style={{ gap: 10 }}>
              <span className="meter" aria-hidden="true"><i style={{ width: `${Math.max(4, strength.pct)}%` }} className={strength.ok ? '' : 'low'} /></span>
              <span><strong style={{ fontWeight: 500 }}>{strength.label}</strong> <span className="dim">{usingSaved ? `· ${savedExampleChars.toLocaleString('en-US')} characters in saved examples` : mode === 'pick' ? `· ${picked.size} picked` : `· ${chars.toLocaleString('en-US')} characters`}</span></span>
            </span>
            <span className="row" style={{ gap: 6 }}>
              {skipHref ? <a className="button" href={skipHref}>Skip for now</a> : null}
              {mode === 'pick' && !strength.ok ? (
                <button type="button" onClick={() => { const t = Date.now(); setRun({ kind: 'dials', at: t }); setNow(t); }} disabled={generating}>Use the dials only</button>
              ) : null}
              <button className="primary" type="submit" disabled={generating || pending || !strength.ok}>{generating ? 'Learning…' : 'Learn the voice'}</button>
            </span>
          </div>
        ) : skipHref ? <div><a className="button" href={skipHref}>Skip for now</a></div> : null}
        <span className="dim small" title="Harbor runs on its built-in model while you set things up, so learning a voice costs nothing.">Proposes a voice; nothing is saved until you choose to use it. Free to run.</span>
        {state?.error ? <p className="error" role="alert">{state.error}</p> : null}
        {generating ? (
          <ol className="gen-stages" role="status" aria-live="polite">
            {stages.map((label, i) => (
              <li key={label} className={i < stageIndex ? 'done' : i === stageIndex ? 'active' : undefined}>
                <span className="mono" aria-hidden="true">{i < stageIndex ? '✓' : i === stageIndex ? '…' : '·'}</span>{label}
              </li>
            ))}
          </ol>
        ) : null}
      </form>

      {revealed && run?.kind === 'dials' ? <VoiceProposal voice={applyMix(mix)} model="voice mixer" brandId={brandId} returnTo={returnTo} examples="" /> : null}
      {revealed && run?.kind !== 'dials' && state?.voice ? (
        <VoiceProposal voice={run?.kind === 'pick' ? applyMix(mix, fromSamples(state.voice, picked)) : state.voice} model={state.run?.model} brandId={brandId} returnTo={returnTo} examples={run?.kind === 'paste' ? state.examples ?? '' : ''} />
      ) : null}
    </div>
  );
}

/**
 * A voice learned from Harbor's sample posts keeps the style (personality, values, do/avoid) but not the samples'
 * content: no verbatim excerpts (their facts aren't this brand's) and no "core topics" rule drawn from them.
 */
function fromSamples(voice: BrandVoice, picked: Set<string>): BrandVoice {
  const names = VOICE_PERSONALITIES.filter((p) => p.posts.some((t) => picked.has(t))).map((p) => p.name);
  return {
    ...voice,
    summary: voice.summary.replace(/\s*Recurring words:[^.]*\./i, '').trim(),
    excerpts: [],
    do: voice.do.filter((d) => !/core topics/i.test(d)),
    sources: names.map((n) => ({ kind: 'example' as const, label: `Sample style: ${n}` })),
  };
}

function VoiceProposal({ voice, model, brandId, returnTo, examples }: { voice: BrandVoice; model?: string; brandId: string; returnTo: string; examples: string }) {
  return (
    <form action={applyVoice} className="preview-card staging reveal" style={{ position: 'static' }}>
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="voice" value={JSON.stringify(voice)} />
      <input type="hidden" name="examples" value={examples} />
      <div className="spread">
        <span className="label">Proposed voice</span>
        {model?.startsWith('simulated') ? <span className="tag" title="Made by Harbor's built-in model: free to run.">Built-in model</span> : model ? <span className="tag">{model}</span> : null}
      </div>
      <div className="kv"><span className="label">Personality</span><p>{voice.summary}</p></div>
      {voice.values.length ? (
        <div className="kv">
          <span className="label">Values</span>
          <ul className="list">{voice.values.map((v) => <li key={v.name}><strong style={{ fontWeight: 500 }}>{v.name}</strong><span className="muted small">{v.meaning}</span></li>)}</ul>
        </div>
      ) : null}
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="kv"><span className="label">Do</span><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{voice.do.map((d) => <li key={d}>{d}</li>)}</ul></div>
        <div className="kv"><span className="label">Avoid</span><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{voice.avoid.map((d) => <li key={d}>{d}</li>)}</ul></div>
      </div>
      {voice.excerpts.length ? (
        <div className="kv"><span className="label">Excerpts (verbatim)</span><div className="stack">{voice.excerpts.map((e) => <p key={e.text} className="excerpt">{e.text}</p>)}</div></div>
      ) : null}
      <div className="kv"><span className="label">Learned from</span><div className="chips">{voice.sources.map((s, i) => <span key={i} className="chip">{s.label}</span>)}</div></div>
      <div className="row">
        <button className="primary" type="submit">Use this voice</button>
        {examples ? <label className="row small"><input type="checkbox" name="keepExamples" defaultChecked style={{ width: 'auto' }} /> Also save the pasted posts as examples</label> : null}
      </div>
    </form>
  );
}
