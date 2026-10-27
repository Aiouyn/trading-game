import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { generateCity } from './fixtures/generate-city';
import * as gf from '../../../src/city/renderer/groundfield';
import type { HarnessWindow } from './helpers';

/** Pixel, coverage and ground-field helpers shared by card1.spec and card2.spec (moved from card1.spec). */
// ---------- pixels ----------
export interface Img { w: number; h: number; d: Buffer }
export async function decode(buf: Buffer): Promise<Img> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: data };
}
export type RGB = [number, number, number];
export const at = (im: Img, x: number, y: number): RGB => {
  const o = (y * im.w + x) * 4;
  return [im.d[o], im.d[o + 1], im.d[o + 2]];
};
/** Bilinear luminance at CSS px (sx, sy); pixel centres at i + 0.5. */
export function lumAt(im: Img, sx: number, sy: number): number {
  const u = sx - 0.5, v = sy - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const L = (x: number, y: number) => lum(at(im, x, y));
  return (L(i, j) * (1 - fu) + L(i + 1, j) * fu) * (1 - fv) + (L(i, j + 1) * (1 - fu) + L(i + 1, j + 1) * fu) * fv;
}
export const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const median = (cs: RGB[]): RGB => {
  const m = (k: number) => cs.map((c) => c[k]).sort((a, b) => a - b)[cs.length >> 1];
  return [m(0), m(1), m(2)];
};

export interface Cover { w: number; h: number; bits: Uint8Array }
export async function coverage(page: Page, what: 'parts' | 'material' | 'brass' = 'parts', id?: number): Promise<Cover> {
  const c = await page.evaluate(([w, i]) => (window as unknown as HarnessWindow).__city.coverage(w, i), [what, id] as const);
  if (!c) throw new Error(`coverage(${what}) returned null`);
  return { w: c.w, h: c.h, bits: new Uint8Array(Buffer.from(c.bits, 'base64')) };
}
/** Is the image pixel (or a neighbour) covered by a part? Coverage may be at device resolution. */
export function covered(cv: Cover, im: Img, x: number, y: number, pad = 1): boolean {
  const k = cv.w / im.w;
  for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
    const X = Math.floor((x + dx + 0.5) * k), Y = Math.floor((y + dy + 0.5) * k);
    if (X < 0 || Y < 0 || X >= cv.w || Y >= cv.h) return true;
    const b = Y * cv.w + X;
    if (cv.bits[b >> 3] & (1 << (b & 7))) return true; // LSB-first, as partsCoverage packs
  }
  return false;
}

export function interior(cv: Cover, im: Img, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!covered(cv, im, x + dx, y + dy, 0)) return false;
  return true;
}

/** Ground (x, z) <-> CSS px. The camera is orthographic, so the map is affine. */
export async function groundMap(page: Page) {
  const p = await page.evaluate(() => {
    const c = (window as unknown as HarnessWindow).__city;
    return [c.projectGround(0, 0), c.projectGround(100, 0), c.projectGround(0, 100)];
  });
  if (p.some((q) => !q)) throw new Error('projectGround returned null');
  const [o, a, b] = p as { x: number; y: number }[];
  const U = [(a.x - o.x) / 100, (a.y - o.y) / 100], V = [(b.x - o.x) / 100, (b.y - o.y) / 100];
  const det = U[0] * V[1] - U[1] * V[0];
  return {
    toPx: (x: number, z: number) => [o.x + x * U[0] + z * V[0], o.y + x * U[1] + z * V[1]] as const,
    toGround: (sx: number, sy: number) => {
      const dx = sx - o.x, dy = sy - o.y;
      return [(dx * V[1] - dy * V[0]) / det, (U[0] * dy - U[1] * dx) / det] as const;
    },
    /** metres per CSS px along x */
    mPerPx: 1 / Math.hypot(U[0], U[1]),
  };
}

// ---------- the field, rebuilt in node from the same fixture ----------
export type Field = {
  s: (x: number, z: number) => number; r: (x: number, z: number) => number; district: (x: number, z: number) => number; jDist: (x: number, z: number) => number;
  /** junction boxes (connected J cells): centre and size in cells */
  junctions: { x: number; z: number; cells: number; w: number; h: number }[];
  /** park cell (mask 2) within two cells (park and verge), reported separately for AC10 */
  nearPark: (x: number, z: number) => boolean;
};
let fieldP: Promise<Field> | null = null;
export function field(): Promise<Field> {
  fieldP ??= (async () => {
    const city = generateCity();
    const mask = city.files.get(city.manifests.get(1)!.ground.url)!;
    const f = gf.buildGroundField({ mask, size: 512, x0: -512, z0: -512, span: 1024 }, city.snapshot.districts);
    const J = new Uint8Array(512 * 512);
    for (let k = 0; k < J.length; k++) J[k] = f.rgba[k * 4 + 3] ? 1 : 0;
    const jsq = gf.squaredDistance(J, 512);
    const cell = (x: number, z: number) => Math.min(511, Math.max(0, Math.floor((x + 512) / 2))) + 512 * Math.min(511, Math.max(0, Math.floor((z + 512) / 2)));
    const bil = (ch: number) => (x: number, z: number) => {
      const u = (x + 512) / 2 - 0.5, v = (z + 512) / 2 - 0.5;
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const t = (a: number, b: number) => gf.decodeDistance(f.rgba[(b * 512 + a) * 4 + ch]);
      return (t(i, j) * (1 - fu) + t(i + 1, j) * fu) * (1 - fv) + (t(i, j + 1) * (1 - fu) + t(i + 1, j + 1) * fu) * fv;
    };
    const junctions: Field['junctions'] = [], seen = new Uint8Array(J.length);
    for (let k0 = 0; k0 < J.length; k0++) {
      if (!J[k0] || seen[k0]) continue;
      const stack = [k0]; seen[k0] = 1;
      let n = 0, sx = 0, sz = 0, i0 = 511, i1 = 0, j0 = 511, j1 = 0;
      while (stack.length) {
        const k = stack.pop()!, i = k % 512, j = (k / 512) | 0;
        n++; sx += i; sz += j; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
        for (const q of [i > 0 ? k - 1 : -1, i < 511 ? k + 1 : -1, j > 0 ? k - 512 : -1, j < 511 ? k + 512 : -1]) if (q >= 0 && J[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
      junctions.push({ x: -512 + (sx / n + 0.5) * 2, z: -512 + (sz / n + 0.5) * 2, cells: n, w: i1 - i0 + 1, h: j1 - j0 + 1 });
    }
    return { s: bil(0), r: bil(1), district: (x, z) => f.rgba[cell(x, z) * 4 + 2], jDist: (x, z) => Math.sqrt(jsq[cell(x, z)]) * 2, junctions,
      nearPark: (x, z) => [-2, 0, 2].some((dx) => [-2, 0, 2].some((dz) => mask[cell(x + dx, z + dz)] === 2)) };
  })();
  return fieldP;
}

/** Median colour of uncovered pixels whose ground point passes `pick`. */
export function refColour(im: Img, cv: Cover, gm: Awaited<ReturnType<typeof groundMap>>, pick: (x: number, z: number) => boolean): { c: RGB; n: number } {
  const cs: RGB[] = [];
  for (let y = 0; y < im.h; y += 1) for (let x = 0; x < im.w; x += 1) {
    const [gx, gz] = gm.toGround(x + 0.5, y + 0.5);
    if (pick(gx, gz) && !covered(cv, im, x, y)) cs.push(at(im, x, y));
  }
  return { c: cs.length ? median(cs) : [0, 0, 0], n: cs.length };
}
export const pixAt = (im: Img, gm: Awaited<ReturnType<typeof groundMap>>, x: number, z: number) => {
  const [sx, sy] = gm.toPx(x, z);
  const X = Math.floor(sx), Y = Math.floor(sy);
  return X >= 0 && Y >= 0 && X < im.w && Y < im.h ? ([X, Y] as const) : null;
};

/**
 * Profiles across every road edge in view (sampled on a 6 px grid): road at r = -0.8 m, the kerb
 * peak in r = -0.2..0.6 m, sidewalk at r = 1.1 m. The kerb is ~1 px at zoom 4, so it is found as
 * the brightest line, not as pure pixels.
 */
export function kerbEdges(im: Img, gm: Awaited<ReturnType<typeof groundMap>>, cv: Cover, F: Field) {
  let edges = 0, kerbOk = 0, walkOk = 0;
  const over: number[] = [], walkOver: number[] = [];
  for (let sy = 3; sy < im.h - 3; sy += 6) for (let sx = 3; sx < im.w - 3; sx += 6) {
    const [gx, gz] = gm.toGround(sx, sy);
    const r0 = F.r(gx, gz);
    if (r0 < -0.5 || r0 > 0.5 || F.s(gx, gz) < 5) continue;
    const e = 0.05, nx = (F.r(gx + e, gz) - F.r(gx - e, gz)) / (2 * e), nz = (F.r(gx, gz + e) - F.r(gx, gz - e)) / (2 * e), gl = Math.hypot(nx, nz);
    if (gl < 0.7) continue; // corners and ridges
    const L = (t: number) => {
      const p = pixAt(im, gm, gx + (nx / gl) * (t - r0), gz + (nz / gl) * (t - r0));
      return p && !covered(cv, im, p[0], p[1]) ? lum(at(im, p[0], p[1])) : NaN;
    };
    const roadL = L(-0.8), walkL = L(1.1);
    let peak = -1;
    for (let t = -0.2; t <= 0.6; t += 0.05) { const l = L(t); if (Number.isNaN(l)) { peak = NaN; break; } peak = Math.max(peak, l); }
    if ([roadL, walkL, peak].some(Number.isNaN)) continue;
    edges++;
    if (peak >= walkL + 3 && peak >= roadL + 3) kerbOk++;
    if (walkL >= roadL + 2) walkOk++;
    over.push(peak - roadL); walkOver.push(walkL - roadL);
  }
  const med = (a: number[]) => +(a.sort((x, y) => x - y)[a.length >> 1] ?? 0).toFixed(1);
  return { edges, kerbOk, walkOk, kerbOverRoad: med(over), walkOverRoad: med(walkOver) };
}

export function popcount(b: number) { let n = 0; for (; b; b &= b - 1) n++; return n; }
