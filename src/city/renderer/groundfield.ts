import type { DistrictTier } from '../data/types';

// Card 1 ground field: everything the ground shader and the T0 shoreline need, computed once per
// ground mask (mask classes: 0 water, 1 land, 2 park, 3 road). RGBA8, one texel per mask cell:
//   R  signed distance to the coast, metres (+ land, − water), smoothed so the 0-level follows the
//      coastline instead of the cell staircase. Linear sampling.
//   G  signed distance to the carriageway, metres (− inside a road). Linear sampling.
//   B  district class of the cell (FIELD_DISTRICT): crosswalks and quays depend on it. texelFetch.
//   A  255 on a junction box cell, else 0. texelFetch.
// R and G are stored as 128 + d·127/FIELD_RANGE_M, clamped to ±FIELD_RANGE_M.

export const FIELD_RANGE_M = 20;
/** B channel: 0 no district, 1 crosswalk district (mid, prime, trophy), 2 quay district (working). */
export const FIELD_DISTRICT = { none: 0, crosswalks: 1, quay: 2 } as const;
/** A junction box cell has road at both of these distances (m) along +x, −x, +z and −z. */
export const JUNCTION_TAPS_M = [6, 16] as const;
/** Quay where the coast is within this distance (m) of a road, outside quay districts. */
export const QUAY_ROAD_M = 16;
/**
 * Smoothing radius (cells) of the coast field: wide enough that a curved coast's cell staircase
 * averages back to the curve (AC4: ≤ 0.5 m off the bay circle), narrow enough to keep the river.
 */
export const COAST_BLUR_CELLS = 2;
/**
 * Road field smoothing: none. An 8 m street is 4 cells, so any blur reaches the centre-line kink
 * and moves the kerb line (0.3 m at radius 1); axis streets are exact without it.
 */
export const ROAD_BLUR_CELLS = 0;
/** Douglas–Peucker tolerance of the T0 shoreline (m). */
export const COAST_TOLERANCE_M = 0.5;

export interface FieldDistrict {
  tier: DistrictTier;
  /** Outline in integer cm, [x, z] pairs. */
  polygon: readonly (readonly [number, number])[];
}

export interface GroundField {
  size: number;
  rgba: Uint8Array;
  /** Coast loops in world metres, [x0, z0, x1, z1, …], closed (last point ≠ first). Land is inside under evenodd. */
  coast: Float32Array[];
  /** Per coast vertex: 1 where the coast is quay. */
  quay: Uint8Array[];
}

export const encodeDistance = (d: number) => Math.max(0, Math.min(255, Math.round(128 + (d * 127) / FIELD_RANGE_M)));
export const decodeDistance = (b: number) => ((b - 128) * FIELD_RANGE_M) / 127;
const districtCode = (t: DistrictTier) => (t === 'working' ? FIELD_DISTRICT.quay : FIELD_DISTRICT.crosswalks);

/** Squared Euclidean distance (in cells²) from each cell to the nearest cell with seed[k] = 1. */
export function squaredDistance(seed: Uint8Array, size: number): Float64Array {
  const INF = 1e20;
  const d = new Float64Array(size * size);
  for (let k = 0; k < d.length; k++) d[k] = seed[k] ? 0 : INF;
  const f = new Float64Array(size), z = new Float64Array(size + 1);
  const v = new Int32Array(size);
  // Felzenszwalb & Huttenlocher 1D lower envelope over a strided line, columns then rows
  const pass = (base: number, stride: number) => {
    for (let q = 0; q < size; q++) f[q] = d[base + q * stride];
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < size; q++) {
      const fq = f[q] + q * q;
      let s = (fq - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (fq - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < size; q++) {
      while (z[k + 1] < q) k++;
      const dq = q - v[k];
      d[base + q * stride] = dq * dq + f[v[k]];
    }
  };
  for (let i = 0; i < size; i++) pass(i, size);
  for (let j = 0; j < size; j++) pass(j * size, 1);
  return d;
}

/**
 * Signed distance in metres (+ outside, − inside) to the boundary between the cells with
 * inside[k] = 1 and the rest, from cell-centre distances (± half a cell), then blurred so a
 * staircase averages back to its curve.
 */
export function signedDistance(inside: Uint8Array, size: number, cellM: number, blurCells: number): Float32Array {
  const outside = new Uint8Array(inside.length);
  for (let k = 0; k < inside.length; k++) outside[k] = inside[k] ? 0 : 1;
  const toIn = squaredDistance(inside, size), toOut = squaredDistance(outside, size);
  const s = new Float32Array(size * size);
  for (let k = 0; k < s.length; k++) s[k] = (inside[k] ? 0.5 - Math.sqrt(toOut[k]) : Math.sqrt(toIn[k]) - 0.5) * cellM;
  for (let pass = 0; pass < 3; pass++) boxBlur(s, size, blurCells);
  return s;
}

/**
 * In place, separable box blur of radius r cells with clamped edges; three passes approximate a
 * Gaussian of σ² = r(r+1) cells². A symmetric kernel keeps linear ramps (straight edges) exact.
 */
function boxBlur(f: Float32Array, size: number, r: number): void {
  if (r <= 0) return;
  const line = new Float32Array(size), w = 2 * r + 1;
  const run = (base: number, stride: number) => {
    for (let q = 0; q < size; q++) line[q] = f[base + q * stride];
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += line[t < 0 ? 0 : t >= size ? size - 1 : t];
    for (let q = 0; q < size; q++) {
      f[base + q * stride] = acc / w;
      const add = q + r + 1, sub = q - r;
      acc += line[add >= size ? size - 1 : add] - line[sub < 0 ? 0 : sub];
    }
  };
  for (let j = 0; j < size; j++) run(j * size, 1);
  for (let i = 0; i < size; i++) run(i, size);
}

/** District code per cell: polygons scan-converted at cell centres, the rest from the nearest district cell. */
export function districtCells(districts: readonly FieldDistrict[], size: number, x0: number, z0: number, cellM: number): Uint8Array {
  const out = new Uint8Array(size * size);
  for (const d of districts) {
    const p = d.polygon;
    if (p.length < 3) continue;
    const code = districtCode(d.tier);
    for (let j = 0; j < size; j++) {
      const z = (z0 + (j + 0.5) * cellM) * 100;
      const xs: number[] = [];
      for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
        const [xa, za] = p[a], [xb, zb] = p[b];
        if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
      }
      xs.sort((u, w) => u - w);
      for (let t = 0; t + 1 < xs.length; t += 2) {
        const i0 = Math.max(0, Math.ceil((xs[t] / 100 - x0) / cellM - 0.5));
        const i1 = Math.min(size - 1, Math.floor((xs[t + 1] / 100 - x0) / cellM - 0.5));
        for (let i = i0; i <= i1; i++) out[j * size + i] = code;
      }
    }
  }
  // breadth-first fill: every cell outside all polygons takes its nearest (4-connected) district
  const queue = new Int32Array(size * size);
  let head = 0, tail = 0;
  for (let k = 0; k < out.length; k++) if (out[k]) queue[tail++] = k;
  while (head < tail) {
    const k = queue[head++], i = k % size, j = (k - i) / size;
    const next = [i > 0 ? k - 1 : -1, i < size - 1 ? k + 1 : -1, j > 0 ? k - size : -1, j < size - 1 ? k + size : -1];
    for (const n of next) if (n >= 0 && !out[n]) { out[n] = out[k]; queue[tail++] = n; }
  }
  return out;
}

/** 1 on road cells that have road at every JUNCTION_TAPS_M distance along ±x and ±z. */
export function junctionCells(mask: Uint8Array, size: number, cellM: number): Uint8Array {
  const out = new Uint8Array(size * size);
  const taps = JUNCTION_TAPS_M.map((m) => Math.round(m / cellM));
  const road = (i: number, j: number) => i >= 0 && j >= 0 && i < size && j < size && mask[j * size + i] === 3;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    if (mask[j * size + i] !== 3) continue;
    let all = true;
    for (const t of taps) all = all && road(i + t, j) && road(i - t, j) && road(i, j + t) && road(i, j - t);
    if (all) out[j * size + i] = 1;
  }
  return out;
}

type GroundInput = { mask: Uint8Array; size: number; x0: number; z0: number; span: number };

/** Builds the RGBA8 field and the coast loops for one ground mask. */
export function buildGroundField(g: GroundInput, districts: readonly FieldDistrict[]): GroundField {
  const steps = groundFieldSteps(g, districts);
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

/** The same build, with `pause()` (a new task) between its stages, so no one task runs it all. */
export async function buildGroundFieldInTasks(g: GroundInput, districts: readonly FieldDistrict[], pause: () => Promise<void>): Promise<GroundField> {
  const steps = groundFieldSteps(g, districts);
  for (;;) { const r = steps.next(); if (r.done) return r.value; await pause(); }
}

function* groundFieldSteps(g: GroundInput, districts: readonly FieldDistrict[]): Generator<void, GroundField> {
  const { mask, size, x0, z0 } = g;
  const cellM = g.span / size;
  const water = new Uint8Array(size * size), road = new Uint8Array(size * size);
  for (let k = 0; k < mask.length; k++) { water[k] = mask[k] === 0 ? 1 : 0; road[k] = mask[k] === 3 ? 1 : 0; }
  const coastSd = signedDistance(water, size, cellM, COAST_BLUR_CELLS); // + land
  yield;
  const roadSd = signedDistance(road, size, cellM, ROAD_BLUR_CELLS); // − road
  yield;
  const dist = districtCells(districts, size, x0, z0, cellM);
  const junction = junctionCells(mask, size, cellM);
  const rgba = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    rgba[k * 4] = encodeDistance(coastSd[k]);
    rgba[k * 4 + 1] = encodeDistance(roadSd[k]);
    rgba[k * 4 + 2] = dist[k];
    rgba[k * 4 + 3] = junction[k] ? 255 : 0;
  }
  yield;
  const coast: Float32Array[] = [], quay: Uint8Array[] = [];
  const at = (x: number, z: number) => {
    const i = Math.min(size - 1, Math.max(0, Math.floor((x - x0) / cellM))), j = Math.min(size - 1, Math.max(0, Math.floor((z - z0) / cellM)));
    return j * size + i;
  };
  for (const loop of contourLoops(coastSd, size)) {
    const pts = simplifyLoop(loop.map(([u, v]) => [x0 + (u + 0.5) * cellM, z0 + (v + 0.5) * cellM] as [number, number]), COAST_TOLERANCE_M);
    if (pts.length < 3) continue;
    const xy = new Float32Array(pts.length * 2), q = new Uint8Array(pts.length);
    pts.forEach(([x, z], n) => {
      xy[n * 2] = x; xy[n * 2 + 1] = z;
      const k = at(x, z);
      q[n] = dist[k] === FIELD_DISTRICT.quay || roadSd[k] < QUAY_ROAD_M ? 1 : 0;
    });
    coast.push(xy); quay.push(q);
  }
  return { size, rgba, coast, quay };
}

/**
 * Marching squares at level 0 over cell-centre samples (u, v in cells, centre of cell (i, j) at
 * (i, j)). Outside the grid each sample mirrors its edge neighbour with the opposite sign, so a
 * loop that meets the map edge closes exactly on it.
 */
export function contourLoops(f: Float32Array, size: number): [number, number][][] {
  const val = (i: number, j: number) => {
    const ci = Math.min(size - 1, Math.max(0, i)), cj = Math.min(size - 1, Math.max(0, j));
    const v = f[cj * size + ci];
    return ci === i && cj === j ? v : -Math.abs(v) - 1e-6;
  };
  // edge ids: horizontal edge (i,j)-(i+1,j) → 2·key, vertical (i,j)-(i,j+1) → 2·key+1, key over the padded grid
  const W = size + 2;
  const key = (i: number, j: number) => (j + 1) * W + (i + 1);
  const point = new Map<number, [number, number]>();
  const edgePoint = (id: number): [number, number] => {
    let p = point.get(id);
    if (p) return p;
    const k = id >> 1, i = (k % W) - 1, j = Math.floor(k / W) - 1;
    const [i2, j2] = id & 1 ? [i, j + 1] : [i + 1, j];
    const a = val(i, j), b = val(i2, j2), t = a / (a - b);
    p = [i + (i2 - i) * t, j + (j2 - j) * t];
    point.set(id, p);
    return p;
  };
  // next[edge] = edge: walking with land on the left
  const next = new Map<number, number>();
  for (let j = -1; j < size; j++) for (let i = -1; i < size; i++) {
    const a = val(i, j) > 0, b = val(i + 1, j) > 0, c = val(i + 1, j + 1) > 0, d = val(i, j + 1) > 0;
    const idx = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    const top = 2 * key(i, j), right = 2 * key(i + 1, j) + 1, bottom = 2 * key(i, j + 1), left = 2 * key(i, j) + 1;
    const centre = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) > 0;
    const e = [top, right, bottom, left];
    for (const [from, to] of SEGMENTS[idx === 5 || idx === 10 ? (centre ? idx : idx + 16) : idx]) next.set(e[from], e[to]);
  }
  const loops: [number, number][][] = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const loop: [number, number][] = [];
    let e = start;
    while (next.has(e)) {
      const n = next.get(e)!;
      next.delete(e);
      loop.push(edgePoint(e));
      e = n;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Marching-squares segments per corner case (bit 1 TL, 2 TR, 4 BR, 8 BL inside), as [from, to]
// edge indices (0 top, 1 right, 2 bottom, 3 left), land on one consistent side. Saddles 5 and 10:
// index 5/10 when the cell centre is land, 21/26 when it is water.
const SEGMENTS: Record<number, [number, number][]> = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [1, 0]], 6: [[0, 2]], 7: [[3, 2]],
  8: [[2, 3]], 9: [[2, 0]], 10: [[0, 3], [2, 1]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
  21: [[3, 0], [1, 2]], 26: [[0, 1], [2, 3]],
};

/** Douglas–Peucker on a closed loop: split at the point farthest from the first, simplify both halves. */
export function simplifyLoop(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 4) return pts;
  let far = 0, best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > best) { best = d; far = i; }
  }
  const a = simplifyLine(pts.slice(0, far + 1), tol), b = simplifyLine([...pts.slice(far), pts[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function simplifyLine(pts: [number, number][], tol: number): [number, number][] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, az] = pts[s], [bx, bz] = pts[e];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    let far = -1, best = tol;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([s, far], [far, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
