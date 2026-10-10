// Deterministic Quay wallpapers (P2-232). Pure SVG string, no images, no Math.random.
// Port of docs/team/design/redesign/src/wallpaper.js. The expressions and the whitespace inside
// the markup match the mock, so the output is byte-identical to the mock's (golden tests in
// __fixtures__/wallpaper/). Only the palette colours come from the palette table below.
//
// Ink & Brass colours come from the ink-0, brass, ink-3 and fg-faint tokens in src/styles/tokens.css.
// Broadsheet and Riviera also use fixed art colours, kept here as art constants (not tokens).
// tokens.test.ts checks the table against tokens.css so the two cannot drift.

export type ArtSlug = 'ink-brass' | 'broadsheet' | 'phosphor' | 'riviera';

export const ART_SLUGS: readonly ArtSlug[] = ['ink-brass', 'broadsheet', 'phosphor', 'riviera'];

export interface ArtPalette {
  /** desktop ground (ink-0 / bg0) */
  bg0: string;
  /** accent (brass) */
  acc: string;
  /** hairline (ink-3) */
  line: string;
  /** caption (fg-faint) */
  faint: string;
}

/** Per-palette colours, equal to the token values for the same palette. */
export const WALLPAPER_PALETTES: Record<ArtSlug, ArtPalette> = {
  'ink-brass': { bg0: '#0B0D10', acc: '#C9A45C', line: '#262B33', faint: '#7E848E' },
  broadsheet: { bg0: '#F2EDE3', acc: '#8C2F2B', line: '#D9D0BF', faint: '#67625A' },
  phosphor: { bg0: '#070908', acc: '#FFB23F', line: '#1F2723', faint: '#7A9085' },
  riviera: { bg0: '#0E1A2B', acc: '#E8836B', line: '#2A3F5E', faint: '#929CAB' },
};

/** Art-only colours (not tokens). Listed so tokens.test.ts can check them. */
export const ART_FIXED = {
  inkVignetteCentre: '#151920',
  broadsheetInk: '#1B1A17',
  riviera: {
    skyTop: '#0E1A2B', skyMid: '#22304F', skyLow: '#5A4462', skyHorizon: '#C7705F',
    seaTop: '#1D3352', hillFar: '#2B2A4A', hillNear: '#1F2440', buildingA: '#1A2238', buildingB: '#202A44',
    window: '#F2C14E', sun: '#F2A48F', pier: '#2A3F5E', sail: '#F4ECDD', sailWarm: '#E8836B', hull: '#0E1A2B',
    title: '#F4ECDD',
  },
} as const;

/** Seeded xorshift32, identical integer ops to the mock. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

interface Building { x: number; w: number; h: number; y: number; spire: boolean }

function skyline(base: number, seed: number, x0: number, x1: number, minH: number, maxH: number): Building[] {
  const r = rng(seed);
  const out: Building[] = [];
  let x = x0;
  while (x < x1) {
    const bw = 18 + r() * 46;
    const bh = minH + Math.pow(r(), 1.6) * (maxH - minH);
    out.push({ x, w: bw, h: bh, y: base - bh, spire: r() < 0.12 });
    x += bw + (r() < 0.3 ? 4 + r() * 10 : 0);
  }
  return out;
}

export interface WallpaperOptions {
  slug: ArtSlug;
  w: number;
  h: number;
  /** Palette colours. Defaults to WALLPAPER_PALETTES[slug]. */
  P?: ArtPalette;
  /** Horizon position as a fraction of height (the mocks use 0.79). */
  hzf?: number;
  /** Prefix for SVG ids (<defs>, url(#...)). Set per instance so two wallpapers can share a document. */
  idPrefix?: string;
  /**
   * 'literal' writes the mock's font-family names (matches the golden files).
   * 'css-vars' uses the next/font CSS variables, which is what the app uses.
   */
  fonts?: 'literal' | 'css-vars';
}

type Role = 'serif' | 'mono' | 'sans';
const FONT_LITERAL: Record<Role, string> = { serif: 'Instrument Serif', mono: 'JetBrains Mono', sans: 'Inter' };
const FONT_VAR: Record<Role, string> = {
  serif: 'var(--font-instrument-serif)',
  mono: 'var(--font-jetbrains-mono)',
  sans: 'var(--font-inter)',
};

export function wallpaperSvg(o: WallpaperOptions): string {
  const { slug, w, h } = o;
  const P = o.P ?? WALLPAPER_PALETTES[slug];
  const hzf = o.hzf ?? 0.64;
  const pre = o.idPrefix ?? '';
  const id = (n: string) => pre + n;
  const fontAttr = (role: Role) =>
    (o.fonts ?? 'literal') === 'literal' ? `font-family="${FONT_LITERAL[role]}"` : `style="font-family:${FONT_VAR[role]}"`;

  const hz = Math.round(h * hzf);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">`;
  const small = w < 600;
  const k = small ? 0.62 : 1;
  const city = skyline(hz, 7, w * 0.38, w * 0.96, 26 * k, 170 * k);

  if (slug === 'ink-brass') {
    s += `<defs><radialGradient id="${id('v')}" cx="70%" cy="60%" r="80%"><stop offset="0" stop-color="${ART_FIXED.inkVignetteCentre}"/><stop offset="1" stop-color="${P.bg0}"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#${id('v')})"/>`;
    s += `<g fill="none" stroke="${P.acc}" stroke-width="1" opacity=".22">`;
    s += `<path d="M0 ${hz}H${w}"/>`;
    city.forEach((b) => {
      s += `<path d="M${b.x} ${hz}V${b.y}H${b.x + b.w}V${hz}"/>`;
      if (b.spire) s += `<path d="M${b.x + b.w / 2} ${b.y}v-26"/>`;
      for (let yy = b.y + 10; yy < hz - 6; yy += 14) s += `<path d="M${b.x + 5} ${yy}h${b.w - 10}" opacity=".35"/>`;
    });
    // cranes
    ([[w * 0.18, hz], [w * 0.27, hz]] as const).forEach(([cx, cy], i) => {
      const t = (150 - i * 20) * k;
      const a = (140 - i * 20) * k;
      const L = 120 * k;
      s += `<path d="M${cx} ${cy}V${cy - t}M${cx - 30 * k} ${cy - a}H${cx + L}M${cx} ${cy - t}L${cx + L} ${cy - a}M${cx} ${cy - t}L${cx - 30 * k} ${cy - a}M${cx + 0.75 * L} ${cy - a}v${40 * k}"/>`;
    });
    // lighthouse
    const lx = w * 0.08;
    s += `<path d="M${lx - 9} ${hz}l4 -70h10l4 70M${lx - 7} ${hz - 70}h14M${lx} ${hz - 70}v-10"/><path d="M${lx + 10} ${hz - 76}L${lx + 130} ${hz - 92}M${lx + 10} ${hz - 74}L${lx + 130} ${hz - 62}" opacity=".5"/>`;
    // quay + piers
    s += `<path d="M${w * 0.05} ${hz + 46}H${w * 0.62}"/>`;
    for (let i = 0; i < 9; i++) {
      const px = w * 0.07 + i * w * 0.064;
      s += `<path d="M${px} ${hz + 46}v18"/>`;
    }
    for (let i = 0; i < 7; i++) {
      const yy = hz + 90 + i * i * 9;
      s += `<path d="M${w * (0.1 + i * 0.03)} ${yy}H${w * (0.9 - i * 0.02)}" opacity="${0.5 - i * 0.06}" stroke-dasharray="${40 + i * 20} ${18 + i * 6}"/>`;
    }
    s += `</g>`;
  }

  if (slug === 'broadsheet') {
    const ink = ART_FIXED.broadsheetInk;
    s += `<defs><pattern id="${id('ht')}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.5" cy="2.5" r="1.05" fill="${ink}"/></pattern>\n      <pattern id="${id('ht2')}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.5" cy="2.5" r=".6" fill="${ink}"/></pattern>\n      <linearGradient id="${id('fade')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="1"/></linearGradient></defs>`;
    s += `<rect width="${w}" height="${h}" fill="${P.bg0}"/>`;
    s += `<g opacity=".17">`;
    s += `<path d="M0 ${hz} C ${w * 0.15} ${hz - 90}, ${w * 0.3} ${hz - 120}, ${w * 0.42} ${hz - 60} S ${w * 0.7} ${hz - 40}, ${w} ${hz - 80} V${hz} Z" fill="url(#${id('ht2')})"/>`;
    city.forEach((b) => {
      s += `<rect x="${b.x}" y="${b.y}" width="${b.w - 2}" height="${b.h}" fill="url(#${id('ht')})"/>`;
      if (b.spire) s += `<path d="M${b.x + b.w / 2} ${b.y}v-24" stroke="${ink}" stroke-width="1.2"/>`;
    });
    for (let i = 0; i < 46; i++) {
      const yy = hz + 4 + i * i * 0.3 + i * 3;
      if (yy > h) break;
      s += `<path d="M0 ${yy}H${w}" stroke="${ink}" stroke-width="${Math.max(0.4, 1.3 - i * 0.02)}" opacity="${0.9 - i * 0.012}"/>`;
    }
    {
      const R = 46 * k;
      const cx = w * 0.2;
      const cy = hz - 150 * k;
      s += `<clipPath id="${id('sunc')}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${ink}" stroke-width="1"/><g clip-path="url(#${id('sunc')})">`;
      for (let i = 0; i < 16; i++) {
        s += `<path d="M${cx - R} ${cy - R + (i * R) / 8 + R / 16}h${2 * R}" stroke="${ink}" stroke-width="${(0.4 + i * 0.06).toFixed(2)}"/>`;
      }
      s += `</g>`;
    }
    s += `</g>`;
    s += `<g ${fontAttr('serif')} fill="${ink}" opacity="${small ? 0 : 0.16}"><text x="${w * 0.05}" y="${h * 0.12}" font-size="22" letter-spacing="3">THE PORT AVALON HARBOUR · ENGRAVED FROM THE NORTH MOLE</text></g>`;
  }

  if (slug === 'phosphor') {
    s += `<rect width="${w}" height="${h}" fill="${P.bg0}"/>`;
    s += `<g stroke="${P.line}" stroke-width="1" opacity=".75">`;
    for (let x = 0; x <= w; x += 48) s += `<path d="M${x} 0V${h}"/>`;
    for (let y = 0; y <= h; y += 48) s += `<path d="M0 ${y}H${w}"/>`;
    s += `</g>`;
    const centers: ReadonlyArray<readonly [number, number, number]> = [[w * 0.72, h * 0.62, 1], [w * 0.25, h * 0.3, 0.7], [w * 0.9, h * 0.15, 0.5]];
    s += `<g fill="none" stroke="${P.acc}" stroke-width="1">`;
    centers.forEach(([cx, cy, kk], ci) => {
      const r = rng(31 + ci);
      const ph = [r() * 6, r() * 6, r() * 6];
      for (let lev = 1; lev <= 14; lev++) {
        const R = lev * 26 * kk + 10;
        let d = '';
        for (let a = 0; a <= 96; a++) {
          const t = (a / 96) * Math.PI * 2;
          const rr = R * (1 + 0.18 * Math.sin(3 * t + ph[0]) + 0.09 * Math.sin(5 * t + ph[1] + lev * 0.2) + 0.05 * Math.sin(9 * t + ph[2]));
          d += (a ? 'L' : 'M') + (cx + rr * Math.cos(t)).toFixed(1) + ' ' + (cy + rr * 0.72 * Math.sin(t)).toFixed(1);
        }
        s += `<path d="${d}Z" opacity="${lev % 5 === 0 ? 0.2 : 0.09}"/>`;
      }
    });
    s += `</g>`;
    s += `<g ${fontAttr('mono')} font-size="10" fill="${P.faint}" opacity="${small ? 0 : 0.5}"><text x="${w - 250}" y="${h - 70}">PORT AVALON · 41.2N 0.0E · BATHYMETRY</text></g>`;
  }

  if (slug === 'riviera') {
    const A = ART_FIXED.riviera;
    s += `<defs><linearGradient id="${id('sky')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.skyTop}"/><stop offset=".45" stop-color="${A.skyMid}"/><stop offset=".78" stop-color="${A.skyLow}"/><stop offset="1" stop-color="${A.skyHorizon}"/></linearGradient>\n      <linearGradient id="${id('sea')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.seaTop}"/><stop offset="1" stop-color="${A.skyTop}"/></linearGradient></defs>`;
    s += `<rect width="${w}" height="${hz}" fill="url(#${id('sky')})"/><rect y="${hz}" width="${w}" height="${h - hz}" fill="url(#${id('sea')})"/>`;
    s += `<clipPath id="${id('above')}"><rect width="${w}" height="${hz}"/></clipPath><circle cx="${w * 0.62}" cy="${hz - 30}" r="${h * 0.11}" fill="${A.sun}" opacity=".92" clip-path="url(#${id('above')})"/>`;
    s += `<path d="M${w * 0.7} ${hz} C ${w * 0.78} ${hz - 60}, ${w * 0.86} ${hz - 95}, ${w} ${hz - 70} V${hz} Z" fill="${A.hillFar}"/>`;
    s += `<rect x="0" y="${hz - 6}" width="${w}" height="${h * 0.12}" fill="url(#${id('sky')})" opacity="0"/>`;
    s += `<path d="M0 ${hz} C ${w * 0.12} ${hz - 130}, ${w * 0.22} ${hz - 150}, ${w * 0.36} ${hz - 70} C ${w * 0.42} ${hz - 40}, ${w * 0.48} ${hz - 30}, ${w * 0.55} ${hz} Z" fill="${A.hillFar}"/>`;
    s += `<path d="M${w * 0.04} ${hz} C ${w * 0.14} ${hz - 70}, ${w * 0.24} ${hz - 80}, ${w * 0.32} ${hz - 30} L ${w * 0.36} ${hz} Z" fill="${A.hillNear}"/>`;
    city.forEach((b, i) => {
      const hh = b.h * 0.62;
      s += `<rect x="${b.x}" y="${hz - hh}" width="${b.w - 3}" height="${hh}" fill="${i % 3 ? A.buildingA : A.buildingB}"/>`;
      const r = rng(100 + i);
      for (let yy = hz - hh + 8; yy < hz - 8; yy += 11) {
        for (let xx = b.x + 5; xx < b.x + b.w - 8; xx += 9) {
          if (r() < 0.18) s += `<rect x="${xx}" y="${yy}" width="3" height="4" fill="${A.window}" opacity=".55"/>`;
        }
      }
    });
    for (let i = 0; i < 9; i++) {
      const yy = hz + 8 + i * i * 6 + i * 6;
      s += `<rect x="${w * 0.62 - (70 - i * 5)}" y="${yy}" width="${(70 - i * 5) * 2}" height="${3 + i * 0.3}" rx="1.5" fill="${A.sun}" opacity="${0.5 - i * 0.05}"/>`;
    }
    for (let i = 0; i < 6; i++) {
      const yy = hz + 30 + i * 38;
      s += `<path d="M${w * 0.05 + i * 40} ${yy}h${w * 0.18}" stroke="${A.pier}" stroke-width="2" stroke-linecap="round"/>`;
    }
    const bx = w * 0.24;
    const by = hz + 70;
    s += `<path d="M${bx} ${by}l26 -62v62z" fill="${A.sail}" opacity=".85"/><path d="M${bx + 30} ${by}l18 -44v44z" fill="${A.sailWarm}" opacity=".9"/><path d="M${bx - 14} ${by + 4}h70l-8 9h-54z" fill="${A.hull}"/>`;
    s += `<g ${fontAttr('serif')} fill="${A.title}" opacity="${small ? 0 : 0.22}"><text x="${w * 0.05}" y="${h * 0.14}" font-size="64" letter-spacing="2">Port Avalon</text><text x="${w * 0.05 + 4}" y="${h * 0.14 + 28}" ${fontAttr('sans')} font-size="12" letter-spacing="6">THE BAY AT DUSK</text></g>`;
  }

  return s + '</svg>';
}
