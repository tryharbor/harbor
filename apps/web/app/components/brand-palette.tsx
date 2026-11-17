'use client';

import { useState } from 'react';
import type { BrandColor, BrandColorRole } from '../api';
import { Select } from './select';

const ROLES: { value: BrandColorRole; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'accent', label: 'Accent' },
  { value: 'neutral', label: 'Neutral' },
];
const MAX = 8;
const HEX = /^#[0-9a-f]{6}$/i;

/** Starting palettes for someone with no colours yet. Each is a full, usable set they can then adjust. */
const STARTERS: { name: string; colors: BrandColor[] }[] = [
  { name: 'Trusty navy', colors: [{ name: 'Navy', hex: '#1b2a4a', role: 'primary' }, { name: 'Signal red', hex: '#d64933', role: 'accent' }, { name: 'Paper', hex: '#f6f4ef', role: 'neutral' }] },
  { name: 'Fresh green', colors: [{ name: 'Forest', hex: '#1f5f4a', role: 'primary' }, { name: 'Lime', hex: '#b5d334', role: 'accent' }, { name: 'Cream', hex: '#fbf8f1', role: 'neutral' }] },
  { name: 'Warm studio', colors: [{ name: 'Terracotta', hex: '#c0583a', role: 'primary' }, { name: 'Sand', hex: '#e8d5b5', role: 'secondary' }, { name: 'Ink', hex: '#2b2522', role: 'neutral' }] },
  { name: 'Bold tech', colors: [{ name: 'Electric', hex: '#3d5afe', role: 'primary' }, { name: 'Pink', hex: '#ff4f9a', role: 'accent' }, { name: 'Night', hex: '#11131a', role: 'neutral' }] },
];

/**
 * The brand's colours as rows of swatch + hex + name + role, posted as parallel `colorHex` / `colorName` /
 * `colorRole` fields. Rows with an invalid hex are kept on screen (marked) but the API rejects them on save.
 */
export function BrandPalette({ initial }: { initial: BrandColor[] }) {
  const [rows, setRows] = useState<BrandColor[]>(initial);
  const set = (i: number, patch: Partial<BrandColor>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.length === 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">No colours yet. Start from a palette, then change anything.</span>
          <div className="palette-starters">
            {STARTERS.map((s) => (
              <button key={s.name} type="button" className="palette-starter" onClick={() => setRows(s.colors)}>
                <span className="palette-strip" aria-hidden="true">{s.colors.map((c) => <i key={c.hex} style={{ background: c.hex }} />)}</span>
                <span className="small">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {rows.map((c, i) => (
        <div key={i} className="palette-row">
          <input type="color" aria-label={`Colour ${i + 1}`} value={HEX.test(c.hex) ? c.hex : '#000000'} onChange={(e) => set(i, { hex: e.target.value })} className="palette-swatch" />
          <input name="colorHex" aria-label={`Colour ${i + 1} hex`} value={c.hex} onChange={(e) => set(i, { hex: e.target.value })} className={`mono${HEX.test(c.hex) ? '' : ' invalid'}`} style={{ width: 110 }} placeholder="#1d5d78" />
          <input name="colorName" aria-label={`Colour ${i + 1} name`} value={c.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name, e.g. Harbor blue" style={{ minWidth: 0 }} />
          <Select name="colorRole" ariaLabel={`Colour ${i + 1} role`} value={c.role} onChange={(v) => set(i, { role: v as BrandColorRole })} options={ROLES} width={130} />
          <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label={`Remove colour ${i + 1}`}>Remove</button>
        </div>
      ))}
      {rows.length > 0 && rows.length < MAX ? (
        <div><button type="button" onClick={() => setRows((r) => [...r, { name: '', hex: '#888888', role: 'accent' }])}>Add a colour</button></div>
      ) : null}
    </div>
  );
}
