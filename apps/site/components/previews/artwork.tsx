/**
 * Demo images for previews, drawn as SVG in the pixel-key palette (like the app's seeded media library). Every
 * crop is the same drawing with a different viewBox, so crops stay sharp at any size.
 */
export const ART_W = 1600;
export const ART_H = 1000;

const PALETTES = [
  ['var(--pink)', 'var(--violet)', 'var(--coral)', 'var(--amber)'],
  ['var(--coral)', 'var(--amber)', 'var(--violet)', 'var(--pink)'],
  ['var(--violet)', 'var(--pink)', 'var(--amber)', 'var(--coral)'],
  ['var(--amber)', 'var(--coral)', 'var(--pink)', 'var(--violet)'],
];
const MARK = ['M0 0H16L32 16V32H16L0 16Z', 'M32 0H48L64 16V32H48L32 16Z', 'M0 32H16L32 48V64H16L0 48Z', 'M32 32H48L64 48V64H48L32 48Z'];

/** Where the subjects sit (in artwork pixels), for focal-point demos. */
export const SUBJECTS = { mark: { x: 452, y: 452 }, sun: { x: 1240, y: 330 } };

export function Artwork({ box = { x: 0, y: 0, w: ART_W, h: ART_H }, variant = 0, label, className, style }: { box?: { x: number; y: number; w: number; h: number }; variant?: number; label?: string; className?: string; style?: React.CSSProperties }) {
  const pal = PALETTES[variant % PALETTES.length]!;
  const markX = variant % 2 ? 980 : 260;
  const sunX = variant % 2 ? 420 : 1240;
  return (
    <svg
      viewBox={`${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`}
      preserveAspectRatio="xMidYMid slice"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
    >
      <rect x="0" y="0" width={ART_W} height={ART_H} style={{ fill: 'color-mix(in oklab, var(--yellow) 16%, #ffffff)' }} />
      <rect x="0" y="660" width={ART_W} height={ART_H - 660} style={{ fill: `color-mix(in oklab, ${pal[1]} 26%, #ffffff)` }} />
      <rect x="0" y="800" width={ART_W} height={ART_H - 800} style={{ fill: `color-mix(in oklab, ${pal[1]} 44%, #ffffff)` }} />
      <circle cx={sunX} cy="330" r="150" style={{ fill: 'var(--yellow)' }} />
      <circle cx={sunX} cy="330" r="90" style={{ fill: 'color-mix(in oklab, var(--yellow) 60%, #ffffff)' }} />
      <g transform={`translate(${markX} 260) scale(6)`}>
        {MARK.map((d, i) => <path key={d} d={d} style={{ fill: pal[i] }} />)}
      </g>
      {[[120, 720], [700, 610], [760, 610], [1420, 700], [1480, 760], [1060, 880], [200, 900]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="48" height="48" style={{ fill: pal[i % 4] }} />
      ))}
    </svg>
  );
}

/** The crop a ratio takes from the artwork around a focal point (0–1), clamped to the image: mirrors the API. */
export function cropBox(ratio: number, fx: number, fy: number) {
  const src = ART_W / ART_H;
  const w = src > ratio ? ART_H * ratio : ART_W;
  const h = src > ratio ? ART_H : ART_W / ratio;
  const x = Math.max(0, Math.min(ART_W - w, fx * ART_W - w / 2));
  const y = Math.max(0, Math.min(ART_H - h, fy * ART_H - h / 2));
  return { x, y, w, h };
}
