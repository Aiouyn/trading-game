import { oklabToSrgb, srgbToOklab, type Rgb } from './color';
import type { Tokens } from './tokens';

// Card 2 §2.1: district materials. Colours are palette-relative OKLCH: L = lerp(L(--win2),
// L(--fg-muted), u), with chroma C and hue h as constants here (no colour literals).

/** OKLCH spec: u on the --win2 → --fg-muted lightness axis, chroma, hue in degrees. */
export interface Lch { u: number; C: number; h: number }
/** Trim / top relative to the wall: a lightness step on the wall's colour. */
export interface Rel { dL: number }

export interface Material {
  /** wall; `wall2` is the second wall (Old Harbor: umber end of the seed mix; podium/base splits: the upper wall) */
  wall: Lch;
  wall2?: Lch;
  trim: Lch | Rel;
  top: Lch;
  /** accent parts take this trim colour on the wall (seed bits 16–23 < RUST_BELOW) */
  rustAccent?: boolean;
}

const slate: Lch = { u: 0.14, C: 0.012, h: 250 };
const concrete: Lch = { u: 0.48, C: 0.008, h: 80 };
const metal: Lch = { u: 0.35, C: 0.01, h: 240 };
// C 0.056: base HSL sat 36.0 %, worst case with full jitter (L ±.02, hue ±4°, chroma ×1.1) 44.8 % ≤ AC-LOOK-04's 45 %
// (Studio ruling 2: no clamp; Studio's quoted 40.9 % base was not reproduced here, measured base at C .06 is 38.7 %, worst 48.6 %)
const rust: Lch = { u: 0.35, C: 0.056, h: 45 };
const mullion: Rel = { dL: 0.06 };

/** Material id 0: parts with no entity (and any data overlay): concrete, no pattern. Ids 1–8: the districts. */
export const MATERIAL_PLAIN = 0;
export const DISTRICT_MATERIALS: readonly (readonly [string, Material])[] = [
  ['old_harbor', { wall: { u: 0.31, C: 0.055, h: 35 }, wall2: { u: 0.35, C: 0.045, h: 55 }, trim: { u: 0.67, C: 0.015, h: 80 }, top: slate }],
  ['riverside_lofts', { wall: { u: 0.4, C: 0.04, h: 60 }, trim: metal, top: concrete }],
  ['midtown', { wall: { u: 0.27, C: 0.012, h: 245 }, trim: mullion, top: metal }],
  ['financial_mile', { wall: { u: 0.57, C: 0.015, h: 80 }, wall2: { u: 0.2, C: 0.014, h: 240 }, trim: mullion, top: metal }],
  ['glasshill', { wall: { u: 0.35, C: 0.018, h: 225 }, trim: { u: 0.7, C: 0.012, h: 85 }, top: metal }],
  ['summit_estates_on_gilt_hill', { wall: { u: 0.82, C: 0.025, h: 85 }, trim: { dL: -0.06 }, top: slate }],
  ['industrial_basin', { wall: { u: 0.48, C: 0.008, h: 80 }, wall2: metal, trim: rust, top: metal, rustAccent: true }],
  ['eastside_docks', { wall: { u: 0.44, C: 0.008, h: 80 }, wall2: { u: 0.31, C: 0.02, h: 220 }, trim: rust, top: metal, rustAccent: true }],
];
const PLAIN: Material = { wall: concrete, trim: concrete, top: concrete };

/** Seed bits 16–23 below this make a rust accent part: about 1 in 10 (26/256). */
export const RUST_BELOW = 26;

/** `dst_<city>_<district>` → material id 1–8, or 0 when unknown. cityId is e.g. `port_avalon`. */
export function materialId(districtId: string | undefined, cityId: string): number {
  if (!districtId) return MATERIAL_PLAIN;
  const prefix = `dst_${cityId}_`;
  const key = districtId.startsWith(prefix) ? districtId.slice(prefix.length) : districtId;
  const i = DISTRICT_MATERIALS.findIndex(([k]) => k === key);
  return i < 0 ? MATERIAL_PLAIN : i + 1;
}

export function material(id: number): Material {
  return id === MATERIAL_PLAIN ? PLAIN : DISTRICT_MATERIALS[id - 1][1];
}

/** FNV-1a 32 over UTF-8 [P: Studio's proposal; Systems may publish the seed instead]. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h >>> 0;
}

/** The per-entity visual seed: fnv1a32("city.vis:" + cityId + ":" + parcelId). */
export const visSeed = (cityId: string, parcelId: string) => fnv1a32(`city.vis:${cityId}:${parcelId}`);

const byte = (seed: number, k: number) => (seed >>> (8 * k)) & 0xff;
/** byte → −1..1 */
const signed = (b: number) => (b / 255) * 2 - 1;

export interface Anchors { l0: number; l1: number }
/** The two lightness anchors: L(--win2), L(--fg-muted). Neither moves under data-hc / data-cb. */
export const anchors = (t: Pick<Tokens, 'win2' | 'fgMuted'>): Anchors => ({ l0: srgbToOklab(t.win2)[0], l1: srgbToOklab(t.fgMuted)[0] });

export function lch(a: Anchors, c: Lch, dL = 0, dh = 0, kC = 1): Rgb {
  const L = a.l0 + (a.l1 - a.l0) * c.u + dL;
  const h = ((c.h + dh) * Math.PI) / 180;
  return oklabToSrgb([L, Math.cos(h) * c.C * kC, Math.sin(h) * c.C * kC]);
}

/** A colour `dL` lighter (OKLab L) than `c`, same a/b. */
export function lighter(c: Rgb, dL: number): Rgb {
  const [L, x, y] = srgbToOklab(c);
  return oklabToSrgb([L + dL, x, y]);
}

export interface PartLook {
  /** jittered wall colour (goes into iColor) */
  wall: Rgb;
  /** iMat: material id 0–8, variant 0–1 (Old Harbor: oxblood↔umber mix t); 2 = rust accent (whole wall, no split or ribs) */
  mat: [number, number];
  rust: boolean;
  /** bits 24–31: window seed (replaces iMeta.x's slot × x hash) */
  windowSeed: number;
}

/**
 * The look of one entity's parts from its material and seed (§2.1 "Seed jitter"):
 * bits 0–7 L ±0.02; bits 8–11 hue ±4°; bits 12–15 chroma ×(1 ± 0.10) (Studio ruling 1);
 * bits 16–23 variant / rust accent; bits 24–31 window seed.
 */
export function partLook(a: Anchors, id: number, seed: number): PartLook {
  const m = material(id);
  const b1 = byte(seed, 1), b2 = byte(seed, 2);
  const dL = signed(byte(seed, 0)) * 0.02;
  const dh = signed((b1 & 0x0f) * 17) * 4;
  const kC = 1 + signed((b1 >>> 4) * 17) * 0.1;
  const rust = !!m.rustAccent && b2 < RUST_BELOW;
  const variant = id === 1 ? b2 / 255 : 0;
  let wall: Rgb;
  if (id === MATERIAL_PLAIN) wall = lch(a, m.wall);
  else if (rust) wall = lch(a, m.trim as Lch, dL, dh, kC);
  else if (id === 1 && m.wall2) {
    const w = m.wall, w2 = m.wall2;
    wall = lch(a, { u: w.u + (w2.u - w.u) * variant, C: w.C + (w2.C - w.C) * variant, h: w.h + (w2.h - w.h) * variant }, dL, dh, kC);
  } else wall = lch(a, m.wall, dL, dh, kC);
  return { wall, mat: [id, rust ? 2 : variant], rust, windowSeed: byte(seed, 3) };
}

/** Material ids at which the shader splits the wall by world height (metres): podium / base below, `wall2` above. */
export const WALL_SPLIT_M: Readonly<Record<number, number>> = { 4: 12, 7: 4, 8: 3 };

/**
 * The shader's material palette (§2.1 "Data path"): 9 × 3 vec3 uniforms, unjittered.
 * wall2: `wall2 − wall` (added to the jittered iColor above the split), trim, top.
 */
export function matPalette(a: Anchors): { wall2: Float32Array; trim: Float32Array; top: Float32Array } {
  const wall2 = new Float32Array(27), trim = new Float32Array(27), top = new Float32Array(27);
  for (let id = 0; id < 9; id++) {
    const m = material(id);
    const w = lch(a, m.wall);
    const w2 = m.wall2 && WALL_SPLIT_M[id] !== undefined ? lch(a, m.wall2) : w;
    wall2.set([w2[0] - w[0], w2[1] - w[1], w2[2] - w[2]], id * 3);
    // trim relative to the wall it sits on: the shaft for Financial Mile's mullions
    trim.set('dL' in m.trim ? lighter(id === 4 ? w2 : w, m.trim.dL) : lch(a, m.trim), id * 3);
    top.set(lch(a, m.top), id * 3);
  }
  return { wall2, trim, top };
}
