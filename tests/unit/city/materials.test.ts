import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anchors, DISTRICT_MATERIALS, fnv1a32, lch, material, materialId, MATERIAL_PLAIN, partLook, RUST_BELOW, matPalette, visSeed, visSeeder, WALL_SPLIT_M, type Lch } from '@/city/art/materials';
import { deltaE, mixOklab, srgbToOklab, type Rgb } from '@/city/art/color';
import { TOKEN_VARS, type Tokens } from '@/city/art/tokens';
import { buildRamps } from '@/city/art/ramps';
import { FLAT_BRASS, partColors } from '@/city/renderer/overlay';
import type { CityEntity } from '@/city/data/types';
import { generateCity } from '../../e2e/city/fixtures/generate-city';

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
    // the ASCII fast path and the prefix chaining hash exactly the UTF-8 bytes
    const ref = (x: string) => { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(x)) h = Math.imul(h ^ b, 0x01000193) >>> 0; return h >>> 0; };
    for (const x of ['', 'a', 'prc_port_avalon_00af3', 'café', 'ab東京', 'x😀y', 'é']) expect(fnv1a32(x), x).toBe(ref(x));
    expect(visSeeder('port_avalon')('prc_07')).toBe(ref('city.vis:port_avalon:prc_07'));
    expect(visSeeder('köln')('p😀')).toBe(ref('city.vis:köln:p😀'));
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
    // the engine's cityId carries 'cty_' and its districtIds don't (CI run 40605465589: every fixture part was plain)
    expect(materialId('dst_port_avalon_old_harbor', 'cty_port_avalon')).toBe(1);
    const city = generateCity();
    const ids = new Set(city.snapshot.entities.map((e) => materialId(e.districtId, city.snapshot.cityId)));
    for (let id = 1; id <= DISTRICT_MATERIALS.length; id++) expect(ids.has(id), `fixture district material ${id}`).toBe(true);
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

describe('seed bit split (Studio ruling 1)', () => {
  const hc = (seed: number) => {
    const [, a, b] = srgbToOklab(partLook(A, 2, seed).wall);
    return { h: (Math.atan2(b, a) * 180) / Math.PI, C: Math.hypot(a, b) };
  };
  it('bits 8–11 move hue only, bits 12–15 move chroma only', () => {
    const o = hc(0x80 | (0x8 << 8) | (0x8 << 12)); // mid nibbles ≈ no jitter
    const hue = hc(0x80 | (0xf << 8) | (0x8 << 12));
    const chr = hc(0x80 | (0x8 << 8) | (0xf << 12));
    expect(Math.abs(hue.h - o.h)).toBeGreaterThan(3);
    expect(Math.abs(hue.C - o.C)).toBeLessThan(2e-4);
    expect(Math.abs(chr.C / o.C - 1)).toBeGreaterThan(0.08);
    expect(Math.abs(chr.h - o.h)).toBeLessThan(0.3);
  });
});

describe('material data path (card 2 §2.1 iMat / uMat)', () => {
  it('iMat variant is 2 exactly on rust accent parts; window seed is bits 24–31', () => {
    const rusty = partLook(A, 7, (RUST_BELOW - 1) << 16 | (0xab << 24));
    const plain = partLook(A, 7, RUST_BELOW << 16);
    expect(rusty.rust).toBe(true);
    expect(rusty.mat).toEqual([7, 2]);
    expect(plain.mat).toEqual([7, 0]);
    expect(rusty.windowSeed).toBe(0xab);
  });
  it('palette: wall2 delta only at split ids, top = material top, trim on the shaft for Financial Mile', () => {
    const P = matPalette(A);
    const at = (a: Float32Array, id: number) => Array.from(a.subarray(id * 3, id * 3 + 3));
    for (let id = 0; id < 9; id++) {
      const d = Math.hypot(...at(P.wall2, id));
      if (WALL_SPLIT_M[id] !== undefined) expect(d).toBeGreaterThan(0.01);
      else expect(d).toBe(0);
      at(P.top, id).forEach((x, k) => expect(x).toBeCloseTo(lch(A, material(id).top)[k], 6));
    }
    expect(WALL_SPLIT_M).toEqual({ 4: 12, 7: 4, 8: 3 });
    const shaft = lch(A, material(4).wall2!), podium = lch(A, material(4).wall);
    const tr = at(P.trim, 4);
    const dist = (c: number[]) => Math.hypot(...c.map((x, k) => x - tr[k]));
    expect(dist(shaft)).toBeLessThan(dist(podium));
  });
});

describe('partColors iMat and window seed', () => {
  const ent = (id: string, districtId: string): CityEntity =>
    ({ id, kind: 'property', parcelId: `par_${id}`, name: null, districtId, sector: null, companyId: null, forSale: false, atAuction: false, lifecycle: 'BUILT', heightLevel: 1 }) as unknown as CityEntity;
  const entities = [ent('a', 'dst_port_avalon_old_harbor'), ent('b', 'dst_port_avalon_industrial_basin')];
  const base = { entity: Int32Array.from([0, 1, -1]), style: new Uint8Array(3), entities, districts: [], mine: new Set<string>(), myCityOverlay: false, quote: () => 0.01, materials: { anchors: A, cityId: 'port_avalon' } };
  const r = buildRamps(t);
  it('none / my_places carry the material id and seed; entity-less parts stay plain', () => {
    for (const overlay of ['none', 'my_places'] as const) {
      const pc = partColors({ ...base, overlay }, r);
      expect([pc.mat[0], pc.mat[2], pc.mat[4]]).toEqual([1, 7, 0]);
      const s = partLook(A, 1, visSeed('port_avalon', 'par_a')).windowSeed / 256;
      expect(pc.windowSeed[0]).toBeCloseTo(s, 7);
      expect(pc.windowSeed[2]).toBe(-1);
    }
  });
  it('a data overlay turns materials off: id 0, card-1 window hash, card-1 colours', () => {
    const pc = partColors({ ...base, overlay: 'districts' as const }, r);
    const plain = partColors({ ...base, overlay: 'districts' as const, materials: undefined }, r);
    expect(Array.from(pc.mat)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(pc.windowSeed)).toEqual([-1, -1, -1]);
    expect(Array.from(pc.colors)).toEqual(Array.from(plain.colors));
  });
  it('binary overlays: matching parts highlight toward the label, the rest dim toward the water', () => {
    const f = { ...entities[0], forSale: true } as CityEntity;
    const pc = partColors({ ...base, entities: [f, entities[1]], overlay: 'for_sale' as const }, r);
    const face = r.facades[0];
    const want = [...mixOklab(face, r.label, 0.55), ...mixOklab(face, r.water, 0.35)];
    Array.from(pc.colors.slice(0, 6)).forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
  });
});

describe('seed determinism on the reference city (card 2 AC 6)', () => {
  // partColors takes no tier: T2 and T1 upload the same iColor / iMat (the tier only gates patterns in the shader)
  const r = buildRamps(t);
  const mk = () => {
    const ents = generateCity().snapshot.entities as CityEntity[];
    // three parts per entity, with mixed styles, as an entity's parts reach the renderer
    const entity = Int32Array.from(ents.flatMap((_, i) => [i, i, i]));
    return { entity, style: Uint8Array.from(entity, (_, k) => k % 4), entities: ents, districts: generateCity().snapshot.districts, mine: new Set<string>(), overlay: 'none' as const, myCityOverlay: false, materials: { anchors: A, cityId: 'port_avalon' } };
  };
  const bytes = (f: Float32Array) => Buffer.from(f.buffer, f.byteOffset, f.byteLength).toString('hex');
  it('two loads give byte-identical iColor and iMat; every part of one entity has the same wall', () => {
    const a = partColors(mk(), r), b = partColors(mk(), r);
    expect(bytes(a.colors)).toBe(bytes(b.colors));
    expect(bytes(a.mat)).toBe(bytes(b.mat));
    expect(bytes(a.windowSeed)).toBe(bytes(b.windowSeed));
    const n = a.flat.length / 3;
    let withMat = 0;
    for (let e = 0; e < n; e++) {
      const p = (k: number) => Array.from(a.colors.subarray((e * 3 + k) * 3, (e * 3 + k) * 3 + 3));
      expect(p(1)).toEqual(p(0));
      expect(p(2)).toEqual(p(0));
      withMat += +(a.mat[e * 6] > 0);
    }
    expect(withMat).toBeGreaterThan(n / 2); // the fixture's entities do carry districts
  });
  it('changing one parcelId changes only that entity', () => {
    const base = mk();
    const a = partColors(base, r);
    const e = base.entities.findIndex((x, i) => x.kind !== 'crown_tower' && a.mat[i * 6] > 0);
    const ents = base.entities.slice();
    ents[e] = { ...ents[e], parcelId: `${ents[e].parcelId}_x` };
    const b = partColors({ ...base, entities: ents }, r);
    const diff: number[] = [];
    for (let k = 0; k < base.entity.length; k++) {
      const same = [0, 1, 2].every((c) => a.colors[k * 3 + c] === b.colors[k * 3 + c]) && a.windowSeed[k] === b.windowSeed[k];
      if (!same) diff.push(base.entity[k]);
    }
    expect(diff.length).toBeGreaterThan(0);
    expect(new Set(diff)).toEqual(new Set([e]));
  });
});
