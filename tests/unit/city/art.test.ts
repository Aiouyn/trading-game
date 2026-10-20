import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { litRatio } from '@/city/renderer/light';
import { deltaE, mixOklab, oklabToSrgb, srgbToOklab, type Rgb } from '@/city/art/color';
import { buildRamps } from '@/city/art/ramps';

const ROOT = join(__dirname, '../../../src/city');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('C-12 art', () => {
  it('src/city has zero hex or rgb()/rgba()/hsl() colour literals', () => {
    const hits: string[] = [];
    for (const f of files(ROOT)) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}\b/.test(line) || /\b(rgba?|hsla?)\s*\(/.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
  it('ramps keep brass for --acc only: no other scene colour is within ΔE 3 of it', () => {
    // Token values as on main (src/styles/tokens.css), parsed from the file at test time.
    const css = readFileSync(join(__dirname, '../../../src/styles/tokens.css'), 'utf8');
    const v = (name: string): Rgb => {
      const m = css.match(new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i'))!;
      return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as Rgb;
    };
    const t = { bg0: v('--color-ink-0'), win: v('--color-ink-1'), win2: v('--color-ink-2'), line: v('--color-ink-3'), fg: v('--color-fg'), fgMuted: v('--color-fg-muted'), acc: v('--color-brass'), gain: v('--color-gain'), loss: v('--color-loss'), signal: v('--color-signal') };
    const r = buildRamps(t);
    const others: Rgb[] = [r.water, r.land, r.park, r.road, ...r.facades, r.roof, r.litWindow, r.darkWindow, ...r.districtHues];
    for (const c of others) expect(deltaE(c, r.brass)).toBeGreaterThan(3);
    // water is the darkest ground tone
    const L = (c: Rgb) => srgbToOklab(c)[0];
    expect(L(r.water)).toBeLessThan(Math.min(L(r.land), L(r.park), L(r.road)));
    expect(r.brass).toEqual(t.acc);
  });
  it('OKLab round-trips and mixes', () => {
    const c: Rgb = [0.2, 0.5, 0.8];
    const back = oklabToSrgb(srgbToOklab(c));
    back.forEach((x, i) => expect(x).toBeCloseTo(c[i], 4));
    expect(mixOklab(c, c, 0.5).map((x) => +x.toFixed(4))).toEqual(c.map((x) => +x.toFixed(4)));
  });
  it('market lights: litRatio = 0.50 + 0.30·clamp(dayReturn/0.05, −1, 1)', () => {
    expect(litRatio(0)).toBe(0.5);
    expect(litRatio(0.05)).toBeCloseTo(0.8);
    expect(litRatio(-1)).toBeCloseTo(0.2);
    expect(litRatio(0.025)).toBeCloseTo(0.65);
  });
});
