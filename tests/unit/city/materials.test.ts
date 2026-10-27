import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anchors, DISTRICT_MATERIALS, fnv1a32, lch, material, materialId, MATERIAL_PLAIN, partLook, RUST_BELOW, visSeed, type Lch } from '@/city/art/materials';
import { deltaE, srgbToOklab, type Rgb } from '@/city/art/color';
import { TOKEN_VARS, type Tokens } from '@/city/art/tokens';
import { buildRamps } from '@/city/art/ramps';
import { FLAT_BRASS, partColors } from '@/city/renderer/overlay';
import type { CityEntity } from '@/city/data/types';

const css = readFileSync(join(__dirname, '../../../src/styles/tokens.css'), 'utf8');
const v = (name: string): Rgb => {
  const m = css.match(new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i'))!;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as Rgb;
};
const t = Object.fromEntries(Object.entries(TOKEN_VARS).map(([k, name]) => [k, v(name)])) as Tokens;
const A = anchors(t);
const hslSat = ([r, g, b]: Rgb) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
};
const allLch = (): Lch[] => DISTRICT_MATERIALS.flatMap(([, m]) => [m.wall, m.wall2, m.top, 'u' in m.trim ? m.trim : undefined]).filter((x): x is Lch => !!x);

describe('card 2 materials', () => {
  it('FNV-1a 32 matches the reference vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
    expect(visSeed('port_avalon', 'p1')).toBe(fnv1a32('city.vis:port_avalon:p1'));
  });
  it('Ink & Brass lightness matches the spec table (u → L)', () => {
    const L = (c: Lch) => srgbToOklab(lch(A, c))[0];
    const m = (k: string) => DISTRICT_MATERIALS.find(([id]) => id === k)![1];
    expect(L(m('old_harbor').wall)).toBeCloseTo(0.38, 1);
    expect(L(m('old_harbor').wall2!)).toBeCloseTo(0.4, 1);
  });
  it('district ids map to materials 1–8; unknown or missing → plain concrete', () => {
    expect(materialId('dst_port_avalon_old_harbor', 'port_avalon')).toBe(1);
    expect(materialId('dst_port_avalon_eastside_docks', 'port_avalon')).toBe(8);
    expect(materialId(undefined, 'port_avalon')).toBe(MATERIAL_PLAIN);
    expect(materialId('dst_port_avalon_nowhere', 'port_avalon')).toBe(MATERIAL_PLAIN);
    expect(material(MATERIAL_PLAIN).wall).toEqual(material(7).wall);
  });
  it('AC-LOOK-04: every wall partLook can give is ≤ 45 % HSL saturation; no material within ΔE 10 of brass', () => {
    let worst = 0;
    for (let id = 0; id <= DISTRICT_MATERIALS.length; id++) for (let i = 0; i < 3000; i++) {
      const w = partLook(A, id, visSeed('port_avalon', `p${i}`)).wall;
      worst = Math.max(worst, hslSat(w));
      for (const b of [t.acc, t.accHi, t.accLo]) expect(deltaE(w, b)).toBeGreaterThan(10);
    }
    expect(worst).toBeLessThanOrEqual(0.45);
    for (const c of allLch()) for (const b of [t.acc, t.accHi, t.accLo]) expect(deltaE(lch(A, c), b)).toBeGreaterThan(10);
  });
  it('seed: deterministic, rust ~1 in 10 only in the yards, window seed is bits 24–31', () => {
    const s = visSeed('port_avalon', 'parcel_042');
    expect(partLook(A, 1, s)).toEqual(partLook(A, 1, s));
    expect(partLook(A, 3, 0xab000000).windowSeed).toBe(0xab);
    expect(partLook(A, 7, (RUST_BELOW - 1) << 16).rust).toBe(true);
    expect(partLook(A, 7, RUST_BELOW << 16).rust).toBe(false);
    expect(partLook(A, 3, 0).rust).toBe(false);
    const n = 2000;
    let r = 0;
    for (let i = 0; i < n; i++) r += +partLook(A, 7, visSeed('port_avalon', `p${i}`)).rust;
    expect(r / n).toBeGreaterThan(0.06);
    expect(r / n).toBeLessThan(0.14);
  });
});

describe('partColors with materials (card 2 §2.1)', () => {
  const ent = (id: string, districtId: string, kind = 'property'): CityEntity =>
    ({ id, kind, parcelId: `par_${id}`, name: null, districtId, sector: null, companyId: null, forSale: false, atAuction: false, lifecycle: 'BUILT', heightLevel: 1 }) as unknown as CityEntity;
  const entities = [ent('a', 'dst_port_avalon_old_harbor'), ent('b', 'dst_port_avalon_eastside_docks'), ent('c', 'dst_port_avalon_x', 'crown_tower')];
  const r = buildRamps(t);
  const input = { entity: Int32Array.from([0, 1, 2, -1]), style: new Uint8Array(4), entities, districts: [], mine: new Set<string>(), overlay: 'none' as const, myCityOverlay: false };
  const rgb = (c: Float32Array, i: number) => Array.from(c.subarray(i * 3, i * 3 + 3));
  it('entity parts take their district material wall; crown brass and entity-less parts are unchanged', () => {
    const off = partColors(input, r);
    const on = partColors({ ...input, materials: { anchors: A, cityId: 'port_avalon' } }, r);
    for (const [i, id] of [[0, 1], [1, 8]] as const) {
      const want = partLook(A, id, visSeed('port_avalon', entities[i].parcelId)).wall;
      rgb(on.colors, i).forEach((x, k) => expect(x).toBeCloseTo(want[k], 5));
    }
    expect(on.flat[2]).toBe(FLAT_BRASS);
    expect(rgb(on.colors, 2)).toEqual(rgb(off.colors, 2));
    expect(rgb(on.colors, 3)).toEqual(rgb(off.colors, 3));
  });
});
