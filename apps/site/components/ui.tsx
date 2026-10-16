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

export function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
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

export function GitHubButton({ label = 'Star on GitHub', primary = true }: { label?: string; primary?: boolean }) {
  return <a className={`btn${primary ? ' primary' : ''}`} href={SITE.github}><GitHubIcon />{label}</a>;
}

export function CtaBand({ title = 'Plan next week in an afternoon.', lede = 'Self-host Harbor free, or get early access to Harbor Cloud. Either way, nothing posts until you say so.' }: { title?: ReactNode; lede?: ReactNode }) {
  return (
    <section className="section tight">
      <div className="container">
        <Reveal>
          <div className="cta-band">
            <span className="eyebrow"><span className="pixels" />Get started</span>
            <h2 className="h2" style={{ maxWidth: '18ch' }}>{title}</h2>
            <p className="lede" style={{ margin: 0 }}>{lede}</p>
            <div className="row">
              <Link className="btn primary" href={SITE.start}>Get started</Link>
              <GitHubButton primary={false} label="View on GitHub" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
