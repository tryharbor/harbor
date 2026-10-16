'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Fades and lifts its children in the first time they scroll into view. Reduced motion: shown immediately (CSS). */
export function Reveal({ children, delay = 0, as: Tag = 'div', className }: { children: ReactNode; delay?: number; as?: 'div' | 'span' | 'li'; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={`reveal${inView ? ' in' : ''}${className ? ` ${className}` : ''}`} style={{ ['--delay' as string]: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** True once the element is on screen; for previews that start animating when seen. */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** Whether the visitor asked for reduced motion; previews then show their final state without looping. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}
