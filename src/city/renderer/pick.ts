import { FLOATS_PER_PART } from '../worker/format';

type V3 = [number, number, number];

/** Index of the nearest part hit by the ray, or -1. Parts are axis-aligned boxes. */
export function pickPart(parts: Float32Array, o: V3, d: V3): number {
  return pickParts(parts, o, d)[0] ?? -1;
}

/** Every part hit by the ray, nearest first. A repeated tap cycles through them (see-through). */
export function pickParts(parts: Float32Array, o: V3, d: V3): number[] {
  const hits: { i: number; t: number }[] = [];
  const n = parts.length / FLOATS_PER_PART;
  for (let i = 0; i < n; i++) {
    const k = i * FLOATS_PER_PART;
    const x = parts[k], z = parts[k + 1], hw = parts[k + 2] / 2, hd = parts[k + 3] / 2;
    const y0 = parts[k + 4], y1 = y0 + parts[k + 5];
    const t = slab(o, d, [x - hw, y0, z - hd], [x + hw, y1, z + hd]);
    if (t !== null) hits.push({ i, t });
  }
  return hits.sort((a, b) => a.t - b.t).map((h) => h.i);
}

function slab(o: V3, d: V3, min: V3, max: V3): number | null {
  let t0 = -Infinity, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    let ta = (min[a] - o[a]) / d[a], tb = (max[a] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t1 < 0 ? null : Math.max(t0, 0);
}
