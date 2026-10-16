import type { CSSProperties, ElementType, ReactNode } from 'react';

/*
 * Motion never changes layout. Previews reserve the space of their largest state up front and only animate
 * opacity, color and transform inside it (styles in app/product/product.css, "Reserved space").
 */

/**
 * Text that changes in place (a status, a count, a button label): every variant is laid out invisibly in one grid
 * cell, so the box is always the size of the largest one and the live text never moves anything around it.
 */
export function Reserve({ all, children, className, style, as: Tag = 'span' }: { all: ReactNode[]; children: ReactNode; className?: string; style?: CSSProperties; as?: ElementType }) {
  return (
    <Tag className={`pv-reserve${className ? ` ${className}` : ''}`} style={style}>
      {all.map((v, i) => <span key={i} className="pv-ghost" aria-hidden="true">{v}</span>)}
      <span className="pv-live">{children}</span>
    </Tag>
  );
}

/** One grid cell for states that replace each other: every `Layer` inside is laid out, the cell takes the largest. */
export function Cell({ children, className, style, as: Tag = 'div' }: { children: ReactNode; className?: string; style?: CSSProperties; as?: ElementType }) {
  return <Tag className={`pv-cell${className ? ` ${className}` : ''}`} style={style}>{children}</Tag>;
}

/** One state in a `Cell`. Hidden ones keep their space (opacity and visibility only). `lift` fades in from below. */
export function Layer({ on, children, className, style, lift = false, as: Tag = 'div' }: { on: boolean; children: ReactNode; className?: string; style?: CSSProperties; lift?: boolean; as?: ElementType }) {
  return (
    <Tag className={`pv-layer${lift ? ' lift' : ''}${on ? ' on' : ''}${className ? ` ${className}` : ''}`} style={style} aria-hidden={on ? undefined : true}>
      {children}
    </Tag>
  );
}

/** Class for something that arrives (a row, a card, a step): always rendered in its final place, faded in when `on`. */
export const arrive = (on: boolean, drop = false) => `pv-arrive${drop ? ' drop' : ''}${on ? ' in' : ''}`;
