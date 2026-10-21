import type { Rgb } from '../art/color';
import { mixOklab } from '../art/color';
import type { Ramps } from '../art/ramps';
import { FLOATS_PER_PART } from '../worker/format';
import { projectOrtho, viewDirection } from './camera';
import { FLAT_BRASS, FLAT_EXACT } from './overlay';
import { placeLabels, type LabelBox } from './labels';

const css = (c: Rgb, k = 1) => `color(srgb ${c[0] * k} ${c[1] * k} ${c[2] * k})`;
export const PICTURE_PADDING_PX = 16;
/** Portrait (phone) T0: the picture fills at least this share of the viewport height (review M6). */
export const PORTRAIT_MIN_FILL = 0.45;
/** ...and never less than this, even to keep every district label on screen. */
export const PORTRAIT_FLOOR = 0.41;

export interface PictureResult {
  url: string;
  /** Vertical extent of the drawn city, CSS px from the top of the stage. */
  top: number;
  bottom: number;
  /** Labels as drawn, CSS px; labels that would be clipped or overlap another are left out. */
  labels: (LabelBox & { text: string })[];
}

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
  /** Each label: its text and candidate ground points (metres), most preferred first. */
  labels: { text: string; ground: [number, number][] }[];
  labelFont: string;
}): PictureResult {
  const { ramps } = opts;
  const canvas = document.createElement('canvas');
  const W = Math.max(1, Math.round(opts.width * opts.dpr)), H = Math.max(1, Math.round(opts.height * opts.dpr));
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return { url: '', top: 0, bottom: 0, labels: [] };
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
  const du = Math.max(1e-6, u1 - u0), dv = Math.max(1e-6, v1 - v0);
  let scale = Math.min((W - 2 * pad) / du, (H - 2 * pad) / dv);
  let uc = (u0 + u1) / 2;
  const vc = (v0 + v1) / 2;
  // label metrics first: the portrait crop must keep every district label on the picture
  const fontPx = Number(/(\d+(?:\.\d+)?)px/.exec(opts.labelFont)?.[1] ?? 16);
  g.font = opts.labelFont.replace(/(\d+(\.\d+)?)px/, (_, px) => `${Number(px) * opts.dpr}px`);
  const labelW = opts.labels.map((l) => g.measureText(l.text).width + 6 * opts.dpr);
  if (dv * scale < PORTRAIT_MIN_FILL * H) {
    // portrait: a wide city fitted to the width would be a thin strip. Fill ≥ 45 % of the
    // height instead and crop the sides, centred on the weighted centre of the built area
    // (the dense core), clamped so no empty margin shows on either side.
    scale = Math.min((PORTRAIT_MIN_FILL * H) / dv, (H - 2 * pad) / dv);
    let su = 0, sw = 0;
    for (let i = 0; i < n; i++) {
      const o = i * FLOATS_PER_PART;
      const wgt = opts.parts[o + 2] * opts.parts[o + 3] * Math.max(1, opts.parts[o + 5]);
      su += projectOrtho([opts.parts[o], 0, opts.parts[o + 1]], 0)[0] * wgt;
      sw += wgt;
    }
    const core = sw > 0 ? su / sw : uc;
    // every district must stay labelled (Industrial Basin was cropped away): fit the span of the
    // label anchors, each with half its label width, into the view. Shrink the picture only as
    // far as that needs, never below the 40 % floor.
    // per district, the candidate label point closest to the core (any point of the district will do)
    const anchors = opts.labels.map((l, i) => {
      let best = l.ground.length ? projectOrtho([l.ground[0][0], 0, l.ground[0][1]], 0)[0] : core;
      for (const [x, z] of l.ground) {
        const u = projectOrtho([x, 0, z], 0)[0];
        if (Math.abs(u - core) < Math.abs(best - core)) best = u;
      }
      return { u: best, half: labelW[i] / 2 };
    });
    const span = (k: number) => {
      let lo = Infinity, hi = -Infinity;
      for (const a of anchors) {
        lo = Math.min(lo, a.u - a.half / k);
        hi = Math.max(hi, a.u + a.half / k);
      }
      return { lo, hi };
    };
    const room = W - 2 * pad;
    const floor = (PORTRAIT_FLOOR * H) / dv;
    for (let it = 0; it < 30 && anchors.length; it++) {
      const { lo, hi } = span(scale);
      if ((hi - lo) * scale <= room || scale <= floor) break;
      scale = Math.max(floor, Math.min(scale * 0.97, room / (hi - lo)));
    }
    const halfView = (W / 2 - pad) / scale;
    const { lo, hi } = anchors.length ? span(scale) : { lo: core, hi: core };
    // centre on the core, shifted just enough to keep every label anchor in view
    uc = Math.min(lo + halfView, Math.max(hi - halfView, core));
    uc = Math.min(u1 - halfView, Math.max(u0 + halfView, uc));
    if (anchors.length && (hi - lo) * scale <= room) uc = Math.min(lo + halfView, Math.max(hi - halfView, uc));
  }
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
  // district labels: --fg with a 3 px --bg0 knockout stroke (no shadow). Laid out like the 3D
  // labels: a label moves to another point of its district, or is left out, rather than being
  // clipped by the edge or drawn over another label (review: "Financial Mile" on phone T0).
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 6 * opts.dpr; // 3 px each side of the glyph edge
  g.strokeStyle = css(ramps.labelHalo);
  g.fillStyle = css(ramps.label);
  const k = opts.dpr;
  const inputs = opts.labels.map((l) => ({
    w: g.measureText(l.text).width / k + 6,
    h: fontPx * 1.25 + 6,
    candidates: l.ground.map(([x, z]) => {
      const [sx, sy] = toScreen(x, 0, z);
      return { x: sx / k, y: sy / k };
    }),
  }));
  const boxes = placeLabels(inputs, [], { w: W / k, h: H / k }, 4);
  const drawn: (LabelBox & { text: string })[] = [];
  boxes.forEach((b, i) => {
    const inside = b.x >= 0 && b.y >= 0 && b.x + b.w <= W / k && b.y + b.h <= H / k;
    if (!inside) return;
    const cx = (b.x + b.w / 2) * k, cy = (b.y + b.h / 2) * k;
    g.strokeText(opts.labels[i].text, cx, cy);
    g.fillText(opts.labels[i].text, cx, cy);
    drawn.push({ ...b, text: opts.labels[i].text });
  });
  // vertical extent of the city as drawn (ground + parts), CSS px
  const top = Math.max(0, (H / 2 - (v1 - vc) * scale) / k);
  const bottom = Math.min(H / k, (H / 2 - (v0 - vc) * scale) / k);
  return { url: canvas.toDataURL('image/png'), top, bottom, labels: drawn };
}
