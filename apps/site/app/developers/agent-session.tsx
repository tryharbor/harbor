'use client';

import { useEffect, useState } from 'react';
import { useInView, useReducedMotion } from '../../components/reveal';

/**
 * A Claude Code session against Harbor's MCP server, played line by line once it's on screen. The tool names and
 * result summaries follow apps/api/src/services/mcp.ts; every result ends with the mode Harbor is running in.
 */

type Line =
  | { kind: 'shell'; text: string }
  | { kind: 'prompt'; text: string }
  | { kind: 'say'; text: string }
  | { kind: 'tool'; name: string; args: string; result: string; scope: 'read' | 'write' }
  | { kind: 'done'; text: string };

const MODE = '(sandbox · simulated model)';
const LINES: Line[] = [
  { kind: 'shell', text: 'claude' },
  { kind: 'prompt', text: 'Plan next week for Tidewater Coffee on Instagram and Threads. Don’t post anything.' },
  { kind: 'tool', name: 'list_brands', args: '', result: `2 brands ${MODE}`, scope: 'read' },
  { kind: 'tool', name: 'get_brand_memory', args: 'brandId: "brd_tide…"', result: `Brand Memory for Tidewater Coffee ${MODE}`, scope: 'read' },
  { kind: 'tool', name: 'best_times', args: 'platform: "instagram"', result: `Best times for Tidewater Coffee on instagram ${MODE}`, scope: 'read' },
  { kind: 'say', text: 'Sunday 7pm is the strongest Instagram slot. Running the weekly plan.' },
  { kind: 'tool', name: 'run_agent', args: 'agentId: "weekly_plan", inputs: { brandId, platforms }', result: `weekly_plan succeeded: Planned 6 posts across Instagram, Threads; 6 waiting for approval. ${MODE}`, scope: 'write' },
  { kind: 'tool', name: 'list_approvals', args: 'status: "pending"', result: `6 pending, 0 approved, 0 rejected ${MODE}`, scope: 'read' },
  { kind: 'done', text: 'Six posts are waiting in Harbor’s Approvals. Nothing was published or scheduled.' },
];

export function AgentSession() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const [run, setRun] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => { if (inView) setStarted(true); }, [inView]);
  useEffect(() => {
    if (!started || reduced) return;
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= LINES.length) clearInterval(id);
    }, 720);
    return () => clearInterval(id);
  }, [started, reduced, run]);
  const shown = reduced ? LINES.length : n;
  const finished = shown >= LINES.length;

  return (
    <div ref={ref} className="terminal dev-session">
      <div className="window-bar" style={{ background: 'var(--raised)', color: 'var(--dim)', borderColor: 'var(--line)' }}>
        <i /><i /><i /><span className="grow">claude · harbor mcp</span>
        <button type="button" className="dev-replay" onClick={() => setRun((r) => r + 1)} disabled={!finished || reduced} aria-label="Replay the session">{finished && !reduced ? 'Replay' : ''}</button>
      </div>
      <div className="dev-session-body" aria-live="off">
        {LINES.map((l, i) => {
          const visible = i < shown;
          const cls = `dev-line ${l.kind}${visible ? ' in' : ''}`;
          if (l.kind === 'shell') return <div key={i} className={cls}><span className="dev-sym">$</span>{l.text}</div>;
          if (l.kind === 'prompt') return <div key={i} className={cls}><span className="dev-sym">&gt;</span><span>{l.text}</span></div>;
          if (l.kind === 'say') return <div key={i} className={cls}><span className="dev-sym">·</span><span>{l.text}</span></div>;
          if (l.kind === 'done') return <div key={i} className={cls}><span className="dev-sym">✓</span><span>{l.text}</span></div>;
          return (
            <div key={i} className={cls}>
              <span className={`dev-sym ${l.scope}`}>{visible ? '●' : '○'}</span>
              <span className="dev-tool">
                <span><strong>{l.name}</strong>{l.args ? <span className="dim"> {'{'} {l.args} {'}'}</span> : null}<span className={`dev-scope ${l.scope}`}>{l.scope}</span></span>
                <span className="dev-result">⎿ {l.result}</span>
              </span>
            </div>
          );
        })}
        <div className={`dev-cursor${finished ? ' idle' : ''}`} aria-hidden="true" />
      </div>
    </div>
  );
}
