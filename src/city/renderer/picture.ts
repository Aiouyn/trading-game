import type { Rgb } from '../art/color';
import { mixOklab } from '../art/color';
import type { Ramps } from '../art/ramps';
import { FLOATS_PER_PART } from '../worker/format';
import { projectOrtho, viewDirection } from './camera';
import { FLAT_BRASS, FLAT_EXACT } from './overlay';

const css = (c: Rgb, k = 1) => `color(srgb ${c[0] * k} ${c[1] * k} ${c[2] * k})`;
export const PICTURE_PADDING_PX = 16;

/**
 * T0 picture [P]: a static canvas2d drawing of the city (no WebGL), returned as a data URL.
 * Same projection as the 3D camera at rotation 0, fitted to the built area ("contain", 16 px
 * padding, review M6), same three face shades as T1/T2, district labels on top.
 */
export function drawPicture(opts: {
  width: number;
  height: number;
  dpr: number;
  ground: { mask: Uint8Array; size: number; x0: number; z0: number; span: number } | null;
  parts: Float32Array;
  colors: Float32Array;
  flat: Uint8Array;
  ramps: Ramps;
  labels: { text: string; x: number; z: number }[];
  labelFont: string;
}): string {
  const { ramps } = opts;
  const canvas = document.createElement('canvas');
  const W = Math.max(1, Math.round(opts.width * opts.dpr)), H = Math.max(1, Math.round(opts.height * opts.dpr));
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return '';
  g.fillStyle = css(ramps.water);
  g.fillRect(0, 0, W, H);
  // fit: projected bounds of every part
  const n = opts.parts.length / FLOATS_PER_PART;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = i * FLOATS_PER_PART;
    const [x, z, w, d, y0, h] = [opts.parts[o], opts.parts[o + 1], opts.parts[o + 2], opts.parts[o + 3], opts.parts[o + 4], opts.parts[o + 5]];
    for (const [cx, cy, cz] of [[x - w / 2, y0, z - d / 2], [x + w / 2, y0, z + d / 2], [x - w / 2, y0, z + d / 2], [x + w / 2, y0, z - d / 2], [x, y0 + h, z]] as [number, number, number][]) {
      const [u, v] = projectOrtho([cx, cy, cz], 0);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
  }
  if (!Number.isFinite(u0)) [u0, u1, v0, v1] = [-1, 1, -1, 1];
  const pad = PICTURE_PADDING_PX * opts.dpr;
  const scale = Math.min((W - 2 * pad) / Math.max(1e-6, u1 - u0), (H - 2 * pad) / Math.max(1e-6, v1 - v0));
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const toScreen = (x: number, y: number, z: number): [number, number] => {
    const [u, v] = projectOrtho([x, y, z], 0);
    return [W / 2 + (u - uc) * scale, H / 2 - (v - vc) * scale];
  };
  const quad = (pts: [number, number][], fill: string) => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  if (opts.ground) {
    const { mask, size, x0: gx, z0: gz, span } = opts.ground;
    const step = Math.max(1, Math.floor(size / 256));
    const cell = span / size;
    const fills = [css(ramps.water), css(ramps.land), css(ramps.park), css(ramps.road)];
    for (let j = 0; j < size; j += step) {
      for (let i = 0; i < size; i += step) {
        const k = mask[j * size + i];
        if (k === 0) continue;
        const x0 = gx + i * cell, z0 = gz + j * cell, s = cell * step;
        quad([toScreen(x0, 0, z0), toScreen(x0 + s, 0, z0), toScreen(x0 + s, 0, z0 + s), toScreen(x0, 0, z0 + s)], fills[k]);
      }
    }
  }
  const [dx, , dz] = viewDirection(0);
  const order = Array.from({ length: n }, (_, i) => i);
  const depth = (i: number) => opts.parts[i * FLOATS_PER_PART] * dx + opts.parts[i * FLOATS_PER_PART + 1] * dz;
  order.sort((a, b) => depth(a) - depth(b) || opts.parts[a * FLOATS_PER_PART + 4] - opts.parts[b * FLOATS_PER_PART + 4]);
  for (const i of order) {
    const o = i * FLOATS_PER_PART;
    const [x, z, w, d, y0, h] = [opts.parts[o], opts.parts[o + 1], opts.parts[o + 2], opts.parts[o + 3], opts.parts[o + 4], opts.parts[o + 5]];
    const c: Rgb = [opts.colors[i * 3], opts.colors[i * 3 + 1], opts.colors[i * 3 + 2]];
    const f = opts.flat[i];
    // camera sits at +x/+z; the dusk key comes from the west-south-west, so +z (south) faces are
    // lit and +x (east) faces are in shadow, as in T1/T2
    const top = f === FLAT_BRASS ? ramps.brassHi : f === FLAT_EXACT ? c : mixOklab(c, ramps.top, 0.55);
    const lit = f === FLAT_BRASS ? ramps.brass : f === FLAT_EXACT ? c : mixOklab(mixOklab(c, ramps.keyLight, 0.16), ramps.fillLight, 0.1);
    const shade = f === FLAT_BRASS ? ramps.brassLo : f === FLAT_EXACT ? c : mixOklab(mixOklab(c, ramps.shadow, 0.42), ramps.fillLight, 0.1);
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h;
    quad([toScreen(x1, y0, z0), toScreen(x1, y0, z1), toScreen(x1, y1, z1), toScreen(x1, y1, z0)], css(shade));
    quad([toScreen(x0, y0, z1), toScreen(x1, y0, z1), toScreen(x1, y1, z1), toScreen(x0, y1, z1)], css(lit));
    quad([toScreen(x0, y1, z0), toScreen(x1, y1, z0), toScreen(x1, y1, z1), toScreen(x0, y1, z1)], css(top));
  }
  // district labels: --fg with a 3 px --bg0 knockout stroke (no shadow)
  g.font = opts.labelFont.replace(/(\d+(\.\d+)?)px/, (_, px) => `${Number(px) * opts.dpr}px`);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 6 * opts.dpr; // 3 px each side of the glyph edge
  g.strokeStyle = css(ramps.labelHalo);
  g.fillStyle = css(ramps.label);
  for (const l of opts.labels) {
    const [sx, sy] = toScreen(l.x, 0, l.z);
    g.strokeText(l.text, sx, sy);
    g.fillText(l.text, sx, sy);
  }
  return canvas.toDataURL('image/png');
}
