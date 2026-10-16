'use client';

import { PlatformIcon } from '../platform-icon';
import { Mark } from '../ui';
import { Artwork, cropBox } from './artwork';
import { useSteps } from './motion';
import { arrive } from './reserve';

const PARTS = [
  '3 weeks, 2 rewrites, 1 feature. A thread on what I cut.',
  'Cut 1: settings. Every option I removed was one fewer thing to explain.',
  'Cut 2: the second chart. One curve against your own median says more than four totals.',
];
const SLIDES = [0, 1, 2, 3].map((v) => ({ v, box: cropBox(4 / 5, [0.28, 0.72, 0.5, 0.3][v]!, 0.5) }));

/** A thread on X, part by part with its own counts, and an Instagram carousel at its 4:5 crop. */
export function ThreadCarouselPreview() {
  const { ref, step, reduced } = useSteps<HTMLDivElement>(8, 1500, { final: 3 });
  const parts = reduced ? PARTS.length : Math.min(PARTS.length, step + 1);
  const slide = reduced ? 0 : step % SLIDES.length;

  return (
    <div ref={ref} className="pv" style={{ minHeight: 470 }}>
      <div className="pv-tc">
        <div className="pv-stack2" style={{ gap: 8 }}>
          <span className="a-label pv-row" style={{ gap: 6 }}><PlatformIcon platform="x" size={10} />Thread · {PARTS.map((p, i) => `${i + 1}: ${[...p].length}`).join(' · ')} / 280</span>
          <div className="pv-stack2" style={{ gap: 10 }}>
            {/* Every part is laid out from the start and fades in as the thread is written. */}
            {PARTS.map((p, i) => (
              <div key={p} className={`pv-tweet ${arrive(i < parts)}${i < parts - 1 ? ' threaded' : ''}`}>
                <span className="pv-avatar"><Mark size={11} /></span>
                <span className="pv-stack2" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12 }}><strong style={{ fontWeight: 500 }}>Harbor</strong> <span className="pv-dim">@tryharbor · {i + 1}/{PARTS.length}</span></span>
                  <span className="pv-pre">{p}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="pv-stack2" style={{ gap: 8 }}>
          <span className="a-label pv-row" style={{ gap: 6 }}><PlatformIcon platform="instagram" size={10} />Carousel · {SLIDES.length} images · 4:5</span>
          <div className="pv-carousel">
            <div className="pv-carousel-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
              {SLIDES.map((s) => <div key={s.v} className="pv-carousel-slide"><Artwork box={s.box} variant={s.v} /></div>)}
            </div>
            <span className="pv-carousel-count pv-mono">{slide + 1}/{SLIDES.length}</span>
          </div>
          <span className="pv-dots" aria-hidden="true">{SLIDES.map((s) => <i key={s.v} className={s.v === slide ? 'on' : ''} />)}</span>
          <span style={{ fontSize: 12 }}><strong style={{ fontWeight: 600 }}>tidewatercoffee</strong> Three roasts, one Sunday. Swipe for the cupping notes.</span>
        </div>
      </div>
    </div>
  );
}
