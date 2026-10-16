'use client';

import { useActionState, useState } from 'react';
import { applyVoice, learnVoice, type LearnState } from '../actions';
import type { BrandVoice } from '../api';

/**
 * Jasper-style voice creation: paste examples (or use saved example posts), get a proposed voice
 * (personality → values → do/avoid → verbatim excerpts → sources), then apply it. Nothing is saved
 * until "Use this voice".
 */
export function VoiceLearner({ brandId, returnTo, savedExampleChars }: { brandId: string; returnTo: string; savedExampleChars: number }) {
  const [state, action, pending] = useActionState<LearnState, FormData>(learnVoice, undefined);
  const [examples, setExamples] = useState('');
  // Count the way the API does: each post trimmed, separators excluded.
  const chars = examples.split(/^\s*---\s*$/m).map((t) => t.trim()).filter(Boolean).reduce((n, t) => n + t.length, 0);
  const usingSaved = chars === 0;
  const enough = usingSaved ? savedExampleChars >= 1000 : chars >= 1000;

  return (
    <div className="stack-lg">
      <form action={action} className="agent-panel">
        <div className="spread">
          <div className="stack" style={{ gap: 4 }}>
            <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />Agent · Learn the voice</span>
            <strong style={{ fontWeight: 500 }}>Show Harbor how this brand writes</strong>
          </div>
          <span className="tag">Simulated · no spend</span>
        </div>
        <input type="hidden" name="brandId" value={brandId} />
        <div className="field">
          <label htmlFor="examples">Paste 3 or more real posts, separated by a line with only <code>---</code>. Leave empty to use the saved example posts.</label>
          <textarea id="examples" name="examples" value={examples} onChange={(e) => setExamples(e.target.value)} style={{ minHeight: 180 }} placeholder={'Every Monday I used to open Notion…\n---\nShipped: …'} />
          <span className={`char-count${enough ? '' : ' over'}`}>
            {usingSaved ? `${savedExampleChars.toLocaleString('en-US')} characters in saved examples` : `${chars.toLocaleString('en-US')} characters`} · 1,000 minimum {enough ? '✓' : ''}
          </span>
        </div>
        <div className="row">
          <button className="primary" type="submit" disabled={pending || !enough}>{pending ? 'Learning…' : 'Learn the voice'}</button>
          <span className="dim small">Proposes a voice; nothing is saved until you apply it.</span>
        </div>
        {state?.error ? <p className="error" role="alert">{state.error}</p> : null}
      </form>

      {state?.voice ? <VoiceProposal voice={state.voice} model={state.run?.model} brandId={brandId} returnTo={returnTo} examples={state.examples ?? ''} /> : null}
    </div>
  );
}

function VoiceProposal({ voice, model, brandId, returnTo, examples }: { voice: BrandVoice; model?: string; brandId: string; returnTo: string; examples: string }) {
  return (
    <form action={applyVoice} className="preview-card staging" style={{ position: 'static' }}>
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="voice" value={JSON.stringify(voice)} />
      <input type="hidden" name="examples" value={examples} />
      <div className="spread">
        <span className="label">Proposed voice</span>
        <span className="tag">{model ?? 'simulated'}</span>
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
