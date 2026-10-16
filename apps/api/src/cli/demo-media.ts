import sharp from 'sharp';

/**
 * Demo images for the seed: abstract, brand-colored compositions drawn as SVG and rendered with sharp, so the media
 * library has real files without shipping any. Deterministic (seeded), in mixed aspect ratios so crops visibly
 * matter, each with its subject off-center and a focal point on it.
 */

export interface DemoImage {
  name: string;
  bytes: Buffer;
  type: 'image/png' | 'image/jpeg';
  alt: string;
  tags: string[];
  focal: { x: number; y: number };
}

/** Harbor's pixel-key palette. */
const HARBOR = ['#e05bb4', '#7c4ddb', '#f2734f', '#9a5200', '#cfa600'];
/** Tidewater: espresso, roast, caramel, crema, cream. */
const TIDEWATER = ['#3b2418', '#6f4a2e', '#a8713f', '#d9a86c', '#f1e2c8'];

/** mulberry32: a tiny seeded PRNG, so every seed run draws the same pictures. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Style = 'orbs' | 'pixels' | 'waves' | 'beans' | 'pour';

interface Spec {
  name: string;
  width: number;
  height: number;
  style: Style;
  /** Where the subject sits (0–1), which becomes the focal point. */
  focal: { x: number; y: number };
  alt: string;
  tags: string[];
}

function draw(spec: Spec, palette: string[], seed: number): string {
  const { width: w, height: h, focal } = spec;
  const r = rng(seed);
  const pick = () => palette[Math.floor(r() * palette.length)]!;
  const m = Math.min(w, h);
  const fx = focal.x * w;
  const fy = focal.y * h;
  const bgA = palette[palette.length - 1]!;
  const bgB = palette[Math.floor(palette.length / 2)]!;
  const shapes: string[] = [];

  if (spec.style === 'orbs') {
    for (let i = 0; i < 7; i++) {
      shapes.push(`<circle cx="${(r() * w).toFixed(0)}" cy="${(r() * h).toFixed(0)}" r="${(m * (0.06 + r() * 0.16)).toFixed(0)}" fill="${pick()}" opacity="0.55"/>`);
    }
    shapes.push(`<circle cx="${fx}" cy="${fy}" r="${m * 0.26}" fill="${palette[0]}"/>`);
    shapes.push(`<circle cx="${fx + m * 0.1}" cy="${fy - m * 0.08}" r="${m * 0.12}" fill="${palette[1]}" opacity="0.9"/>`);
  } else if (spec.style === 'pixels') {
    const cell = Math.round(m / 12);
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const d = Math.hypot(x - fx, y - fy) / m;
        if (r() > 0.25 + d * 0.9) shapes.push(`<rect x="${x}" y="${y}" width="${cell - 4}" height="${cell - 4}" fill="${pick()}"/>`);
      }
    }
  } else if (spec.style === 'waves') {
    for (let i = 0; i < 6; i++) {
      const y = h * (0.2 + i * 0.13);
      const amp = h * (0.05 + r() * 0.08);
      shapes.push(
        `<path d="M0 ${y} Q ${fx} ${y - amp * 2} ${w} ${y + amp} L ${w} ${h} L 0 ${h} Z" fill="${palette[i % palette.length]}" opacity="${(0.35 + i * 0.1).toFixed(2)}"/>`,
      );
    }
    shapes.push(`<circle cx="${fx}" cy="${fy}" r="${m * 0.12}" fill="${palette[0]}"/>`);
  } else if (spec.style === 'beans') {
    for (let i = 0; i < 14; i++) {
      const cx = i === 0 ? fx : r() * w;
      const cy = i === 0 ? fy : r() * h;
      const rx = m * (i === 0 ? 0.2 : 0.05 + r() * 0.06);
      const rot = (r() * 180).toFixed(0);
      shapes.push(
        `<g transform="rotate(${rot} ${cx.toFixed(0)} ${cy.toFixed(0)})"><ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${(rx * 0.68).toFixed(0)}" fill="${i === 0 ? palette[0] : pick()}"/>` +
          `<path d="M ${(cx - rx * 0.8).toFixed(0)} ${cy.toFixed(0)} Q ${cx.toFixed(0)} ${(cy - rx * 0.3).toFixed(0)} ${(cx + rx * 0.8).toFixed(0)} ${cy.toFixed(0)}" stroke="${palette[palette.length - 1]}" stroke-width="${Math.max(2, rx * 0.08).toFixed(0)}" fill="none"/></g>`,
      );
    }
  } else {
    // A pour-over: a cone over a cup, with a stream between them.
    const s = m * 0.35;
    shapes.push(`<polygon points="${fx - s},${fy - s} ${fx + s},${fy - s} ${fx + s * 0.25},${fy - s * 0.2} ${fx - s * 0.25},${fy - s * 0.2}" fill="${palette[2]}"/>`);
    shapes.push(`<rect x="${fx - s * 0.03}" y="${fy - s * 0.2}" width="${s * 0.06}" height="${s * 0.6}" fill="${palette[0]}"/>`);
    shapes.push(`<rect x="${fx - s * 0.5}" y="${fy + s * 0.4}" width="${s}" height="${s * 0.7}" rx="${s * 0.12}" fill="${palette[1]}"/>`);
    for (let i = 0; i < 5; i++) shapes.push(`<circle cx="${(r() * w).toFixed(0)}" cy="${(r() * h).toFixed(0)}" r="${(m * 0.04).toFixed(0)}" fill="${pick()}" opacity="0.5"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}" stop-opacity="0.55"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${shapes.join('\n  ')}
</svg>`;
}

const HARBOR_SPECS: Spec[] = [
  { name: 'launch-orbs.png', width: 2000, height: 1000, style: 'orbs', focal: { x: 0.7, y: 0.45 }, alt: 'Pink and violet circles on a cream background', tags: ['launch', 'product'] },
  { name: 'pixel-key.png', width: 1080, height: 1080, style: 'pixels', focal: { x: 0.35, y: 0.4 }, alt: 'A cluster of pixel squares in pink, violet, coral, amber and yellow', tags: ['product', 'brand'] },
  { name: 'growth-curve.png', width: 1600, height: 900, style: 'waves', focal: { x: 0.62, y: 0.38 }, alt: 'Layered waves rising to the right, like a growth curve', tags: ['growth-curve', 'build-log'] },
  { name: 'build-log-tall.png', width: 1080, height: 1350, style: 'pixels', focal: { x: 0.5, y: 0.3 }, alt: 'Pixel blocks gathered near the top of a tall frame', tags: ['build-log', 'behind-the-scenes'] },
  { name: 'monday-calendar.png', width: 1200, height: 1600, style: 'orbs', focal: { x: 0.4, y: 0.62 }, alt: 'Overlapping coral and amber circles low in a tall frame', tags: ['behind-the-scenes'] },
  { name: 'launch-wide.png', width: 2400, height: 1000, style: 'waves', focal: { x: 0.25, y: 0.5 }, alt: 'Wide bands of color with a pink sun on the left', tags: ['launch'] },
  { name: 'dashboard-square.png', width: 1200, height: 1200, style: 'waves', focal: { x: 0.5, y: 0.55 }, alt: 'Stacked color bands under a pink dot', tags: ['product', 'growth-curve'] },
  { name: 'story-pixels.png', width: 1080, height: 1920, style: 'pixels', focal: { x: 0.55, y: 0.45 }, alt: 'A tall column of pixel squares', tags: ['launch', 'brand'] },
  { name: 'open-source.png', width: 1500, height: 1000, style: 'orbs', focal: { x: 0.3, y: 0.5 }, alt: 'A violet circle beside a large pink one', tags: ['open-source', 'product'] },
];

const TIDEWATER_SPECS: Spec[] = [
  { name: 'batch-41-beans.jpg', width: 1600, height: 1200, style: 'beans', focal: { x: 0.6, y: 0.45 }, alt: 'Roasted coffee beans scattered on a cream table', tags: ['roast', 'product'] },
  { name: 'cupping-table.jpg', width: 2000, height: 1000, style: 'orbs', focal: { x: 0.3, y: 0.55 }, alt: 'Cupping bowls seen from above in caramel and espresso tones', tags: ['cupping', 'behind-the-scenes'] },
  { name: 'pour-over.jpg', width: 1080, height: 1350, style: 'pour', focal: { x: 0.5, y: 0.45 }, alt: 'A pour-over cone dripping into a cup', tags: ['brew-guide', 'product'] },
  { name: 'roaster-morning.jpg', width: 1200, height: 1600, style: 'waves', focal: { x: 0.45, y: 0.35 }, alt: 'Warm light over the roaster, in browns and cream', tags: ['roast', 'behind-the-scenes'] },
  { name: 'beans-square.jpg', width: 1080, height: 1080, style: 'beans', focal: { x: 0.4, y: 0.6 }, alt: 'A single large coffee bean among smaller ones', tags: ['roast'] },
  { name: 'farm-huila.jpg', width: 1800, height: 1000, style: 'waves', focal: { x: 0.7, y: 0.4 }, alt: 'Rolling hills at the Gómez farm in Huila, in coffee tones', tags: ['farm', 'cupping'] },
  { name: 'brew-along.jpg', width: 1080, height: 1920, style: 'pour', focal: { x: 0.5, y: 0.5 }, alt: 'A tall pour-over setup for the Sunday brew-along', tags: ['brew-guide', 'behind-the-scenes'] },
  { name: 'cupping-notes.jpg', width: 1350, height: 1080, style: 'orbs', focal: { x: 0.55, y: 0.5 }, alt: 'Circles of cherry, cocoa and honey tones, like cupping notes', tags: ['cupping'] },
];

async function render(specs: Spec[], palette: string[], type: DemoImage['type'], seed: number): Promise<DemoImage[]> {
  const out: DemoImage[] = [];
  for (const [i, s] of specs.entries()) {
    const img = sharp(Buffer.from(draw(s, palette, seed + i)));
    const bytes = type === 'image/png' ? await img.png().toBuffer() : await img.jpeg({ quality: 90 }).toBuffer();
    out.push({ name: s.name, bytes, type, alt: s.alt, tags: s.tags, focal: s.focal });
  }
  return out;
}

/** Harbor: 9 PNG graphics in the pixel-key palette. Tidewater: 8 JPEG "photos" in coffee tones. */
export const demoImages = (brand: 'harbor' | 'tidewater') =>
  brand === 'harbor' ? render(HARBOR_SPECS, HARBOR, 'image/png', 41) : render(TIDEWATER_SPECS, TIDEWATER, 'image/jpeg', 97);
