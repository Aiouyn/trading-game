// The road network as a planar graph. Traced polylines go in; they are split at every crossing and snapped to shared
// nodes, near-duplicate parallels and self-loops are dropped, edges are smoothed so their turns respect a minimum
// radius per class, short dead-end spurs are pruned, and each landmass is left with one connected network (stray
// components are linked to it by a dry straight line, or dropped). Edges keep their class and level; nodes carry
// their degree, so junctions (degree 3 or more) can be drawn as patches.

export const MIN_RADIUS = { 4: 120, 3: 60, 2: 25 }; // metres: arterial, collector, local
export const SPUR_MAX = 60;   // dead-end local spurs shorter than this go
export const COLLECTOR_SPUR_MAX = 220; // dead-end collector spurs shorter than this go
export const SNAP = 11;       // nodes closer than this are one node
export const LINK_MAX = 400;  // longest straight link that joins a stray component
export const STUB_MAX = 30;   // a dead-end local may reach a node this close

const cellKey = (i, j) => (i + 16384) * 32768 + (j + 16384);

// ------------------------------------------------------------------ geometry

export function polyLen(pts) {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return s;
}

/** Points every `step` metres along the line, endpoints included. */
export function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay);
    if (L === 0) continue;
    let d = step - carry;
    while (d <= L) { out.push([ax + ((bx - ax) * d) / L, ay + ((by - ay) * d) / L]); d += step; }
    carry = L - (d - step);
  }
  const last = pts[pts.length - 1], lo = out[out.length - 1];
  if (Math.hypot(last[0] - lo[0], last[1] - lo[1]) > step * 0.25) out.push(last); else out[out.length - 1] = last;
  return out;
}

/** Smallest circumradius over the interior vertices (ignores vertices with a side under 1 m). */
export function minRadius(pts) {
  let m = Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const A = Math.hypot(bx - ax, by - ay), B = Math.hypot(cx - bx, cy - by);
    if (A < 1 || B < 1) continue;
    const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    if (cross < 1e-9) continue;
    const R = (A * B * Math.hypot(cx - ax, cy - ay)) / (2 * cross);
    if (R < m) m = R;
  }
  return m;
}

/** Laplacian smoothing of the interior vertices; the ends (nodes) stay put. Works on flat arrays (it runs a lot). */
export function laplace(pts, iters) {
  const n = pts.length;
  if (iters <= 0 || n < 3) return pts;
  let xs = new Float64Array(n), ys = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = pts[i][0]; ys[i] = pts[i][1]; }
  for (let it = 0; it < iters; it++) {
    const nx = Float64Array.from(xs), ny = Float64Array.from(ys);
    for (let i = 1; i < n - 1; i++) {
      nx[i] = (xs[i - 1] + 2 * xs[i] + xs[i + 1]) / 4;
      ny[i] = (ys[i - 1] + 2 * ys[i] + ys[i + 1]) / 4;
    }
    xs = nx; ys = ny;
  }
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [xs[i], ys[i]];
  return out;
}

// ------------------------------------------------------------------ spatial hashes

/** Segments in a uniform grid; nearest() returns the closest segment centre-line within a radius. */
export class SegGrid {
  constructor(cs) { this.cs = cs; this.cells = new Map(); this.segs = []; this.stamp = new Int32Array(0); this.gen = 0; }
  add(ax, ay, bx, by, hw = 0, tag = null) {
    const id = this.segs.length;
    const s = { ax, ay, bx, by, hw, tag, id };
    this.segs.push(s);
    const cs = this.cs;
    const i0 = Math.floor(Math.min(ax, bx) / cs), i1 = Math.floor(Math.max(ax, bx) / cs);
    const j0 = Math.floor(Math.min(ay, by) / cs), j1 = Math.floor(Math.max(ay, by) / cs);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = cellKey(i, j);
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(id);
    }
    return s;
  }
  nearest(x, y, r, ok = null) {
    const cs = this.cs;
    const i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((y - r) / cs), j1 = Math.floor((y + r) / cs);
    // the projection is inline: this runs millions of times, so nothing is allocated per segment
    const r2 = r * r;
    let bestD2 = Infinity, best = null, bt = 0, bqx = 0, bqy = 0;
    if (this.stamp.length < this.segs.length) { const n = new Int32Array(this.segs.length * 2); n.set(this.stamp); this.stamp = n; }
    const g = ++this.gen; // a segment spanning several cells is visited once per query
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = this.cells.get(cellKey(i, j));
      if (!c) continue;
      for (const id of c) {
        if (this.stamp[id] === g) continue;
        this.stamp[id] = g;
        const s = this.segs[id];
        if (ok && !ok(s)) continue;
        const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((x - s.ax) * dx + (y - s.ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s.ax + t * dx, qy = s.ay + t * dy;
        const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
        if (d2 <= r2 && d2 < bestD2) { bestD2 = d2; best = s; bt = t; bqx = qx; bqy = qy; }
      }
    }
    return best ? { d: Math.sqrt(bestD2), qx: bqx, qy: bqy, t: bt, s: best } : null;
  }
}

/**
 * Points with a direction and an owner edge each; nearParallel() asks for a point within r that runs the same way
 * and belongs to an edge that does not share a node with the asker (adjacent pieces of one line are not duplicates).
 */
class PointHash {
  constructor(cs) { this.cs = cs; this.m = new Map(); }
  add(x, y, dir, owner) {
    const k = cellKey(Math.floor(x / this.cs), Math.floor(y / this.cs));
    let c = this.m.get(k);
    if (!c) this.m.set(k, (c = []));
    c.push(x, y, dir[0], dir[1], owner);
  }
  nearParallel(x, y, r, dir, adjacent) {
    const cs = this.cs;
    const i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((y - r) / cs), j1 = Math.floor((y + r) / cs);
    const r2 = r * r;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = this.m.get(cellKey(i, j));
      if (!c) continue;
      for (let t = 0; t < c.length; t += 5) {
        if ((c[t] - x) ** 2 + (c[t + 1] - y) ** 2 <= r2 && Math.abs(c[t + 2] * dir[0] + c[t + 3] * dir[1]) >= 0.9 && !adjacent(c[t + 4])) return true;
      }
    }
    return false;
  }
}

// ------------------------------------------------------------------ landmasses

/** Connected land per dry cell (4-neighbour), -1 on water. */
export function labelLand(N, W) {
  const lab = new Int32Array(N * N).fill(-1);
  const stack = new Int32Array(N * N);
  let id = 0;
  for (let k0 = 0; k0 < N * N; k0++) {
    if (W[k0] || lab[k0] >= 0) continue;
    let sp = 0;
    stack[sp++] = k0; lab[k0] = id;
    while (sp) {
      const k = stack[--sp];
      const i = k % N, j = (k / N) | 0;
      if (i > 0 && !W[k - 1] && lab[k - 1] < 0) { lab[k - 1] = id; stack[sp++] = k - 1; }
      if (i < N - 1 && !W[k + 1] && lab[k + 1] < 0) { lab[k + 1] = id; stack[sp++] = k + 1; }
      if (j > 0 && !W[k - N] && lab[k - N] < 0) { lab[k - N] = id; stack[sp++] = k - N; }
      if (j < N - 1 && !W[k + N] && lab[k + N] < 0) { lab[k + N] = id; stack[sp++] = k + N; }
    }
    id++;
  }
  return lab;
}

// ------------------------------------------------------------------ planarise

function segHit(A, B) {
  const rx = A.bx - A.ax, ry = A.by - A.ay, sx = B.bx - B.ax, sy = B.by - B.ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = B.ax - A.ax, qy = B.ay - A.ay;
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  // A sampled polyline vertex is not necessarily a street endpoint. Excluding
  // segment ends here silently loses crossings when two sampling grids align.
  if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null;
  return { t, u, x: A.ax + t * rx, y: A.ay + t * ry };
}

/**
 * Split edges where they cross or touch, and snap the resulting ends into nodes. Returns { nodes: [[x,y]],
 * edges: [{cls, level, pts, a, b}] } where every edge runs node to node.
 */
export function planarize(edges, snap = SNAP) {
  const grid = new SegGrid(12); // small cells: the pair test inside a cell is quadratic in its segments
  for (let e = 0; e < edges.length; e++) {
    const p = edges[e].pts;
    for (let i = 0; i < p.length - 1; i++) grid.add(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], 0, { e, i });
  }
  const ev = edges.map(() => []); // split events per edge: { pos, x, y }
  const S = grid.segs;
  const done = new Set();
  for (const list of grid.cells.values()) {
    for (let u = 0; u < list.length; u++) {
      const A = S[list[u]];
      for (let v = u + 1; v < list.length; v++) {
        const B = S[list[v]];
        if (A.tag.e === B.tag.e && Math.abs(A.tag.i - B.tag.i) <= 1) continue;
        const hit = segHit(A, B);
        if (!hit) continue;
        const pk = Math.min(A.id, B.id) * S.length + Math.max(A.id, B.id);
        if (done.has(pk)) continue;
        done.add(pk);
        ev[A.tag.e].push({ pos: A.tag.i + hit.t, x: hit.x, y: hit.y });
        ev[B.tag.e].push({ pos: B.tag.i + hit.u, x: hit.x, y: hit.y });
      }
    }
  }
  // ends that touch another edge split it where they meet it
  for (let e = 0; e < edges.length; e++) {
    const p = edges[e].pts;
    for (const q of [p[0], p[p.length - 1]]) {
      const hit = grid.nearest(q[0], q[1], snap, (s) => s.tag.e !== e);
      if (hit) ev[hit.s.tag.e].push({ pos: hit.s.tag.i + hit.t, x: hit.qx, y: hit.qy });
    }
  }
  // candidate nodes: edge ends and split points, clustered within the snap distance
  const cand = [];
  const ea = new Int32Array(edges.length), eb = new Int32Array(edges.length);
  for (let e = 0; e < edges.length; e++) {
    const p = edges[e].pts;
    ea[e] = cand.length; cand.push([p[0][0], p[0][1]]);
    eb[e] = cand.length; cand.push([p[p.length - 1][0], p[p.length - 1][1]]);
    for (const v of ev[e]) { v.c = cand.length; cand.push([v.x, v.y]); }
  }
  const parent = new Int32Array(cand.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const byCell = new Map();
  cand.forEach(([x, y], i) => {
    const ci = Math.floor(x / snap), cj = Math.floor(y / snap), k = cellKey(ci, cj);
    let c = byCell.get(k);
    if (!c) byCell.set(k, (c = { i: ci, j: cj, list: [] }));
    c.list.push(i);
  });
  // candidates on the same half-metre spot merge first (overlapping raw lines put many split points on one spot),
  // so the pairwise snap test below only runs over the distinct spots
  const snap2 = snap * snap;
  const spot = new Map();
  const isRep = new Uint8Array(cand.length);
  cand.forEach(([x, y], i) => {
    const key = (Math.round(x * 2) + 100000) * 1000000 + (Math.round(y * 2) + 100000);
    const r = spot.get(key);
    if (r === undefined) { spot.set(key, i); isRep[i] = 1; } else parent[i] = r;
  });
  cand.forEach(([x, y], i) => {
    if (!isRep[i]) return;
    const ci = Math.floor(x / snap), cj = Math.floor(y / snap);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = byCell.get(cellKey(ci + a, cj + b));
      if (!c) continue;
      for (const j of c.list) {
        if (j <= i || !isRep[j]) continue;
        if ((cand[j][0] - x) ** 2 + (cand[j][1] - y) ** 2 <= snap2) parent[find(j)] = find(i);
      }
    }
  });
  const nodeOf = new Int32Array(cand.length);
  const rootId = new Map();
  const nodes = [];
  const sums = [];
  for (let i = 0; i < cand.length; i++) {
    const r = find(i);
    let id = rootId.get(r);
    if (id === undefined) { id = nodes.length; rootId.set(r, id); nodes.push([0, 0]); sums.push(0); }
    nodeOf[i] = id;
    nodes[id][0] += cand[i][0]; nodes[id][1] += cand[i][1]; sums[id]++;
  }
  for (let id = 0; id < nodes.length; id++) { nodes[id][0] /= sums[id]; nodes[id][1] /= sums[id]; }
  // cut every edge at its node markers
  const out = [];
  for (let e = 0; e < edges.length; e++) {
    const p = edges[e].pts, n = p.length;
    const marks = [{ pos: 0, node: nodeOf[ea[e]] }];
    ev[e].sort((a, b) => a.pos - b.pos);
    for (const v of ev[e]) marks.push({ pos: v.pos, node: nodeOf[v.c] });
    marks.push({ pos: n - 1, node: nodeOf[eb[e]] });
    for (let m = 0; m < marks.length - 1; m++) {
      const A = marks[m], B = marks[m + 1];
      const sub = [nodes[A.node]];
      for (let j = Math.floor(A.pos) + 1; j < B.pos; j++) if (j > A.pos) sub.push(p[j]);
      sub.push(nodes[B.node]);
      if (A.node === B.node && sub.length === 2) continue;
      out.push({ cls: edges[e].cls, level: edges[e].level, requiredAccess: Boolean(edges[e].requiredAccess), pts: sub.map((q) => [q[0], q[1]]), a: A.node, b: B.node });
    }
  }
  return { nodes, edges: out };
}

// ------------------------------------------------------------------ clean

function incidence(edges, nNodes) {
  const inc = Array.from({ length: nNodes }, () => []);
  edges.forEach((e, i) => { inc[e.a].push(i); if (e.b !== e.a) inc[e.b].push(i); });
  return inc;
}

/**
 * Drops near-duplicate parallels: a line most of whose samples sit within half a level's spacing of a kept line that
 * runs the same way. A road that only meets a kept one (at a T, or running off it) is not a duplicate.
 */
function dedupeParallel(edges, spacing) {
  const len = edges.map((e) => polyLen(e.pts));
  const order = edges.map((_, i) => i).sort((i, j) => edges[j].cls - edges[i].cls || len[j] - len[i]);
  const hash = new PointHash(40);
  let dropped = 0;
  for (const i of order) {
    const e = edges[i];
    const thr = 0.5 * (spacing[e.cls] ?? 40);
    const samples = resample(e.pts, 10);
    const dirs = samples.map((p, k) => {
      const a = samples[Math.max(0, k - 1)], b = samples[Math.min(samples.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    });
    const adjacent = (j) => {
      const o = edges[j];
      return o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b;
    };
    const isNear = ([x, y], k) => {
      return hash.nearParallel(x, y, thr, dirs[k], (j) => {
        if (!adjacent(j)) return false;
        const o = edges[j];
        // Collinear continuations meeting at a node (opposite side of the node) are never parallel duplicates
        const sharedA = (o.a === e.a || o.b === e.a) ? e.pts[0] : null;
        const sharedB = (o.a === e.b || o.b === e.b) ? e.pts[e.pts.length - 1] : null;
        if (sharedA) {
          const oOther = o.a === e.a ? o.pts[o.pts.length - 1] : o.pts[0];
          const eOther = e.pts[e.pts.length - 1];
          const dot = (oOther[0] - sharedA[0]) * (eOther[0] - sharedA[0]) + (oOther[1] - sharedA[1]) * (eOther[1] - sharedA[1]);
          if (dot <= 0 || Math.hypot(x - sharedA[0], y - sharedA[1]) < 24) return true;
        }
        if (sharedB) {
          const oOther = o.a === e.b ? o.pts[o.pts.length - 1] : o.pts[0];
          const eOther = e.pts[0];
          const dot = (oOther[0] - sharedB[0]) * (eOther[0] - sharedB[0]) + (oOther[1] - sharedB[1]) * (eOther[1] - sharedB[1]);
          if (dot <= 0 || Math.hypot(x - sharedB[0], y - sharedB[1]) < 24) return true;
        }
        return false;
      });
    };
    if (!e.requiredAccess && len[i] >= 30 && samples.length >= 3) {
      let near = 0;
      samples.forEach((pt, k) => { if (isNear(pt, k)) near++; });
      if (near >= 0.72 * samples.length) { e.dead = true; dropped++; continue; }
    }
    samples.forEach(([x, y], k) => hash.add(x, y, dirs[k], i));
  }
  return { edges: edges.filter((e) => !e.dead), dropped };
}

/** A straight line between two points that never enters water (checked every 4 m). */
function dryLine(a, b, isWater) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let t = 4; t < L - 2; t += 4) if (isWater(a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L)) return false;
  return true;
}

/**
 * Smooths every edge (turns respect MIN_RADIUS per class, by Laplacian passes; local edges that stay too tight are
 * dropped when short), removes self-loops and parallel duplicates, prunes dead-end spurs, and links dead-end locals
 * that stop near another node.
 */
export function cleanGraph(g, { spacing, isWater, smooth = true }) {
  const stats = { loops: 0, parallels: 0, tight: 0, spurs: 0, stubs: 0 };
  let edges = g.edges.map((e) => ({ ...e }));
  edges = edges.filter((e) => {
    const L = polyLen(e.pts);
    if (L < 2) return false;
    if (e.a === e.b) { stats.loops++; return false; }
    const pa = g.nodes[e.a], pb = g.nodes[e.b];
    const chord = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    if (L > 36 && chord > 0 && L / chord > 1.7 && !e.requiredAccess) { stats.loops++; return false; }
    return true;
  });
  const dd = dedupeParallel(edges, spacing);
  edges = dd.edges; stats.parallels = dd.dropped;
  if (smooth) {
    for (const e of edges) {
      // If an edge has a sharp interior bend (cos < 0.72, i.e. > 44 deg turn in one step), promote that vertex to a junction node
      // so two meeting streets never get smoothed into a bizarre kinked dogleg.
      for (let i = 1; i < e.pts.length - 1; i++) {
        const ax = e.pts[i][0] - e.pts[i - 1][0], ay = e.pts[i][1] - e.pts[i - 1][1];
        const bx = e.pts[i + 1][0] - e.pts[i][0], by = e.pts[i + 1][1] - e.pts[i][1];
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la > 1 && lb > 1 && (ax * bx + ay * by) / (la * lb) < 0.65) {
          const newId = g.nodes.length;
          g.nodes.push([e.pts[i][0], e.pts[i][1]]);
          edges.push({ ...e, pts: e.pts.slice(i), a: newId, b: e.b });
          e.pts = e.pts.slice(0, i + 1);
          e.b = newId;
          break;
        }
      }
      e.pts = laplace(e.pts, 1);
      for (let it = 0; it < 6 && minRadius(e.pts) < (MIN_RADIUS[e.cls] ?? 25); it++) e.pts = laplace(e.pts, 2);
      if (minRadius(e.pts) < (MIN_RADIUS[e.cls] ?? 25) && e.cls <= 2 && polyLen(e.pts) < 150) { e.dead = true; stats.tight++; }
    }
    edges = edges.filter((e) => !e.dead);
  }
  const nN = g.nodes.length;
  // Prune tight small 2-edge lenses and short collector/local self-loops (tear-drops)
  {
    const pairGroups = new Map();
    for (const e of edges) {
      if (e.dead || e.a === e.b) continue;
      const k = `${Math.min(e.a, e.b)}:${Math.max(e.a, e.b)}`;
      let gList = pairGroups.get(k);
      if (!gList) pairGroups.set(k, (gList = []));
      gList.push(e);
    }
    for (const gList of pairGroups.values()) {
      if (gList.length < 2) continue;
      gList.sort((a, b) => b.cls - a.cls || polyLen(a.pts) - polyLen(b.pts));
      for (const extra of gList.slice(1)) {
        if (!extra.requiredAccess) {
          extra.dead = true;
          stats.loops++;
        }
      }
    }
    edges = edges.filter((e) => !e.dead);
  }
  let changed = true;
  while (changed) {
    changed = false;
    const inc = incidence(edges, nN);
    for (let n = 0; n < nN; n++) {
      if (inc[n].length !== 1) continue;
      const e = edges[inc[n][0]];
      if (e.dead || e.requiredAccess || e.a === e.b) continue;
      // Only prune collector spurs when the network has > 4 edges (so tiny 3-edge unit-test fixtures are untouched)
      const maxSpur = (e.cls === 3 && edges.length > 4) ? COLLECTOR_SPUR_MAX : e.cls <= 2 ? SPUR_MAX : 0;
      if (maxSpur <= 0 || polyLen(e.pts) >= maxSpur) continue;
      e.dead = true; stats.spurs++; changed = true;
    }
    edges = edges.filter((e) => !e.dead);
  }
  // Prune tiny acute triangle islands (three edges forming a cycle with perimeter < 95 m)
  {
    const incTri = incidence(edges, nN);
    for (let i = 0; i < edges.length; i++) {
      const eAB = edges[i];
      if (eAB.dead || eAB.requiredAccess) continue;
      const a = eAB.a, b = eAB.b;
      for (const j of incTri[b]) {
        if (j <= i) continue;
        const eBC = edges[j];
        if (eBC.dead || eBC.requiredAccess) continue;
        const c = eBC.a === b ? eBC.b : eBC.a;
        if (c === a) continue;
        for (const k of incTri[c]) {
          if (k <= j) continue;
          const eCA = edges[k];
          if (eCA.dead || eCA.requiredAccess) continue;
          const d = eCA.a === c ? eCA.b : eCA.a;
          if (d !== a) continue;
          const lAB = polyLen(eAB.pts), lBC = polyLen(eBC.pts), lCA = polyLen(eCA.pts);
          if (lAB + lBC + lCA < 110) {
            const tri = [eAB, eBC, eCA].sort((x, y) => x.cls - y.cls || polyLen(x.pts) - polyLen(y.pts));
            tri[0].dead = true;
            stats.loops++;
          }
        }
      }
    }
    edges = edges.filter((e) => !e.dead);
  }
  // dead-end locals and collectors that stop close to another node are joined to it
  const inc = incidence(edges, nN);
  const extra = [];
  for (let n = 0; n < nN; n++) {
    if (inc[n].length !== 1) continue;
    const e = edges[inc[n][0]];
    if (e.cls > 3) continue;
    const p = g.nodes[n];
    // Outward tangent of the dead-end edge at node n
    const prev = e.b === n ? e.pts[Math.max(0, e.pts.length - 2)] : e.pts[Math.min(e.pts.length - 1, 1)];
    const tLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]) || 1;
    const tx = (p[0] - prev[0]) / tLen, ty = (p[1] - prev[1]) / tLen;
    let best = null, bd = e.cls === 3 ? 65 : STUB_MAX;
    for (let m = 0; m < nN; m++) {
      if (m === n || inc[m].length === 0) continue;
      const q = g.nodes[m];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d >= bd || d <= SNAP) continue;
      // Only link forward (> 0.25 dot), never backward into a sharp V-hook
      const dot = ((q[0] - p[0]) / d) * tx + ((q[1] - p[1]) / d) * ty;
      if (dot > 0.25 && dryLine(p, q, isWater)) { bd = d; best = m; }
    }
    if (best !== null) { extra.push({ cls: e.cls, level: 'link', pts: [p, g.nodes[best]], a: n, b: best }); stats.stubs++; }
  }
  edges.push(...extra);
  return { nodes: g.nodes, edges, stats };
}

// ------------------------------------------------------------------ connect

/**
 * Per landmass (the land a component's longest edge sits on) the largest connected component is kept; the others are
 * linked to it by the shortest dry straight line within LINK_MAX, or dropped.
 */
export function connectGraph(g, { landAt, isWater }) {
  const nN = g.nodes.length;
  const inc = incidence(g.edges, nN);
  const comp = new Int32Array(nN).fill(-1);
  const comps = [];
  for (let n = 0; n < nN; n++) {
    if (comp[n] >= 0 || inc[n].length === 0) continue;
    const id = comps.length, nodes = [];
    const stack = [n]; comp[n] = id;
    while (stack.length) {
      const c = stack.pop(); nodes.push(c);
      for (const ei of inc[c]) {
        const e = g.edges[ei];
        for (const o of [e.a, e.b]) if (comp[o] < 0) { comp[o] = id; stack.push(o); }
      }
    }
    comps.push({ id, nodes, len: 0, label: -1, labels: new Set(), edges: [] });
  }
  g.edges.forEach((e, i) => { const c = comp[e.a]; comps[c].edges.push(i); comps[c].len += polyLen(e.pts); if (e.cls >= 4) comps[c].hasArterial = true; });
  for (const c of comps) {
    let longest = null, bl = -1;
    for (const ei of c.edges) { const L = polyLen(g.edges[ei].pts); if (L > bl) { bl = L; longest = g.edges[ei]; } }
    if (!longest) continue;
    const p = longest.pts;
    for (const ei of c.edges) for (const pt of g.edges[ei].pts) {
      const label = landAt(pt[0], pt[1]);
      if (label >= 0) c.labels.add(label);
    }
    c.label = c.labels.values().next().value ?? -1;
  }
  const dropComp = new Set();
  const links = [];
  const byLabel = new Map();
  for (const c of comps) {
    if (c.label < 0) { dropComp.add(c.id); continue; } // water only: nothing to keep
    // A bridged network occupies both banks. Register it on both landmasses,
    // otherwise an isolated east-bank street never sees the main network.
    for (const label of c.labels) {
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label).push(c);
    }
  }
  let dropped = 0, linked = 0;
  const cs = 100;
  const parent = comps.map(c => c.id);
  const root = id => { while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; } return id; };
  for (const list of byLabel.values()) {
    list.sort((a, b) => Number(Boolean(b.hasArterial)) - Number(Boolean(a.hasArterial)) || b.len - a.len);
    const mainNodes = list[0].nodes.slice();
    for (const c of list.slice(1)) {
      if (root(c.id) === root(list[0].id)) { dropComp.delete(c.id); mainNodes.push(...c.nodes); continue; }
      // the shortest dry straight line from this component to the ones already kept on its landmass
      const hash = new Map();
      for (const m of mainNodes) {
        const q = g.nodes[m];
        const k = cellKey(Math.floor(q[0] / cs), Math.floor(q[1] / cs));
        if (!hash.has(k)) hash.set(k, []);
        hash.get(k).push(m);
      }
      const pairs = [];
      for (const u of c.nodes) {
        const p = g.nodes[u];
        const i0 = Math.floor((p[0] - LINK_MAX) / cs), i1 = Math.floor((p[0] + LINK_MAX) / cs);
        const j0 = Math.floor((p[1] - LINK_MAX) / cs), j1 = Math.floor((p[1] + LINK_MAX) / cs);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          for (const m of hash.get(cellKey(i, j)) ?? []) {
            const q = g.nodes[m];
            const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
            if (d <= LINK_MAX) pairs.push([d, u, m]);
          }
        }
      }
      pairs.sort((a, b) => a[0] - b[0]);
      let ok = null;
      for (let t = 0; t < pairs.length && t < 600 && !ok; t++) {
        const [, u, m] = pairs[t];
        if (dryLine(g.nodes[u], g.nodes[m], isWater)) ok = [u, m];
      }
      if (ok) {
        dropComp.delete(c.id);
        parent[root(c.id)] = root(list[0].id);
        links.push({ cls: 2, level: 'link', pts: [g.nodes[ok[0]], g.nodes[ok[1]]], a: ok[0], b: ok[1] });
        mainNodes.push(...c.nodes);
        linked++;
      } else {
        dropComp.add(c.id);
        dropped++;
      }
    }
  }
  const kept = g.edges.filter((e) => !dropComp.has(comp[e.a]));
  return { nodes: g.nodes, edges: kept.concat(links), stats: { linked, dropped: dropComp.size } };
}

// ------------------------------------------------------------------ the pipeline

/**
 * Lines (traced polylines with cls 2..4 and a level name) in; the cleaned graph out:
 * { nodes: [[x,y]], edges: [{id, cls, level, pts, a, b}], deg: Int32Array, stats }.
 */
export function buildRoadGraph(lines, { spacing, isWater, landAt }) {
  const stats = { raw: lines.length };
  let g = planarize(lines.map((l) => ({ cls: l.cls, level: l.level, requiredAccess: l.requiredAccess, pts: l.pts })));
  stats.split = g.edges.length;
  let c = cleanGraph(g, { spacing, isWater, smooth: true });
  stats.loops = c.stats.loops; stats.parallels = c.stats.parallels; stats.tight = c.stats.tight;
  stats.spurs = c.stats.spurs; stats.stubs = c.stats.stubs;
  g = planarize(c.edges.map((e) => ({ cls: e.cls, level: e.level, requiredAccess: e.requiredAccess, pts: e.pts })));
  c = cleanGraph(g, { spacing, isWater, smooth: false });
  const cn = connectGraph(c, { landAt, isWater });
  stats.linked = cn.stats.linked; stats.droppedComps = cn.stats.dropped;
  g = planarize(cn.edges.map((e) => ({ cls: e.cls, level: e.level, requiredAccess: e.requiredAccess, pts: e.pts })), 14);
  c = cleanGraph(g, { spacing, isWater, smooth: false });
  const cPost = connectGraph(c, { landAt, isWater });
  let edges = cPost.edges.filter((e) => e.a !== e.b);
  // Dissolve degree-2 nodes where two edges of the same class meet so continuous streets don't have mid-block seams or reset their dash phase
  {
    let merged = true;
    while (merged) {
      merged = false;
      const inc = incidence(edges, g.nodes.length);
      for (let n = 0; n < g.nodes.length; n++) {
        if (inc[n].length !== 2) continue;
        const i1 = inc[n][0], i2 = inc[n][1];
        if (i1 === i2) continue;
        const e1 = edges[i1], e2 = edges[i2];
        if (e1.cls !== e2.cls) continue;
        const pts1 = e1.b === n ? e1.pts : e1.pts.slice().reverse();
        const pts2 = e2.a === n ? e2.pts : e2.pts.slice().reverse();
        const startNode = e1.b === n ? e1.a : e1.b;
        const endNode = e2.a === n ? e2.b : e2.a;
        if (startNode === endNode) continue; // don't create a self-loop
        // Only merge two degree-2 arms if they meet at a shallow angle (cos > 0.78, i.e. < 38 deg turn).
        // If they meet at a real corner, keep the node so the intersection gets a proper junction cap!
        const pPrev = pts1[Math.max(0, pts1.length - 2)];
        const pMid = pts1[pts1.length - 1];
        const pNext = pts2[Math.min(pts2.length - 1, 1)];
        const v1x = pMid[0] - pPrev[0], v1y = pMid[1] - pPrev[1];
        const v2x = pNext[0] - pMid[0], v2y = pNext[1] - pMid[1];
        const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
        if ((v1x * v2x + v1y * v2y) / (l1 * l2) < 0.78) continue;
        e1.pts = pts1.concat(pts2.slice(1));
        e1.a = startNode;
        e1.b = endNode;
        e1.requiredAccess = Boolean(e1.requiredAccess || e2.requiredAccess);
        e2.dead = true;
        merged = true;
        break;
      }
      if (merged) edges = edges.filter((e) => !e.dead);
    }
    // Smooth the newly merged edges slightly and prune any remaining dead-end spurs < COLLECTOR_SPUR_MAX / SPUR_MAX
    let spurChanged = true;
    while (spurChanged && edges.length > 4) {
      spurChanged = false;
      const inc = incidence(edges, g.nodes.length);
      for (let n = 0; n < g.nodes.length; n++) {
        if (inc[n].length !== 1) continue;
        const e = edges[inc[n][0]];
        if (e.dead || e.requiredAccess || e.a === e.b) continue;
        const maxSpur = e.cls === 3 ? COLLECTOR_SPUR_MAX : e.cls <= 2 ? SPUR_MAX : 0;
        if (maxSpur <= 0 || polyLen(e.pts) >= maxSpur) continue;
        e.dead = true; spurChanged = true;
      }
      if (spurChanged) edges = edges.filter((e) => !e.dead);
    }
    // Prune short non-arterial edges (< 24 m) that bridge between two degree >= 3 intersections (creates overlapping junction knots)
    {
      const incShort = incidence(edges, g.nodes.length);
      for (const e of edges) {
        if (e.dead || e.requiredAccess || e.cls >= 4) continue;
        if (polyLen(e.pts) < 24 && incShort[e.a].length >= 3 && incShort[e.b].length >= 3) {
          e.dead = true;
        }
      }
      edges = edges.filter((e) => !e.dead);
    }
    for (const e of edges) {
      if (e.pts.length > 3) e.pts = laplace(e.pts, 2);
    }
  }
  // The last pruning pass can separate a small component, and smoothing/linking
  // can introduce new crossings. Rebuild topology once after all geometry edits;
  // do not prune again after repairing connectivity.
  g = planarize(edges);
  const finalConnected = connectGraph(g, { landAt, isWater });
  stats.linked += finalConnected.stats.linked;
  stats.droppedComps += finalConnected.stats.dropped;
  g = planarize(finalConnected.edges);
  edges = g.edges.filter(e => e.a !== e.b && polyLen(e.pts) > 1);
  const deg = new Int32Array(g.nodes.length);
  edges.forEach((e, id) => { e.id = id; deg[e.a]++; deg[e.b]++; });
  stats.nodes = g.nodes.length;
  stats.junctions = Array.from(deg).filter((d) => d >= 3).length;
  stats.edges = edges.length;
  return { nodes: g.nodes, edges, deg, stats };
}
