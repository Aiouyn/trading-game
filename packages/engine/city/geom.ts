// T10A-01: fixed-point geometry of 10 §2.11 (last paragraph). Coordinates are integer centimetres in the city plane;
// floats are allowed only in continuous fields and are quantised (round half even, G8) before they are stored (card step 3).
import { EngineFault, roundHalfEven } from '@tycoon/engine-core';

/** `{ x, z }` in integer centimetres (10 §2.11). */
export type FixedPointCoord = { x: number; z: number };
/** An array of coords in counter-clockwise order (10 §2.11). */
export type FixedPointPolygon = FixedPointCoord[];
/** E-88 (2a): an open chain of at least 2 integer-centimetre coords (10 §2.11 names it, never defines it). */
export type FixedPointPolyline = FixedPointCoord[];
/** E-88 (2a): the axis-aligned box [minX, maxX] × [minZ, maxZ], integer centimetres, min < max on both axes. */
export interface FixedPointRect { minX: number; minZ: number; maxX: number; maxZ: number }

export type StreetClass = 'HIGHWAY' | 'ARTERIAL' | 'COLLECTOR' | 'LOCAL' | 'ALLEY' | 'PEDESTRIAN' | 'CANAL' | 'RAIL';
export const STREET_CLASSES: readonly StreetClass[] = ['HIGHWAY', 'ARTERIAL', 'COLLECTOR', 'LOCAL', 'ALLEY', 'PEDESTRIAN', 'CANAL', 'RAIL'];

const fault = (msg: string): never => { throw new EngineFault('CITY_BAD_GEOMETRY', msg); };

/** Metres (a continuous float) to integer centimetres, round half even. */
export function quantiseCm(metres: number): number { return roundHalfEven(metres * 100); }

export function isFixedPointCoord(c: FixedPointCoord): boolean { return Number.isSafeInteger(c.x) && Number.isSafeInteger(c.z); }

/** Twice the signed area in cm² (shoelace; positive = counter-clockwise). Exact: integer inputs, bigint sum. */
export function signedArea2(p: readonly FixedPointCoord[]): bigint {
  let s = 0n;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    s += BigInt(a.x) * BigInt(b.z) - BigInt(b.x) * BigInt(a.z);
  }
  return s;
}

/** Throws CITY_BAD_GEOMETRY unless the polygon has ≥ 3 integer-centimetre vertices in counter-clockwise order (non-zero area). */
export function assertFixedPolygon(p: readonly FixedPointCoord[]): void {
  if (p.length < 3) fault(`polygon has ${p.length} vertices (< 3)`);
  for (const c of p) if (!isFixedPointCoord(c)) fault(`vertex (${c.x}, ${c.z}) is not integer centimetres`);
  if (signedArea2(p) <= 0n) fault('polygon is not counter-clockwise');
}

/** Throws CITY_BAD_GEOMETRY unless the rect is integer centimetres with min < max on both axes (E-88 (2a): no degenerate rect). */
export function assertFixedRect(r: FixedPointRect): void {
  for (const v of [r.minX, r.minZ, r.maxX, r.maxZ]) if (!Number.isSafeInteger(v)) fault(`rect bound ${v} is not integer centimetres`);
  if (r.minX >= r.maxX || r.minZ >= r.maxZ) fault('rect is degenerate: min must be < max on both axes');
}

/** Throws CITY_BAD_GEOMETRY unless the polyline has ≥ 2 integer-centimetre points (E-88 (2a)). */
export function assertFixedPolyline(p: readonly FixedPointCoord[]): void {
  if (p.length < 2) fault(`polyline has ${p.length} points (< 2)`);
  for (const c of p) if (!isFixedPointCoord(c)) fault(`point (${c.x}, ${c.z}) is not integer centimetres`);
}
