import type { Rgb } from '../art/color';
import type { Ramps } from '../art/ramps';
import { FLOATS_PER_PART } from '../worker/format';
import { projectOrtho, viewDirection } from './camera';

const css = (c: Rgb, k = 1) => `color(srgb ${c[0] * k} ${c[1] * k} ${c[2] * k})`;

/**
 * T0 picture [P]: a static canvas2d snapshot of the city (no WebGL), returned as a data URL.
 * Same projection as the 3D camera at rotation 0.
 */
export function drawPicture(opts: {
  width: number;
  height: number;
  extent: number;
  ground: { mask: Uint8Array; size: number } | null;
  parts: Float32Array;
  colors: Float32Array;
  flat: Uint8Array;
  ramps: Ramps;
}): string {
  const { width, height, extent, ramps } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const g = canvas.getContext('2d');
  if (!g) return '';
  g.fillStyle = css(ramps.water);
  g.fillRect(0, 0, canvas.width, canvas.height);
  const span = extent * Math.SQRT2 * 2;
  const scale = Math.min(canvas.width / span, canvas.height / (span * 0.5)) * 0.98;
  const toScreen = (x: number, y: number, z: number): [number, number] => {
    const [u, v] = projectOrtho([x, y, z], 0);
    return [canvas.width / 2 + u * scale, canvas.height / 2 - v * scale];
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
    const { mask, size } = opts.ground;
    const step = Math.max(1, Math.floor(size / 160));
    const cell = (2 * extent) / size;
    const fills = [css(ramps.water), css(ramps.land), css(ramps.park), css(ramps.road)];
    for (let j = 0; j < size; j += step) {
      for (let i = 0; i < size; i += step) {
        const k = mask[j * size + i];
        if (k === 0) continue;
        const x0 = -extent + i * cell, z0 = -extent + j * cell, s = cell * step;
        quad([toScreen(x0, 0, z0), toScreen(x0 + s, 0, z0), toScreen(x0 + s, 0, z0 + s), toScreen(x0, 0, z0 + s)], fills[k]);
      }
    }
  }
  const n = opts.parts.length / FLOATS_PER_PART;
  const [dx, , dz] = viewDirection(0);
  const order = Array.from({ length: n }, (_, i) => i);
  const depth = (i: number) => opts.parts[i * FLOATS_PER_PART] * dx + opts.parts[i * FLOATS_PER_PART + 1] * dz;
  order.sort((a, b) => depth(a) - depth(b) || opts.parts[a * FLOATS_PER_PART + 4] - opts.parts[b * FLOATS_PER_PART + 4]);
  for (const i of order) {
    const o = i * FLOATS_PER_PART;
    const [x, z, w, d, y0, h] = [opts.parts[o], opts.parts[o + 1], opts.parts[o + 2], opts.parts[o + 3], opts.parts[o + 4], opts.parts[o + 5]];
    const c: Rgb = [opts.colors[i * 3], opts.colors[i * 3 + 1], opts.colors[i * 3 + 2]];
    const isFlat = opts.flat[i] === 1;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h;
    // camera sits at +x/+z, so the +x and +z faces and the roof are visible
    quad([toScreen(x1, y0, z0), toScreen(x1, y0, z1), toScreen(x1, y1, z1), toScreen(x1, y1, z0)], isFlat ? css(c) : css(c, 0.78));
    quad([toScreen(x0, y0, z1), toScreen(x1, y0, z1), toScreen(x1, y1, z1), toScreen(x0, y1, z1)], isFlat ? css(c) : css(c, 0.64));
    quad([toScreen(x0, y1, z0), toScreen(x1, y1, z0), toScreen(x1, y1, z1), toScreen(x0, y1, z1)], isFlat ? css(c) : css(c, 1));
  }
  return canvas.toDataURL('image/png');
}
