/**
 * The token icon (lead-launchpad.md L2): a procedural SVG from the ticker hash. Shape, two palette colours and a glyph are all
 * drawn from one FNV-1a hash of the ticker, so the same ticker always has the same icon and no upload is ever needed. The
 * ticker is validated to A-Z before it reaches here, so the text in the SVG is safe.
 */

/** FNV-1a, 32-bit: the same hash the world uses for seeds elsewhere (no randomness: a pure function of the text). */
export function tickerHash(ticker: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < ticker.length; i++) {
    h ^= ticker.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const SHAPES = ['circle', 'square', 'diamond', 'hex'] as const;
export type IconShape = (typeof SHAPES)[number];

export interface IconSpec {
  shape: IconShape;
  /** two colours, as hex, drawn from one hue wheel so they always contrast */
  fg: string;
  bg: string;
  glyph: string;
}

/**
 * The icon's parts, from the hash: the shape, a hue pair, and the glyph (the ticker's first letter). R-10-6: the creator picks one of
 * the generated variants at launch. Variant 0 hashes the ticker alone (every icon made before Phase 10 is unchanged); variant k > 0
 * hashes the ticker and k, so the same ticker has a fresh shape and palette for each variant.
 */
export function iconSpec(ticker: string, art = 0): IconSpec {
  const h = tickerHash(art > 0 ? `${ticker}#${art}` : ticker);
  const shape = SHAPES[h % SHAPES.length]!;
  const hue = (h >>> 3) % 360;
  const hue2 = (hue + 150 + ((h >>> 11) % 60)) % 360;
  return {
    shape,
    bg: `hsl(${hue} 70% 46%)`,
    fg: `hsl(${hue2} 85% 92%)`,
    glyph: ticker.charAt(0),
  };
}

function shapePath(shape: IconShape): string {
  switch (shape) {
    case 'circle': return '<circle cx="32" cy="32" r="30"/>';
    case 'square': return '<rect x="3" y="3" width="58" height="58" rx="10"/>';
    case 'diamond': return '<polygon points="32,2 62,32 32,62 2,32"/>';
    case 'hex': return '<polygon points="32,2 59,17 59,47 32,62 5,47 5,17"/>';
  }
}

/** The icon as a standalone SVG string (64 by 64), in the given variant (0 when none is picked). */
export function iconSvg(ticker: string, art = 0): string {
  const s = iconSpec(ticker, art);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${s.glyph}">`
    + `<g fill="${s.bg}">${shapePath(s.shape)}</g>`
    + `<text x="32" y="43" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="700" fill="${s.fg}">${s.glyph}</text>`
    + '</svg>';
}
