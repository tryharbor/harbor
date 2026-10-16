'use client';

import { useState } from 'react';

export type Theme = 'light' | 'dark';

/**
 * Light / Dark switch. The choice lives in the `harbor-theme` cookie so the server renders the right theme on the
 * next load (no flash), and is applied to <html data-theme> immediately.
 */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = (next: Theme) => {
    setTheme(next);
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    document.cookie = `harbor-theme=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="segmented" role="group" aria-label="Theme">
      {(['light', 'dark'] as const).map((t) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => choose(t)}>
          {t === 'light' ? 'Light' : 'Dark'}
        </button>
      ))}
    </div>
  );
}
