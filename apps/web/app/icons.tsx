/** Navigation icons: 16px, 1.5px square-capped strokes, current color. Drawn for Harbor (no icon set). */
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  home: () => <Svg><path d="M2.5 7.5 8 3l5.5 4.5V13H2.5Z" /><path d="M6.5 13V9.5h3V13" /></Svg>,
  hub: () => <Svg><path d="M2.5 2.5h3v11h-3ZM6.5 2.5h3v7h-3ZM10.5 2.5h3v4h-3Z" /></Svg>,
  campaigns: () => <Svg><path d="M2.5 2.5h5v4h-5ZM9.5 8.5h4v5h-4ZM2.5 9.5h4v4h-4Z" /><path d="M7.5 4.5h3.5v4" /></Svg>,
  studio: () => <Svg><path d="M10.5 2.5 13.5 5.5 6 13H3v-3Z" /><path d="M9 4l3 3" /></Svg>,
  performance: () => <Svg><path d="M2.5 13.5h11" /><path d="M3.5 10.5 6.5 7.5 9 9.5 13 4.5" /></Svg>,
  insights: () => <Svg><path d="M3 13.5V9.5M6.5 13.5V6M10 13.5V8M13.5 13.5V3" /></Svg>,
  agents: () => <Svg><path d="M3 5.5h10v8H3Z" /><path d="M8 2.5v3M6 9.5v0.5M10 9.5v0.5" /></Svg>,
  approvals: () => <Svg><path d="M2.5 9.5h3l1 2h3l1-2h3v4h-11Z" /><path d="M5.5 5 7.5 7l3.5-4" /></Svg>,
  media: () => <Svg><path d="M2.5 3.5h11v9h-11Z" /><path d="M2.5 10.5 6 7.5l3 2.5 2-1.5 2.5 2" /><path d="M10.5 5.5h.5" /></Svg>,
  key: () => <Svg><path d="M2.5 6.5h5v5h-5Z" /><path d="M7.5 9h6M11.5 9v2.5M13.5 9v2" /></Svg>,
  settings: () => <Svg><path d="M8 5.5v-3M8 13.5v-3M5.5 8h-3M13.5 8h-3" /><path d="M6 6h4v4H6Z" /></Svg>,
  plus: () => <Svg><path d="M8 3v10M3 8h10" /></Svg>,
  theme: () => <Svg><path d="M8 2.5a5.5 5.5 0 1 0 0 11Z" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11" /></Svg>,
  updown: () => <Svg><path d="M5 6.5 8 3.5l3 3M5 9.5l3 3 3-3" /></Svg>,
  signOut: () => <Svg><path d="M9.5 2.5h-7v11h7" /><path d="M6.5 8h7M11 5.5 13.5 8 11 10.5" /></Svg>,
  collapse: () => <Svg><path d="M2.5 2.5h11v11h-11ZM6.5 2.5v11" /><path d="M11 6 9 8l2 2" /></Svg>,
  expand: () => <Svg><path d="M2.5 2.5h11v11h-11ZM6.5 2.5v11" /><path d="M9 6l2 2-2 2" /></Svg>,
};
