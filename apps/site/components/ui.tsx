import Link from 'next/link';
import type { ReactNode } from 'react';
import { SITE, type Feature } from '../lib/site';
import { Reveal } from './reveal';

/** The Harbor mark (docs/design/brand/harbor-mark.svg), drawn in the current text color. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <path d="M0 0H16L32 16V32H16L0 16ZM32 0H48L64 16V32H48L32 16ZM0 32H16L32 48V64H16L0 48ZM32 32H48L64 48V64H48L32 48Z" />
    </svg>
  );
}

/** A page's opening: eyebrow, big headline, lede, actions, and an optional visual below or beside. */
export function PageHero({ eyebrow, title, lede, actions, children, color }: { eyebrow: ReactNode; title: ReactNode; lede?: ReactNode; actions?: ReactNode; children?: ReactNode; color?: Feature['color'] }) {
  return (
    <section className="section" style={{ paddingBottom: children ? 'clamp(40px, 6vw, 80px)' : undefined }}>
      <div className="container stack" style={{ gap: 28 }}>
        <Reveal><span className={`eyebrow${color ? ` c-${color}` : ''}`}>{color ? <span className="swatch" /> : <span className="pixels" />}{eyebrow}</span></Reveal>
        <Reveal delay={60}><h1 className="h1" style={{ maxWidth: '16ch' }}>{title}</h1></Reveal>
        {lede ? <Reveal delay={120}><p className="lede" style={{ margin: 0, maxWidth: '52ch' }}>{lede}</p></Reveal> : null}
        {actions ? <Reveal delay={180}><div className="row">{actions}</div></Reveal> : null}
      </div>
      {children ? <div className="container" style={{ marginTop: 'clamp(40px, 6vw, 72px)' }}><Reveal delay={200}>{children}</Reveal></div> : null}
    </section>
  );
}

/** Section heading block: mono eyebrow, headline, optional lede. */
export function SectionHead({ eyebrow, title, lede, color, center }: { eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; color?: Feature['color']; center?: boolean }) {
  return (
    <Reveal>
      <div className="stack" style={{ gap: 18, justifyItems: center ? 'center' : 'start', textAlign: center ? 'center' : 'left' }}>
        {eyebrow ? <span className={`eyebrow${color ? ` c-${color}` : ''}`}>{color ? <span className="swatch" /> : null}{eyebrow}</span> : null}
        <h2 className="h2" style={{ maxWidth: '20ch' }}>{title}</h2>
        {lede ? <p className="lede" style={{ margin: 0, maxWidth: '56ch' }}>{lede}</p> : null}
      </div>
    </Reveal>
  );
}

/** Product UI in a light app window, the way it really looks. */
export function Window({ title, children, className, style }: { title?: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`window${className ? ` ${className}` : ''}`} style={style}>
      <div className="window-bar" aria-hidden="true"><i /><i /><i /><span className="grow">{title ?? 'Harbor'}</span><span style={{ width: 39 }} /></div>
      <div className="window-body app">{children}</div>
    </div>
  );
}

export function CtaBand({ title = 'Your business, up and running.', lede = 'Get early access. We’ll email you when your plan is ready.' }: { title?: ReactNode; lede?: ReactNode }) {
  return (
    <section className="section tight">
      <div className="container">
        <Reveal>
          <div className="cta-band">
            <span className="eyebrow"><span className="pixels" />Get started</span>
            <h2 className="h2" style={{ maxWidth: '18ch' }}>{title}</h2>
            <p className="lede" style={{ margin: 0 }}>{lede}</p>
            <div className="row">
              <Link className="btn primary" href={SITE.start}>Get early access</Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
