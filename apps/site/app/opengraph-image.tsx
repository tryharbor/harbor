import { ImageResponse } from 'next/og';
import { SITE } from '../lib/site';

export const alt = `Harbor: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The Harbor mark (same path as components/ui.tsx) and the pixel-key palette. Hex values match globals.css tokens. */
const MARK = 'M0 0H16L32 16V32H16L0 16ZM32 0H48L64 16V32H48L32 16ZM0 32H16L32 48V64H16L0 48ZM32 32H48L64 48V64H48L32 48Z';
const PIXELS = ['#f78ad9', '#c77dff', '#ff8670', '#ffc13b', '#ffde2e'];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0a0a0a',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
          color: '#f5f5f4',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="#f5f5f4"><path d={MARK} /></svg>
          <span style={{ fontSize: 48, letterSpacing: '-0.03em' }}>Harbor</span>
          <div style={{ display: 'flex', marginLeft: 8 }}>
            {PIXELS.map((c) => <div key={c} style={{ width: 16, height: 8, background: c }} />)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 84, lineHeight: 1, letterSpacing: '-0.045em', maxWidth: 980 }}>The open-source content strategist for builders.</div>
          <div style={{ fontSize: 28, color: '#a1a1aa', maxWidth: 900, lineHeight: 1.35 }}>Learns what works for each brand, plans the week, drafts it in your voice and waits for your OK.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex' }}>
            {PIXELS.map((c) => <div key={c} style={{ width: 72, height: 14, background: c }} />)}
          </div>
          <span style={{ fontSize: 22, color: '#71717a', letterSpacing: '0.08em', textTransform: 'uppercase' }}>useharbor.io · AGPL</span>
        </div>
      </div>
    ),
    size,
  );
}
