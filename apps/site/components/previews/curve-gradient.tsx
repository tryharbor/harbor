/** The growth curve's stroke: the pixel gradient from early (pink) to mature (yellow), per docs/design/DESIGN.md. */
export function CurveGradient({ id, x1, x2 }: { id: string; x1: number; x2: number }) {
  return (
    <linearGradient id={id} x1={x1} x2={x2} y1="0" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" style={{ stopColor: 'var(--stage-idea)' }} />
      <stop offset="35%" style={{ stopColor: 'var(--stage-drafting)' }} />
      <stop offset="65%" style={{ stopColor: 'var(--stage-approved)' }} />
      <stop offset="100%" style={{ stopColor: 'var(--stage-live)' }} />
    </linearGradient>
  );
}
