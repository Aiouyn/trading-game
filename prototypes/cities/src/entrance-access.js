import { entranceOf, routeGrid } from './access.js';

export const DEPTH_FACTOR = Object.freeze({
  row: 1, house: 0.8, gabled: 0.92, midrise: 0.97,
  loft: 0.97, warehouse: 0.96, mansion: 0.55, villa: 0.66,
  glassvilla: 0.66, palazzo: 1, tower: 1, ghost: 1,
  condo: 0.92, strip: 0.9, micro: 0.95, hut: 0.9,
});

export function thresholdOf(lot) {
  const dp = lot.dp ?? (lot.hd * 2);
  const f = DEPTH_FACTOR[lot.type] ?? 1;
  return entranceOf({ x: lot.x, y: lot.y, rot: lot.rot, dp: dp * f, front: lot.front ?? -1 });
}

export function reserveLotCorridor(lot, goal, width, markPoint) {
  const dp = lot.dp ?? (lot.hd * 2);
  const gate = entranceOf({ x: lot.x, y: lot.y, rot: lot.rot, dp, front: lot.front ?? -1 });
  const dx = goal[0] - gate[0], dy = goal[1] - gate[1];
  const L = Math.hypot(dx, dy);
  if (L < 0.1) {
    markPoint(gate[0], gate[1]);
    return;
  }
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  const hw = width * 0.5;
  for (let t = 0; t <= L; t += 0.8) {
    const sx = gate[0] + ux * t, sy = gate[1] + uy * t;
    for (let o = -hw; o <= hw + 1e-6; o += 0.8) {
      markPoint(sx + nx * o, sy + ny * o);
    }
  }
}

export function planEntranceAccess({ lot, entrance, goal, canStand, canStep, step = 2, maxVisited = 4096, margin = 20 }) {
  return routeGrid({
    start: entrance ?? thresholdOf(lot),
    goal,
    step,
    margin,
    maxVisited,
    canStand,
    canStep,
  });
}

export function collectGoalCandidates(pt, net, r, { isWater = () => false, isBridgeAt = () => false } = {}) {
  const [x, y] = pt;
  const cs = net.cs;
  const i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs);
  const j0 = Math.floor((y - r) / cs), j1 = Math.floor((y + r) / cs);
  const r2 = r * r;
  const seen = new Set();
  const hits = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const k = (i + 16384) * 32768 + (j + 16384);
      const cell = net.cells.get(k);
      if (!cell) continue;
      for (const id of cell) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = net.segs[id];
        const tag = s.tag ?? {};
        if (tag.rail || tag.cls === undefined || tag.cls < 2) continue;
        const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((x - s.ax) * dx + (y - s.ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s.ax + t * dx, qy = s.ay + t * dy;
        const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
        if (d2 > r2) continue;
        if (isWater(qx, qy) || isBridgeAt(qx, qy, tag)) continue;
        const d = Math.sqrt(d2);
        const edgeDist = Math.max(0, d - s.hw);
        let ux, uy;
        if (d > 1e-6) {
          ux = (x - qx) / d; uy = (y - qy) / d;
        } else {
          const L = Math.sqrt(l2) || 1;
          ux = -dy / L; uy = dx / L;
        }
        const gx = qx + ux * s.hw, gy = qy + uy * s.hw;
        if (isWater(gx, gy)) continue;
        hits.push({
          d,
          edgeDist,
          qx,
          qy,
          gx,
          gy,
          hw: s.hw,
          edgeId: tag.edgeId ?? -1,
          cls: tag.cls,
          a: tag.a,
          b: tag.b,
          segId: s.id,
        });
      }
    }
  }
  hits.sort((a, b) => a.edgeDist - b.edgeDist || a.edgeId - b.edgeId || a.segId - b.segId);
  const out = [];
  for (const h of hits) {
    // Allow up to 2 best projections per graph edge so curved streets still offer good entries
    const count = out.filter((o) => o.edgeId === h.edgeId).length;
    if (count >= 2 && h.edgeId >= 0) continue;
    out.push(h);
    if (out.length >= 8) break;
  }
  return out;
}

export function resolveEntranceAccess({
  lot,
  net,
  isWater = () => false,
  isBlocked = () => false,
  isBridgeAt = () => false,
  heightAt = () => 0,
}) {
  const dp = lot.dp ?? (lot.hd * 2);
  const front = lot.front ?? -1;
  const entryGate = entranceOf({ x: lot.x, y: lot.y, rot: lot.rot, dp, front });
  const entryThreshold = thresholdOf({ ...lot, dp, front });
  const farm = lot.d?.tier === 'rural';
  const ped = !farm && (lot.d?.gap === 0 || ['row', 'midrise', 'loft', 'strip', 'micro', 'palazzo', 'tower', 'condo'].includes(lot.type));
  const reach = farm ? 400 : 75;
  const cands = collectGoalCandidates(entryGate, net, reach, { isWater, isBridgeAt });
  if (!cands.length) {
    return { status: 'unserviceable', reason: 'no-candidate-road', entryThreshold, entryGate };
  }

  const kind = farm ? 'track' : ped ? 'pedestrian' : 'driveway';
  const width = farm ? 4.0 : ped ? 1.8 : 3.4;
  for (const cand of cands) {
    const goal = [cand.gx, cand.gy];
    const kinds = !farm && cand.edgeDist <= 6 ? ['pedestrian'] : kind === 'driveway' ? ['driveway', 'pedestrian'] : [kind];
    for (const tryKind of kinds) {
      const kMaxGrade = tryKind === 'pedestrian' ? 0.15 : 0.12;
      const kWidth = tryKind === 'pedestrian' ? 1.8 : width;
      const canStand = (x, y) => !isWater(x, y) && !isBlocked(x, y);
      // Validate perpendicular samples across the ENTIRE width, including endpoints.
      // The caller permits only this lot's exterior setback, never another footprint.
      const canStep = (a, b) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 1e-8) return canStand(...a);
        const nx = -(b[1] - a[1]) / length, ny = (b[0] - a[0]) / length;
        const along = Math.max(1, Math.ceil(length / 0.5));
        const across = Math.max(2, Math.ceil(kWidth / 0.5));
        for (let i = 0; i <= along; i++) {
          const x = a[0] + (b[0] - a[0]) * i / along, y = a[1] + (b[1] - a[1]) * i / along;
          for (let j = 0; j <= across; j++) {
            const offset = kWidth * (j / across - 0.5);
            const sx = x + nx * offset, sy = y + ny * offset;
            if (!canStand(sx, sy)) return false;
            if (i > 0) {
              const px = sx - (b[0] - a[0]) / along, py = sy - (b[1] - a[1]) / along;
              if (Math.abs(heightAt(sx, sy) - heightAt(px, py)) / (length / along) > kMaxGrade + 1e-6) return false;
            }
          }
        }
        return true;
      };
      if (!canStep(entryThreshold, entryGate)) continue;
      // Leave the frontage perpendicularly before turning; an oblique ribbon starting
      // on the door would otherwise clip the building with one of its corridor edges.
      const apron = [entryGate[0] - Math.sin(lot.rot) * front * kWidth / 2,
        entryGate[1] + Math.cos(lot.rot) * front * kWidth / 2];
      if (!canStep(entryGate, apron)) continue;
      let pts = [apron, goal], mode = 'direct';
      if (!canStep(apron, goal)) {
        pts = planEntranceAccess({ lot, entrance: apron, goal, canStand, canStep,
          step: farm ? 4 : 2, maxVisited: farm ? 8192 : 4096 });
        mode = 'routed';
      }
      if (!pts) continue;
      pts.unshift(entryGate);
      if (Math.hypot(entryGate[0] - entryThreshold[0], entryGate[1] - entryThreshold[1]) > 0.05) pts.unshift(entryThreshold);
      return { status: 'served', mode, edgeId: cand.edgeId, a: cand.a, b: cand.b,
        entryThreshold, entryGate, goal,
        path: { kind: tryKind, width: kWidth, pts, edgeId: cand.edgeId, a: cand.a, b: cand.b } };
    }
  }

  return { status: 'unserviceable', reason: 'route-blocked-or-steep', entryThreshold, entryGate };
}
