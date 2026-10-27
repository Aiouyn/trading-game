import type { Rgb } from '../art/color';
import { mixOklab } from '../art/color';
import type { Ramps } from '../art/ramps';
import { FLOATS_PER_PART } from '../worker/format';
import { projectOrtho, viewDirection } from './camera';
import { FLAT_BRASS, FLAT_EXACT } from './overlay';
import { placeLabels, type LabelBox } from './labels';

/** Ground cells per bitmap pixel: the mask is drawn at ≤ 256 cells a side. */
export const groundStep = (size: number) => Math.max(1, Math.floor(size / 256));

/**
 * The ground mask as RGBA, one pixel per drawn cell (every step-th cell of the mask, as the old
 * per-cell loop sampled it). Class 0 (water) is transparent: the water fill underneath shows.
 * classRgba: 4 bytes per mask class, read back from the canvas so the colours are the ones
 * the per-cell fills produced.
 */
export function groundBitmap(mask: Uint8Array, size: number, step: number, classRgba: Uint8ClampedArray): { n: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const n = Math.ceil(size / step);
  const data = new Uint8ClampedArray(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = mask[j * step * size + i * step];
      if (k === 0) continue;
      data.set(classRgba.subarray(k * 4, k * 4 + 4), (j * n + i) * 4);
    }
  }
  return { n, data };
}

/**
 * Card 1 T0: grows land (non-transparent) pixels by one into the water, so the coast clip path,
 * which runs up to half a cell outside the stair-stepped mask, never shows the water fill
 * through a gap. In place; 4-neighbour, one pass.
 */
export function dilateLand(data: Uint8ClampedArray, n: number): void {
  // one 32-bit word per pixel (a T0 hot loop: ~2-3 ms per-byte on CI, explain-the-number #60)
  const px = new Uint32Array(data.buffer, data.byteOffset, n * n);
  const src = px.slice();
  const alpha = new Uint8Array(src.buffer);
  const solid = (p: number) => alpha[p * 4 + 3] !== 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0, p = j * n; i < n; i++, p++) {
      if (solid(p)) continue;
      const from = i > 0 && solid(p - 1) ? p - 1 : i < n - 1 && solid(p + 1) ? p + 1 : j > 0 && solid(p - n) ? p - n : j < n - 1 && solid(p + n) ? p + n : -1;
      if (from >= 0) px[p] = src[from];
    }
  }
}

/** Each CSS fill as the canvas resolves it: one 1×1 fill per class, read back as RGBA bytes. */
function fillBytes(fills: string[]): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = fills.length;
  c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return new Uint8ClampedArray(fills.length * 4);
  fills.forEach((f, i) => {
    g.fillStyle = f;
    g.fillRect(i, 0, 1, 1);
  });
  return g.getImageData(0, 0, fills.length, 1).data;
}

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
  /** Wall-clock ms per drawing stage (explains the T0 long task; read by the e2e hook only). */
  ms: Record<string, number>;
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
  /** card 1: world-space coast loops (x, z pairs, land inside under even-odd) and per-vertex quay flags */
  coast: { loops: Float32Array[]; quay: Uint8Array[] } | null;
  parts: Float32Array;
  colors: Float32Array;
  flat: Uint8Array;
  ramps: Ramps;
  /** Each label: its text and candidate ground points (metres), most preferred first. */
  labels: { text: string; ground: [number, number][] }[];
  labelFont: string;
  /** e2e profiling: flush the canvas (1 px read-back) at each stage so `ms` holds raster time too */
  profile?: boolean;
}): PictureResult {
  const { ramps } = opts;
  const ms: Record<string, number> = {};
  let t = performance.now();
  const lap = (k: string) => { if (opts.profile) g?.getImageData(0, 0, 1, 1); const now = performance.now(); ms[k] = Math.round((now - t) * 10) / 10; t = now; };
  const canvas = document.createElement('canvas');
  const W = Math.max(1, Math.round(opts.width * opts.dpr)), H = Math.max(1, Math.round(opts.height * opts.dpr));
  canvas.width = W;
  canvas.height = H;
  // willReadFrequently: a CPU (software) canvas. The picture is read back once (toDataURL), and an
  // accelerated canvas on a software GPU (SwiftShader: CI, the box, blocklisted GPUs) spent seconds
  // in that one flush (T0 profile, 2026-10-27).
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return { url: '', top: 0, bottom: 0, labels: [], ms };
  g.fillStyle = css(ramps.water);
  g.fillRect(0, 0, W, H);
  // label metrics first: the portrait crop must keep every district label on the picture
  const fontPx = Number(/(\d+(?:\.\d+)?)px/.exec(opts.labelFont)?.[1] ?? 16);
  g.font = opts.labelFont.replace(/(\d+(\.\d+)?)px/, (_, px) => `${Number(px) * opts.dpr}px`);
  const labelW = opts.labels.map((l) => g.measureText(l.text).width + 6 * opts.dpr);
  const n = opts.parts.length / FLOATS_PER_PART;
  const pad = PICTURE_PADDING_PX * opts.dpr;
  const { scale, uc, vc, v0, v1 } = fitPicture({ parts: opts.parts, labels: opts.labels.map((l, i) => ({ ground: l.ground, w: labelW[i] })), W, H, pad });
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
    // one n×n bitmap of the mask (one pixel per cell), mapped onto the ground plane by the
    // projection's affine transform: 1 drawImage instead of ~52k per-cell fills (T0 profile)
    const { mask, size, x0: gx, z0: gz, span } = opts.ground;
    const step = groundStep(size);
    const s = (span / size) * step;
    const fills = [css(ramps.water), css(ramps.land), css(ramps.park), css(ramps.road)];
    lap('setup');
    const bmp = groundBitmap(mask, size, step, fillBytes(fills));
    lap('bitmap');
    if (opts.coast) dilateLand(bmp.data, bmp.n);
    lap('dilate');
    const src = document.createElement('canvas');
    src.width = bmp.n;
    src.height = bmp.n;
    const sg = src.getContext('2d', { willReadFrequently: true });
    if (sg) {
      sg.putImageData(new ImageData(bmp.data, bmp.n, bmp.n), 0, 0);
      const [ox, oy] = toScreen(gx, 0, gz);
      const [ax, ay] = toScreen(gx + s, 0, gz);
      const [bx, by] = toScreen(gx, 0, gz + s);
      g.save();
      if (opts.coast) {
        // the vector shoreline: canvas AA on the clip gives the smooth coast, river banks and map edge
        const coast = new Path2D();
        for (const l of opts.coast.loops) {
          coast.moveTo(...toScreen(l[0], 0, l[1]));
          for (let k = 2; k < l.length; k += 2) coast.lineTo(...toScreen(l[k], 0, l[k + 1]));
          coast.closePath();
        }
        // MUTANT M2 (reverted next commit): g.clip(coast, 'evenodd');
      }
      g.imageSmoothingEnabled = false;
      g.setTransform(ax - ox, ay - oy, bx - ox, by - oy, ox, oy);
      g.drawImage(src, 0, 0);
      g.restore();
    }
    lap('clip+ground');
    if (opts.coast) {
      // quay coping: the coast segments whose both ends are quay, one stroke, at least 1 px
      const { loops, quay } = opts.coast;
      const cope = new Path2D();
      loops.forEach((l, li) => {
        const q = quay[li], m = q.length;
        for (let k = 0; k < m; k++) {
          const k2 = (k + 1) % m;
          if (!q[k] || !q[k2]) continue;
          cope.moveTo(...toScreen(l[k * 2], 0, l[k * 2 + 1]));
          cope.lineTo(...toScreen(l[k2 * 2], 0, l[k2 * 2 + 1]));
        }
      });
      g.save();
      g.strokeStyle = css(ramps.coping);
      g.lineWidth = Math.max(1, 0.5 * scale);
      g.stroke(cope);
      g.restore();
      lap('coping');
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
  lap('parts');
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
  lap('labels');
  const url = canvas.toDataURL('image/png');
  lap('encode');
  // MUTANT T0x1.3 (reverted next commit): 22 ms busy-wait = 30% of main's 74 ms median T0 longest task
  for (const end = performance.now() + 22; performance.now() < end;);
  return { url, top, bottom, labels: drawn, ms };
}

/**
 * The picture's projection (pure, unit-tested): scale and centre for a W×H device-px canvas.
 * "Contain" by default. In portrait, where a wide city would be a thin strip, it fills
 * PORTRAIT_MIN_FILL of the height and crops the sides around the dense core, but keeps one
 * label point of every district (with half its label width) in view, shrinking the picture
 * for that only down to PORTRAIT_FLOOR of the height (#26: Industrial Basin was cropped away).
 */
export function fitPicture(o: {
  parts: Float32Array;
  /** Per district label: candidate ground points (metres) and label width in device px. */
  labels: { ground: [number, number][]; w: number }[];
  W: number;
  H: number;
  pad: number;
}): { scale: number; uc: number; vc: number; u0: number; u1: number; v0: number; v1: number; anchors: number[] } {
  const { W, H, pad } = o;
  const n = o.parts.length / FLOATS_PER_PART;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = i * FLOATS_PER_PART;
    const [x, z, w, d, y0, h] = [o.parts[p], o.parts[p + 1], o.parts[p + 2], o.parts[p + 3], o.parts[p + 4], o.parts[p + 5]];
    for (const [cx, cy, cz] of [[x - w / 2, y0, z - d / 2], [x + w / 2, y0, z + d / 2], [x - w / 2, y0, z + d / 2], [x + w / 2, y0, z - d / 2], [x, y0 + h, z]] as [number, number, number][]) {
      const [u, v] = projectOrtho([cx, cy, cz], 0);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
  }
  if (!Number.isFinite(u0)) [u0, u1, v0, v1] = [-1, 1, -1, 1];
  const du = Math.max(1e-6, u1 - u0), dv = Math.max(1e-6, v1 - v0);
  let scale = Math.min((W - 2 * pad) / du, (H - 2 * pad) / dv);
  let uc = (u0 + u1) / 2;
  const vc = (v0 + v1) / 2;
  let chosen: number[] = [];
  if (dv * scale < PORTRAIT_MIN_FILL * H) {
    // portrait: fill ≥ 45 % of the height and crop the sides, centred on the weighted centre of
    // the built area (the dense core), clamped so no empty margin shows on either side.
    scale = Math.min((PORTRAIT_MIN_FILL * H) / dv, (H - 2 * pad) / dv);
    let su = 0, sw = 0;
    for (let i = 0; i < n; i++) {
      const p = i * FLOATS_PER_PART;
      const wgt = o.parts[p + 2] * o.parts[p + 3] * Math.max(1, o.parts[p + 5]);
      su += projectOrtho([o.parts[p], 0, o.parts[p + 1]], 0)[0] * wgt;
      sw += wgt;
    }
    const core = sw > 0 ? su / sw : uc;
    // every district must stay labelled: fit the span of the label anchors, each with half its
    // label width, into the view. Shrink the picture only as far as that needs, never below the
    // PORTRAIT_FLOOR (41 %) of the height. Per district, the anchor is its candidate label point
    // closest to the core (any point of the district will do).
    const anchors = o.labels.map((l) => {
      let best = l.ground.length ? projectOrtho([l.ground[0][0], 0, l.ground[0][1]], 0)[0] : core;
      for (const [x, z] of l.ground) {
        const u = projectOrtho([x, 0, z], 0)[0];
        if (Math.abs(u - core) < Math.abs(best - core)) best = u;
      }
      return { u: best, half: l.w / 2 };
    });
    chosen = anchors.map((a) => a.u);
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
  return { scale, uc, vc, u0, u1, v0, v1, anchors: chosen };
}
