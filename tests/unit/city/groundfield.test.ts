import { describe, expect, it } from 'vitest';
import { generateCity, DISTRICTS } from '../../e2e/city/fixtures/generate-city';
import { buildGroundField, decodeDistance, FIELD_DISTRICT, signedDistance } from '@/city/renderer/groundfield';
import { dilateLand } from '@/city/renderer/picture';

// Card 1 (spec §6 AC4): the ground field's coast follows the analytic coastline, not the 2 m cells.
const city = generateCity();
const mask = city.files.get(city.manifests.get(1)!.ground.url)!;
const g = { mask, size: 512, x0: -512, z0: -512, span: 1024 };
const field = buildGroundField(g, city.snapshot.districts);
const BAY = { x: 170, z: 420, r: 250 };
const onBayArc = (x: number, z: number) => x > 120 && x < 330 && z > 165 && z < 215; // P3: the streets at x=169, 215, 285 end here

/** Bilinear sample of a field channel in metres, as the shader's linear filter reads it (texel centres at cell centres). */
function sample(ch: number, x: number, z: number) {
  const u = (x - g.x0) / 2 - 0.5, v = (z - g.z0) / 2 - 0.5;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const t = (a: number, b: number) => decodeDistance(field.rgba[(b * 512 + a) * 4 + ch]);
  return (t(i, j) * (1 - fu) + t(i + 1, j) * fu) * (1 - fv) + (t(i, j + 1) * (1 - fu) + t(i + 1, j + 1) * fu) * fv;
}

describe('card 1 ground field', () => {
  it('AC4: the T0 shoreline (contour) is within 0.5 m of the bay circle along P3', () => {
    let n = 0, worst = 0;
    for (let l = 0; l < field.coast.length; l++) {
      const xy = field.coast[l];
      for (let p = 0; p < xy.length; p += 2) {
        if (!onBayArc(xy[p], xy[p + 1])) continue;
        worst = Math.max(worst, Math.abs(Math.hypot(xy[p] - BAY.x, xy[p + 1] - BAY.z) - BAY.r));
        n++;
      }
    }
    console.log(`T0 contour: ${n} vertices on the P3 arc, worst ${worst.toFixed(3)} m`);
    expect(n).toBeGreaterThan(5);
    expect(worst).toBeLessThanOrEqual(0.5);
  });

  it('AC4: the shader field (8-bit, bilinear) crosses 0 within 0.5 m of the bay circle along P3', () => {
    let worst = 0, n = 0;
    for (let a = -0.25; a <= 0.75; a += 0.002) {
      // walk outward from the bay centre (water) until the coast field turns positive (land)
      let lo = BAY.r - 6, hi = BAY.r + 6;
      const at = (r: number) => sample(0, BAY.x + r * Math.sin(a), BAY.z - r * Math.cos(a));
      const x = BAY.x + BAY.r * Math.sin(a), z = BAY.z - BAY.r * Math.cos(a);
      if (!onBayArc(x, z) || !(at(lo) < 0 && at(hi) > 0)) continue;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (at(m) < 0) lo = m; else hi = m; }
      worst = Math.max(worst, Math.abs(lo - BAY.r));
      n++;
    }
    console.log(`shader field: ${n} rays on the P3 arc, worst ${worst.toFixed(3)} m`);
    expect(n).toBeGreaterThan(50);
    expect(worst).toBeLessThanOrEqual(0.5);
  });

  it('a straight edge is exact: a half-plane stays a linear ramp through 0 at the edge', () => {
    const size = 64, half = new Uint8Array(size * size);
    for (let k = 0; k < half.length; k++) half[k] = k % size < 20 ? 1 : 0; // inside: i < 20, edge at u = 20 cells
    const s = signedDistance(half, size, 2, 3);
    for (const i of [17, 18, 19, 20, 21, 22]) expect(s[30 * size + i]).toBeCloseTo((i + 0.5 - 20) * 2, 5);
  });

  it('road distance: 0 at the kerb line of an axis street, negative on the carriageway', () => {
    // a street running along z: a land|road boundary with land two cells left and road four cells right, on rows j±6
    const j = 256;
    const straight = (i: number) => [-6, 0, 6].every((dj) => [-2, -1].every((di) => mask[(j + dj) * 512 + i + di] === 1) && [0, 1, 2, 3].every((di) => mask[(j + dj) * 512 + i + di] === 3));
    let i = 200;
    while (!straight(i)) i++;
    const edge = g.x0 + i * 2; // world x of the land|road cell boundary
    expect(Math.abs(sample(1, edge, g.z0 + (j + 0.5) * 2))).toBeLessThanOrEqual(0.13); // 8-bit step
    expect(sample(1, edge + 1, g.z0 + (j + 0.5) * 2)).toBeLessThan(0);
  });

  it('district channel: working districts are quay, the rest crosswalk; every cell has one', () => {
    const names = new Map(DISTRICTS.map((d) => [`dst_port_avalon_${d.slug}`, d.tier]));
    expect([...names.values()].filter((t) => t === 'working').length).toBe(2);
    const counts = [0, 0, 0];
    for (let k = 0; k < 512 * 512; k++) counts[field.rgba[k * 4 + 2]]++;
    expect(counts[FIELD_DISTRICT.none]).toBe(0);
    expect(counts[FIELD_DISTRICT.quay]).toBeGreaterThan(0);
    expect(counts[FIELD_DISTRICT.crosswalks]).toBeGreaterThan(0);
  });

  it('junctions: every junction cell is road, and some exist', () => {
    let n = 0;
    for (let k = 0; k < 512 * 512; k++) if (field.rgba[k * 4 + 3]) { n++; expect(mask[k]).toBe(3); }
    expect(n).toBeGreaterThan(100);
  });

  it('T0: the coast loops under even-odd enclose the land cells (the clip path for the bitmap)', () => {
    // crossing count along +x at each sampled cell centre; land is where the smoothed field is > 0
    let wrong = 0, n = 0;
    for (let j = 1; j < 512; j += 7) {
      const z = g.z0 + (j + 0.5) * 2;
      const xs: number[] = [];
      for (const l of field.coast) {
        for (let p = 0; p < l.length; p += 2) {
          const q = (p + 2) % l.length, z1 = l[p + 1], z2 = l[q + 1];
          if (z1 > z !== z2 > z) xs.push(l[p] + ((z - z1) / (z2 - z1)) * (l[q] - l[p]));
        }
      }
      for (let i = 0; i < 512; i += 3) {
        const x = g.x0 + (i + 0.5) * 2, f = decodeDistance(field.rgba[(j * 512 + i) * 4]);
        if (Math.abs(f) < 1) continue; // within 1 m of the coast: contour vs 8-bit field rounding
        const inside = xs.filter((cx) => cx > x).length % 2 === 1;
        n++;
        if (inside !== f > 0) wrong++;
      }
    }
    expect(n).toBeGreaterThan(5000);
    expect(wrong).toBe(0);
  });

  it('T0: dilateLand grows land one pixel into water and leaves land alone', () => {
    const n = 4, d = new Uint8ClampedArray(n * n * 4);
    d.set([10, 20, 30, 255], (1 * n + 1) * 4);
    dilateLand(d, n);
    const solid = [...Array(n * n).keys()].filter((k) => d[k * 4 + 3] !== 0);
    expect(solid).toEqual([1, 4, 5, 6, 9]);
    expect([...d.subarray(4 * 4, 4 * 4 + 4)]).toEqual([10, 20, 30, 255]);
  });
});
