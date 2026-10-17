// Deliberately independent of the routing module (including its threshold helper).
const FACADE_DEPTH = { house: 0.8, gabled: 0.92, midrise: 0.97, loft: 0.97,
  warehouse: 0.96, mansion: 0.55, villa: 0.66, glassvilla: 0.66,
  condo: 0.92, strip: 0.9, micro: 0.95, hut: 0.9 };

function bil(A, n, res, half, x, y) {
  let fx = (x + half) / res - 0.5, fy = (y + half) / res - 0.5;
  fx = Math.max(0, Math.min(n - 1.001, fx));
  fy = Math.max(0, Math.min(n - 1.001, fy));
  const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
  const k = j * n + i;
  return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + n] * (1 - tx) + A[k + n + 1] * tx) * ty;
}

function pointToPolylineDist(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx, qy = ay + t * dy;
    const d = Math.hypot(x - qx, y - qy);
    if (d < best) best = d;
  }
  return best;
}

export function auditCityAccess(city) {
  const half = city.S / 2;
  const N = city.N, RES = city.RES, H = city.H;
  const heightAt = (x, y) => bil(H, N, RES, half, x, y);
  const isWater = (x, y) => {
    const i = Math.floor((x + half) / RES), j = Math.floor((y + half) / RES);
    if (i < 0 || j < 0 || i >= N || j >= N) return true;
    return H[j * N + i] < 0;
  };

  // Build arterial-reachability set over roadGraph via BFS from all arterial (cls === 4) nodes
  const rg = city.roadGraph;
  const adj = Array.from({ length: rg.nodes.length }, () => []);
  const edgeById = new Map();
  for (const e of rg.edges) {
    edgeById.set(e.id, e);
    adj[e.a]?.push(e.b);
    adj[e.b]?.push(e.a);
  }
  const reachableNodes = new Uint8Array(rg.nodes.length);
  const queue = [];
  for (const e of rg.edges) {
    if (e.cls === 4) {
      if (!reachableNodes[e.a]) { reachableNodes[e.a] = 1; queue.push(e.a); }
      if (!reachableNodes[e.b]) { reachableNodes[e.b] = 1; queue.push(e.b); }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    for (const v of adj[u] ?? []) {
      if (!reachableNodes[v]) { reachableNodes[v] = 1; queue.push(v); }
    }
  }

  // Network half-widths by edgeId
  const edgeMaxHw = new Map();
  for (const netItem of city.network ?? []) {
    if (netItem.edgeId !== undefined && netItem.cls >= 2) {
      const m = Math.max(...netItem.hw);
      if (m > (edgeMaxHw.get(netItem.edgeId) ?? 0)) edgeMaxHw.set(netItem.edgeId, m);
    }
  }

  // Spatial bucket of building footprints to check collisions quickly
  const BS = 24;
  const bGrid = new Map();
  const bKey = (i, j) => `${i},${j}`;
  for (const b of city.buildings) {
    const r = Math.hypot(b.w, b.dp) * 0.5 + 2;
    const i0 = Math.floor((b.x - r) / BS), i1 = Math.floor((b.x + r) / BS);
    const j0 = Math.floor((b.y - r) / BS), j1 = Math.floor((b.y + r) / BS);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = bKey(i, j);
      let list = bGrid.get(k);
      if (!list) bGrid.set(k, (list = []));
      list.push(b);
    }
  }

  const hitsOtherFootprint = (x, y, selfId) => {
    const list = bGrid.get(bKey(Math.floor(x / BS), Math.floor(y / BS)));
    if (!list) return false;
    for (const o of list) {
      if (o.id === selfId) continue;
      const c = Math.cos(-o.rot), s = Math.sin(-o.rot);
      const dx = x - o.x, dy = y - o.y;
      if (Math.abs(c * dx - s * dy) < o.w * 0.5 - 1e-6 && Math.abs(s * dx + c * dy) < o.dp * 0.5 - 1e-6) {
        return true;
      }
    }
    return false;
  };

  const failures = [];
  let auditedRoadServed = 0;
  let specialModeCount = 0;
  let legacyUnaudited = 0;

  for (const b of city.buildings) {
    if (b.accessMode === 'landmark' || b.accessMode === 'water' || b.kind === 'Landmark' || b.kind === 'Island estate') {
      specialModeCount++;
      continue;
    }
    const pth = b.accessPath;
    if (!pth || !Array.isArray(pth.pts) || pth.pts.length < 2) {
      // Cities that still use proximity-based access emit no paths. They are not audited as
      // if they were: record them as legacy so the report cannot read as a pass.
      legacyUnaudited++;
      continue;
    }
    auditedRoadServed++;
    const depth = b.dp * (FACADE_DEPTH[b.type] ?? 1) * 0.5 * (b.front ?? -1);
    const expectedThr = [b.x - Math.sin(b.rot) * depth, b.y + Math.cos(b.rot) * depth];
    const p0 = pth.pts[0];
    if (Math.hypot(p0[0] - expectedThr[0], p0[1] - expectedThr[1]) > 0.5) {
      failures.push({ id: b.id, parcelId: b.parcelId, reason: 'entrance-mismatch' });
      continue;
    }
    const edge = edgeById.get(pth.edgeId);
    if (!edge) {
      failures.push({ id: b.id, parcelId: b.parcelId, reason: 'missing-road-edge' });
      continue;
    }
    if (!reachableNodes[edge.a] && !reachableNodes[edge.b]) {
      failures.push({ id: b.id, parcelId: b.parcelId, reason: 'isolated-road-component' });
      continue;
    }
    const pEnd = pth.pts[pth.pts.length - 1];
    const dCenter = pointToPolylineDist(pEnd[0], pEnd[1], edge.pts);
    const hw = edgeMaxHw.get(edge.id) ?? 5.5;
    if (Math.max(0, dCenter - hw) > 0.5) {
      failures.push({ id: b.id, parcelId: b.parcelId, reason: 'road-edge-gap', gap: dCenter - hw });
      continue;
    }

    // Sample path every 0.5m and corridor edges
    const maxGrade = pth.kind === 'pedestrian' ? 0.15 : 0.12;
    const width = pth.width ?? 1.8;
    const across = Math.max(2, Math.ceil(width / 0.5));
    let badReason = null;
    for (let s = 0; s < pth.pts.length - 1 && !badReason; s++) {
      const [ax, ay] = pth.pts[s], [bx, by] = pth.pts[s + 1];
      const segLen = Math.hypot(bx - ax, by - ay);
      if (segLen < 1e-6) continue;
      const steps = Math.max(1, Math.ceil(segLen / 0.5));
      const ux = (bx - ax) / segLen, uy = (by - ay) / segLen;
      const nx = -uy, ny = ux;
      for (let i = 0; i <= steps; i++) {
        const sx = ax + ux * (segLen * i / steps);
        const sy = ay + uy * (segLen * i / steps);
        if (isWater(sx, sy)) { badReason = 'water-crossing'; break; }
        for (let j = 0; j <= across && !badReason; j++) {
          const off = width * (j / across - 0.5), cx = sx + nx * off, cy = sy + ny * off;
          if (isWater(cx, cy)) { badReason = 'corridor-water-crossing'; break; }
          if (hitsOtherFootprint(cx, cy, b.id)) { badReason = 'footprint-collision'; break; }
          // A route can traverse the exterior setback but never the selected building's interior.
          const dx = cx - b.x, dy = cy - b.y;
          const lx = Math.cos(b.rot) * dx + Math.sin(b.rot) * dy;
          const lz = -Math.sin(b.rot) * dx + Math.cos(b.rot) * dy;
          if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.dp / 2 &&
              lz * (b.front ?? -1) < Math.abs(depth) - 1e-6) {
            badReason = 'own-interior-crossing'; break;
          }
          if (i > 0) {
            const stepD = segLen / steps;
            const grade = Math.abs(heightAt(cx, cy) - heightAt(cx - ux * stepD, cy - uy * stepD)) / stepD;
            if (grade > maxGrade + 1e-6) { badReason = 'excessive-grade'; break; }
          }
        }
        if (badReason) break;
      }
    }
    if (badReason) {
      failures.push({ id: b.id, parcelId: b.parcelId, reason: badReason });
    }
  }

  return {
    city: city.P.id,
    seed: city.P.seed,
    auditedRoadServed,
    specialModeCount,
    legacyUnaudited,
    occupiedInvalid: failures.length,
    failures,
  };
}
