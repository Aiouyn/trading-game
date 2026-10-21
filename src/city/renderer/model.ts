import type { CitySnapshot } from '../data/types';
import type { DecodedChunk } from '../worker/decode';
import { FLOATS_PER_PART } from '../worker/format';

/** Everything the map draws, merged from decoded chunks and the public snapshot. */
export interface CityModel {
  parts: Float32Array;
  entity: Int32Array;
  style: Uint8Array;
  /** Entity index → part indices */
  partsOf: Map<number, number[]>;
  entityIndex: Map<string, number>;
  parcelIndex: Map<string, number>;
}

export function buildModel(s: CitySnapshot, chunks: ReadonlyMap<string, DecodedChunk>): CityModel {
  const entityIndex = new Map(s.entities.map((e, i) => [e.id, i]));
  const parcelIndex = new Map(s.entities.map((e, i) => [e.parcelId, i]));
  let total = 0;
  const live: DecodedChunk[] = [];
  for (const ref of s.chunks) {
    const c = chunks.get(ref.contentHash);
    if (c) {
      live.push(c);
      total += c.parts.length / FLOATS_PER_PART;
    }
  }
  const parts = new Float32Array(total * FLOATS_PER_PART);
  const entity = new Int32Array(total);
  const style = new Uint8Array(total);
  const partsOf = new Map<number, number[]>();
  let i = 0;
  for (const c of live) {
    parts.set(c.parts, i * FLOATS_PER_PART);
    const n = c.parts.length / FLOATS_PER_PART;
    for (let k = 0; k < n; k++, i++) {
      const id = c.ids[c.parts[k * FLOATS_PER_PART + 6]];
      const ei = id !== undefined ? (entityIndex.get(id) ?? -1) : -1;
      entity[i] = ei;
      style[i] = c.parts[k * FLOATS_PER_PART + 7] & 3;
      if (ei >= 0) {
        const list = partsOf.get(ei);
        if (list) list.push(i);
        else partsOf.set(ei, [i]);
      }
    }
  }
  return { parts, entity, style, partsOf, entityIndex, parcelIndex };
}

/** Roof-top centre of an entity's tallest part: the point a tap lands on and a row anchors to. */
export function entityAnchor(m: CityModel, ei: number): [number, number, number] | null {
  const list = m.partsOf.get(ei);
  if (!list) return null;
  let best = list[0];
  for (const p of list) {
    const o = p * FLOATS_PER_PART;
    const b = best * FLOATS_PER_PART;
    if (m.parts[o + 4] + m.parts[o + 5] > m.parts[b + 4] + m.parts[b + 5]) best = p;
  }
  const o = best * FLOATS_PER_PART;
  return [m.parts[o], m.parts[o + 4] + m.parts[o + 5], m.parts[o + 1]];
}

/** World bounds of the ground mask in metres. */
export function groundBounds(g: CitySnapshot['ground']): { x0: number; z0: number; size: number; cx: number; cz: number; extent: number } {
  const size = (g.size * g.cellCm) / 100;
  const x0 = g.originCm[0] / 100, z0 = g.originCm[1] / 100;
  return { x0, z0, size, cx: x0 + size / 2, cz: z0 + size / 2, extent: size / 2 };
}

/** Label anchor of a district: area centroid of its polygon (cm → m) [P, SR Q7]. */
export function polygonCentroid(poly: readonly (readonly [number, number])[]): [number, number] {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const f = x0 * z1 - x1 * z0;
    a += f;
    cx += (x0 + x1) * f;
    cz += (z0 + z1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, poly.length);
    return [poly.reduce((s, p) => s + p[0], 0) / n / 100, poly.reduce((s, p) => s + p[1], 0) / n / 100];
  }
  return [cx / (3 * a) / 100, cz / (3 * a) / 100];
}

/** Entity ids that have at least one part on the map, i.e. are reachable by a map pick. */
export function pickableEntityIds(s: CitySnapshot, m: CityModel): Set<string> {
  const out = new Set<string>(s.districts.map((d) => d.id)); // district labels are pick targets
  for (const ei of m.partsOf.keys()) out.add(s.entities[ei].id);
  return out;
}
