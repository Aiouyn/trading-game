// Building archetypes (a small shape grammar), landmarks, trees, cranes and ships.
// Every structure is a stack of instanced parts: box, gable, hip, pyr, cyl, cone, dome, ico.

import { clamp, hash2 } from './noise.js';

export const S = { PLAIN: 0, PUNCH: 1, GLASS: 2, RIBBON: 3, SHOP: 4, SIGN: 5, FRAME: 6, ROOF: 7, LEAF: 8, POOL: 9, LAMP: 10, CONT: 11 };
export const GEOMS = ['box', 'gable', 'hip', 'pyr', 'cyl', 'cone', 'dome', 'ico'];
export const STRIDE = 18;
export const CONTAINER_COLORS = [0xb5452f, 0x2f6f8f, 0xd09a2b, 0x4f7f3f, 0x8a8f93, 0x9a3d58, 0xc8c3b8, 0x3f5e8c, 0xc96b2c];
const NEON = [0xff3d8b, 0x3de0ff, 0xffb23f, 0xa56bff, 0x39ff9a, 0xff5a3c, 0xfff06a];
const BRASS = 0xc9a45c;

/**
 * The tree groups: a tree's trunk (box) and crown (ico) are kept apart from the buildings' parts, so the renderer can
 * swap a crown for a billboard when zoomed out. Each group draws with the geometry named here.
 */
export const TREE_GEOM = { treeBox: 'box', treeIco: 'ico' };
export const PART_KEYS = [...GEOMS, ...Object.keys(TREE_GEOM)];

export class Parts {
  constructor() { this.g = Object.fromEntries(PART_KEYS.map((k) => [k, []])); }
  push(geom, x, y, z, w, h, d, rot, color, style, floorH, bayW, bid, key, lit, ground, flags) {
    this.g[geom].push(x, y, z, w, h, d, rot, ((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255,
      style, floorH, bayW, bid, key, lit, ground, flags);
  }
  box(...a) { this.push('box', ...a); }
  setFlag(bid, flag) {
    for (const k of PART_KEYS) { const a = this.g[k]; for (let i = 0; i < a.length; i += STRIDE) if (a[i + 13] === bid) a[i + 17] |= flag; }
  }
  mapOrders(cdf) {
    for (const k of PART_KEYS) { const a = this.g[k]; for (let i = 0; i < a.length; i += STRIDE) a[i + 14] = cdf(a[i + 14]); }
  }
  finish() { return Object.fromEntries(PART_KEYS.map((k) => [k, new Float32Array(this.g[k])])); }
}

/** Builder bound to one building: local coordinates (ax along the lot frontage, az across, ay up from its base). */
class B {
  constructor(ctx, rec) {
    this.p = ctx.parts; this.x = rec.x; this.y = rec.y; this.rot = rec.rot;
    this.c = Math.cos(rec.rot); this.s = Math.sin(rec.rot);
    this.bid = rec.id; this.key = rec.key; this.g = rec.gz; this.lit = rec.lit ?? 0.4; this.flags = 0;
  }
  part(geom, ax, ay, az, w, h, d, color, style = 0, fh = 3.3, bw = 3, rotAdd = 0, lit = this.lit) {
    const wx = this.x + this.c * ax - this.s * az, wz = this.y + this.s * ax + this.c * az;
    this.p.push(geom, wx, this.g + ay, wz, w, h, d, this.rot + rotAdd, color, style, fh, bw, this.bid, this.key, lit, this.g, this.flags);
  }
  box(...a) { this.part('box', ...a); }
}

const shade = (c, f) => {
  const r = clamp(Math.round(((c >> 16) & 255) * f), 0, 255), g = clamp(Math.round(((c >> 8) & 255) * f), 0, 255), b = clamp(Math.round((c & 255) * f), 0, 255);
  return (r << 16) | (g << 8) | b;
};
const vary = (c, R, a = 0.06) => shade(c, 1 + R.range(-a, a));

function groundOf(ctx, x, y, rot, hw, hd) {
  const c = Math.cos(rot), s = Math.sin(rot);
  let lo = Infinity, hi = -Infinity;
  for (const [a, b] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]]) {
    const h = Math.max(0.2, ctx.heightAt(x + c * a - s * b, y + s * a + c * b));
    if (h < lo) lo = h; if (h > hi) hi = h;
  }
  return { base: lo, extra: hi - lo };
}

const LABEL = {
  row: 'Row houses', house: 'House', gabled: 'Gabled house', midrise: 'Apartment block', loft: 'Loft building', warehouse: 'Warehouse',
  containers: 'Container yard', mansion: 'Mansion', villa: 'Villa', glassvilla: 'Glass house', palazzo: 'Palazzo', tower: 'Office tower',
  condo: 'Condo tower', strip: 'Shopfronts', micro: 'Walk-up', hut: 'Hillside house', ghost: 'Unfinished tower',
};
const RESIDENTIAL = new Set(['row', 'house', 'gabled', 'midrise', 'loft', 'mansion', 'villa', 'glassvilla', 'palazzo', 'condo', 'micro', 'hut']);

export function buildArchetype(type, L, ctx) {
  const { R, P } = ctx;
  const { x, y, rot, d } = L;
  let { w, dp, h } = L;
  const gr = groundOf(ctx, x, y, rot, w / 2, dp / 2);
  const rec = {
    kind: LABEL[type] ?? type, type, d, x, y, rot, w, dp, h: h + gr.extra, gz: gr.base, key: L.key,
    lit: clamp(0.38 + 0.25 * R.normal() * 0.5 + (d.tier === 'cbd' ? 0.12 : 0) + (P.id === 'kaiyo' ? 0.15 : 0), 0.08, 0.9),
  };
  rec.id = ctx.addBuilding(rec);
  const b = new B(ctx, rec);
  const fac = vary(R.pick(d.facade), R), roof = R.pick(d.roof);
  const H = h + gr.extra;
  const front = L.front ?? -1;

  switch (type) {
    case 'row': {
      b.box(0, 0, 0, w - 0.25, H, dp, fac, S.PUNCH, 3.4, 2.7);
      b.box(0, H - 0.6, 0, w + 0.2, 0.6, dp + 0.25, shade(fac, 0.78), S.PLAIN);
      if (R.chance(0.28) && H > 10) b.part('gable', 0, H, 0, w - 0.25, 2.6, dp * 0.92, roof, S.ROOF);
      else roofProps(b, R, w, dp, H, P, 0.5);
      break;
    }
    case 'house': {
      const roofH = Math.min(w, dp) * 0.42, bodyH = Math.max(3, H - roofH);
      b.box(0, 0, 0, w * 0.86, bodyH, dp * 0.8, fac, S.PUNCH, 3, 3.2);
      if (w >= dp) b.part('gable', 0, bodyH, 0, w * 0.92, roofH, dp * 0.9, roof, S.ROOF);
      else b.part('gable', 0, bodyH, 0, dp * 0.9, roofH, w * 0.92, roof, S.ROOF, 3, 3, Math.PI / 2);
      rec.h = bodyH + roofH;
      break;
    }
    case 'gabled': {
      const roofH = w * 0.55, bodyH = Math.max(4, H - roofH);
      b.box(0, 0, 0, w - 0.3, bodyH, dp * 0.92, fac, S.PUNCH, 3, 2.4);
      b.part('gable', 0, bodyH, 0, dp * 0.96, roofH, w - 0.1, roof, S.ROOF, 3, 3, Math.PI / 2);
      if (R.chance(0.4)) b.box(w * 0.2, bodyH + roofH * 0.4, dp * 0.15, 0.9, roofH * 0.7, 0.9, shade(fac, 0.7), S.PLAIN);
      rec.h = bodyH + roofH;
      break;
    }
    case 'midrise': {
      const shops = d.tier === 'cbd' || d.tier === 'mid';
      b.box(0, 0, 0, w * 0.97, H, dp * 0.97, fac, shops ? S.SHOP : R.chance(0.35) ? S.RIBBON : S.PUNCH, 3.3, 3.1);
      b.box(0, H, 0, w * 0.97, 0.5, dp * 0.97, shade(fac, 0.82), S.PLAIN);
      roofProps(b, R, w, dp, H + 0.5, P, 1);
      break;
    }
    case 'loft': {
      b.box(0, 0, 0, w * 0.97, H, dp * 0.97, fac, S.PUNCH, 4.2, 4.2);
      b.box(0, H - 0.7, 0, w + 0.1, 0.7, dp + 0.1, shade(fac, 0.75), S.PLAIN);
      if (R.chance(0.3)) b.box(0, H, 0, w * 0.6, 0.6, dp * 0.5, 0x6f8a4f, S.LEAF);
      else roofProps(b, R, w, dp, H, P, 0.7);
      break;
    }
    case 'warehouse': {
      const hh = Math.min(H, 14);
      b.box(0, 0, 0, w * 0.96, hh, dp * 0.96, fac, S.RIBBON, hh, 5);
      if (R.chance(0.55)) {
        const k = Math.max(2, Math.round(w / 8));
        for (let i = 0; i < k; i++) b.part('gable', -w * 0.48 + (i + 0.5) * (w * 0.96 / k), hh, 0, dp * 0.96, 2.6, (w * 0.96) / k, roof, S.ROOF, 3, 3, Math.PI / 2);
        rec.h = hh + 2.6;
      } else { b.box(0, hh, 0, w * 0.96, 0.4, dp * 0.96, roof, S.PLAIN); rec.h = hh; }
      rec.lit = 0.08;
      break;
    }
    case 'containers': {
      const nu = Math.max(1, Math.floor(w / 12.8)), nv = Math.max(1, Math.floor(dp / 2.75));
      let n = 0;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        if (j % 5 === 4) continue; // aisles
        if (n++ > 80) break;
        const lv = 1 + Math.floor(R.next() * 4);
        b.box(-w / 2 + (i + 0.5) * (w / nu), 0, -dp / 2 + (j + 0.5) * (dp / nv), 12.2, 2.6 * lv, 2.45, R.pick(CONTAINER_COLORS), S.CONT, 2.6, 6.1);
      }
      rec.h = 10.4; rec.lit = 0;
      break;
    }
    case 'mansion': {
      const bodyH = Math.max(6, H - 4.5);
      b.box(0, 0, 0, w * 0.62, bodyH, dp * 0.55, fac, S.PUNCH, 3.9, 3.6);
      b.part(w > dp * 1.25 ? 'hip' : 'pyr', 0, bodyH, 0, w * 0.66, 4.5, dp * 0.6, roof, S.ROOF);
      for (const s of [-1, 1]) {
        b.box(s * w * 0.4, 0, -dp * 0.04, w * 0.19, bodyH - 3, dp * 0.42, fac, S.PUNCH, 3.6, 3.4);
        b.part('hip', s * w * 0.4, bodyH - 3, -dp * 0.04, w * 0.21, 2.6, dp * 0.45, roof, S.ROOF);
      }
      if (R.chance(0.45)) b.box(0, 0.05, dp * 0.38, Math.min(12, w * 0.4), 0.25, 4.5, 0x39a6b8, S.POOL);
      rec.h = bodyH + 4.5; rec.lit = 0.6;
      break;
    }
    case 'villa': {
      const big = d.tier === 'trophy' ? 1.25 : 1;
      b.box(0, 0, 0, w * 0.8 * big, 3.7, dp * 0.66 * big, fac, S.RIBBON, 3.7, 4.5);
      b.box(0, 3.7, 0, w * 0.84 * big, 0.35, dp * 0.7 * big, shade(fac, 0.85), S.PLAIN);
      b.box(w * 0.12, 4.05, -dp * 0.05, w * 0.52 * big, 3.3, dp * 0.55 * big, fac, S.RIBBON, 3.3, 4.5);
      b.box(w * 0.12, 7.35, -dp * 0.05, w * 0.56 * big, 0.3, dp * 0.6 * big, shade(fac, 0.85), S.PLAIN);
      b.box(-w * 0.05, 0.05, dp * 0.52 * big, w * 0.48, 0.25, 4.5, 0x2fb3c4, S.POOL);
      if (d.tier === 'trophy' && R.chance(0.5)) {
        b.part('cyl', -w * 0.9, 0.1, 0, 13, 0.45, 13, 0x3b3f44, S.PLAIN);
        b.part('cyl', -w * 0.9, 0.5, 0, 9, 0.08, 9, BRASS, S.LAMP, 3, 3, 0, 1);
      }
      rec.h = 7.7; rec.lit = 0.65;
      break;
    }
    case 'glassvilla': {
      const gx = ctx.dWaterAt(x + 4, y) - ctx.dWaterAt(x - 4, y), gy = ctx.dWaterAt(x, y + 4) - ctx.dWaterAt(x, y - 4);
      const toW = Math.atan2(-gy, -gx) - rot;
      const ox = Math.cos(toW) * 3.5, oz = Math.sin(toW) * 3.5;
      const glass = R.pick(d.glass ?? [0x7fa3b0]);
      b.box(0, 0, 0, w * 0.75, 3.4, dp * 0.66, glass, S.GLASS, 3.4, 2.2);
      b.box(ox, 3.4, oz, w * 0.9, 3.3, dp * 0.55, fac, S.RIBBON, 3.3, 4);
      b.box(ox, 6.7, oz, w * 0.95, 0.4, dp * 0.62, 0x34383c, S.PLAIN);
      rec.h = 7.1; rec.lit = 0.7;
      break;
    }
    case 'palazzo': {
      b.box(0, 0, 0, w, H, dp, fac, S.PUNCH, 4.3, 3.5);
      b.box(0, H - 0.5, 0, w + 0.3, 0.5, dp + 0.3, shade(fac, 0.8), S.PLAIN);
      b.part(w / dp > 1.3 || dp / w > 1.3 ? 'hip' : 'pyr', 0, H, 0, w + 0.2, 2.3, dp + 0.2, roof, S.ROOF, 3, 3, w >= dp ? 0 : Math.PI / 2);
      if (R.chance(0.12)) b.box(w * 0.2, H + 1.2, 0, 3.2, 1.6, 3.2, 0x7a5a3c, S.PLAIN);
      rec.h = H + 2.3;
      break;
    }
    case 'tower':
    case 'ghost': {
      buildTower(b, rec, R, P, d, w, dp, H, type === 'ghost');
      break;
    }
    case 'condo': {
      const along = R.chance(0.5);
      const sw = along ? w * 0.92 : w * 0.5, sd = along ? dp * 0.5 : dp * 0.92;
      b.box(0, 0, 0, sw, H, sd, fac, S.RIBBON, 3.1, 4);
      b.box(0, H, 0, sw * 0.4, 3, sd * 0.5, shade(fac, 0.85), S.PLAIN);
      if (R.chance(0.3)) b.box(0, H + 3, 0, sw * 0.42, 0.25, sd * 0.42, 0x2fb3c4, S.POOL);
      rec.h = H + 3; rec.tower = H > 40;
      break;
    }
    case 'strip': {
      const hh = Math.min(H, 12);
      b.box(0, 0, 0, w * 0.96, hh, dp * 0.9, fac, S.SHOP, 4, 4.2);
      b.box(0, hh, 0, w * 0.96, 0.5, dp * 0.9, shade(fac, 0.85), S.PLAIN);
      signs(b, R, w, dp * 0.9, hh, front, 0.9);
      rec.h = hh; rec.lit = 0.75;
      break;
    }
    case 'micro': {
      b.box(0, 0, 0, w * 0.97, H, dp * 0.95, fac, R.chance(0.45) ? S.RIBBON : S.PUNCH, 3, 2.4);
      if (d.neon) signs(b, R, w * 0.97, dp * 0.95, H, front, 0.75);
      roofProps(b, R, w, dp, H, P, 0.8);
      if (R.chance(0.08) && H > 12) b.box(0, H + 1.8, 0, w * 0.85, 3.6, 0.4, R.pick(NEON), S.SIGN, 3, 3, 0, 1);
      break;
    }
    case 'hut': {
      const hh = Math.min(H, 6.5);
      b.box(0, 0, 0, w * 0.9, hh, dp * 0.9, fac, S.PUNCH, 2.8, 2.6);
      b.box(0, hh, 0, w * 0.96, 0.3, dp * 0.96, roof, S.PLAIN);
      if (R.chance(0.35)) {
        const ox = R.range(-1, 1) * w * 0.15;
        b.box(ox, hh + 0.3, 0, w * 0.6, 2.8, dp * 0.6, vary(R.pick(d.facade), R), S.PUNCH, 2.8, 2.6);
        b.box(ox, hh + 3.1, 0, w * 0.66, 0.3, dp * 0.66, roof, S.PLAIN);
        rec.h = hh + 3.4;
      } else rec.h = hh + 0.3;
      if (R.chance(0.3)) b.part('cyl', w * 0.25, rec.h, dp * 0.2, 1.4, 1.5, 1.4, 0x3d6fa8, S.PLAIN);
      break;
    }
    default:
      b.box(0, 0, 0, w, H, dp, fac, S.PUNCH);
  }

  const floors = Math.max(1, Math.round(rec.h / 3.3));
  rec.floors = floors;
  const area = w * dp * 0.85 * floors;
  if (RESIDENTIAL.has(type)) rec.residents = Math.round(area / (type === 'mansion' || type === 'villa' || type === 'glassvilla' ? 160 : 42));
  else if (type === 'tower' || type === 'strip') rec.jobs = Math.round(area / 16);
  else rec.jobs = Math.round(area / 60);
  if (type === 'midrise' || type === 'micro') rec.jobs = Math.round(area / 120);
  return rec;
}

function roofProps(b, R, w, dp, top, P, chance) {
  if (!R.chance(chance)) return;
  const n = 1 + Math.floor(R.next() * 3);
  for (let i = 0; i < n; i++) {
    const ax = R.range(-0.3, 0.3) * w, az = R.range(-0.3, 0.3) * dp;
    const kind = R.next();
    if (kind < 0.35 && (P.id === 'avalon' || P.id === 'kaiyo')) {
      // the classic rooftop water tank
      b.box(ax - 1, top, az - 1, 0.3, 2.2, 0.3, 0x4a4540, S.PLAIN);
      b.box(ax + 1, top, az + 1, 0.3, 2.2, 0.3, 0x4a4540, S.PLAIN);
      b.part('cyl', ax, top + 2.2, az, 3, 3.2, 3, 0x7a5a42, S.PLAIN);
      b.part('cone', ax, top + 5.4, az, 3.1, 1.3, 3.1, 0x4a4540, S.ROOF);
    } else if (kind < 0.7) {
      b.box(ax, top, az, R.range(2, 4), R.range(1, 2), R.range(1.5, 3), 0x9a9893, S.PLAIN);
    } else {
      b.box(ax, top, az, R.range(3, 5), R.range(2.4, 3.2), R.range(3, 4.5), 0x8d8a84, S.PLAIN);
    }
  }
}

function signs(b, R, w, dp, H, front, chance) {
  if (!R.chance(chance)) return;
  const zf = front * (dp / 2 + 0.35);
  if (R.chance(0.6)) {
    const sh = Math.min(R.range(3.5, 13), H * 0.7);
    b.box(R.pick([-1, 1]) * w * 0.38, R.range(0.25, 0.4) * H, zf + front * 0.6, 0.45, sh, 1.6, R.pick(NEON), S.SIGN, 3, 3, 0, 1);
  }
  if (R.chance(0.6)) b.box(0, Math.min(H * 0.35, 4.2), zf, w * R.range(0.4, 0.8), R.range(1.1, 1.9), 0.4, R.pick(NEON), S.SIGN, 3, 3, 0, 1);
}

function buildTower(b, rec, R, P, d, w, dp, H, ghost) {
  const deco = P.id === 'avalon' ? R.chance(0.5) : P.id === 'kaiyo' ? R.chance(0.1) : R.chance(0.25);
  const glassPal = d.glass ?? [0x5d7f8f];
  const glass = R.pick(glassPal);
  const stone = R.pick(d.facade);
  const podH = clamp(Math.round(H * 0.1 / 4.5) * 4.5, 4.5, 18);
  b.box(0, 0, 0, w, podH, dp, deco ? stone : shade(stone, 0.9), S.SHOP, 4.5, 4.2);
  b.box(0, podH, 0, w + 0.2, 0.5, dp + 0.2, shade(stone, 0.75), S.PLAIN);
  const f = R.range(0.66, 0.88);
  let sw = w * f, sd = dp * f, y = podH;
  const crownKinds = deco ? ['lantern', 'spire', 'stepped', 'pyramid'] : ['flat', 'helipad', 'antenna', 'spire', 'pyramid', 'flat', 'stepped'];
  const crown = R.pick(crownKinds);
  const crownH = crown === 'flat' ? 2 : crown === 'helipad' ? 1 : 6;
  let shaft = Math.max(8, H - podH - crownH);
  const tiers = H > 110 && R.chance(deco ? 0.85 : 0.4) ? 1 + Math.floor(R.next() * 3) : 0;
  const style = ghost ? S.FRAME : deco ? (R.chance(0.6) ? S.PUNCH : S.RIBBON) : R.chance(0.78) ? S.GLASS : S.RIBBON;
  const col = ghost ? 0xa7a299 : deco ? stone : style === S.GLASS ? glass : R.pick([0xe6e2d8, 0xcfc8bb, 0x8f969c, stone]);
  const fh = style === S.GLASS ? 3.9 : 3.6, bw = style === S.GLASS ? 1.8 : 2.8;
  const segs = [];
  if (tiers) {
    let left = shaft;
    for (let t = 0; t <= tiers; t++) {
      const part = t === tiers ? left : left * R.range(0.5, 0.66);
      segs.push(part); left -= part;
    }
  } else segs.push(shaft);
  if (ghost) segs[0] = shaft * R.range(0.45, 0.8);
  for (let t = 0; t < segs.length; t++) {
    b.box(0, y, 0, sw, segs[t], sd, col, style, fh, bw);
    y += segs[t];
    if (t < segs.length - 1) { b.box(0, y - 0.6, 0, sw + 0.3, 0.6, sd + 0.3, shade(col, 0.8), S.PLAIN); sw *= 0.8; sd *= 0.8; }
    if (P.id === 'kaiyo' && t === 0 && segs[t] > 80 && R.chance(0.3)) b.box(0, y - segs[t] * 0.45, 0, sw * 1.04, 3.2, sd * 1.04, 0x6f8f4f, S.LEAF);
  }
  rec.h = y;
  if (!ghost) {
    // the crown band: lights up for headquarters on a good day, brass for crown towers
    b.box(0, y - 2.6, 0, sw + 0.35, 1.5, sd + 0.35, BRASS, S.LAMP, 3, 3, 0, 0.6);
    switch (crown) {
      case 'flat': b.box(0, y, 0, sw, 1, sd, shade(col, 0.8), S.PLAIN); b.box(sw * 0.15, y + 1, -sd * 0.1, sw * 0.35, 3, sd * 0.3, 0x8d8a84, S.PLAIN); rec.h = y + 4; break;
      case 'helipad': b.part('cyl', 0, y, 0, Math.min(sw, sd) * 0.85, 0.7, Math.min(sw, sd) * 0.85, 0x3b3f44, S.PLAIN); b.part('cyl', 0, y + 0.7, 0, Math.min(sw, sd) * 0.55, 0.06, Math.min(sw, sd) * 0.55, BRASS, S.LAMP, 3, 3, 0, 1); rec.h = y + 1; break;
      case 'antenna': b.box(0, y, 0, sw * 0.5, 3, sd * 0.5, 0x8d8a84, S.PLAIN); b.box(sw * 0.1, y + 3, 0, 0.9, H * 0.12 + 10, 0.9, 0xb9b4aa, S.PLAIN); b.box(-sw * 0.12, y + 3, sd * 0.1, 0.7, H * 0.07 + 6, 0.7, 0xb9b4aa, S.PLAIN); rec.h = y + H * 0.12 + 13; break;
      case 'spire': b.box(0, y, 0, sw * 0.6, 4, sd * 0.6, shade(col, 0.9), style, fh, bw); b.part('cone', 0, y + 4, 0, sw * 0.28, H * 0.11 + 12, sd * 0.28, deco ? 0xc9b48a : 0xb9c0c4, S.ROOF); rec.h = y + 4 + H * 0.11 + 12; break;
      case 'lantern': b.box(0, y, 0, sw * 0.6, 7, sd * 0.6, BRASS, S.LAMP, 3, 3, 0, 1); b.part('pyr', 0, y + 7, 0, sw * 0.66, 7, sd * 0.66, deco ? 0x6f9a87 : 0x5d6266, S.ROOF); rec.h = y + 14; break;
      case 'pyramid': b.part('pyr', 0, y, 0, sw, Math.min(sw, sd) * 0.55, sd, style === S.GLASS ? shade(glass, 1.1) : 0x6f9a87, S.ROOF); rec.h = y + Math.min(sw, sd) * 0.55; break;
      case 'stepped': b.box(0, y, 0, sw * 0.72, 5, sd * 0.72, col, style, fh, bw); b.box(0, y + 5, 0, sw * 0.45, 4, sd * 0.45, col, style, fh, bw); b.box(0, y + 9, 0, 0.8, 9, 0.8, 0xb9b4aa, S.PLAIN); rec.h = y + 18; break;
    }
  } else {
    rec.ghost = true;
    rec.kind = 'Unfinished tower';
    b.flags = 4;
  }
  rec.tower = !ghost;
  rec.lit = clamp(0.5 + R.range(-0.15, 0.15), 0, 1);
}

// ------------------------------------------------------------------ landmarks

export function buildLandmark(lm, x, y, rot, ctx) {
  const { R } = ctx;
  const gz = Math.max(0.2, ctx.heightAt(x, y));
  const rec = { kind: 'Landmark', label: lm.name, type: lm.type, d: ctx.distAt(x, y), x, y, rot, w: 40, dp: 40, h: 30, gz, key: -1, lit: 0.6 };
  rec.id = ctx.addBuilding(rec);
  const b = new B(ctx, rec);
  const stone = 0xd8ccb3;
  let radius = 30;
  switch (lm.type) {
    case 'exchange': {
      b.box(0, 0, 0, 74, 4, 52, 0xc9bd9f, S.PLAIN);
      b.box(0, 4, 4, 64, 24, 40, stone, S.PUNCH, 6, 5);
      for (let i = 0; i < 8; i++) b.part('cyl', -31.5 + i * 9, 4, -19, 2.4, 16, 2.4, 0xe9e1cf, S.PLAIN);
      b.box(0, 20, -18, 72, 3, 8, 0xe2d8c2, S.PLAIN);
      b.part('gable', 0, 23, -18, 72, 7, 8, 0xd6cbb2, S.PLAIN);
      b.box(0, 28, 6, 58, 1, 32, 0x8d8a84, S.PLAIN);
      rec.w = 74; rec.dp = 52; rec.h = 30; radius = 46;
      break;
    }
    case 'lighthouse': {
      b.box(10, 0, 4, 12, 5, 8, 0xe9e4da, S.PUNCH, 3, 3);
      b.part('gable', 10, 5, 4, 12, 3, 8, 0xa8493a, S.ROOF);
      b.part('cyl', 0, 0, 0, 9, 30, 9, 0xf1ede5, S.PLAIN);
      b.part('cyl', 0, 12, 0, 9.2, 5, 9.2, 0xb0453a, S.PLAIN);
      b.part('cyl', 0, 30, 0, 11, 1, 11, 0x3b3f44, S.PLAIN);
      b.part('cyl', 0, 31, 0, 5.5, 4.5, 5.5, 0xffe2a0, S.LAMP, 3, 3, 0, 1);
      b.part('cone', 0, 35.5, 0, 7, 4.5, 7, 0xb0453a, S.ROOF);
      rec.h = 40; rec.w = 12; rec.dp = 12; radius = 16;
      break;
    }
    case 'customs': {
      b.box(0, 0, 0, 52, 17, 30, stone, S.PUNCH, 5, 4.5);
      b.box(0, 17, 0, 54, 1.2, 32, 0xc4b796, S.PLAIN);
      b.part('cyl', 0, 18.2, 0, 17, 6, 17, stone, S.PLAIN);
      b.part('dome', 0, 24.2, 0, 17, 10, 17, 0x6f9a87, S.ROOF);
      b.part('cyl', 0, 34, 0, 3.4, 4, 3.4, 0xe9e1cf, S.PLAIN);
      b.part('cone', 0, 38, 0, 3.6, 3, 3.6, 0x6f9a87, S.ROOF);
      rec.h = 41; rec.w = 54; rec.dp = 32; radius = 36;
      break;
    }
    case 'observatory': {
      b.part('cyl', 0, 0, 0, 24, 9, 24, 0xece7dc, S.PLAIN);
      b.part('dome', 0, 9, 0, 23, 11, 23, 0xb9c0c4, S.ROOF);
      b.box(16, 0, 0, 14, 6, 10, 0xece7dc, S.PUNCH, 3, 3);
      rec.h = 20; rec.w = 24; rec.dp = 24; radius = 24;
      break;
    }
    case 'opera': {
      b.box(0, 0, 0, 92, 12, 54, 0x8fb0bb, S.GLASS, 4, 2.5);
      for (let i = 0; i < 4; i++) b.part('gable', -30 + i * 20, 12, -6 + i * 3, 24, 8 + i * 6, 46 - i * 6, 0xf3f1ec, S.PLAIN);
      b.box(0, 0, 34, 96, 1.2, 14, 0xe8e6e1, S.PLAIN);
      rec.h = 38; rec.w = 96; rec.dp = 60; radius = 56;
      break;
    }
    case 'cathedral': {
      b.box(0, 0, 0, 22, 18, 64, 0xcfc4ad, S.PUNCH, 9, 5);
      b.part('gable', 0, 18, 0, 64, 11, 22, 0x4f7a6d, S.ROOF, 3, 3, Math.PI / 2);
      b.box(0, 0, -38, 14, 44, 14, 0xcfc4ad, S.PUNCH, 8, 5);
      b.part('pyr', 0, 44, -38, 14, 26, 14, 0x4f7a6d, S.ROOF);
      b.box(0, 0, 12, 40, 14, 16, 0xcfc4ad, S.PUNCH, 7, 5);
      b.part('gable', 0, 14, 12, 40, 8, 16, 0x4f7a6d, S.ROOF);
      rec.h = 70; rec.w = 40; rec.dp = 80; radius = 48;
      break;
    }
    case 'basilica': {
      b.box(0, 0, 0, 56, 22, 64, 0xe7d9bf, S.PUNCH, 7, 5);
      b.part('cyl', 0, 22, 0, 22, 8, 22, 0xe2d3b5, S.PLAIN);
      b.part('dome', 0, 30, 0, 22, 14, 22, 0x6f9a87, S.ROOF);
      for (const [ax, az] of [[-18, -20], [18, -20], [-18, 20], [18, 20]]) { b.part('cyl', ax, 22, az, 12, 4, 12, 0xe2d3b5, S.PLAIN); b.part('dome', ax, 26, az, 12, 8, 12, 0x6f9a87, S.ROOF); }
      b.part('cone', 0, 44, 0, 3, 6, 3, 0xc9a45c, S.ROOF);
      rec.h = 50; rec.w = 56; rec.dp = 64; radius = 44;
      break;
    }
    case 'campanile': {
      b.box(0, 0, 0, 12, 78, 12, 0xb5643a, S.PUNCH, 12, 4);
      b.box(0, 78, 0, 13, 10, 13, 0xe7d9bf, S.PUNCH, 10, 4);
      b.part('pyr', 0, 88, 0, 13, 16, 13, 0x6f9a87, S.ROOF);
      b.part('cone', 0, 104, 0, 1.6, 6, 1.6, 0xc9a45c, S.ROOF);
      rec.h = 110; rec.w = 13; rec.dp = 13; radius = 12;
      break;
    }
    case 'dome': {
      b.box(0, 0, 0, 34, 16, 34, 0xe7d9bf, S.PUNCH, 8, 5);
      b.part('cyl', 0, 16, 0, 20, 7, 20, 0xe2d3b5, S.PLAIN);
      b.part('dome', 0, 23, 0, 20, 13, 20, 0xb9c0c4, S.ROOF);
      b.part('cyl', 0, 36, 0, 3, 4, 3, 0xe2d3b5, S.PLAIN);
      rec.h = 40; rec.w = 34; rec.dp = 34; radius = 28;
      break;
    }
    case 'sail': {
      b.part('cyl', 0, 0, 0, 74, 2, 74, 0xe9e1cf, S.PLAIN);
      for (let i = 0; i < 14; i++) {
        const t = i / 13, dd = 44 * (1 - t * 0.85) + 4, ox = -12 + 16 * Math.sin(t * 1.4);
        b.box(ox, 2 + i * 20, 0, 22, 20.5, dd, i % 2 ? 0xf3f1ec : 0xe8eef0, S.RIBBON, 4, 5);
      }
      b.box(4, 282, 0, 1.4, 40, 1.4, 0xc9a45c, S.PLAIN);
      b.part('cyl', -14, 200, 0, 18, 0.8, 18, 0x3b3f44, S.PLAIN);
      b.part('cyl', -14, 200.8, 0, 12, 0.06, 12, 0xc9a45c, S.LAMP, 3, 3, 0, 1);
      rec.h = 322; rec.w = 40; rec.dp = 48; radius = 36;
      break;
    }
    case 'ferris': {
      const cy = 36, r = 30;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        b.box(Math.cos(a) * r, cy + Math.sin(a) * r - 0.6, 0, 3.6, 1.2, 1.2, 0xe9e4da, S.PLAIN);
        if (i % 2 === 0) b.box(Math.cos(a) * (r + 1.2), cy + Math.sin(a) * (r + 1.2) - 3.4, 0, 2.4, 2.8, 2.4, NEON[(i / 2) % NEON.length], S.SIGN, 3, 3, 0, 1);
      }
      for (const s of [-1, 1]) { b.box(s * 10, 0, 0, 1.6, cy, 1.6, 0xe9e4da, S.PLAIN); b.box(s * 4, 0, 0, 1.6, cy, 1.6, 0xe9e4da, S.PLAIN); }
      b.box(0, cy - 2, 0, 4, 4, 4, 0xe9e4da, S.PLAIN);
      b.box(0, 0, 0, 30, 4, 12, 0xf0ece4, S.SHOP, 4, 4);
      rec.h = cy + r + 4; rec.w = 66; rec.dp = 12; radius = 36;
      break;
    }
    case 'stadium': {
      const rx = 70, rz = 50, n = 44;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
        const px = Math.cos(a) * rx, pz = Math.sin(a) * rz, qx = Math.cos(a2) * rx, qz = Math.sin(a2) * rz;
        const len = Math.hypot(qx - px, qz - pz) + 0.6;
        b.box((px + qx) / 2, 0, (pz + qz) / 2, len, 22, 16, 0xe6e0d4, S.RIBBON, 5.5, 3, Math.atan2(qz - pz, qx - px));
      }
      b.box(0, 0.1, 0, 96, 0.4, 62, 0x5f9a4a, S.PLAIN);
      for (const [ax, az] of [[-80, -58], [80, -58], [-80, 58], [80, 58]]) { b.box(ax, 0, az, 1.6, 52, 1.6, 0xb9b4aa, S.PLAIN); b.box(ax, 52, az, 7, 3, 2, 0xfff6d8, S.LAMP, 3, 3, 0, 1); }
      rec.h = 55; rec.w = 160; rec.dp = 120; radius = 92;
      break;
    }
    case 'skytower': {
      const legs = [[40, 0, 70], [30, 70, 90], [20, 160, 110], [13, 270, 60]];
      for (const [r, y0, h] of legs) b.part('cyl', 0, y0, 0, r, h, r, 0xd9dcde, S.RIBBON, 9, 4);
      b.part('cyl', 0, 230, 0, 34, 16, 34, 0x6b8597, S.GLASS, 4, 2);
      b.part('cyl', 0, 246, 0, 36, 1.2, 36, 0xc9a45c, S.LAMP, 3, 3, 0, 1);
      b.part('cyl', 0, 315, 0, 22, 10, 22, 0x6b8597, S.GLASS, 4, 2);
      b.part('cone', 0, 330, 0, 8, 120, 8, 0xd9dcde, S.ROOF);
      rec.h = 450; rec.w = 40; rec.dp = 40; radius = 40;
      break;
    }
    case 'pagoda': {
      b.box(0, 0, 0, 46, 12, 46, 0x8f8a80, S.PLAIN);
      let s = 30, y0 = 12;
      for (let i = 0; i < 5; i++) {
        b.box(0, y0, 0, s, 6.5, s, 0xf1ede5, S.PUNCH, 6.5, 4);
        b.part('hip', 0, y0 + 6.5, 0, s + 8, 3.5, s + 8, 0x3f4a4f, S.ROOF);
        y0 += 10; s *= 0.8;
      }
      b.part('cone', 0, y0, 0, 3, 8, 3, 0xc9a45c, S.ROOF);
      rec.h = y0 + 8; rec.w = 46; rec.dp = 46; radius = 30;
      break;
    }
    case 'estate':
    case 'estateSmall': {
      // a private island estate: main house, terraces, pool, guest house, helipad, pavilion
      const k = lm.type === 'estate' ? 1 : 0.75;
      const white = 0xf3efe7, stoneW = 0xe2d6bf, timber = 0x6b5a48;
      b.box(0, 0, 0, 56 * k, 1.2, 40 * k, 0xd9cdb2, S.PLAIN);
      b.box(0, 1.2, 0, 40 * k, 4.2, 22 * k, white, S.GLASS, 4.2, 2.6);
      b.box(-4 * k, 5.4, -2 * k, 30 * k, 0.4, 26 * k, stoneW, S.PLAIN);
      b.box(-6 * k, 5.8, -3 * k, 22 * k, 3.8, 14 * k, white, S.RIBBON, 3.8, 5);
      b.box(-6 * k, 9.6, -3 * k, 25 * k, 0.4, 17 * k, timber, S.PLAIN);
      b.box(14 * k, 1.2, 15 * k, 22 * k, 0.3, 8 * k, 0x2fb3c4, S.POOL);
      b.box(-24 * k, 1.2, 14 * k, 10 * k, 3.4, 8 * k, white, S.RIBBON, 3.4, 4);
      b.box(-24 * k, 4.6, 14 * k, 11 * k, 0.3, 9 * k, timber, S.PLAIN);
      b.part('cyl', 30 * k, 0.2, -16 * k, 15, 0.5, 15, 0x3b3f44, S.PLAIN);
      b.part('cyl', 30 * k, 0.7, -16 * k, 10, 0.06, 10, BRASS, S.LAMP, 3, 3, 0, 1);
      b.part('pyr', 22 * k, 1.2, 4 * k, 6, 2.5, 6, timber, S.ROOF);
      rec.h = 10; rec.w = 56 * k; rec.dp = 40 * k; rec.kind = 'Island estate'; radius = 38 * k;
      break;
    }
    default:
      return null;
  }
  return { radius, height: rec.h };
}

// ------------------------------------------------------------------ life

export function buildTree(type, x, y, key, ctx, scale = 1) {
  const { R, P } = ctx;
  const g = Math.max(0.2, ctx.heightAt(x, y));
  const pal = P.palette.tree;
  const s = R.range(3.6, 6.4) * scale;
  const p = ctx.parts;
  switch (type) {
    case 'pine':
      p.push('cone', x, g, y, s * 0.85, s * 2.5, s * 0.85, 0, R.pick(pal), S.LEAF, 3, 3, 0, key, 0, g, 0);
      break;
    case 'palm': {
      const th = R.range(6, 11) * scale;
      p.push('cyl', x, g, y, 0.55, th, 0.55, 0, 0x8a7255, S.LEAF, 3, 3, 0, key, 0, g, 0);
      p.push('dome', x, g + th - 0.6, y, 5.6 * scale, 1.8, 5.6 * scale, 0, R.pick(pal), S.LEAF, 3, 3, 0, key, 0, g, 0);
      break;
    }
    case 'cherry':
      p.push('treeBox', x, g, y, 0.4, 1.5, 0.4, 0, 0x6b5240, S.PLAIN, 3, 3, 0, key, 0, g, 0); // short trunk (a box: cheap to draw)
      p.push('treeIco', x, g + 0.8, y, s, s * 0.95, s, 0, R.chance(0.45) ? pal[1] : R.pick([pal[0], pal[2]]), S.LEAF, 3, 3, 0, key, 0, g, 0);
      break;
    default:
      p.push('treeBox', x, g, y, 0.4, 1.5, 0.4, 0, 0x6b5240, S.PLAIN, 3, 3, 0, key, 0, g, 0); // short trunk
      p.push('treeIco', x, g + 0.9, y, s, s * 1.05, s, 0, R.pick(pal), S.LEAF, 3, 3, 0, key, 0, g, 0);
  }
}

export function buildCrane(kind, x, y, rot, key, ctx, height = 40) {
  const { R } = ctx;
  const g = Math.max(0.2, ctx.heightAt(x, y));
  const rec = { x, y, rot, id: 0, key, gz: g, lit: 0 };
  const b = new B(ctx, rec);
  if (kind === 'gantry') {
    const col = R.chance(0.6) ? 0xb84a35 : 0x3c6e92;
    for (const [ax, az] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) b.box(ax, 0, az, 1.5, 30, 1.5, col, S.PLAIN);
    for (const az of [-7, 7]) b.box(0, 28, az, 16, 2.4, 1.6, col, S.PLAIN);
    b.box(14, 30.4, 0, 62, 2.6, 3.2, col, S.PLAIN);
    b.box(-4, 32, 0, 9, 4.5, 8, 0xe9e4da, S.PLAIN);
    b.box(-7, 33, 0, 1, 14, 1, col, S.PLAIN);
  } else {
    const col = 0xd9a62b;
    b.box(0, 0, 0, 1.8, height, 1.8, col, S.PLAIN);
    b.box(12, height, 0, 48, 1.6, 1.6, col, S.PLAIN);
    b.box(-10, height - 1.5, 0, 6, 3, 3, 0x5f5c58, S.PLAIN);
    b.box(1.8, height - 3, 0, 2.6, 2.6, 2.6, 0xe9e4da, S.PLAIN);
    b.box(0, height + 1.6, 0, 0.8, 7, 0.8, col, S.PLAIN);
    b.box(30, height - 14, 0, 0.2, 14, 0.2, 0x3b3f44, S.PLAIN);
  }
}

export function buildShip(x, y, rot, key, ctx) {
  const { R } = ctx;
  const rec = { x, y, rot, id: 0, key, gz: 0, lit: 0.5 };
  const b = new B(ctx, rec);
  const L = R.range(110, 150);
  b.box(0, -3, 0, L, 8, 20, R.pick([0x7b2f28, 0x2d3a44, 0x29404f]), S.PLAIN);
  b.box(0, 4.9, 0, L - 2, 0.3, 19, 0x9a3d34, S.PLAIN);
  const bays = Math.floor((L - 30) / 13);
  for (let i = 0; i < bays; i++) {
    const lv = 1 + Math.floor(R.next() * 4);
    b.box(-L / 2 + 26 + i * 13, 5.2, 0, 12.2, 2.6 * lv, 18, R.pick(CONTAINER_COLORS), S.CONT, 2.6, 2.5);
  }
  b.box(-L / 2 + 10, 5.2, 0, 12, 15, 18, 0xeeeae2, S.PUNCH, 3, 2.4);
  b.box(-L / 2 + 6, 20.2, 0, 4, 6, 4, 0x3b3f44, S.PLAIN);
}

export function buildBoat(x, y, rot, key, ctx, scale = 1) {
  const { R } = ctx;
  const rec = { x, y, rot, id: 0, key, gz: 0, lit: 0.7 };
  const b = new B(ctx, rec);
  const L = R.range(8, 18) * scale;
  b.box(0, -0.5, 0, L, 1.8, L * 0.32, 0xf3f1ec, S.PLAIN);
  b.box(-L * 0.08, 1.3, 0, L * 0.42, 1.4, L * 0.22, 0xe2e0da, S.RIBBON, 1.4, 2);
  if (scale > 1.3 && R.chance(0.5)) b.box(-L * 0.12, 2.7, 0, L * 0.26, 1.2, L * 0.18, 0xe2e0da, S.RIBBON, 1.2, 2);
}
