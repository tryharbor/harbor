'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from '../reveal';

/**
 * A step counter for previews, driven by requestAnimationFrame. It advances every `ms` while the preview is on
 * screen and wraps after `steps` (or stops on the last step with `loop: false`). Reduced motion: it sits on `final`
 * (the last step by default) and never moves.
 */
export function useSteps<T extends HTMLElement>(steps: number, ms: number, opts: { loop?: boolean; final?: number; threshold?: number } = {}) {
  const { ref, inView } = useInView<T>(opts.threshold ?? 0.25);
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const loop = opts.loop ?? true;
  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    let last = performance.now();
    let x = 0;
    setN(0);
    const tick = (now: number) => {
      if (now - last >= ms) {
        last = now;
        if (x + 1 < steps) x += 1;
        else if (loop) x = 0;
        else return;
        setN(x);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, steps, ms, loop]);
  return { ref, step: reduced ? (opts.final ?? steps - 1) : n, reduced, inView };
}

/** 0 → 1 over `ms` the first time the preview is seen (ease-out cubic). Reduced motion: 1 straight away. */
export function useProgress<T extends HTMLElement>(ms: number, threshold = 0.25) {
  const { ref, inView } = useInView<T>(threshold);
  const reduced = useReducedMotion();
  const [p, setP] = useState(0);
  const played = useRef(false);
  useEffect(() => {
    if (!inView || reduced || played.current) return;
    played.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setP(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, ms]);
  return { ref, p: reduced ? 1 : p, reduced, inView };
}

/** Scales a fixed-size stage down to fit its container (for previews that need a fixed layout, like the canvas). */
export function useFitScale<T extends HTMLElement>(width: number) {
  const ref = useRef<T>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setScale(Math.min(1, e.contentRect.width / width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return { ref, scale };
}
