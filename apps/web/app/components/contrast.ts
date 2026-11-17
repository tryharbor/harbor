/** Black or white, whichever reads better on a #rrggbb background (WCAG relative luminance). */
export function readableOn(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#111111';
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  return l > 0.179 ? '#111111' : '#ffffff';
}
