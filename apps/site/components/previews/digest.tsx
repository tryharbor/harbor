'use client';

import { PlatformIcon } from '../platform-icon';
import type { Platform } from '../../lib/site';
import { useSteps } from './motion';
import { arrive } from './reserve';

type Cite = { platform: Platform; text: string; ratio: number };
const SECTIONS: { title: string; finding: string; confidence: string; detail: string; cites: Cite[] }[] = [
  { title: 'What worked', finding: 'Number-first openers', confidence: 'High confidence', detail: '4 of the 5 posts that opened with a number beat the median.', cites: [{ platform: 'x', text: '3 weeks, 2 rewrites, 1 feature.', ratio: 2.4 }, { platform: 'linkedin', text: '4 minutes to set up a brand, down from 15.', ratio: 1.8 }] },
  { title: 'What didn’t', finding: 'Links in the first line', confidence: 'Medium confidence', detail: 'Both posts with a link up top came in under 0.7× the median.', cites: [{ platform: 'x', text: 'New changelog is up: harbor.example/changelog', ratio: 0.55 }] },
  { title: 'Patterns', finding: 'Weekday mornings carry the week', confidence: 'Medium confidence', detail: 'The 3 best posts all went out between 8 and 10am, Tuesday to Thursday.', cites: [{ platform: 'linkedin', text: 'Most founders with several products hit the same wall…', ratio: 1.4 }] },
  { title: 'Do next', finding: 'Repurpose the feature post', confidence: 'High confidence', detail: 'It did 2.4× on X and hasn’t run anywhere else. Draft it for LinkedIn and Threads.', cites: [{ platform: 'x', text: '3 weeks, 2 rewrites, 1 feature.', ratio: 2.4 }] },
];

/** The weekly digest: wins, misses, patterns and next steps, each citing the posts behind it. Sections arrive in order. */
export function DigestPreview() {
  const { ref, step } = useSteps<HTMLDivElement>(SECTIONS.length + 2, 1000, { loop: false, final: SECTIONS.length + 1 });
  const shown = Math.max(0, step - 1);

  return (
    <div ref={ref} className="pv" style={{ minHeight: 560 }}>
      <div className="pv-head">
        <div className="pv-stack2"><span className="a-label pv-row"><span className="pixels" style={{ width: 20, height: 4 }} />Weekly digest · Harbor</span><span className="pv-sub">Oct 12 – Oct 18 · simulated model</span></div>
        <span className={`a-btn${step === 0 ? ' pressed' : ''}`}>Rewrite digest</span>
      </div>
      <strong style={{ fontWeight: 400, fontSize: 20, letterSpacing: '-0.025em', lineHeight: 1.2 }}>Number-first openers beat the median again. Links up top keep missing.</strong>
      <div className="pv-stats">
        <div><span className="a-label">Published</span><strong>9</strong></div>
        <div><span className="a-label">Median · 24h</span><strong>2.9K</strong></div>
        <div><span className="a-label">Vs. last period</span><strong>+22%</strong></div>
      </div>
      {/* Every section is laid out from the start and fades in, in order. */}
      {SECTIONS.map((s, i) => (
        <div key={s.title} className={`pv-finding ${arrive(i < shown)}`}>
          <span className="a-label">{s.title}</span>
          <span className="pv-head" style={{ alignItems: 'baseline' }}><strong style={{ fontWeight: 500 }}>{s.finding}</strong><span className="pv-sub">{s.confidence}</span></span>
          <span className="pv-sub">{s.detail}</span>
          {s.cites.map((c) => (
            <span key={c.text + s.title} className="pv-ev-row">
              <PlatformIcon platform={c.platform} size={11} />
              <span className="pv-ellipsis">{c.text}</span>
              <span className={`pv-verdict ${c.ratio >= 1.3 ? 'up' : c.ratio < 0.7 ? 'down' : 'met'}`}>{c.ratio >= 1 ? '↑' : '↓'} {c.ratio.toFixed(1)}×</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
