// Quay glyph family (P2-228, P2-229). Port of docs/team/design/redesign/src/glyphs.js.
// 24 px grid, single-weight round line, no fills except tiny dots.
//
// Numeric attributes are kept as the mock's exact strings (".9", "3.75") so the markup is
// byte-identical to the mock. Golden tests live in __fixtures__/glyphs.golden.json.
// The inner shapes are serialised from this typed data with glyphMarkup() and inserted with
// dangerouslySetInnerHTML: React's server renderer writes <path></path>, not the mock's <path/>,
// and the data is static, so the insertion carries no user input.
export type GlyphShape =
  | { tag: 'path'; d: string; opacity?: string }
  | { tag: 'circle'; cx: string; cy: string; r: string; dot?: true }
  | { tag: 'rect'; x: string; y: string; width: string; height: string; rx?: string };

const path = (d: string, opacity?: string): GlyphShape => (opacity ? { tag: 'path', d, opacity } : { tag: 'path', d });
const circle = (cx: string, cy: string, r: string): GlyphShape => ({ tag: 'circle', cx, cy, r });
const dot = (cx: string, cy: string): GlyphShape => ({ tag: 'circle', cx, cy, r: '.9', dot: true });
const rect = (x: string, y: string, width: string, height: string, rx?: string): GlyphShape =>
  rx ? { tag: 'rect', x, y, width, height, rx } : { tag: 'rect', x, y, width, height };

/** App glyphs first, then the chrome icons. Calendar, exchange, launchpad and learn are new (C-38). */
export const GLYPHS = {
  quay: [path('M3 9h18M7 9v7M17 9v7'), path('M3 19.5h3.5M10.25 19.5h3.5M17.5 19.5H21', '.55')],
  broker: [path('M8 3.5v3.5M8 15v5.5M16 5.5V10M16 16v3'), rect('6', '7', '4', '8', '.6'), rect('14', '10', '4', '6', '.6')],
  portfolio: [circle('12', '12', '8.25'), path('M12 3.75V12h8.25')],
  wire: [path('M8.5 7.5h11M8.5 12h11M8.5 16.5h7'), dot('5', '7.5'), dot('5', '12'), dot('5', '16.5')],
  businesses: [path('M4 9.5h16M5.5 4.5h13L20 9.5M5.5 4.5 4 9.5M5.5 9.5v10h13v-10M10.25 19.5v-5h3.5v5')],
  ailab: [circle('6', '7', '2.25'), circle('18', '7', '2.25'), circle('12', '18', '2.25'), path('M8.25 7h7.5M7.1 9 10.9 16M16.9 9l-3.8 7')],
  research: [path('M11 20.5H5.5v-17h8l4 4V10M13.5 3.5v4h4'), circle('15.5', '15.5', '3.25'), path('m18 18 2.75 2.75')],
  bank: [path('M3.5 9 12 4l8.5 5zM6 11.5v6M10 11.5v6M14 11.5v6M18 11.5v6M3.5 20h17')],
  legal: [path('M12 4v15.5M8 19.5h8M5 7.5h14M5 7.5 2.75 13.25h4.5zM19 7.5l-2.25 5.75h4.5z')],
  security: [path('M12 3.25 19 6v5.25c0 4.5-3 7.9-7 9.5-4-1.6-7-5-7-9.5V6z'), path('M12 10.25v3.5'), dot('12', '9.5')],
  boutique: [path('M5 8.25h14l-1 12H6zM9 8.25V6.5a3 3 0 0 1 6 0v1.75')],
  messages: [path('M4 5h16v11H10.5L6.5 19.25V16H4z'), path('M8 9h8M8 12h5')],
  settings: [path('M4 7h3M11 7h9M4 12h9M17 12h3M4 17h1M9 17h11'), circle('9', '7', '2'), circle('15', '12', '2'), circle('7', '17', '2')],
  company: [path('M7 20.5v-16h10v16M4 20.5h16M10 8h1M13 8h1M10 11.5h1M13 11.5h1M10 15h1M13 15h1')],
  calendar: [rect('4', '5.5', '16', '14.5', '1.5'), path('M4 10h16M8.5 3.5v4M15.5 3.5v4')],
  exchange: [path('M4 8h13l-3.5-3.5M20 16H7l3.5 3.5')],
  launchpad: [rect('4', '4', '6.5', '6.5', '1.6'), rect('13.5', '4', '6.5', '6.5', '1.6'), rect('4', '13.5', '6.5', '6.5', '1.6'), rect('13.5', '13.5', '6.5', '6.5', '1.6')],
  learn: [path('M12 6.5C10 5 7.5 4.5 4 5v13.5c3.5-.5 6 0 8 1.5 2-1.5 4.5-2 8-1.5V5c-3.5-.5-6 0-8 1.5zM12 6.5V20')],
  bell: [path('M6.5 16v-4.5a5.5 5.5 0 0 1 11 0V16l1.5 2h-14z'), path('M10 20.5h4')],
  search: [circle('10.5', '10.5', '6'), path('m15 15 5 5')],
  collapse: [path('M4.5 12h7')],
  fill: [path('M6.5 4H4v8h2.5M9.5 4H12v8H9.5')],
  close: [path('m4.5 4.5 7 7M11.5 4.5l-7 7')],
  pause: [path('M9 7v10M15 7v10')],
  chev: [path('m9 6 6 6-6 6')],
  focus: [path('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5')],
  layout: [rect('3.5', '5', '17', '14', '1.5'), path('M14 5v14M14 12h6.5')],
  check: [path('m3.5 8.5 3 3 6-7')],
} satisfies Record<string, GlyphShape[]>;

export type GlyphName = keyof typeof GLYPHS;

export const GLYPH_NAMES = Object.keys(GLYPHS) as GlyphName[];

/** The apps that have a shelf or home tile. Matches the app ids in the spec (V:269). */
export const APP_GLYPH_NAMES = [
  'broker', 'portfolio', 'wire', 'messages', 'businesses', 'ailab', 'research', 'bank', 'legal',
  'security', 'boutique', 'settings', 'company', 'calendar', 'exchange', 'launchpad', 'learn',
] as const satisfies readonly GlyphName[];

/** 16 px viewBox for the small icons, 24 px otherwise (mock rule). */
export function glyphViewBox(name: GlyphName): '0 0 16 16' | '0 0 24 24' {
  return name === 'collapse' || name === 'fill' || name === 'close' || name === 'check' ? '0 0 16 16' : '0 0 24 24';
}

function shapeMarkup(s: GlyphShape): string {
  if (s.tag === 'path') return `<path d="${s.d}"${s.opacity ? ` opacity="${s.opacity}"` : ''}/>`;
  if (s.tag === 'circle') {
    const dotAttrs = s.dot ? ' fill="currentColor" stroke="none"' : '';
    return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}"${dotAttrs}/>`;
  }
  return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"${s.rx ? ` rx="${s.rx}"` : ''}/>`;
}

/** The inner SVG markup of a glyph, byte-identical to the mock's G[name]. */
export function glyphMarkup(name: GlyphName): string {
  return GLYPHS[name].map(shapeMarkup).join('');
}

export interface GlyphProps {
  name: GlyphName;
  size?: number;
  strokeWidth?: number;
  /** Flip horizontally (the phone back chevron is the mirrored chev). */
  mirror?: boolean;
  className?: string;
}

/** Icon. Attributes follow the mock's <svg class="g"> element, in the same order. */
export function Glyph({ name, size = 18, strokeWidth = 1.5, mirror = false, className }: GlyphProps) {
  const cls = [className ?? 'g', mirror ? 'os-glyph-mirror' : ''].filter(Boolean).join(' ');
  return (
    <svg
      className={cls}
      width={size}
      height={size}
      viewBox={glyphViewBox(name)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: glyphMarkup(name) }}
    />
  );
}
