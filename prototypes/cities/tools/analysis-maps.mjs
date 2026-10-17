// Control layers for the road plan. Drawn from the generator, not from a beauty render,
// so a conflict is a measured overlap and not a camera trick.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { PERSONALITIES } from '../src/personalities.js';
import { generateCity } from '../src/gen.js';

const outDir = resolve(process.argv[2] ?? 'prototypes/cities/evidence/plans');
mkdirSync(outDir, { recursive: true });

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

function stamp(img, W, H, x0, y0, x1, y1, rgb, rad) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const minx = Math.max(0, Math.floor(Math.min(x0, x1) - rad));
  const maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + rad));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1) - rad));
  const maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + rad));
  const r2 = rad * rad;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
    const px = x0 + dx * t, py = y0 + dy * t;
    if ((x - px) ** 2 + (y - py) ** 2 > r2) continue;
    const o = (y * W + x) * 4;
    img[o] = rgb[0]; img[o + 1] = rgb[1]; img[o + 2] = rgb[2]; img[o + 3] = 255;
  }
}

const city = await generateCity(PERSONALITIES.avalon);
const S = city.S, half = S / 2;
const W = 900, H = 900;
const sc = W / S;
const toX = (x) => (x + half) * sc;
const toY = (y) => (y + half) * sc; // model y points south, matching the overhead render

const blank = (rgb) => {
  const img = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { img[i * 4] = rgb[0]; img[i * 4 + 1] = rgb[1]; img[i * 4 + 2] = rgb[2]; img[i * 4 + 3] = 255; }
  return img;
};
const save = (name, img) => {
  writeFileSync(`${outDir}/${name}.png`, png(W, H, img));
  console.log(name);
};

const water = [18, 52, 78], land = [186, 176, 148], field = [168, 176, 122];
const heightImg = blank(land);
const N = city.N, RES = city.RES;
let hMin = Infinity, hMax = 0;
for (let k = 0; k < city.H.length; k++) if (city.H[k] > 0) { hMin = Math.min(hMin, city.H[k]); hMax = Math.max(hMax, city.H[k]); }
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = -half + (i + 0.5) / sc, y = -half + (j + 0.5) / sc;
  const ix = Math.max(0, Math.min(N - 1, Math.floor((x + half) / RES)));
  const iy = Math.max(0, Math.min(N - 1, Math.floor((y + half) / RES)));
  const h = city.H[iy * N + ix];
  const o = (j * W + i) * 4;
  if (h < 0) { heightImg[o] = water[0]; heightImg[o + 1] = water[1]; heightImg[o + 2] = water[2]; continue; }
  const t = (h - hMin) / Math.max(1, hMax - hMin);
  heightImg[o] = Math.round(40 + 180 * t);
  heightImg[o + 1] = Math.round(90 + 80 * (1 - Math.abs(t - 0.45)));
  heightImg[o + 2] = Math.round(50 + 40 * (1 - t));
}
save('variant-height', heightImg);

const use = blank([214, 206, 186]);
const useColor = {
  cbd: [48, 78, 128],
  working: [176, 92, 42],
  prime: [168, 132, 64],
  mid: [150, 78, 62],
  rural: [120, 132, 72],
};
for (const b of city.buildings) {
  const tier = b.d?.tier ?? 'mid';
  const industrial = tier === 'working' || ['warehouse', 'containers', 'crane'].includes(b.type);
  const residential = ['row', 'house', 'gabled', 'midrise', 'loft', 'mansion', 'villa', 'glassvilla', 'palazzo', 'condo', 'micro', 'hut'].includes(b.type);
  const col = industrial ? useColor.working : tier === 'cbd' && !residential ? useColor.cbd : residential ? useColor.mid : useColor[tier] ?? useColor.mid;
  const hw = (b.w ?? 8) / 2 * sc, hd = (b.dp ?? 10) / 2 * sc;
  const cx = toX(b.x), cy = toY(b.y);
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  for (let iy = -hd; iy <= hd; iy++) for (let ix = -hw; ix <= hw; ix++) {
    const px = Math.round(cx + c * ix - s * iy), py = Math.round(cy + s * ix + c * iy);
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const o = (py * W + px) * 4;
    use[o] = col[0]; use[o + 1] = col[1]; use[o + 2] = col[2];
  }
}
save('variant-landuse', use);

const roads = blank([232, 226, 214]);
const clsColor = { 4: [40, 40, 44], 3: [78, 72, 64], 2: [120, 114, 104], 1: [168, 150, 120], 0: [150, 132, 96] };
const drawNet = (img, list, widthOf) => {
  for (const e of list) {
    const col = clsColor[e.cls] ?? clsColor[2];
    const w = widthOf(e);
    for (let i = 1; i < e.pts.length; i++) {
      stamp(img, W, H, toX(e.pts[i - 1][0]), toY(e.pts[i - 1][1]), toX(e.pts[i][0]), toY(e.pts[i][1]), col, Math.max(1.1, w * sc * 0.5));
    }
  }
};
drawNet(roads, city.roadGraph.edges, (e) => e.cls >= 4 ? 15 : e.cls === 3 ? 10 : 7);
save('variant-roads', roads);

const deg = new Map();
for (const e of city.roadGraph.edges) {
  deg.set(e.a, (deg.get(e.a) || 0) + 1);
  deg.set(e.b, (deg.get(e.b) || 0) + 1);
}
const junc = Buffer.from(roads);
let stops = 0, signals = 0, tees = 0, crosses = 0;
for (const [id, n] of deg) {
  if (n < 3) continue;
  if (n === 3) tees++; else crosses++;
  const [x, y] = city.roadGraph.nodes[id];
  const arms = city.roadGraph.edges.filter((e) => e.a === id || e.b === id);
  const maxCls = Math.max(...arms.map((e) => e.cls));
  const majors = arms.filter((e) => e.cls >= 3).length;
  const signal = n >= 4 && majors >= 3;
  if (signal) signals++; else stops++;
  stamp(junc, W, H, toX(x), toY(y), toX(x), toY(y), signal ? [196, 48, 42] : [32, 96, 168], signal ? 5 : 3.2);
}
save('variant-junctions', junc);

let clips = 0;
for (const b of city.buildings) {
  const hw = (b.w ?? 8) / 2, hd = (b.dp ?? 10) / 2;
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, d]) => [b.x + c * a - s * d, b.y + s * a + c * d]);
  for (const e of city.roadGraph.edges) {
    if (e.cls < 2) continue;
    const rw = (e.cls >= 4 ? 15 : e.cls === 3 ? 10 : 7) / 2;
    for (let i = 1; i < e.pts.length; i++) {
      const [ax, ay] = e.pts[i - 1], [bx, by] = e.pts[i];
      for (const [px, py] of corners) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
        if (d < rw - 0.4) { clips++; break; }
      }
    }
  }
}
console.log(JSON.stringify({
  buildings: city.buildings.length,
  edges: city.roadGraph.edges.length,
  tees, crosses, signals, stops, clips,
  height: { min: Math.round(hMin * 10) / 10, max: Math.round(hMax * 10) / 10 },
  ms: city.ms,
}, null, 2));
