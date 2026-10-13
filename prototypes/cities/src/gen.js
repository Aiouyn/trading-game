// The city generator: seed + personality -> roads, blocks, lots, buildings, trees and ground data.
// Pure data out. Pipeline: terrain -> districts and land value -> tensor field -> streets (canals,
// arterials, collectors, locals) -> blocks -> parcels -> buildings -> life -> development order.

import { rng, makeNoise, hash2, clamp, lerp, smoothstep } from './noise.js';
import { COMPANIES } from './companies.js';
import { Parts, buildArchetype, buildLandmark, buildTree, buildCrane, buildShip, buildBoat, CONTAINER_COLORS } from './archetypes.js';
import { sampleOutskirts, outskirtsHeight, traceHighways, borderSurface, nearestNode } from './outskirts.js';

const RES = 2;   // fine raster, metres per cell
const R4 = 4;    // coarse raster (terrain, districts, land value)
const FRES = 8;  // tensor field resolution

const HALF_PI = Math.PI / 2;

export async function generateCity(P, progress = () => {}) {
  const t0 = performance.now();
  const timings = {};
  let tLast = t0;
  const step = async (label) => {
    const now = performance.now();
    timings[label] = Math.round(now - tLast);
    tLast = now;
    progress(label);
    await new Promise((r) => setTimeout(r, 0));
  };

  const S = P.size, half = S / 2;
  const N = S / RES, N4 = S / R4, NF = S / FRES;
  const n = makeNoise(P.seed);
  const R = rng(P.seed * 7 + 3);

  // ------------------------------------------------------------------ terrain
  await step('Surveying the land');
  const H4 = new Float32Array(N4 * N4);
  for (let j = 0; j < N4; j++) {
    const y = -half + (j + 0.5) * R4;
    for (let i = 0; i < N4; i++) H4[j * N4 + i] = P.terrain(-half + (i + 0.5) * R4, y, n);
  }
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const y = -half + (j + 0.5) * RES;
    for (let i = 0; i < N; i++) H[j * N + i] = bil(H4, N4, R4, half, -half + (i + 0.5) * RES, y);
  }
  const W = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) W[k] = H[k] < 0 ? 1 : 0;

  const cellX = (i) => -half + (i + 0.5) * RES;
  const toI = (x) => Math.floor((x + half) / RES);
  const inMap = (x, y) => x > -half && x < half && y > -half && y < half;
  const cellAt = (x, y) => { const i = toI(x), j = toI(y); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const heightAt = (x, y) => bil(H, N, RES, half, x, y);
  const isWater = (x, y) => { const c = cellAt(x, y); return c < 0 || W[c] === 1; };

  // ------------------------------------------------------------------ districts and land value
  await step('Drawing districts');
  const DISTS = P.districts;
  const D4 = new Uint8Array(N4 * N4);
  const slope4 = new Float32Array(N4 * N4);
  for (let j = 0; j < N4; j++) {
    const y = -half + (j + 0.5) * R4;
    for (let i = 0; i < N4; i++) {
      const x = -half + (i + 0.5) * R4;
      const wx = x + 110 * n.fbm(x / 420 + 11, y / 420, 3), wy = y + 110 * n.fbm(x / 420, y / 420 - 7, 3);
      let best = 0, bs = -Infinity;
      for (let k = 0; k < DISTS.length; k++) {
        const d = DISTS[k];
        const s = 1 - Math.hypot(wx - d.x, wy - d.y) / d.r;
        if (s > bs) { bs = s; best = k; }
      }
      D4[j * N4 + i] = best;
      const k = j * N4 + i;
      const hx = H4[Math.min(N4 - 1, i + 1) + j * N4] - H4[Math.max(0, i - 1) + j * N4];
      const hy = H4[i + Math.min(N4 - 1, j + 1) * N4] - H4[i + Math.max(0, j - 1) * N4];
      slope4[k] = Math.hypot(hx, hy) / (2 * R4);
    }
  }
  const distAt = (x, y) => { const i = clamp(Math.floor((x + half) / R4), 0, N4 - 1), j = clamp(Math.floor((y + half) / R4), 0, N4 - 1); return DISTS[D4[j * N4 + i]]; };
  const slopeAt = (x, y) => bil(slope4, N4, R4, half, x, y);

  const landSrc = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) landSrc[k] = W[k] ? 1 : 0;
  let distWater = chamfer(N, landSrc, RES);
  const dWaterAt = (x, y) => bil(distWater, N, RES, half, x, y);

  // rail (Kaiyo): stations lift land value
  let rail = null;
  if (P.rail) {
    const { cx, cy, rx, ry, stations, h } = P.rail;
    const path = [];
    const L = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
    const m = Math.round(L / 6);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      const wob = 1 + 0.06 * n.fbm(Math.cos(a) * 2 + 3, Math.sin(a) * 2, 2);
      path.push([cx + rx * wob * Math.cos(a), cy + ry * wob * Math.sin(a)]);
    }
    const st = [];
    for (let s = 0; s < stations; s++) st.push(path[Math.floor((s / stations) * m + m / (stations * 3)) % m]);
    rail = { path, stations: st, h };
  }

  const V4 = new Float32Array(N4 * N4);
  let vmax = 0;
  for (let j = 0; j < N4; j++) {
    const y = -half + (j + 0.5) * R4;
    for (let i = 0; i < N4; i++) {
      const x = -half + (i + 0.5) * R4;
      let v = 0;
      for (const [cx, cy, a, s] of P.centers) v += a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
      v += 0.22 * Math.exp(-dWaterAt(x, y) / 110);
      if (rail) for (const [sx, sy] of rail.stations) v += 0.32 * Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (2 * 110 * 110));
      v += 0.07 * n.fbm(x / 140 + 40, y / 140, 3);
      V4[j * N4 + i] = v;
      if (v > vmax) vmax = v;
    }
  }
  for (let k = 0; k < V4.length; k++) V4[k] = clamp(V4[k] / vmax, 0, 1);
  const VAt = (x, y) => bil(V4, N4, R4, half, x, y);

  // ------------------------------------------------------------------ tensor field
  await step('Laying out the street grain');
  const bases = [...P.fields];
  if (P.patchwork) {
    const pw = P.patchwork;
    for (let k = 0; k < pw.count; k++) {
      bases.push({ type: 'grid', x: R.range(pw.area[0], pw.area[2]), y: R.range(pw.area[1], pw.area[3]), theta: R.range(-0.8, 0.8), decay: pw.decay * R.range(0.7, 1.3), w: pw.w });
    }
  }
  const Fc = new Float32Array(NF * NF), Fs = new Float32Array(NF * NF);
  for (let j = 0; j < NF; j++) {
    const y = -half + (j + 0.5) * FRES;
    for (let i = 0; i < NF; i++) {
      const x = -half + (i + 0.5) * FRES;
      let tx = 0.08, ty = 0; // a weak global grid so the field never vanishes
      for (const b of bases) {
        const w = b.w * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (b.decay * b.decay));
        if (w < 1e-4) continue;
        const th = b.type === 'grid' ? b.theta : Math.atan2(y - b.y, x - b.x);
        tx += w * Math.cos(2 * th); ty += w * Math.sin(2 * th);
      }
      if (P.boundary?.w) {
        const dw = dWaterAt(x, y);
        if (dw > 0) {
          const w = P.boundary.w * Math.exp(-dw / P.boundary.decay);
          const gx = dWaterAt(x + 8, y) - dWaterAt(x - 8, y), gy = dWaterAt(x, y + 8) - dWaterAt(x, y - 8);
          if (gx * gx + gy * gy > 1e-6) { const th = Math.atan2(gy, gx) + HALF_PI; tx += w * Math.cos(2 * th); ty += w * Math.sin(2 * th); }
        }
      }
      if (P.contour?.w) {
        const gx = heightAt(x + 8, y) - heightAt(x - 8, y), gy = heightAt(x, y + 8) - heightAt(x, y - 8);
        const s = Math.hypot(gx, gy) / 16;
        if (s > 1e-3) {
          const w = P.contour.w * clamp(s * 7, 0, 1.4);
          const th = Math.atan2(gy, gx) + HALF_PI;
          tx += w * Math.cos(2 * th); ty += w * Math.sin(2 * th);
        }
      }
      let th = 0.5 * Math.atan2(ty, tx);
      const d = distAt(x, y);
      th += (d.jitter ?? 0) * 1.4 * n.fbm(x / 170 + 3, y / 170 - 5, 3);
      if (d.snap > 0) {
        const base = d.theta ?? 0;
        const k = Math.round((th - base) / HALF_PI);
        th += d.snap * (base + k * HALF_PI - th);
      }
      Fc[j * NF + i] = Math.cos(2 * th); Fs[j * NF + i] = Math.sin(2 * th);
    }
  }
  const fieldAngle = (x, y) => 0.5 * Math.atan2(bil(Fs, NF, FRES, half, x, y), bil(Fc, NF, FRES, half, x, y));
  const fieldDir = (x, y, fam) => { const a = fieldAngle(x, y) + (fam ? HALF_PI : 0); return [Math.cos(a), Math.sin(a)]; };

  // ------------------------------------------------------------------ streets
  const lines = []; // { cls, fam, pts: [[x,y],...], level }
  const allHash = new Hash(24);
  const addLine = (line) => {
    line.id = lines.length;
    lines.push(line);
    for (let i = 0; i < line.pts.length; i += 2) allHash.add(line.pts[i][0], line.pts[i][1], line.id);
  };
  const famOf = (pts) => {
    const m = Math.floor(pts.length / 2);
    const a = pts[Math.max(0, m - 2)], b = pts[Math.min(pts.length - 1, m + 2)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const [ux, uy] = fieldDir(a[0], a[1], 0);
    return Math.abs(dx * ux + dy * uy) >= Math.abs(-dx * uy + dy * ux) ? 0 : 1;
  };

  // predefined avenues (densified)
  if (P.predef) for (const pd of P.predef(n)) {
    const pts = densify(pd.pts, 6).filter(([x, y]) => inMap(x, y));
    if (pts.length > 2) addLine({ cls: pd.cls, fam: famOf(pts), pts, level: 'predef' });
  }

  // the urban edge: an organic line between city and countryside, from land value plus correlated noise
  const urban = P.urban ?? { vMin: 0, soft: 0 };
  // the urban edge before the countryside penalty: arterials use it, so they still reach the square's border
  const urbanCore = (x, y) => VAt(x, y) + urban.soft * n.fbm(x / 320 + 9, y / 320 - 3, 3);
  // collectors, locals and blocks thin out over the last 400 m before the border
  const urbanAt = (x, y) => urbanCore(x, y) - 0.5 * smoothstep(half - 450, half - 60, Math.max(Math.abs(x), Math.abs(y)));
  const bridges = P.bridges ?? { arterial: 240, collector: 40, local: 0 };
  const maxSlope = P.maxSlope ?? 0.33;
  const levels = [];
  if (P.canals) levels.push({ name: 'canal', cls: -1, dsep: P.canals.dsep, step: 4, maxLen: 900, minLen: 60, bridge: 0, dtest: 0.55,
    valid: (x, y) => distAt(x, y).id === P.canals.district && dWaterAt(x, y) > 14 });
  levels.push({ name: 'arterial', cls: 4, dsep: P.roads.arterial, step: 7, maxLen: 4200, minLen: 260, bridge: bridges.arterial, dtest: 0.5, slope: 0.5,
    valid: (x, y) => urbanCore(x, y) > urban.vMin - 0.16 });
  levels.push({ name: 'collector', cls: 3, dsep: P.roads.collector, step: 5, maxLen: 1800, minLen: 90, bridge: bridges.collector, dtest: 0.5, sepPow: 0.5, slope: maxSlope + 0.05,
    valid: (x, y) => urbanAt(x, y) > urban.vMin - 0.07 });
  levels.push({ name: 'local', cls: 2, dsep: P.roads.local, step: 4, maxLen: 800, minLen: 22, bridge: bridges.local, dtest: 0.52, sepPow: 1, slope: maxSlope,
    valid: (x, y) => urbanAt(x, y) > urban.vMin - 0.025 });

  for (const L of levels) {
    if (L.dsep >= S) continue;
    await step(`Tracing ${L.name === 'canal' ? 'canals' : L.name + ' streets'}`);
    const sepAt = (x, y) => L.dsep * Math.pow(distAt(x, y).sep ?? 1, L.sepPow ?? 0);
    const cs = Math.max(10, L.dsep * 0.5);
    const fam = [new Hash(cs), new Hash(cs)];
    for (const ln of lines) for (let i = 0; i < ln.pts.length; i += 2) fam[ln.fam].add(ln.pts[i][0], ln.pts[i][1], ln.id);
    const valid = (x, y) => inMap(x, y) && !isWater(x, y) && (!L.valid || L.valid(x, y)) && (!L.slope || slopeAt(x, y) < L.slope);

    // seed candidates: random land points, biased to valuable land
    const cands = [];
    const want = Math.min(6000, Math.round((S * S) / (L.dsep * L.dsep) * 2.5));
    for (let t = 0; t < want * 3 && cands.length < want; t++) {
      const x = R.range(-half, half), y = R.range(-half, half);
      if (valid(x, y)) cands.push([x, y, VAt(x, y) + R.next() * 0.6]);
    }
    cands.sort((a, b) => b[2] - a[2]);
    const queue = [[], []];
    let ci = 0, f = 0, fails = 0;
    const lineId = { v: 100000 };
    while (fails < 2) {
      let seed = null;
      while (queue[f].length && !seed) {
        const q = queue[f].shift();
        if (valid(q[0], q[1]) && !fam[f].near(q[0], q[1], sepAt(q[0], q[1]), -1)) seed = q;
      }
      while (!seed && ci < cands.length) {
        const q = cands[ci++];
        if (!fam[f].near(q[0], q[1], sepAt(q[0], q[1]), -1)) seed = q;
      }
      if (!seed) { fails++; f = 1 - f; continue; }
      fails = 0;
      const pts = traceStreamline(seed, f, L, { fieldDir, valid, isWater, inMap, fam, sepAt });
      if (pts && polyLen(pts) >= L.minLen) {
        joinEnds(pts, L, allHash, isWater, sepAt);
        const line = { cls: L.cls, fam: f, pts, level: L.name };
        addLine(line);
        for (let i = 0; i < pts.length; i += 2) fam[f].add(pts[i][0], pts[i][1], line.id);
        // perpendicular seeds along the new line make proper intersections
        const every = Math.max(2, Math.round(sepAt(seed[0], seed[1]) / L.step));
        for (let i = every; i < pts.length - 1; i += every) queue[1 - f].push(pts[i]);
      }
      f = 1 - f;
      lineId.v++;
    }

    if (L.cls === -1) {
      // carve canals into water
      for (const ln of lines) if (ln.cls === -1 && !ln.carved) {
        ln.carved = true;
        stampLine(ln.pts, P.canals.width / 2, N, RES, half, (k) => { W[k] = 1; H[k] = Math.min(H[k], -1.2); });
      }
      for (let k = 0; k < N * N; k++) landSrc[k] = W[k];
      distWater = chamfer(N, landSrc, RES);
    }
  }

  // quays: land meets the water low, so shorelines stay smooth at any zoom
  for (let k = 0; k < N * N; k++) if (!W[k]) H[k] = Math.min(H[k], 0.35 + distWater[k] * 0.09);

  // ------------------------------------------------------------------ rasterise roads, blocks
  await step('Cutting city blocks');
  const roadCls = new Uint8Array(N * N);
  const roads = lines.filter((l) => l.cls > 0);
  if (rail) roads.push({ cls: 3, fam: 0, pts: [...rail.path, rail.path[0]], level: 'rail', rail: true });
  for (const ln of roads) {
    ln.width = ln.pts.map(([x, y]) => roadWidth(ln.cls, distAt(x, y)));
    for (let i = 0; i < ln.pts.length - 1; i++) {
      const [ax, ay] = ln.pts[i], [bx, by] = ln.pts[i + 1];
      stampSeg(ax, ay, bx, by, ln.width[i] / 2 + 0.6, N, RES, half, (k) => { if (!W[k] && roadCls[k] < ln.cls) roadCls[k] = ln.cls; });
    }
  }
  const roadSrc = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) roadSrc[k] = roadCls[k] ? 1 : 0;
  const distRoad = chamfer(N, roadSrc, RES);

  const blockId = new Int32Array(N * N).fill(-1);
  const blockCells = new Int32Array(N * N);
  const blocks = [];
  {
    const stack = new Int32Array(N * N);
    let used = 0;
    for (let k0 = 0; k0 < N * N; k0++) {
      if (W[k0] || roadCls[k0] || blockId[k0] >= 0) continue;
      const id = blocks.length, start = used;
      let sp = 0; stack[sp++] = k0; blockId[k0] = id;
      let sx = 0, sy = 0, border = false;
      while (sp) {
        const k = stack[--sp];
        blockCells[used++] = k;
        const i = k % N, j = (k / N) | 0;
        sx += i; sy += j;
        if (i === 0 || j === 0 || i === N - 1 || j === N - 1) border = true;
        if (i > 0) push(k - 1); if (i < N - 1) push(k + 1); if (j > 0) push(k - N); if (j < N - 1) push(k + N);
      }
      const count = used - start;
      const cx = cellX(Math.round(sx / count)), cy = cellX(Math.round(sy / count));
      blocks.push({ id, start, count, area: count * RES * RES, cx, cy, border, d: distAt(cx, cy) });
      function push(q) { if (!W[q] && !roadCls[q] && blockId[q] < 0) { blockId[q] = id; stack[sp++] = q; } }
    }
  }

  // ------------------------------------------------------------------ surfaces
  const SURF = { natural: 0, park: 2, sand: 3, plaza: 4, lawn: 6, forest: 7, fields: 8 };
  const surf = new Uint8Array(N * N);
  const beachW = P.beach ?? 0;
  for (let k = 0; k < N * N; k++) if (!W[k] && beachW && distWater[k] < beachW) surf[k] = SURF.sand;
  const parkNames = [];
  for (const b of blocks) {
    let kind = null;
    for (const [px, py, pr, name] of P.parks ?? []) if (Math.hypot(b.cx - px, b.cy - py) < pr) { kind = 'park'; if (name && !parkNames.includes(name)) parkNames.push(name); }
    if (!kind && urbanAt(b.cx, b.cy) < urban.vMin) kind = n.fbm(b.cx / 260 + 2, b.cy / 260 + 7, 3) > (P.forest ?? 0.05) || slopeAt(b.cx, b.cy) > maxSlope * 0.8 ? 'forest' : 'fields';
    if (!kind && b.area < 150) kind = 'plaza';
    if (!kind && slopeAt(b.cx, b.cy) > maxSlope * 1.1) kind = 'forest';
    if (!kind && b.area > 900 && b.area < 9000 && b.d.tier !== 'cbd' && hash2(b.id, 7, P.seed) < 0.05) kind = 'park';
    if (!kind && b.d.tier === 'cbd' && b.area < 1800 && hash2(b.id, 9, P.seed) < 0.08) kind = 'plaza';
    b.kind = kind ?? 'build';
    const code = kind === 'park' ? SURF.park : kind === 'plaza' ? SURF.plaza : kind === 'forest' ? SURF.forest : kind === 'fields' ? SURF.fields : b.d.placement === 'scatter' ? SURF.lawn : 0;
    if (code) for (let c = b.start; c < b.start + b.count; c++) { const k = blockCells[c]; if (surf[k] !== SURF.sand) surf[k] = code; }
  }

  // ------------------------------------------------------------------ parts, lots, landmarks
  const parts = new Parts();
  const buildings = [];
  const labels = [];
  const occ = new Uint8Array(N * N);
  const lotKey = new Float32Array(N * N).fill(Infinity);
  const shadowKey = new Float32Array(N * N).fill(Infinity);
  const keyOf = (x, y, jit = 0.18) => (1 - VAt(x, y)) + jit * (hash2(Math.round(x * 3), Math.round(y * 3), P.seed) - 0.5);
  const sun = norm2(0.62, -0.78); // baked shadows fall north-east

  const ctx = { P, R, n, parts, buildings, labels, heightAt, VAt, dWaterAt, distAt, fieldAngle, keyOf, isWater, half };

  const addBuilding = (rec) => {
    rec.id = buildings.length + 1;
    buildings.push(rec);
    return rec.id;
  };
  ctx.addBuilding = addBuilding;

  const stampRect = (cx, cy, rot, hw, hd, fn) => {
    const ux = Math.cos(rot), uy = Math.sin(rot);
    const stepA = RES * 0.7;
    for (let a = -hw; a <= hw; a += stepA) for (let b = -hd; b <= hd; b += stepA) {
      const k = cellAt(cx + ux * a - uy * b, cy + uy * a + ux * b);
      if (k >= 0) fn(k);
    }
  };
  const fits = (b, cx, cy, rot, hw, hd) => {
    const ux = Math.cos(rot), uy = Math.sin(rot);
    const na = Math.max(2, Math.ceil((2 * hw) / 2.5)), nb = Math.max(2, Math.ceil((2 * hd) / 2.5));
    for (let ia = 0; ia <= na; ia++) {
      const a = -hw + (2 * hw * ia) / na;
      for (let ib = 0; ib <= nb; ib++) {
        const bb = -hd + (2 * hd * ib) / nb;
        const k = cellAt(cx + ux * a - uy * bb, cy + uy * a + ux * bb);
        if (k < 0 || blockId[k] !== b || occ[k]) return false;
      }
    }
    return true;
  };
  const shadowOf = (cx, cy, rot, hw, hd, h, key) => {
    const ux = Math.cos(rot), uy = Math.sin(rot);
    const len = Math.min(h * 0.85, 240);
    const pts = [];
    for (const [a, b] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
      const x = cx + ux * a - uy * b, y = cy + uy * a + ux * b;
      pts.push([x, y], [x + sun[0] * len, y + sun[1] * len]);
    }
    fillConvex(hull(pts), N, RES, half, (k) => { if (key < shadowKey[k]) shadowKey[k] = key; });
  };
  ctx.shadowOf = shadowOf;
  ctx.stampLot = (cx, cy, rot, hw, hd, key) => stampRect(cx, cy, rot, hw + 1.5, hd + 1.5, (k) => { if (key < lotKey[k]) lotKey[k] = key; });

  // landmarks first, so lots flow around them
  await step('Raising landmarks');
  for (const lm of P.landmarks ?? []) {
    let x = lm.x, y = lm.y;
    if (!lm.exact) {
      const found = findLand(x, y, 260, (k) => !W[k] && !roadCls[k] && blockId[k] >= 0 && distRoad[k] > 6, N, RES, half);
      if (!found) continue;
      [x, y] = found;
    }
    const rot = fieldAngle(x, y);
    const r = buildLandmark(lm, x, y, rot, ctx);
    if (!r) continue;
    // reserve the footprint
    for (let a = -r.radius; a <= r.radius; a += RES) for (let b = -r.radius; b <= r.radius; b += RES) {
      if (a * a + b * b > r.radius * r.radius) continue;
      const k = cellAt(x + a, y + b);
      if (k >= 0) { occ[k] = 1; if (!W[k] && surf[k] !== SURF.park) { surf[k] = SURF.plaza; } }
    }
    labels.push({ text: lm.name, x, y, z: heightAt(x, y) + r.height + 8, kind: 'landmark' });
  }

  // Isla Serena: one estate per island, each with its owner
  if (P.estates) {
    for (const [i, [cx, cy, r]] of P.isles.entries()) {
      const f = findLand(cx, cy, r, (k) => !W[k] && !roadCls[k] && blockId[k] >= 0, N, RES, half);
      if (!f) continue;
      const owner = P.estates[i % P.estates.length];
      const res = buildLandmark({ type: r > 100 ? 'estate' : 'estateSmall', name: owner }, f[0], f[1], fieldAngle(f[0], f[1]), ctx);
      if (!res) continue;
      for (let a = -res.radius; a <= res.radius; a += RES) for (let bb = -res.radius; bb <= res.radius; bb += RES) {
        if (a * a + bb * bb > res.radius * res.radius) continue;
        const k = cellAt(f[0] + a, f[1] + bb);
        if (k >= 0 && !W[k]) { occ[k] = 1; surf[k] = SURF.lawn; }
      }
      buildings[buildings.length - 1].label = owner === 'Private' ? 'Private estate' : `${owner}'s estate`;
      labels.push({ text: owner === 'Private' ? 'Private' : owner, x: f[0], y: f[1], z: heightAt(f[0], f[1]) + res.height + 10, kind: owner === 'Private' ? 'landmark' : 'crown', bid: buildings.length });
    }
  }

  // bridges and their towers, from road polylines crossing water
  const bridgeSpans = [];
  for (const ln of roads) {
    if (ln.rail) continue;
    let run = [];
    for (let i = 0; i < ln.pts.length; i++) {
      const [x, y] = ln.pts[i];
      if (isWater(x, y)) run.push(i);
      else if (run.length) { bridgeSpans.push({ ln, from: run[0], to: run[run.length - 1] }); run = []; }
    }
  }

  await step('Dividing parcels');
  const lots = [];
  for (const b of blocks) {
    if (b.kind === 'fields' && b.area > 4000) {
      // the odd farmhouse and barn out in the fields
      for (let t = 0; t < Math.round(b.area / 30000) + 1; t++) {
        const k = blockCells[b.start + Math.floor(R.next() * b.count)];
        const x = cellX(k % N), y = cellX((k / N) | 0), rot = fieldAngle(x, y);
        if (fits(b.id, x, y, rot, 9, 7)) { stampRect(x, y, rot, 6, 5, (q) => { occ[q] = 1; }); lots.push({ b, d: { ...b.d, types: [['house', 1]], height: [7, 0.1, 6, 9], tier: 'rural' }, x, y, rot, hw: 6, hd: 5, front: -1 }); }
      }
    }
    if (b.kind !== 'build') continue;
    const d = b.d;
    const theta = fieldAngle(b.cx, b.cy);
    if (P.estates) continue;
    if (d.placement === 'scatter') scatterLots(b, d, 1);
    else rowLots(b, d, theta);
    if (d.placement !== 'scatter' && b.area > 250) scatterLots(b, d, 0.55, theta);
  }

  function rowLots(b, d, theta) {
    const ux = Math.cos(theta), uy = Math.sin(theta);
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (let c = b.start; c < b.start + b.count; c++) {
      const k = blockCells[c];
      const x = cellX(k % N), y = cellX((k / N) | 0);
      const u = x * ux + y * uy, v = -x * uy + y * ux;
      if (u < umin) umin = u; if (u > umax) umax = u; if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
    umin -= 1; vmin -= 1; umax += 1; vmax += 1;
    const depth = d.lot[1] * R.range(0.85, 1.2);
    const span = vmax - vmin;
    const nrows = Math.max(1, Math.round(span / depth));
    const rowD = span / nrows;
    for (let r = 0; r < nrows; r++) {
      const v0 = vmin + r * rowD;
      let u = umin;
      while (u < umax - 2) {
        const f = clamp(d.lot[0] * Math.exp(0.28 * R.normal()), d.lot[0] * 0.55, d.lot[0] * 1.9);
        const gap = d.gap;
        let hw = f / 2 - gap / 2, hd = rowD / 2 - gap / 2 - 0.4;
        let cu = u + f / 2, cv = v0 + rowD / 2;
        let ok = false;
        for (const [sf, sd, anchor] of [[1, 1, 0], [1, 0.62, -1], [1, 0.62, 1], [0.66, 0.62, -1], [0.66, 0.62, 1]]) {
          const thw = hw * sf, thd = hd * sd;
          const tcv = anchor === 0 ? cv : anchor < 0 ? v0 + gap / 2 + 0.4 + thd : v0 + rowD - gap / 2 - 0.4 - thd;
          const x = cu * ux - tcv * uy, y = cu * uy + tcv * ux;
          if (thw > 2.2 && thd > 2.2 && fits(b.id, x, y, theta, thw, thd)) {
            const dr = distRoad[cellAt(x, y)] ?? 0;
            if (!d.interior && dr > thd + 9) break;
            place(b, d, x, y, theta, thw, thd);
            ok = true; break;
          }
        }
        u += ok ? f : 3;
      }
    }
  }

  function scatterLots(b, d, scale, theta = null) {
    const tries = Math.round((b.area / (d.lot[0] * d.lot[1] * scale * scale)) * (theta === null ? 2.2 : 1.2)) + 2;
    for (let t = 0; t < tries; t++) {
      const k = blockCells[b.start + Math.floor(R.next() * b.count)];
      const x = cellX(k % N) + R.range(-1, 1), y = cellX((k / N) | 0) + R.range(-1, 1);
      const rot = theta ?? fieldAngle(x, y) + R.range(-0.08, 0.08);
      const hw = (d.lot[0] * scale * R.range(0.75, 1.25)) / 2, hd = (d.lot[1] * scale * R.range(0.75, 1.25)) / 2;
      const m = (d.gap ?? 4) / 2 * (theta === null ? 1 : 0.3);
      if (hw < 2.2 || hd < 2.2) continue;
      if (!fits(b.id, x, y, rot, hw + m, hd + m)) continue;
      if (theta !== null && !d.interior && (distRoad[k] ?? 0) > hd + 10) continue;
      place(b, d, x, y, rot, hw, hd);
    }
  }

  function place(b, d, x, y, rot, hw, hd) {
    stampRect(x, y, rot, hw, hd, (k) => { occ[k] = 1; });
    // which long side faces the street (signs and shopfronts go there)
    const zx = -Math.sin(rot), zy = Math.cos(rot), o = hd + 3;
    const dm = distRoad[cellAt(x - zx * o, y - zy * o)] ?? 99, dpl = distRoad[cellAt(x + zx * o, y + zy * o)] ?? 99;
    lots.push({ b, d, x, y, rot, hw, hd, front: dm <= dpl ? -1 : 1 });
  }

  // ------------------------------------------------------------------ buildings
  await step(`Raising ${lots.length.toLocaleString('en')} buildings`);
  const towers = [];
  for (const lot of lots) {
    const { d, x, y, rot, hw, hd } = lot;
    const V = VAt(x, y);
    const hn = Math.pow(2, 0.9 * n.fbm(x / 230 + 50, y / 230, 3));
    const [hMed, hSig, hMin, hMax] = d.height;
    const med = hMed * (0.35 + 1.35 * Math.pow(V, 1.25)) * hn;
    // attached rows (no gap) keep a steady cornice line; detached buildings vary freely
    let h = clamp(med * Math.exp(hSig * (d.gap === 0 ? 0.4 : 1) * R.normal()), hMin, hMax);
    const type = pickType(d, h, R);
    const key = keyOf(x, y);
    const rec = buildArchetype(type, { x, y, rot, w: hw * 2, dp: hd * 2, h, d, key, V, front: lot.front }, ctx);
    if (!rec) continue;
    ctx.stampLot(x, y, rot, hw, hd, key);
    if (key < (lot.b.minKey ?? Infinity)) lot.b.minKey = key;
    if (rec.h > 5 && type !== 'containers') shadowOf(x, y, rot, hw * 0.95, hd * 0.95, rec.h, key);
    if (rec.tower) towers.push(rec);
  }

  // company headquarters and crown towers: the skyline is the leaderboard
  await step('Seating the companies');
  const cbdTowers = towers.filter((t) => t.d.tier === 'cbd').sort((a, b) => b.h - a.h);
  const otherTall = buildings.filter((b) => !b.tower && b.h > 18 && b.kind !== 'Landmark').sort((a, b) => b.h - a.h);
  const pool = [...cbdTowers, ...towers.filter((t) => t.d.tier !== 'cbd').sort((a, b) => b.h - a.h), ...otherTall];
  const companies = (COMPANIES[P.region] ?? []).slice();
  const crownSlots = new Set([1, 4, 8]);
  const crownNames = CROWNS[P.id] ?? [];
  let ci = 0, cn = 0;
  for (let i = 0; i < pool.length && (ci < companies.length || cn < crownNames.length); i++) {
    const t = pool[i];
    if (crownSlots.has(i) && cn < crownNames.length && t.tower) {
      t.crown = crownNames[cn++];
      t.label = `${t.crown.handle} · crown tower`;
      parts.setFlag(t.id, 2);
      labels.push({ text: t.crown.handle, x: t.x, y: t.y, z: t.gz + t.h + 10, kind: 'crown', bid: t.id });
      continue;
    }
    if (ci < companies.length && !P.static) {
      const [ticker, name, cap, sector] = companies[ci++];
      t.company = { ticker, name, cap, sector };
      t.label = name;
      parts.setFlag(t.id, 1);
      if (ci <= 6) labels.push({ text: ticker, x: t.x, y: t.y, z: t.gz + t.h + 10, kind: 'hq', bid: t.id });
    }
  }

  // building categories, used by map lenses and the info card
  for (const b of buildings) b.cat = categoryOf(b);

  // demo ownership (prototype only, stands in for live game data): "you" own a company office, three shops
  // and a home; other players own a few shops; a few buildings are for sale
  if (!P.static) seatDemoOwners(buildings, R, labels);

  // ------------------------------------------------------------------ life: trees, ships, cranes
  await step('Planting trees');
  let trees = 0;
  const treeOk = (k) => k >= 0 && !W[k] && !roadCls[k] && !occ[k];
  for (const b of blocks) {
    const d = b.d;
    let density = 0;
    if (b.kind === 'park') density = 1 / 70;
    else if (b.kind === 'forest') density = 1 / 45;
    else if (b.kind === 'build') density = (d.trees ?? 0) / 260;
    if (!density) continue;
    const want = Math.round(b.area * density);
    for (let t = 0; t < want * 2 && t < 4000; t++) {
      const k = blockCells[b.start + Math.floor(R.next() * b.count)];
      if (!treeOk(k) || surf[k] === SURF.sand) continue;
      const x = cellX(k % N) + R.range(-1, 1), y = cellX((k / N) | 0) + R.range(-1, 1);
      if (b.kind === 'park' && hash2(Math.round(x / 9), Math.round(y / 9), 3) < 0.25) continue; // clearings
      buildTree(b.kind === 'forest' ? P.forestTree ?? d.tree ?? 'round' : d.tree ?? 'round', x, y, keyOf(x, y) + 0.01, ctx, b.kind === 'forest' ? 1.2 : 1);
      occ[k] = 1; trees++;
    }
  }
  // street trees
  for (const ln of roads) {
    if (ln.cls < 2 || ln.rail) continue;
    for (let i = 0; i < ln.pts.length - 1; i += 3) {
      const [x, y] = ln.pts[i];
      const d = distAt(x, y);
      if ((d.trees ?? 0) < 0.25 || hash2(i, ln.id, 11) > d.trees * 0.8) continue;
      const [x2, y2] = ln.pts[i + 1];
      const [nx, ny] = norm2(-(y2 - y), x2 - x);
      for (const s of [-1, 1]) {
        const off = ln.width[i] / 2 + 2.2;
        const tx = x + nx * off * s, ty = y + ny * off * s;
        const k = cellAt(tx, ty);
        if (!treeOk(k)) continue;
        buildTree(d.tree ?? 'round', tx, ty, keyOf(tx, ty) + 0.02, ctx, 0.8);
        occ[k] = 1; trees++;
      }
    }
  }

  await step('Bringing in the ships');
  // gantry cranes and container ships at port districts
  const portEdge = [];
  for (let j = 2; j < N - 2; j += 3) for (let i = 2; i < N - 2; i += 3) {
    const k = j * N + i;
    if (W[k] || distWater[k] > 5) continue;
    const x = cellX(i), y = cellX(j);
    const d = distAt(x, y);
    if (d.port) portEdge.push([x, y]);
  }
  shuffle(portEdge, R);
  const cranes = [];
  for (const [x, y] of portEdge) {
    if (cranes.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 62)) continue;
    const gx = dWaterAt(x + 4, y) - dWaterAt(x - 4, y), gy = dWaterAt(x, y + 4) - dWaterAt(x, y - 4);
    const rot = Math.atan2(-gy, -gx); // pointing to the water
    buildCrane('gantry', x, y, rot, keyOf(x, y) + 0.05, ctx);
    cranes.push([x, y]);
    if (cranes.length % 2 === 0) {
      const sx = x + Math.cos(rot) * 38, sy = y + Math.sin(rot) * 38;
      if (isWater(sx, sy) && isWater(sx + Math.sin(rot) * 60, sy - Math.cos(rot) * 60) && isWater(sx - Math.sin(rot) * 60, sy + Math.cos(rot) * 60)) {
        buildShip(sx, sy, rot + HALF_PI, keyOf(x, y) + 0.06, ctx);
      }
    }
  }
  // construction cranes in booming districts
  for (const t of towers) if (t.d.cranes && R.chance(t.d.cranes)) buildCrane('tower', t.x + t.w * 0.7, t.y + t.dp * 0.7, R.range(0, 6.28), t.key, ctx, t.h + 18);
  for (const b of buildings) if (b.ghost) buildCrane('tower', b.x, b.y, R.range(0, 6.28), b.key, ctx, b.h + 26);

  // boats in marinas
  let boats = 0;
  const boatAt = [];
  for (let t = 0; t < 9000 && boats < (P.id === 'serena' ? 70 : 140); t++) {
    const x = R.range(-half, half), y = R.range(-half, half);
    const k = cellAt(x, y);
    if (k < 0 || !W[k]) continue;
    const dl = distLandAt(x, y);
    if (dl < 7 || dl > 46) continue;
    const d = distAt(x, y);
    const marina = d.tier === 'prime' || d.tier === 'trophy' || d.id === 'oldharbor';
    if (!marina || R.next() > 0.6) continue;
    if (boatAt.some(([bx, by]) => Math.hypot(bx - x, by - y) < 26)) continue;
    boatAt.push([x, y]);
    buildBoat(x, y, fieldAngle(x, y) + R.range(-0.2, 0.2), keyOf(x, y) + 0.03, ctx, d.tier === 'trophy' || d.id === 'palmbay' ? 1.6 : 1);
    boats++;
  }
  function distLandAt(x, y) {
    // distance from water to land: sample outward rings (cheap, used rarely)
    for (let r = 2; r <= 60; r += 3) for (let a = 0; a < 6.28; a += 0.5) if (!isWater(x + Math.cos(a) * r, y + Math.sin(a) * r)) return r;
    return 99;
  }

  // ------------------------------------------------------------------ outskirts: woods, and highways that leave the city
  const outskirts = sampleOutskirts(P, n, half, heightAt, dWaterAt);
  borderSurface(outskirts, surf, N, RES, half, SURF);
  const outH = (x, y) => outskirtsHeight(outskirts, x, y);
  const highways = traceHighways(lines.filter((l) => l.cls === 4), { P, n, half, outH });
  // woods beyond the square where the forest noise is high, and where the inner woods reach the border; never on
  // water, beaches or the highways
  const hwCells = new Set();
  const cellKey = (x, y) => (Math.floor(x / 8) + 4096) * 8192 + Math.floor(y / 8) + 4096;
  for (const ln of highways) for (const [x, y] of ln.pts) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) hwCells.add(cellKey(x + a * 8, y + b * 8));
  const outCtx = { ...ctx, heightAt: outH };
  const band = half + 1400;
  let outTrees = 0;
  for (let t = 0; t < 80000 && outTrees < 12000; t++) {
    const x = R.range(-band, band), y = R.range(-band, band);
    if (Math.abs(x) <= half && Math.abs(y) <= half) continue;
    if (outH(x, y) < 1) continue;
    const edge = Math.max(Math.abs(x), Math.abs(y)) - half;
    const f = n.fbm(x / 300 + 61, y / 300 - 17, 3) - 0.06;
    const woodsIn = nearestNode(outskirts, outskirts.frs, x, y) * (1 - smoothstep(0, 450, edge));
    const p = Math.max(smoothstep(0, 0.2, f), woodsIn * 0.5);
    if (p <= 0 || R.next() > p) continue;
    if (hwCells.has(cellKey(x, y))) continue;
    buildTree(P.forestTree ?? 'round', x, y, -1, outCtx, 1);
    outTrees++;
  }

  // ------------------------------------------------------------------ elevated rail
  if (rail) {
    const pth = rail.path;
    for (let i = 0; i < pth.length; i++) {
      const [ax, ay] = pth[i], [bx, by] = pth[(i + 1) % pth.length];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const g = Math.max(0, heightAt(mx, my));
      const rot = Math.atan2(by - ay, bx - ax);
      const key = keyOf(mx, my) - 0.12;
      parts.box(mx, g + rail.h, my, Math.hypot(bx - ax, by - ay) + 0.3, 1.6, 9, rot, 0x5f6266, 0, 4, 4, 0, key, 0, g, 0);
      if (i % 5 === 0) parts.box(mx, g, my, 2.2, rail.h, 2.6, rot, 0x7d8083, 0, 4, 4, 0, key, 0, g, 0);
    }
    for (const [sx, sy] of rail.stations) {
      const i = pth.findIndex((p) => p[0] === sx && p[1] === sy);
      const [bx, by] = pth[(i + 3) % pth.length];
      const rot = Math.atan2(by - sy, bx - sx);
      const g = Math.max(0, heightAt(sx, sy));
      const key = keyOf(sx, sy) - 0.12;
      parts.box(sx, g + rail.h - 2, sy, 70, 7, 22, rot, 0xb9c3c8, 2, 3.5, 3, 0, key, 0.6, g, 0);
      parts.box(sx, g + rail.h + 5, sy, 74, 1.2, 24, rot, 0x6b6e72, 0, 4, 4, 0, key, 0, g, 0);
      labels.push({ text: 'Loop Line', x: sx, y: sy, z: g + rail.h + 12, kind: 'station' });
    }
  }

  // ------------------------------------------------------------------ development order
  await step('Planning the growth');
  const allKeys = buildings.map((b) => b.key).filter((k) => k > -0.5).sort((a, b) => a - b);
  const cdf = (key) => {
    if (key <= -0.5) return 0;
    let lo = 0, hi = allKeys.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (allKeys[m] < key) lo = m + 1; else hi = m; }
    return (lo / Math.max(1, allKeys.length)) * 0.965;
  };
  for (const b of buildings) b.order = cdf(b.key);
  parts.mapOrders(cdf);

  // roads: ribbons with per-vertex order (arterials lead, locals follow); the highways always show (order 0)
  const lead = { 4: 0.16, 3: 0.08, 2: 0.025 };
  const ribbons = buildRibbons([...roads, ...highways], { heightAt, outH, isWater, keyOf, cdf, lead, parts, P, bridgeSpans });

  // ------------------------------------------------------------------ ground data textures
  await step('Painting the ground');
  const texA = new Uint8Array(N * N * 4); // water, green, sand, depth
  const texB = new Uint8Array(N * N * 4); // shadow order, lot order, plaza, variation
  const toByte = (key) => (key === Infinity ? 255 : Math.min(254, Math.round(cdf(key) * 254)));
  for (let k = 0; k < N * N; k++) {
    const s = surf[k], o = k * 4;
    texA[o] = W[k] ? 255 : 0;
    texA[o + 1] = s === SURF.park ? 255 : s === SURF.forest ? 200 : s === SURF.lawn ? 130 : s === SURF.fields ? 60 : 0;
    texA[o + 2] = s === SURF.sand ? 255 : 0;
    // water: depth; land: when its block gets developed (0 = always, for parks, fields and forest)
    texA[o + 3] = W[k] ? Math.min(255, Math.round(-H[k] * 12)) : blockId[k] >= 0 && blocks[blockId[k]].kind === 'build' ? toByte(blocks[blockId[k]].minKey ?? Infinity) : 0;
    texB[o] = toByte(shadowKey[k]);
    texB[o + 1] = toByte(lotKey[k]);
    texB[o + 2] = s === SURF.plaza ? 255 : 0;
    texB[o + 3] = Math.round(128 + 120 * n.noise(((k % N) * RES) / 9, (((k / N) | 0) * RES) / 9));
  }

  // districts labels
  for (const d of DISTS) {
    let x = d.x, y = d.y;
    if (isWater(x, y) || !inMap(x, y)) { const f = findLand(x, y, 400, (k) => !W[k], N, RES, half); if (f) [x, y] = f; else continue; }
    labels.push({ text: d.name, x, y, z: Math.max(0, heightAt(x, y)) + 40, kind: d.game ? 'district' : 'minor' });
  }
  for (const name of parkNames) {
    const p = (P.parks ?? []).find((q) => q[3] === name);
    labels.push({ text: name, x: p[0], y: p[1], z: Math.max(0, heightAt(p[0], p[1])) + 12, kind: 'park' });
  }

  // population curve along the growth order
  const byOrder = buildings.slice().sort((a, b) => a.order - b.order);
  let res = 0, jobs = 0;
  const popCurve = byOrder.map((b) => { res += b.residents ?? 0; jobs += b.jobs ?? 0; return [b.order, res, jobs]; });

  await step('Done');
  const tallest = buildings.reduce((m, b) => (b.h > (m?.h ?? 0) ? b : m), null);
  return {
<<<<<<< HEAD
    P, S, N, RES, H, texA, texB, parts: parts.finish(), ribbons, buildings, labels, rail,
    // coarse rasters for the map lenses: land value (0..1) and district index into P.districts, on a R4 grid
    value: { n: N4, res: R4, data: V4 }, districts: { n: N4, res: R4, data: D4 },
=======
    P, S, N, RES, H, texA, texB, parts: parts.finish(), ribbons, buildings, labels, rail, outskirts,
>>>>>>> cities/endless
    popCurve, timings, ms: Math.round(performance.now() - t0),
    stats: {
      buildings: buildings.length, lots: lots.length, roads: roads.length, trees, outTrees, boats, highways: highways.length,
      roadKm: Math.round(roads.reduce((s, l) => s + polyLen(l.pts), 0) / 100) / 10,
      tallest: tallest ? { h: Math.round(tallest.h), label: tallest.label ?? tallest.kind } : null,
      hqs: buildings.filter((b) => b.company).length,
    },
  };
}

// ------------------------------------------------------------------ crown towers (demo handles)
const CROWNS = {
  avalon: [{ handle: 'k.reyes', rank: 1 }, { handle: 'mira.okafor', rank: 4 }, { handle: 'dubreuil', rank: 9 }],
  nordhaven: [{ handle: 'solveig', rank: 2 }, { handle: 'h.lind', rank: 12 }],
  meridia: [{ handle: 'dubreuil', rank: 9 }, { handle: 'valentina.r', rank: 6 }],
  sundara: [{ handle: 'tiago.m', rank: 3 }, { handle: 'lua', rank: 15 }],
  kaiyo: [{ handle: 'ren.k', rank: 5 }, { handle: 'mei', rank: 7 }, { handle: 'oda', rank: 11 }],
};

// ------------------------------------------------------------------ categories and demo owners

const RESIDENTIAL_TYPES = new Set(['row', 'house', 'gabled', 'midrise', 'loft', 'palazzo', 'condo', 'micro', 'hut']);
const ESTATE_TYPES = new Set(['mansion', 'villa', 'glassvilla']);
/** One category per building: hq, crown, landmark, office, shop, home, estate, industry. */
function categoryOf(b) {
  if (b.company) return 'hq';
  if (b.crown) return 'crown';
  if (b.kind === 'Landmark' || b.kind === 'Island estate') return 'landmark';
  if (b.type === 'tower' || b.type === 'ghost') return 'office';
  if (b.type === 'strip') return 'shop';
  if (b.type === 'warehouse' || b.type === 'containers') return 'industry';
  if (ESTATE_TYPES.has(b.type)) return 'estate';
  if (RESIDENTIAL_TYPES.has(b.type)) return 'home';
  return 'home';
}

const OTHER_PLAYERS = ['mika_a', 'lena.v', 'hale.ward', 'tiago.m', 'ren.k', 'solveig', 'oda'];

function seatDemoOwners(buildings, R, labels) {
  const free = (b) => !b.company && !b.crown && b.cat !== 'landmark' && !b.mine;
  const near = (a, b, r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < r * r;
  // your company office: a mid-height building that taller neighbours hide (it shows why see-through matters)
  const offices = buildings.filter((b) => free(b) && ['midrise', 'tower', 'loft'].includes(b.type) && b.h > 22 && b.h < 80 && ['cbd', 'mid'].includes(b.d.tier));
  let best = null, bestScore = -1;
  for (const o of offices) {
    let score = 0;
    for (const t of buildings) if (t.h > o.h * 1.8 && near(t, o, 110)) score++;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  const mine = [];
  if (best) { Object.assign(best, { mine: true, mineRole: 'company', label: 'Halyard Robotics', owner: 'you', cat: 'office' }); mine.push(best); }
  // three shops in different districts, and a home
  const shopTypes = ['strip', 'micro', 'row', 'palazzo', 'midrise', 'hut', 'gabled', 'house'];
  const shopNames = ['Corner Cart', 'Halyard Coffee', 'Night Clean'];
  const used = new Set();
  for (const name of shopNames) {
    const c = buildings.filter((b) => free(b) && shopTypes.includes(b.type) && !used.has(b.d.id) && b.d.tier !== 'prime');
    if (!c.length) break;
    const s = c[Math.floor(R.next() * c.length)];
    used.add(s.d.id);
    Object.assign(s, { mine: true, mineRole: 'shop', label: name, owner: 'you', cat: 'shop' });
    mine.push(s);
  }
  const homes = buildings.filter((b) => free(b) && RESIDENTIAL_TYPES.has(b.type) && b.d.tier !== 'cbd');
  if (homes.length) { const h = homes[Math.floor(R.next() * homes.length)]; Object.assign(h, { mine: true, mineRole: 'home', label: 'Your home', owner: 'you', cat: 'home' }); mine.push(h); }
  for (const b of mine) labels.push({ text: b.label, x: b.x, y: b.y, z: b.gz + b.h + 8, kind: 'mine', bid: b.id });
  // other players' shops and buildings for sale
  for (const b of buildings) {
    if (!free(b)) continue;
    const r = R.next();
    if ((b.cat === 'shop' || b.cat === 'home') && r < 0.025) { b.owner = OTHER_PLAYERS[Math.floor(R.next() * OTHER_PLAYERS.length)]; b.cat = 'shop'; }
    else if ((b.cat === 'home' || b.cat === 'office' || b.cat === 'estate') && r > 0.97) b.forSale = true;
  }
  for (const b of buildings) if (b.crown) b.owner = b.crown.handle;
}

// ------------------------------------------------------------------ helpers

function pickType(d, h, R) {
  const fit = d.types.filter(([t]) => TYPE_RANGE[t] && h >= TYPE_RANGE[t][0] && h <= TYPE_RANGE[t][1]);
  const pool = fit.length ? fit : d.types;
  return R.weighted(pool);
}
const TYPE_RANGE = {
  row: [6, 24], house: [3, 11], gabled: [5, 16], midrise: [12, 70], loft: [8, 40], warehouse: [5, 20], containers: [5, 30],
  mansion: [6, 16], villa: [4, 14], glassvilla: [4, 16], palazzo: [8, 28], tower: [34, 500], condo: [24, 140], strip: [4, 14],
  micro: [6, 60], hut: [2, 12], ghost: [40, 300],
};

function roadWidth(cls, d) {
  if (cls === 4) return 15;
  if (cls === 3) return 10;
  const narrow = (d.sep ?? 1) < 0.7;
  return narrow ? 4.6 : d.tier === 'prime' && d.placement === 'scatter' ? 6 : 7;
}

function traceStreamline(seed, f, L, { fieldDir, valid, isWater, inMap, fam, sepAt }) {
  const both = [];
  for (const sign of [1, -1]) {
    const pts = [[seed[0], seed[1]]];
    let [dx, dy] = fieldDir(seed[0], seed[1], f);
    dx *= sign; dy *= sign;
    let x = seed[0], y = seed[1], len = 0;
    const h = L.step;
    while (len < L.maxLen) {
      const k1 = align(fieldDir(x, y, f), dx, dy);
      const k2 = align(fieldDir(x + k1[0] * h * 0.5, y + k1[1] * h * 0.5, f), k1[0], k1[1]);
      let nx = x + k2[0] * h, ny = y + k2[1] * h;
      if (!inMap(nx, ny)) break;
      if (!valid(nx, ny)) {
        // try a bridge straight across the water
        if (L.bridge > 0 && isWater(nx, ny)) {
          let s = h, land = null;
          while (s <= L.bridge) {
            const bx = x + k2[0] * s, by = y + k2[1] * s;
            if (!inMap(bx, by)) break;
            if (!isWater(bx, by)) { land = [bx, by]; break; }
            s += h;
          }
          if (land && valid(land[0] + k2[0] * h, land[1] + k2[1] * h)) {
            for (let t = h; t < s; t += h) pts.push([x + k2[0] * t, y + k2[1] * t]);
            x = land[0]; y = land[1]; pts.push([x, y]); len += s; dx = k2[0]; dy = k2[1];
            continue;
          }
        }
        break;
      }
      const sep = sepAt(nx, ny) * L.dtest;
      if (len > h * 2 && fam[f].near(nx, ny, sep, -1)) { pts.push([nx, ny]); break; }
      if (len > 40 && Math.hypot(nx - seed[0], ny - seed[1]) < h * 1.2) { pts.push([seed[0], seed[1]]); break; }
      pts.push([nx, ny]);
      x = nx; y = ny; dx = k2[0]; dy = k2[1]; len += h;
    }
    both.push(pts);
  }
  const back = both[1].reverse();
  back.pop();
  return back.concat(both[0]);
}

function align([x, y], dx, dy) { return x * dx + y * dy < 0 ? [-x, -y] : [x, y]; }

function joinEnds(pts, L, allHash, isWater, sepAt) {
  for (const atStart of [true, false]) {
    if (pts.length < 3) return;
    const e = atStart ? pts[0] : pts[pts.length - 1];
    const p = atStart ? pts[2] : pts[pts.length - 3];
    const [dx, dy] = norm2(e[0] - p[0], e[1] - p[1]);
    const r = Math.max(24, sepAt(e[0], e[1]) * 0.85);
    const q = allHash.nearest(e[0], e[1], r, (qx, qy) => {
      const [vx, vy] = norm2(qx - e[0], qy - e[1]);
      return vx * dx + vy * dy > 0.5;
    });
    if (!q) continue;
    const dd = Math.hypot(q[0] - e[0], q[1] - e[1]);
    let wet = false;
    for (let t = 2; t < dd; t += 3) if (isWater(e[0] + (q[0] - e[0]) * (t / dd), e[1] + (q[1] - e[1]) * (t / dd))) { wet = true; break; }
    if (wet) continue;
    const extra = densify([e, q], L.step).slice(1);
    if (atStart) pts.unshift(...extra.reverse()); else pts.push(...extra);
  }
}

class Hash {
  constructor(cs) { this.cs = cs; this.m = new Map(); }
  key(i, j) { return (i + 4096) * 8192 + (j + 4096); }
  add(x, y, id) {
    const k = this.key(Math.floor(x / this.cs), Math.floor(y / this.cs));
    let a = this.m.get(k);
    if (!a) this.m.set(k, (a = []));
    a.push(x, y, id);
  }
  near(x, y, r, exclude) {
    const cs = this.cs, i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((y - r) / cs), j1 = Math.floor((y + r) / cs);
    const r2 = r * r;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.m.get(this.key(i, j));
      if (!a) continue;
      for (let t = 0; t < a.length; t += 3) if (a[t + 2] !== exclude && (a[t] - x) ** 2 + (a[t + 1] - y) ** 2 < r2) return true;
    }
    return false;
  }
  nearest(x, y, r, ok) {
    const cs = this.cs, i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((y - r) / cs), j1 = Math.floor((y + r) / cs);
    let best = null, bd = r * r;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.m.get(this.key(i, j));
      if (!a) continue;
      for (let t = 0; t < a.length; t += 3) {
        const d = (a[t] - x) ** 2 + (a[t + 1] - y) ** 2;
        if (d < bd && d > 4 && ok(a[t], a[t + 1])) { bd = d; best = [a[t], a[t + 1]]; }
      }
    }
    return best;
  }
}

/** Bilinear sample of a cell-centred grid. */
function bil(A, n, res, half, x, y) {
  let fx = (x + half) / res - 0.5, fy = (y + half) / res - 0.5;
  fx = clamp(fx, 0, n - 1.001); fy = clamp(fy, 0, n - 1.001);
  const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
  const k = j * n + i;
  return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + n] * (1 - tx) + A[k + n + 1] * tx) * ty;
}

/** Two-pass 8-neighbour chamfer distance (metres) to source cells. */
function chamfer(N, src, res) {
  const d = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) d[k] = src[k] ? 0 : 1e9;
  const a = res, b = res * Math.SQRT2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; let v = d[k]; if (v === 0) continue;
    if (i > 0 && d[k - 1] + a < v) v = d[k - 1] + a;
    if (j > 0) {
      if (d[k - N] + a < v) v = d[k - N] + a;
      if (i > 0 && d[k - N - 1] + b < v) v = d[k - N - 1] + b;
      if (i < N - 1 && d[k - N + 1] + b < v) v = d[k - N + 1] + b;
    }
    d[k] = v;
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    const k = j * N + i; let v = d[k]; if (v === 0) continue;
    if (i < N - 1 && d[k + 1] + a < v) v = d[k + 1] + a;
    if (j < N - 1) {
      if (d[k + N] + a < v) v = d[k + N] + a;
      if (i < N - 1 && d[k + N + 1] + b < v) v = d[k + N + 1] + b;
      if (i > 0 && d[k + N - 1] + b < v) v = d[k + N - 1] + b;
    }
    d[k] = v;
  }
  return d;
}

function stampSeg(ax, ay, bx, by, r, N, res, half, fn) {
  const x0 = Math.floor((Math.min(ax, bx) - r + half) / res), x1 = Math.ceil((Math.max(ax, bx) + r + half) / res);
  const y0 = Math.floor((Math.min(ay, by) - r + half) / res), y1 = Math.ceil((Math.max(ay, by) + r + half) / res);
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  for (let j = Math.max(0, y0); j <= Math.min(N - 1, y1); j++) for (let i = Math.max(0, x0); i <= Math.min(N - 1, x1); i++) {
    const px = -half + (i + 0.5) * res, py = -half + (j + 0.5) * res;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    if ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2 <= r * r) fn(j * N + i);
  }
}
function stampLine(pts, r, N, res, half, fn) { for (let i = 0; i < pts.length - 1; i++) stampSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, N, res, half, fn); }

function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.round(L / step));
    for (let t = 1; t <= m; t++) out.push([ax + ((bx - ax) * t) / m, ay + ((by - ay) * t) / m]);
  }
  return out;
}
function polyLen(pts) { let s = 0; for (let i = 0; i < pts.length - 1; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return s; }
function norm2(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
function shuffle(a, R) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

function findLand(x, y, rmax, ok, N, res, half) {
  for (let r = 0; r <= rmax; r += 4) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 4));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const i = Math.floor((px + half) / res), j = Math.floor((py + half) / res);
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      if (ok(j * N + i)) return [px, py];
    }
  }
  return null;
}

function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

function fillConvex(poly, N, res, half, fn) {
  let ymin = Infinity, ymax = -Infinity;
  for (const [, y] of poly) { if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  const j0 = Math.max(0, Math.floor((ymin + half) / res)), j1 = Math.min(N - 1, Math.ceil((ymax + half) / res));
  for (let j = j0; j <= j1; j++) {
    const py = -half + (j + 0.5) * res;
    let xa = Infinity, xb = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      if ((y1 <= py && y2 > py) || (y2 <= py && y1 > py)) {
        const x = x1 + ((py - y1) / (y2 - y1)) * (x2 - x1);
        if (x < xa) xa = x; if (x > xb) xb = x;
      }
    }
    if (xa > xb) continue;
    const i0 = Math.max(0, Math.ceil((xa + half) / res - 0.5)), i1 = Math.min(N - 1, Math.floor((xb + half) / res - 0.5));
    for (let i = i0; i <= i1; i++) fn(j * N + i);
  }
}

/** Road ribbons: triangle strips with side, distance and order attributes. Bridges get decks and towers. */
function buildRibbons(roads, { heightAt, outH, isWater, keyOf, cdf, lead, parts, P, bridgeSpans }) {
  const pos = [], side = [], dist = [], order = [], cls = [], idx = [];
  let vbase = 0;
  for (const ln of roads) {
    const pts = ln.pts, m = pts.length;
    if (m < 2) continue;
    // highways run over the outskirts ring (their own height, never wet: they stop at the water)
    const hAt = ln.outer ? outH : heightAt;
    // deck heights with ramps
    const ground = pts.map(([x, y]) => Math.max(0, hAt(x, y)));
    const wet = pts.map(([x, y]) => (ln.outer ? false : isWater(x, y)));
    const deck = ln.cls === 4 ? 8 : ln.cls === 3 ? 4.5 : 2.4;
    const r = wet.map((w, i) => (w ? deck + ground[i] : -1e9));
    const stepLen = polyLen(pts) / (m - 1);
    const slope = 0.09 * stepLen;
    for (let i = 1; i < m; i++) r[i] = Math.max(r[i], r[i - 1] - slope);
    for (let i = m - 2; i >= 0; i--) r[i] = Math.max(r[i], r[i + 1] - slope);
    const y = pts.map((_, i) => Math.max(ground[i] + 0.35 + ln.cls * 0.04, r[i]));
    let along = (ln.id ?? 0) * 7919 % 5000;
    const lift = ln.rail ? -0.02 : 0;
    for (let i = 0; i < m; i++) {
      const [x0, y0] = pts[Math.max(0, i - 1)], [x1, y1] = pts[Math.min(m - 1, i + 1)];
      const [nx, ny] = norm2(-(y1 - y0), x1 - x0);
      if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const hw = ln.width[i] / 2;
      const o = ln.outer ? 0 : Math.max(0, cdf(keyOf(pts[i][0], pts[i][1], 0.1)) - (lead[ln.cls] ?? 0));
      for (const s of [-1, 1]) {
        pos.push(pts[i][0] + nx * hw * s, y[i] + lift, pts[i][1] + ny * hw * s);
        side.push(s); dist.push(along); order.push(o); cls.push(ln.rail ? 1 : ln.cls);
      }
      if (i < m - 1) { const a = vbase + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      // bridge deck under elevated stretches
      if (i < m - 1 && y[i] > ground[i] + 1.2) {
        const [bx, by] = pts[i + 1];
        const mx = (pts[i][0] + bx) / 2, my = (pts[i][1] + by) / 2;
        const rot = Math.atan2(by - pts[i][1], bx - pts[i][0]);
        const top = (y[i] + y[i + 1]) / 2;
        const key = keyOf(mx, my, 0.1) - 0.2;
        parts.box(mx, top - 1.6, my, Math.hypot(bx - pts[i][0], by - pts[i][1]) + 0.4, 1.55, hw * 2 + 1.2, rot, 0x8c8a86, 0, 4, 4, 0, key, 0, Math.max(0, ground[i]), 0);
        if (i % 7 === 0 && wet[i]) parts.box(mx, -3, my, 2.4, top - 1.6 + 3, hw * 1.4, rot, 0x6d6b67, 0, 4, 4, 0, key, 0, 0, 0);
      }
    }
    vbase += m * 2;
  }
  // suspension towers on long arterial bridges
  for (const sp of bridgeSpans) {
    if (sp.ln.cls !== 4) continue;
    const pts = sp.ln.pts;
    const span = polyLen(pts.slice(sp.from, sp.to + 1));
    if (span < 110) continue;
    for (const f of [0.22, 0.78]) {
      const i = Math.round(sp.from + (sp.to - sp.from) * f);
      const [x, y] = pts[i], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const rot = Math.atan2(by - y, bx - x);
      const key = keyOf(x, y, 0.1) - 0.2;
      const hw = sp.ln.width[i] / 2 + 1.5;
      for (const s of [-1, 1]) {
        const tx = x + -Math.sin(rot) * hw * s, ty = y + Math.cos(rot) * hw * s;
        parts.box(tx, -2, ty, 3.2, 52, 3.2, rot, 0xa8493a, 0, 4, 4, 0, key, 0, 0, 0);
      }
      parts.box(x, 40, y, 3, 3, hw * 2 + 3, rot, 0xa8493a, 0, 4, 4, 0, key, 0, 0, 0);
      parts.box(x, 30, y, 2.4, 2.4, hw * 2 + 3, rot, 0xa8493a, 0, 4, 4, 0, key, 0, 0, 0);
    }
  }
  return {
    position: new Float32Array(pos), side: new Float32Array(side), dist: new Float32Array(dist),
    order: new Float32Array(order), cls: new Float32Array(cls), index: new Uint32Array(idx),
  };
}

export { CONTAINER_COLORS };
