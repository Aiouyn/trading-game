import { describe, expect, it } from 'vitest';
import { generateCity } from '../../e2e/city/fixtures/generate-city';
import { groundBitmap, groundStep } from '@/city/renderer/picture';

// One distinct RGBA per mask class (0 water, 1 land, 2 park, 3 road).
const RGBA = new Uint8ClampedArray([1, 2, 3, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);

/** The pre-bitmap per-cell loop: one fill per non-water cell, every step-th cell (picture.ts before T0 perf). */
function perCellFills(mask: Uint8Array, size: number, step: number) {
  const fills: { i: number; j: number; k: number }[] = [];
  for (let j = 0; j < size; j += step) for (let i = 0; i < size; i += step) {
    const k = mask[j * size + i];
    if (k !== 0) fills.push({ i, j, k });
  }
  return fills;
}

function expectSame(mask: Uint8Array, size: number) {
  const step = groundStep(size);
  const { n, data } = groundBitmap(mask, size, step, RGBA);
  expect(n).toBe(Math.ceil(size / step));
  const fills = perCellFills(mask, size, step);
  const want = new Uint8ClampedArray(n * n * 4); // water / unfilled: transparent
  for (const f of fills) want.set(RGBA.subarray(f.k * 4, f.k * 4 + 4), ((f.j / step) * n + f.i / step) * 4);
  expect(Buffer.from(data).equals(Buffer.from(want))).toBe(true);
  let opaque = 0;
  for (let p = 3; p < data.length; p += 4) if (data[p]) opaque++;
  expect(opaque).toBe(fills.length); // one bitmap pixel per former fill
  return fills.length;
}

describe('T0 ground bitmap', () => {
  it('reference seed: every former per-cell fill is one pixel of the same class colour, nothing else', () => {
    const city = generateCity();
    const mask = city.files.get(city.manifests.get(1)!.ground.url)!;
    expect(city.snapshot.ground.size).toBe(512);
    expect(mask.length).toBe(512 * 512);
    expect(expectSame(mask, 512)).toBe(52_288); // the 52,288 fills of the T0 profile
  });
  it('sizes that are not a multiple of the step, and step 1', () => {
    let s = 7;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 3;
    for (const size of [300, 515, 1024]) expectSame(Uint8Array.from({ length: size * size }, rnd), size);
  });
});
