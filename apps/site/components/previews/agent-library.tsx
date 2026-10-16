'use client';

import { useSteps } from './motion';
import { Reserve } from './reserve';

/** The five built-in agents as defined in apps/api/src/services/agents.ts. */
export const AGENTS = [
  { name: 'Weekly plan', cat: 'Plan', k: 'var(--violet)', tagline: 'Plan next week from what worked last week.', steps: ['Read last week', 'Find open slots', 'Suggest ideas', 'Draft every idea', 'Voice check', 'Queue for approval'], produces: ['Digest', 'Ideas', 'Drafts', 'Approvals'], runs: 'Run by hand · On a schedule', last: 'Automation · Mon 8:00 AM' },
  { name: 'Repurpose a winner', cat: 'Repurpose', k: 'var(--coral)', tagline: 'Turn a post that outperformed into posts for your other platforms.', steps: ['Read the winner', 'Turn it into an idea', 'Draft for other platforms', 'Voice check', 'Find open slots', 'Queue for approval'], produces: ['Ideas', 'Drafts', 'Approvals'], runs: 'Run by hand · When a post outperforms', last: 'Automation · Thu 2:14 PM' },
  { name: 'Voice check', cat: 'Review', k: 'var(--pink)', tagline: 'Check a draft against the brand voice and platform rules.', steps: ['Check the draft'], produces: ['Report'], runs: 'Run by hand', last: 'Studio · Wed 11:02 AM' },
  { name: 'Weekly digest', cat: 'Insights', k: 'var(--amber)', tagline: 'What worked, what missed, and what to do next week.', steps: ['Write the digest'], produces: ['Digest'], runs: 'Run by hand · On a schedule', last: 'You · Mon 7:58 AM' },
  { name: 'Voice refresh', cat: 'Review', k: 'var(--pink)', tagline: 'Learn the voice from what actually worked.', steps: ['Refresh verdicts', 'Compare winners and losers', 'Check the current rules', 'Draft the changes', 'Send for approval'], produces: ['Report', 'Approvals'], runs: 'Run by hand · On a schedule', last: 'Not run yet' },
];

/** The agent library: what each agent does, its steps, what it produces and how it runs. The weekly plan runs while you watch. */
export function AgentLibraryPreview() {
  const steps = AGENTS[0]!.steps.length;
  const { ref, step } = useSteps<HTMLDivElement>(steps + 3, 700, { final: steps + 2 });
  const running = step >= 1 && step <= steps;
  const at = step - 1;

  return (
    <div ref={ref} className="pv">
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label">Agents</span><strong className="pv-title">Agents that do the strategist’s homework</strong></div>
        <span className="pv-row"><span className="a-btn">Connect Claude (MCP)</span><span className="a-btn primary">Approvals · 6</span></span>
      </div>
      <div className="pv-agents">
        {AGENTS.map((a, i) => {
          const live = i === 0;
          return (
            <article key={a.name} className="a-card pv-agent pv-in" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="pv-head">
                <span className="a-label pv-row"><span className="pv-glyph" style={{ ['--k' as string]: a.k }} />{a.cat}</span>
                {i < 2 ? <span className="pv-tag solid">1 automation</span> : null}
              </div>
              <div className="pv-stack2">
                <strong style={{ fontWeight: 500, fontSize: 14 }}>{a.name}</strong>
                <span className="pv-sub">{a.tagline}</span>
              </div>
              <ol className="pv-agent-steps">
                {a.steps.map((s, n) => (
                  <li key={s} className={live && running ? (n < at ? 'done' : n === at ? 'on' : '') : ''}><Reserve all={[<b key="b">{s}</b>]}>{s}</Reserve></li>
                ))}
              </ol>
              <span className="pv-chips">{a.produces.map((p) => <span key={p} className="pv-chip">{p}</span>)}</span>
              <span className="pv-sub">{a.runs}</span>
              <div className="pv-head pv-agent-foot">
                {live ? (
                  <span className="pv-row" style={{ gap: 6 }}><span className={`a-pill ${running ? 'sched' : 'good'}`}><Reserve all={['Running', 'Done']}>{running ? 'Running' : 'Done'}</Reserve></span><Reserve all={['You · now', 'You · just now']} className="pv-sub">{running ? 'You · now' : 'You · just now'}</Reserve></span>
                ) : <span className="pv-sub">{a.last}</span>}
                <span className="pv-row" style={{ gap: 6 }}>{a.runs.includes('·') ? <span className="a-btn">Automate</span> : null}<span className={`a-btn primary${live && step === 1 ? ' pressed' : ''}`}>Run</span></span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
