import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_SLUGS, WALLPAPER_PALETTES, wallpaperSvg, type ArtSlug } from './wallpaper';

const golden = (slug: ArtSlug, w: number, h: number) =>
  readFileSync(new URL(`./__fixtures__/wallpaper/${slug}-${w}x${h}.svg`, import.meta.url), 'utf8');

describe('Quay wallpapers (golden vs docs/team/design/redesign/src/wallpaper.js)', () => {
  for (const slug of ART_SLUGS) {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      it(`${slug} ${w}x${h} is byte-identical to the mock`, () => {
        expect(wallpaperSvg({ slug, w, h, hzf: 0.79 })).toBe(golden(slug, w, h));
      });
    }
  }

  it('is deterministic across calls', () => {
    const a = wallpaperSvg({ slug: 'phosphor', w: 1440, h: 900, hzf: 0.79 });
    const b = wallpaperSvg({ slug: 'phosphor', w: 1440, h: 900, hzf: 0.79 });
    expect(a).toBe(b);
  });

  it('prefixes every SVG id and url(#) reference when asked, so two wallpapers can share a document', () => {
    const svg = wallpaperSvg({ slug: 'broadsheet', w: 1440, h: 900, hzf: 0.79, idPrefix: 'wp1-' });
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith('wp1-')).toBe(true);
    for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ref[1]!.startsWith('wp1-')).toBe(true);
  });

  it('writes font families as CSS variables when fonts is css-vars (the app setting)', () => {
    const svg = wallpaperSvg({ slug: 'riviera', w: 1440, h: 900, hzf: 0.79, fonts: 'css-vars' });
    expect(svg).toContain('style="font-family:var(--font-instrument-serif)"');
    expect(svg).toContain('style="font-family:var(--font-inter)"');
    expect(svg).not.toContain('font-family="Instrument Serif"');
  });

  it('hides text on phone-width artwork (small < 600 px), as the mock does', () => {
    const phone = wallpaperSvg({ slug: 'phosphor', w: 390, h: 844, hzf: 0.79 });
    expect(phone).toContain('opacity="0"');
    const desk = wallpaperSvg({ slug: 'phosphor', w: 1440, h: 900, hzf: 0.79 });
    expect(desk).toContain('opacity="0.5"');
  });
});

describe('palette table for the art', () => {
  it('has the four palettes with the four colours each', () => {
    for (const slug of ART_SLUGS) {
      const p = WALLPAPER_PALETTES[slug];
      for (const v of [p.bg0, p.acc, p.line, p.faint]) expect(v).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
