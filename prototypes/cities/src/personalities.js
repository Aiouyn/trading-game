// The five cities (plus Isla Serena). Each personality is data plus a terrain function.
// Map coordinates: x east, y south (towards the default viewer), metres, origin at the map centre.
// terrain(x, y, n) returns height in metres; negative means water.

import { smoothstep, clamp } from './noise.js';

const gauss = (x, y, cx, cy, s) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

/** Signed distance to a polyline [[x,y],...] (unsigned, metres). */
function polyDist(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < best) best = d;
  }
  return best;
}

/** Sample a parametric curve into points. */
function curve(f, n) { return Array.from({ length: n + 1 }, (_, i) => f(i / n)); }

/** Water depth from a signed shore distance d (> 0 land). */
function seabed(d) { return Math.max(-24, d * 0.07) - 0.4; }

// ---------------------------------------------------------------------------------------------
// Shared building colour sets
const BRICK = [0x9c5a43, 0x8a4b38, 0xa86b4f, 0x7d4a3a, 0xb07a5c, 0x93543f];
const STONE = [0xcdbfa3, 0xb9ab90, 0xd8ccb3, 0xc2b598, 0xa99f8c];
const GLASS_COOL = [0x5d7f8f, 0x4b6b7c, 0x6f8f9b, 0x58778a, 0x7a96a0];
const CONCRETE = [0xb9b4aa, 0xa7a299, 0xc8c3b8, 0x9b978f];

export const PERSONALITIES = {
  // ===========================================================================================
  avalon: {
    id: 'avalon', name: 'Port Avalon', bloc: 'Federal Union', currency: 'FDL', unlock: 'R0', region: 'avalon',
    tagline: 'The harbor capital where everyone starts.',
    blurb: 'A crescent bay, an old radial port, a gridded Midtown of towers, warehouses on the piers and old money on the hill.',
    size: 2400, seed: 1701, urban: { vMin: 0.1, soft: 0.1 }, forest: 0.15, forestTree: 'round',
    terrain(x, y, n) {
      const coast = 540 - 440 * Math.exp(-(((x + 40) / 560) ** 2)) + 40 * n.fbm(x / 300, 3.1, 3) + 14 * n.fbm(x / 70, 7.7, 2);
      let d = coast - y;
      // headland with the lighthouse, closing the west side of the bay
      d = Math.max(d, 70 - dist(x, y, -560, 420) * (1 + 0.25 * n.fbm(x / 90, y / 90, 2)));
      // the river from the north into the east of the bay
      const rx = 560 + 70 * Math.sin(y / 210) + 30 * Math.sin(y / 83 + 1);
      const rw = 30 + 6 * n.fbm(y / 200, 2.2, 2);
      if (y < coast + 30) d = Math.min(d, Math.abs(x - rx) - rw);
      // the old port basin
      d = Math.min(d, dist(x, y, -40, 70) - 105 - 12 * n.fbm(x / 60, y / 60, 2));
      // piers of the Eastside Docks
      for (let i = 0; i < 4; i++) {
        const px = 720 + i * 120;
        if (Math.abs(x - px) < 26 && y > coast - 20 && y < coast + 210) d = Math.max(d, Math.min(26 - Math.abs(x - px), coast + 210 - y));
      }
      if (d < 0) return seabed(d);
      const hill = 78 * gauss(x + 90 * n.fbm(x / 260, y / 260 + 4, 3), y + 90 * n.fbm(x / 260 - 6, y / 260, 3), -660, -560, 330) * (0.75 + 0.5 * n.fbm(x / 180, y / 180, 3));
      return 1.3 + Math.min(d, 60) * 0.03 + hill + Math.max(0, -y - 300) * 0.018 + 4 * n.warped(x / 500, y / 500, 4) + 3;
    },
    centers: [[330, -320, 1, 300], [-60, -40, 0.55, 260], [-660, -560, 0.45, 330], [860, 160, 0.22, 300], [250, -950, 0.25, 350]],
    fields: [
      { type: 'grid', x: 330, y: -320, theta: 0, decay: 650, w: 1.4 },
      { type: 'radial', x: -40, y: 70, decay: 430, w: 1.6 },
      { type: 'grid', x: 250, y: -980, theta: 0.12, decay: 560, w: 1.0 },
      { type: 'grid', x: -980, y: 140, theta: -0.32, decay: 560, w: 1.0 },
      { type: 'grid', x: 880, y: 220, theta: 0, decay: 480, w: 1.2 },
      { type: 'grid', x: 950, y: -650, theta: 0.2, decay: 450, w: 0.9 },
    ],
    boundary: { w: 1.4, decay: 120 }, contour: { w: 1.5 },
    roads: { arterial: 290, collector: 130, local: 64 },
    predef: (n) => [
      // the Broadway: a diagonal from Old Harbor to the north-east, breaking the grid (flatiron blocks)
      { cls: 4, pts: curve((t) => [-120 + 1000 * t, -150 - 820 * t + 60 * Math.sin(t * 3)], 60) },
      // the harbor road along the bay
      { cls: 4, pts: curve((t) => { const x = -1150 + 2300 * t; return [x, 470 - 440 * Math.exp(-(((x + 40) / 560) ** 2)) - 60]; }, 120) },
    ],
    districts: [
      { id: 'oldharbor', name: 'Old Harbor', game: true, x: -60, y: -40, r: 340, tier: 'mid', snap: 0.25, theta: 0, jitter: 0.1, sep: 0.8,
        placement: 'rows', lot: [9, 15], gap: 0, interior: false, height: [15, 0.35, 8, 36],
        types: [['row', 3], ['midrise', 1]], facade: BRICK, roof: [0x4c5257, 0x5b6166, 0x55504b], trees: 0.3, tree: 'round' },
      { id: 'midtown', name: 'Midtown', game: true, x: 330, y: -330, r: 420, tier: 'cbd', snap: 1, theta: 0, jitter: 0.0, sep: 1.15,
        placement: 'rows', lot: [28, 30], gap: 3, interior: true, height: [58, 0.62, 18, 330],
        types: [['tower', 3], ['midrise', 1]], facade: [...STONE, ...GLASS_COOL], roof: [0x77726b, 0x6b6762], glass: GLASS_COOL, trees: 0.1, tree: 'round' },
      { id: 'docks', name: 'Eastside Docks', game: true, x: 880, y: 230, r: 380, tier: 'working', snap: 0.95, theta: 0, jitter: 0, sep: 1.5,
        placement: 'rows', lot: [42, 48], gap: 6, interior: true, height: [11, 0.3, 7, 40],
        types: [['warehouse', 4], ['loft', 1], ['containers', 2]], facade: [0x8d5b45, 0x6e6a63, 0x9a8a72, 0x7b5a48, 0x5f6b72], roof: [0x5c5f62, 0x6d6a66], trees: 0.05, tree: 'round', port: true },
      { id: 'gilthill', name: 'Gilt Hill', game: true, x: -660, y: -560, r: 420, tier: 'prime', snap: 0, theta: 0, jitter: 0.45, sep: 1.7,
        placement: 'scatter', lot: [30, 24], gap: 10, interior: true, height: [10, 0.2, 8, 15],
        types: [['mansion', 1]], facade: [0xe2d9c6, 0xd6cbb4, 0xcfc2a6, 0xe8e2d4, 0xbfae8e], roof: [0x3f464c, 0x4a5157, 0x55504b], trees: 1.0, tree: 'round' },
      { id: 'northgate', name: 'Northgate', x: 250, y: -980, r: 480, tier: 'mid', snap: 0.8, theta: 0.12, jitter: 0.03, sep: 1.0,
        placement: 'rows', lot: [11, 17], gap: 0, interior: false, height: [17, 0.4, 9, 40],
        types: [['row', 2], ['midrise', 2]], facade: [...BRICK, ...STONE], roof: [0x55504b, 0x4c5257], trees: 0.4, tree: 'round' },
      { id: 'westbank', name: 'Westbank', x: -980, y: 140, r: 430, tier: 'working', snap: 0.6, theta: -0.32, jitter: 0.06, sep: 1.0,
        placement: 'rows', lot: [8, 14], gap: 1, interior: false, height: [10, 0.3, 6, 22],
        types: [['house', 2], ['row', 2]], facade: [0xb79b7c, 0x9c8a74, 0xa86b4f, 0xc8b79a, 0x8e9a9a], roof: [0x5b6166, 0x6a4a3d, 0x4c5257], trees: 0.6, tree: 'round' },
      { id: 'riverside', name: 'Riverside Lofts', x: 950, y: -650, r: 430, tier: 'mid', snap: 0.85, theta: 0.2, jitter: 0.03, sep: 1.1,
        placement: 'rows', lot: [20, 24], gap: 2, interior: true, height: [22, 0.45, 10, 70],
        types: [['loft', 2], ['midrise', 2]], facade: [...BRICK, 0x6e6a63], roof: [0x5c5f62], trees: 0.3, tree: 'round' },
    ],
    parks: [[120, -700, 160, 'Harbor Common'], [-660, -560, 60, null]],
    landmarks: [
      { type: 'exchange', x: 330, y: -300, name: 'Port Avalon Exchange' },
      { type: 'lighthouse', x: -560, y: 470, name: 'Bay Light' },
      { type: 'customs', x: -40, y: -60, name: 'Old Customs House' },
      { type: 'observatory', x: -660, y: -560, name: 'Gilt Hill Observatory' },
    ],
    palette: {
      land: 0xc4b9a4, natural: 0x9ea383, park: 0x6f8a5a, sand: 0xd8c8a0, pave: 0xa8a092, plaza: 0xb7ad9c,
      road: [0x6d6a66, 0x5f5c59, 0x52504d], water: [0x4a7a80, 0x1f4250], tree: [0x5f7d4a, 0x6b8a52, 0x4f6b40],
      lit: [0xffcf7a, 0xffe2a8, 0xffb85c],
    },
  },

  // ===========================================================================================
  nordhaven: {
    id: 'nordhaven', name: 'Nordhaven City', bloc: 'Nordic Alliance', currency: 'NKR', unlock: 'R2', region: 'nordhaven',
    tagline: 'Fjords, design and quiet wealth.',
    blurb: 'A fjord splits the city. Streets climb the valley walls along the contours; painted houses below, glass villas on the water.',
    size: 2400, seed: 4242, urban: { vMin: 0.22, soft: 0.12 }, forest: -0.7, forestTree: 'pine',
    fjordX: (y) => 90 * Math.sin(y / 330) + 140 * Math.sin(y / 760 + 1.2),
    terrain(x, y, n) {
      const fx = this.fjordX(y);
      const w = 110 + 190 * smoothstep(-1300, 1100, y) + 25 * n.fbm(y / 200, 1.7, 3);
      let d = Math.abs(x - fx) - w / 2 + 10 * n.fbm(x / 60, y / 60, 2);
      const seaEdge = 900 + 70 * n.fbm(x / 260, 4.4, 3);
      d = Math.min(d, seaEdge - y);
      for (const [cx, cy, r] of [[-430, 1030, 130], [390, 1080, 160], [-60, 1170, 85], [120, 990, 55]]) {
        d = Math.max(d, r - dist(x, y, cx, cy) * (1 + 0.3 * n.fbm(x / 80, y / 80, 2)));
      }
      if (d < 0) return seabed(d);
      const away = Math.max(0, Math.abs(x - fx) - w / 2);
      const valley = 0.13 * Math.pow(Math.min(away, 1000), 1.06);
      const ridge = 34 * n.ridged(x / 520, y / 520, 4) * smoothstep(120, 650, away);
      return 1.5 + Math.min(d, 30) * 0.05 + valley + ridge + 5 * n.warped(x / 300, y / 300, 3);
    },
    centers: [[240, 700, 1, 260], [-320, 520, 0.6, 260], [330, 200, 0.55, 280], [0, 300, 0.3, 500]],
    fields: [
      { type: 'grid', x: 250, y: 720, theta: 0.3, decay: 320, w: 1.3 },
      { type: 'grid', x: -330, y: 540, theta: -0.15, decay: 260, w: 0.6 },
    ],
    boundary: { w: 2.2, decay: 160 }, contour: { w: 3.4 },
    roads: { arterial: 300, collector: 150, local: 70 }, maxSlope: 0.42,
    districts: [
      { id: 'fjord', name: 'Fjord Quarter', game: true, x: 340, y: 200, r: 340, tier: 'prime', snap: 0, theta: 0, jitter: 0.15, sep: 1.6,
        placement: 'scatter', lot: [20, 15], gap: 9, interior: true, height: [9, 0.25, 6, 16],
        types: [['glassvilla', 1]], facade: [0xe9e6df, 0xd8d3c8, 0x3c3f42, 0xcdbba0], roof: [0x2f3438, 0xe8ecef], glass: [0x7fa3b0, 0x9fbfcb], trees: 0.8, tree: 'pine' },
      { id: 'gamla', name: 'Gamla Town', game: true, x: -330, y: 520, r: 330, tier: 'mid', snap: 0.15, theta: -0.15, jitter: 0.22, sep: 0.62,
        placement: 'rows', lot: [8, 12], gap: 0, interior: true, height: [11, 0.25, 7, 18],
        types: [['gabled', 4], ['row', 1]], facade: [0xd19a3e, 0xa8433a, 0x3f7f7a, 0xe6e2d8, 0xe0c068, 0x5b7ea6, 0xc4673f, 0x9b3f3a], roof: [0xe9edf0, 0xdfe4e8, 0x3a3f44], trees: 0.2, tree: 'pine' },
      { id: 'sentrum', name: 'Sentrum', x: 250, y: 720, r: 300, tier: 'cbd', snap: 1, theta: 0.3, jitter: 0, sep: 1.05,
        placement: 'rows', lot: [22, 24], gap: 3, interior: true, height: [24, 0.45, 12, 72],
        types: [['midrise', 2], ['tower', 1]], facade: [0xe6e2d8, 0xcfc6b6, 0x3c3f42, ...GLASS_COOL], roof: [0x5d6266], glass: [0x7fa3b0, 0x6a8f9d], trees: 0.2, tree: 'pine' },
      { id: 'nordberg', name: 'Nordberg', x: -520, y: -450, r: 560, tier: 'mid', snap: 0, theta: 0, jitter: 0.2, sep: 1.15,
        placement: 'scatter', lot: [13, 10], gap: 6, interior: true, height: [8, 0.2, 6, 12],
        types: [['gabled', 1]], facade: [0xa8433a, 0xd19a3e, 0xe6e2d8, 0x3f7f7a, 0x6f5a48, 0xe0c068], roof: [0xe9edf0, 0xdfe4e8], trees: 1.2, tree: 'pine' },
      { id: 'osthogda', name: 'Østhøgda', x: 560, y: -520, r: 560, tier: 'mid', snap: 0, theta: 0, jitter: 0.2, sep: 1.2,
        placement: 'scatter', lot: [14, 11], gap: 6, interior: true, height: [8, 0.2, 6, 12],
        types: [['gabled', 2], ['house', 1]], facade: [0xe6e2d8, 0xa8433a, 0x5b7ea6, 0xd19a3e, 0x4a4f54], roof: [0xe9edf0, 0x3a3f44], trees: 1.2, tree: 'pine' },
    ],
    parks: [[-60, -100, 120, 'Kongsparken']],
    landmarks: [
      { type: 'opera', x: 120, y: 820, name: 'Nordhaven Opera' },
      { type: 'cathedral', x: -330, y: 500, name: 'Gamla Cathedral' },
      { type: 'lighthouse', x: 390, y: 1060, name: 'Skerry Light' },
    ],
    palette: {
      land: 0xd7dbd6, natural: 0xcfd5d0, park: 0x5e6f5a, sand: 0xc9c2ae, pave: 0xb3b6b3, plaza: 0xc5c7c3,
      road: [0x6e7174, 0x616467, 0x55585b], water: [0x3f6a78, 0x14303e], tree: [0x34493a, 0x3d5443, 0x2e4033],
      lit: [0xffc56a, 0xffdca0, 0xffb04a],
    },
  },

  // ===========================================================================================
  meridia: {
    id: 'meridia', name: 'Meridia', bloc: 'Euran Compact', currency: 'EUN', unlock: 'R2', region: 'meridian',
    tagline: 'Canals, banks and grand hotels.',
    blurb: 'An old city of islands and canals on a lagoon, low and dense, facing a modern business district across the water.',
    size: 2400, seed: 9090, urban: { vMin: 0.12, soft: 0.1 }, forest: 0.1, forestTree: 'round',
    canalPts: curve((t) => [-760 + 1520 * t, 330 + 190 * Math.sin(t * Math.PI * 1.8 + 0.4)], 80),
    terrain(x, y, n) {
      let d = -330 + 45 * n.fbm(x / 280, 2.5, 3) - y; // mainland north
      const main = 1 - Math.hypot(x / 660, (y - 330) / 470);
      d = Math.max(d, main * 420 + 70 * n.fbm(x / 230, y / 230, 3));
      d = Math.max(d, (1 - Math.hypot((x - 60) / 560, (y - 960) / 85)) * 80 + 18 * n.fbm(x / 120, 9.1, 2));
      for (const [cx, cy, r] of [[-860, 160, 110], [790, 90, 105], [930, 640, 80], [-720, 830, 95], [-60, -120, 0]]) {
        if (r) d = Math.max(d, r - dist(x, y, cx, cy) * (1 + 0.25 * n.fbm(x / 70, y / 70, 2)));
      }
      // the Grand Canal
      if (main > -0.2) d = Math.min(d, polyDist(x, y, this.canalPts) - 22);
      if (d < 0) return seabed(d * 0.7);
      return 1.4 + Math.min(d, 40) * 0.01 + (y < -330 ? Math.max(0, -y - 600) * 0.02 + 2 * n.fbm(x / 400, y / 400, 3) : 0);
    },
    centers: [[300, -760, 1, 300], [40, 330, 0.8, 360], [-560, -720, 0.35, 380]],
    fields: [
      { type: 'grid', x: 300, y: -760, theta: 0.42, decay: 520, w: 1.6 },
      { type: 'grid', x: -560, y: -760, theta: 0.42, decay: 600, w: 1.2 },
      { type: 'radial', x: 40, y: 330, decay: 300, w: 0.5 },
    ],
    boundary: { w: 1.8, decay: 110 }, contour: { w: 0 },
    roads: { arterial: 300, collector: 140, local: 64 },
    canals: { district: 'grandcanal', dsep: 80, width: 9 },
    bridges: { arterial: 420, collector: 30, local: 26 },
    predef: () => [
      { cls: 4, pts: curve((t) => [380 - 330 * t, -560 + 560 * t], 40) }, // the causeway
    ],
    districts: [
      { id: 'grandcanal', name: 'Grand Canal', game: true, x: 40, y: 360, r: 640, tier: 'prime', snap: 0, theta: 0, jitter: 0.4, sep: 0.42,
        placement: 'rows', lot: [15, 17], gap: 0, interior: true, height: [13, 0.22, 9, 22],
        types: [['palazzo', 4], ['row', 1]], facade: [0xc0704a, 0xd6a35c, 0xe2d3b5, 0xd58f7e, 0xa95c3c, 0xe8c79a, 0xcf9b75], roof: [0xa4532f, 0xb5643a, 0x9b4a2c], trees: 0.05, tree: 'round' },
      { id: 'bizdist', name: 'Business District', game: true, x: 320, y: -760, r: 440, tier: 'cbd', snap: 1, theta: 0.42, jitter: 0, sep: 1.15,
        placement: 'rows', lot: [30, 30], gap: 4, interior: true, height: [62, 0.55, 20, 270],
        types: [['tower', 3], ['midrise', 1]], facade: [...GLASS_COOL, 0xd7cdb8, 0x8fa5ad], roof: [0x6f6b66], glass: [0x6f97a5, 0x5b8494, 0x88a9b3], trees: 0.15, tree: 'round' },
      { id: 'terraferma', name: 'Terraferma', x: -560, y: -760, r: 480, tier: 'mid', snap: 0.9, theta: 0.42, jitter: 0.03, sep: 1.0,
        placement: 'rows', lot: [16, 20], gap: 1, interior: false, height: [18, 0.35, 10, 40],
        types: [['midrise', 3], ['row', 1]], facade: [0xe2d3b5, 0xd6a35c, 0xcdbfa3, 0xc0704a], roof: [0xa4532f, 0x7a746c], trees: 0.4, tree: 'round' },
    ],
    parks: [[-720, 830, 70, 'Isola dei Cipressi']],
    landmarks: [
      { type: 'basilica', x: 210, y: 440, name: 'Basilica di Meridia' },
      { type: 'campanile', x: 290, y: 400, name: 'The Campanile' },
      { type: 'dome', x: 600, y: 300, name: 'Santa Maria del Porto' },
    ],
    palette: {
      land: 0xcdb99a, natural: 0xa9a27e, park: 0x6e8256, sand: 0xd8c39a, pave: 0xc2ad8d, plaza: 0xd3c1a2,
      road: [0xa9967a, 0x77706a, 0x625d58], water: [0x4f8574, 0x234b4a], tree: [0x55713f, 0x3e5a35, 0x2f4a2e],
      lit: [0xffc777, 0xffdfa6, 0xffb35a],
    },
  },

  // ===========================================================================================
  sundara: {
    id: 'sundara', name: 'Sundara Coast', bloc: 'Southern Coalition', currency: 'SRL', unlock: 'R3', region: 'sundara',
    tagline: 'Beaches, boom towns and villas.',
    blurb: 'A long beach and a coastal highway, villas around Palm Bay, neon on the strip, and a skyline of cranes that never stops changing.',
    size: 2400, seed: 3131, urban: { vMin: 0.2, soft: 0.12 }, forest: 0.05, forestTree: 'round',
    coastY: (x, n) => 430 + 35 * Math.sin(x / 380) + 25 * n.fbm(x / 300, 1.1, 3),
    terrain(x, y, n) {
      let d = this.coastY(x, n) - y;
      d = Math.min(d, dist(x, y, -640, 470) - 390 - 20 * n.fbm(x / 120, y / 120, 2));
      d = Math.max(d, 38 - dist(x, y, -640, 470)); // the hotel island in the bay
      if (d < 0) return seabed(d * 0.8);
      const hills = Math.max(0, -(y + 120)) * 0.075 + 40 * n.ridged(x / 520, y / 520, 4) * smoothstep(-150, -800, y);
      return 1.2 + Math.min(d, 60) * 0.025 + hills + 3 * n.warped(x / 400, y / 400, 3);
    },
    beach: 52,
    centers: [[260, -110, 1, 260], [-640, 330, 0.6, 330], [430, 300, 0.45, 420], [1000, -200, 0.3, 300]],
    fields: [
      { type: 'grid', x: 260, y: -110, theta: 0.08, decay: 420, w: 1.3 },
      { type: 'radial', x: -640, y: 470, decay: 520, w: 1.7 },
      { type: 'grid', x: 1000, y: -220, theta: -0.1, decay: 420, w: 1.0 },
    ],
    boundary: { w: 2.0, decay: 220 }, contour: { w: 2.2 },
    roads: { arterial: 300, collector: 140, local: 62 },
    predef: (n) => [
      { cls: 4, pts: curve((t) => { const x = -1200 + 2400 * t; let y = 430 + 35 * Math.sin(x / 380) + 25 * n.fbm(x / 300, 1.1, 3) - 105; if (x < -150) y = Math.min(y, -(Math.sqrt(Math.max(0, 520 ** 2 - (x + 640) ** 2))) + 470); return [x, y]; }, 160) },
    ],
    districts: [
      { id: 'palmbay', name: 'Palm Bay', game: true, x: -640, y: 230, r: 430, tier: 'prime', snap: 0, theta: 0, jitter: 0.15, sep: 1.6,
        placement: 'scatter', lot: [20, 16], gap: 10, interior: true, height: [8, 0.25, 6, 13],
        types: [['villa', 1]], facade: [0xf0ece4, 0xe9c6b0, 0xf3d9a0, 0xe7e0d2, 0xd9c0a5], roof: [0xd9d3c7, 0xb86b45], trees: 1.0, tree: 'palm' },
      { id: 'strip', name: 'Sunset Strip', game: true, x: 450, y: 300, r: 470, tier: 'working', snap: 0.85, theta: 0.0, jitter: 0.04, sep: 0.9,
        placement: 'rows', lot: [16, 20], gap: 2, interior: false, height: [14, 0.75, 6, 110],
        types: [['strip', 3], ['condo', 2]], facade: [0xf0ece4, 0xe9c6b0, 0xa9d1cf, 0xf3d9a0, 0xe3a0a8, 0xc7d9a9], roof: [0xd9d3c7], trees: 0.4, tree: 'palm', neon: true },
      { id: 'centro', name: 'Centro', x: 260, y: -120, r: 360, tier: 'cbd', snap: 0.95, theta: 0.08, jitter: 0, sep: 1.15,
        placement: 'rows', lot: [28, 28], gap: 4, interior: true, height: [48, 0.85, 14, 300],
        types: [['tower', 3], ['condo', 1], ['ghost', 0.6]], facade: [0xf0ece4, 0xbdb7ac, 0x6aa6b8, 0x8cc0c9, 0xe6dccb], roof: [0xcfc8bb], glass: [0x6aa6b8, 0x5d98ab, 0x7fb6c1], trees: 0.2, tree: 'palm', cranes: 0.18 },
      { id: 'morro', name: 'Morro', x: -100, y: -760, r: 620, tier: 'working', snap: 0, theta: 0, jitter: 0.3, sep: 0.75,
        placement: 'scatter', lot: [9, 8], gap: 2, interior: true, height: [6, 0.3, 3.5, 11],
        types: [['hut', 1]], facade: [0xe6b07a, 0x9fc2b8, 0xe39a8a, 0xf0dca0, 0xb8a9d0, 0xd1d8c4, 0xe2e2d6], roof: [0xbfb4a3, 0xa8603e, 0x9aa0a3], trees: 0.5, tree: 'palm' },
      { id: 'marina', name: 'Marina Este', x: 1000, y: -220, r: 420, tier: 'mid', snap: 0.8, theta: -0.1, jitter: 0.04, sep: 1.0,
        placement: 'rows', lot: [16, 18], gap: 3, interior: false, height: [16, 0.4, 8, 50],
        types: [['midrise', 2], ['condo', 1]], facade: [0xf0ece4, 0xe9c6b0, 0xa9d1cf, 0xe6dccb], roof: [0xd9d3c7], trees: 0.5, tree: 'palm' },
    ],
    parks: [[120, -420, 110, 'Parque Central']],
    landmarks: [
      { type: 'sail', x: -640, y: 470, name: 'The Sail Hotel', exact: true },
      { type: 'ferris', x: 240, y: 340, name: 'Sunset Wheel' },
      { type: 'stadium', x: 700, y: -380, name: 'Estádio Sundara' },
    ],
    palette: {
      land: 0xd8cdb2, natural: 0xb5ac7d, park: 0x6f9a52, sand: 0xf0e0b4, pave: 0xc9c0ad, plaza: 0xddd3be,
      road: [0x7a756d, 0x67635d, 0x57544f], water: [0x2fa6aa, 0x175c78], tree: [0x5d8c45, 0x6f9a52, 0x4f7a3c],
      lit: [0xffd38a, 0xfff0c8, 0xffbf70],
    },
  },

  // ===========================================================================================
  kaiyo: {
    id: 'kaiyo', name: 'Kaiyo City', bloc: 'Pacific League', currency: 'PYN', unlock: 'R3', region: 'kaiyo',
    tagline: 'Neon, density and towers.',
    blurb: 'Patchwork wards of tiny lots and alleys, mega-towers around an elevated rail loop, and perfectly square reclaimed land in the bay.',
    size: 2400, seed: 7777, urban: { vMin: 0.1, soft: 0.08 }, forest: -0.1, forestTree: 'cherry',
    reclaim: [[-760, 380, -260, 760], [-80, 430, 560, 880], [720, 360, 1080, 660]],
    terrain(x, y, n) {
      let d = 300 + 40 * n.fbm(x / 300, 6.6, 3) - y;
      for (const [x0, y0, x1, y1] of this.reclaim) {
        const inside = Math.min(x - x0, x1 - x, y - y0, y1 - y);
        d = Math.max(d, inside);
      }
      const r1 = -380 + 50 * Math.sin(y / 190), r2 = 420 + 45 * Math.sin(y / 160 + 2);
      if (y < 380) { d = Math.min(d, Math.abs(x - r1) - 27, Math.abs(x - r2) - 24); }
      // the moat around the old castle garden
      const mx = Math.abs(x + 150), my = Math.abs(y + 640);
      const box = Math.max(mx, my);
      if (box > 170 && box < 198) d = Math.min(d, -Math.min(box - 170, 198 - box));
      if (d < 0) return seabed(d);
      const mount = Math.max(0, -(y + 820)) * 0.32 + 70 * n.ridged(x / 420, y / 420, 5) * smoothstep(-820, -1150, y);
      return 2.0 + mount + 1.5 * n.fbm(x / 400, y / 400, 3);
    },
    centers: [[180, -180, 1, 260], [-560, -60, 0.55, 300], [300, 620, 0.4, 380], [-60, -200, 0.4, 600]],
    fields: [
      { type: 'grid', x: 300, y: 640, theta: 0, decay: 420, w: 2.4 },
      { type: 'grid', x: 180, y: -180, theta: 0.05, decay: 330, w: 1.3 },
      { type: 'grid', x: -150, y: -640, theta: 0, decay: 260, w: 1.5 },
    ],
    patchwork: { count: 16, decay: 250, w: 1.1, area: [-1100, -950, 1100, 250] },
    boundary: { w: 1.0, decay: 90 }, contour: { w: 1.5 },
    roads: { arterial: 280, collector: 120, local: 60 },
    bridges: { arterial: 260, collector: 60, local: 0 },
    rail: { cx: -60, cy: -200, rx: 640, ry: 390, stations: 7, h: 11 },
    predef: () => [
      { cls: 4, pts: curve((t) => [150 + 30 * Math.sin(t * 3), 150 + 700 * t], 40) },
      { cls: 4, pts: curve((t) => [-520 + 20 * t, 200 + 500 * t], 30) },
    ],
    districts: [
      { id: 'heights', name: 'Shinbashi Heights', game: true, x: 180, y: -180, r: 360, tier: 'cbd', snap: 1, theta: 0.05, jitter: 0, sep: 1.1,
        placement: 'rows', lot: [30, 30], gap: 4, interior: true, height: [95, 0.55, 30, 390],
        types: [['tower', 4], ['midrise', 1]], facade: [0xc9c7c2, 0x9fa3a6, 0xd8d4cc, 0x7f8790, 0x4f6f86], roof: [0x6b6e72], glass: [0x4f6f86, 0x6b8597, 0x5a7a90, 0x7d93a3], trees: 0.15, tree: 'cherry' },
      { id: 'neon', name: 'Neon Ward', game: true, x: -560, y: -60, r: 400, tier: 'mid', snap: 0, theta: 0, jitter: 0.2, sep: 0.44,
        placement: 'rows', lot: [7, 11], gap: 0, interior: true, height: [16, 0.5, 7, 46],
        types: [['micro', 1]], facade: [0xc9c7c2, 0x9fa3a6, 0xd8d4cc, 0xb7a99a, 0xe0dcd2, 0x8d9296], roof: [0x7a7d80, 0x666a6e], trees: 0.05, tree: 'cherry', neon: true },
      { id: 'reclaim', name: 'Bayside Reclaim', x: 300, y: 640, r: 600, tier: 'working', snap: 1, theta: 0, jitter: 0, sep: 1.3,
        placement: 'rows', lot: [40, 44], gap: 6, interior: true, height: [16, 0.6, 8, 120],
        types: [['warehouse', 2], ['containers', 2], ['tower', 1]], facade: [0x9fa3a6, 0x7f8790, 0xc9c7c2, 0x5f6b72], roof: [0x5c5f62], glass: [0x4f6f86, 0x6b8597], trees: 0.05, tree: 'round', port: true },
      { id: 'kita', name: 'Kita', x: 450, y: -700, r: 520, tier: 'mid', snap: 0.6, theta: 0.1, jitter: 0.1, sep: 0.7,
        placement: 'rows', lot: [12, 14], gap: 1, interior: true, height: [22, 0.45, 9, 60],
        types: [['midrise', 3], ['micro', 1]], facade: [0xd8d4cc, 0xc9c7c2, 0xe0dcd2, 0xb7a99a, 0xa8aaa6], roof: [0x7a7d80], trees: 0.3, tree: 'cherry' },
      { id: 'nishi', name: 'Nishi', x: -880, y: -640, r: 480, tier: 'mid', snap: 0.4, theta: -0.2, jitter: 0.15, sep: 0.65,
        placement: 'rows', lot: [10, 12], gap: 1, interior: true, height: [12, 0.4, 6, 32],
        types: [['house', 2], ['micro', 1], ['midrise', 1]], facade: [0xd8d4cc, 0xb7a99a, 0xe0dcd2, 0x8d9296, 0xa59a8a], roof: [0x4c5257, 0x5f5a54], trees: 0.4, tree: 'cherry' },
    ],
    parks: [[-150, -640, 168, 'Castle Garden']],
    landmarks: [
      { type: 'skytower', x: 230, y: -240, name: 'Kaiyo Sky Tower' },
      { type: 'pagoda', x: -150, y: -640, name: 'Castle Keep', exact: true },
    ],
    palette: {
      land: 0xb4b0a8, natural: 0x8f977a, park: 0x5f7f4e, sand: 0xc9c1ad, pave: 0xa6a39d, plaza: 0xb8b4ac,
      road: [0x6a6a6c, 0x5b5b5e, 0x4d4d50], water: [0x3e6676, 0x1a3442], tree: [0x5c7c4a, 0xe7a9b8, 0x4c6b3d],
      lit: [0xfff0d0, 0xd9ecff, 0xffd58a],
    },
  },

  // ===========================================================================================
  serena: {
    id: 'serena', name: 'Isla Serena', bloc: 'Federal Union', currency: 'FDL', unlock: 'R4', region: 'avalon',
    tagline: 'A private archipelago for the very few.',
    blurb: 'Nine islands, one owner each. Never grows: its scarcity is the point.',
    size: 1600, seed: 5151, static: true, estates: ['k.reyes', 'Private', 'dubreuil', 'Private', 'mira.okafor', 'Private', 'solveig', 'Private', 'Private'], forestTree: 'palm',
    isles: [[-420, -330, 170], [120, -460, 130], [470, -200, 150], [-90, -60, 110], [-520, 160, 120], [260, 160, 175], [-150, 420, 125], [560, 430, 95], [-620, -620, 70]],
    terrain(x, y, n) {
      let d = -1e9;
      for (const [cx, cy, r] of this.isles) d = Math.max(d, r - dist(x, y, cx, cy) * (1 + 0.32 * n.fbm(x / 90 + cx, y / 90, 3)));
      if (d < 0) return seabed(d * 0.5);
      return 1.0 + Math.min(d, 120) * 0.12 + 6 * n.ridged(x / 150, y / 150, 3) * smoothstep(20, 90, d);
    },
    beach: 18,
    centers: [[0, 0, 0.6, 600]],
    fields: [{ type: 'radial', x: 0, y: 0, decay: 900, w: 0.6 }],
    boundary: { w: 2.5, decay: 80 }, contour: { w: 1.5 },
    roads: { arterial: 9999, collector: 9999, local: 9999 },
    districts: [
      { id: 'cays', name: 'The Cays', game: true, x: 0, y: 0, r: 900, tier: 'trophy', snap: 0, theta: 0, jitter: 0.2, sep: 1,
        placement: 'scatter', lot: [30, 22], gap: 16, interior: true, height: [9, 0.2, 7, 13],
        types: [['villa', 1]], facade: [0xf3efe7, 0xece4d4, 0xe2d6bf], roof: [0xd9d3c7, 0xb86b45], trees: 1.4, tree: 'palm' },
    ],
    parks: [],
    landmarks: [{ type: 'lighthouse', x: -620, y: -620, name: 'Serena Light' }],
    palette: {
      land: 0xd9cfae, natural: 0x9fae78, park: 0x6f9a52, sand: 0xf3e6c2, pave: 0xd6cdb6, plaza: 0xe1d8c2,
      road: [0xc9bfa6, 0xb6ac94, 0xa59c86], water: [0x25a9b4, 0x125573], tree: [0x5d8c45, 0x6f9a52, 0x4f7a3c],
      lit: [0xffd38a, 0xfff0c8, 0xffbf70],
    },
  },
};

export const CITY_ORDER = ['avalon', 'nordhaven', 'meridia', 'sundara', 'kaiyo', 'serena'];
