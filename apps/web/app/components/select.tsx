'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface SelectOption { value: string; label: ReactNode; /** Plain text for typeahead and the screen-reader name, when `label` isn't a string. */ text?: string; hint?: ReactNode }

/**
 * Harbor's select: never the browser's native dropdown (decision in docs/design/DESIGN.md). A square trigger and a
 * listbox styled with the design tokens; works inside plain forms through a hidden input, uncontrolled
 * (`defaultValue`) or controlled (`value` + `onChange`). Keyboard: arrows, Home/End, Enter/Space, Esc, typeahead.
 */
export function Select({
  name, options, defaultValue, value, onChange, id, ariaLabel, placeholder = 'Choose…', width, disabled, className,
}: {
  name?: string;
  options: SelectOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  width?: number | string;
  disabled?: boolean;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? '');
  const current = controlled ? value : inner;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const uid = useId();
  const selected = options.find((o) => o.value === current);
  const textOf = (o: SelectOption) => o.text ?? (typeof o.label === 'string' ? o.label : o.value);

  const choose = (v: string) => {
    if (!controlled) setInner(v);
    onChange?.(v);
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>('button.select-trigger')?.focus();
  };
  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
    // Safari doesn't focus buttons on click; keys only reach the select when its trigger has focus.
    root.current?.querySelector<HTMLButtonElement>('button.select-trigger')?.focus();
  };

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  // Open upward when there isn't room below; keep the active option in view.
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const r = root.current.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const last = options.length - 1;
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(last, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End') { e.preventDefault(); setActive(last); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = options[active]; if (o) choose(o.value); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const i = options.findIndex((o) => textOf(o).toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <div ref={root} className={`select${open ? ' open' : ''}${className ? ` ${className}` : ''}`} style={width !== undefined ? { width } : undefined} onKeyDown={onKey}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        type="button"
        id={id}
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${uid}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        <span className={`select-value${selected ? '' : ' placeholder'}`}>{selected ? selected.label : placeholder}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="select-chevron"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" /></svg>
      </button>
      {open ? (
        <ul ref={list} id={`${uid}-list`} role="listbox" aria-label={ariaLabel} className={`select-list${up ? ' up' : ''}`}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${uid}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === current}
              className={`${i === active ? 'active' : ''}${o.value === current ? ' selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o.value)}
            >
              <span className="select-check" aria-hidden="true">{o.value === current ? '✓' : ''}</span>
              <span className="select-option">
                <span>{o.label}</span>
                {o.hint ? <span className="small dim">{o.hint}</span> : null}
              </span>
            </li>
          ))}
          {options.length === 0 ? <li className="dim small" role="option" aria-disabled="true" aria-selected={false}>Nothing to choose yet</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
