// A junction owns the surface between its arm mouths. Road strips stop at those
// mouths; they never overlap through the center or put kerbs across another arm.
export function junctionSetbacks(roads, nodes, degree) {
  const arms = nodes.map(() => []), cuts = new Map();
  for (const road of roads) {
    if (road.rail || road.outer || road.cls < 2 || road.a == null || road.b == null) continue;
    const pts = road.pts;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const hw = (road.width?.[0] ?? 7) / 2;
    const pair = [0, 0]; cuts.set(road, pair);
    for (const end of [0, 1]) {
      const p = end ? pts.at(-1) : pts[0], q = end ? pts[Math.max(0, pts.length - 3)] : pts[Math.min(2, pts.length - 1)];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      arms[end ? road.b : road.a].push({ road, end, dx: (q[0] - p[0]) / len, dz: (q[1] - p[1]) / len, hw, length });
    }
  }
  for (let n = 0; n < nodes.length; n++) {
    const list = arms[n];
    if (degree[n] < 2 || list.length < 2) continue;
    if (list.length === 2 && list[0].dx * list[1].dx + list[0].dz * list[1].dz < -0.995) continue;
    for (const a of list) {
      let distance = Math.max(6, a.hw + 1.5);
      for (const b of list) {
        if (a === b) continue;
        const cos = a.dx * b.dx + a.dz * b.dz;
        if (cos < -0.98) continue;
        distance = Math.max(distance, (b.hw + a.hw * Math.max(0, cos) + 1) / Math.max(0.25, Math.abs(a.dx * b.dz - a.dz * b.dx)));
      }
      // Opposing collars together use <=80% of an edge, even on a short block.
      cuts.get(a.road)[a.end] = Math.min(32, distance, a.length * 0.4);
    }
  }
  return cuts;
}

export function sliceProfile(profile, start, end) {
  const { pts, y, ground, wet } = profile;
  const distances = [0];
  for (let i = 1; i < pts.length; i++) distances.push(distances.at(-1) + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = distances.at(-1), stop = length - end;
  const result = { pts: [], y: [], ground: [], wet: [], distance: [] };
  const at = distance => {
    let i = 0;
    while (i < pts.length - 2 && distances[i + 1] < distance) i++;
    const t = (distance - distances[i]) / Math.max(1e-9, distances[i + 1] - distances[i]);
    result.pts.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
    result.y.push(y[i] + (y[i + 1] - y[i]) * t);
    result.ground.push(ground[i] + (ground[i + 1] - ground[i]) * t);
    result.wet.push(wet[i] || wet[i + 1]); result.distance.push(distance);
  };
  at(start);
  for (let i = 1; i < pts.length - 1; i++) if (distances[i] > start + 1e-6 && distances[i] < stop - 1e-6) {
    result.pts.push(pts[i]); result.y.push(y[i]); result.ground.push(ground[i]); result.wet.push(wet[i]); result.distance.push(distances[i]);
  }
  at(stop);
  return result;
}

export function junctionBoundary(arms, origin) {
  const sorted = arms.map(a => ({ ...a, angle: Math.atan2(a.pz - origin[1], a.px - origin[0]) })).sort((a, b) => a.angle - b.angle);
  const boundary = [];
  boundary.mouthEdges = new Set();
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], b = sorted[(i + 1) % sorted.length];
    const left = [a.px - a.dz * a.hw, a.pz + a.dx * a.hw];
    const right = [a.px + a.dz * a.hw, a.pz - a.dx * a.hw];
    boundary.mouthEdges.add(boundary.length);
    boundary.push(right, left);
    // Rounded inside corner between mouths. Parallel/opposed arms use a straight
    // boundary; acute or very short junctions keep a bounded bevel.
    const next = [b.px + b.dz * b.hw, b.pz - b.dx * b.hw];
    const cross = a.dx * b.dz - a.dz * b.dx;
    if (cross <= 0.2) continue;
    const t = ((next[0] - left[0]) * b.dz - (next[1] - left[1]) * b.dx) / cross;
    const corner = [left[0] + t * a.dx, left[1] + t * a.dz];
    if (Math.hypot(corner[0] - origin[0], corner[1] - origin[1]) > 40) continue;
    for (let s = 1; s < 4; s++) {
      const f = s / 4, u = 1 - f;
      boundary.push([u * u * left[0] + 2 * u * f * corner[0] + f * f * next[0], u * u * left[1] + 2 * u * f * corner[1] + f * f * next[1]]);
    }
  }
  return boundary;
}

// Cut/fill the actual terrain before parcels are placed. A level junction patch
// must have a matching bed; lifting a patch above ungraded hills hides a hole
// from above but leaves a floating intersection in a street view.
export function gradeJunctionTerrain(roads, graph, { H, N, res, half, heightAt, isWater }) {
  const cuts = junctionSetbacks(roads, graph.nodes, graph.deg);
  const arms = graph.nodes.map(() => []);
  for (const road of roads) {
    const pair = cuts.get(road);
    if (!pair) continue;
    for (const end of [0, 1]) {
      const cut = pair[end], node = end ? road.b : road.a;
      if (!cut || isWater(...graph.nodes[node])) continue;
      const pts = end ? [...road.pts].reverse() : road.pts;
      let left = cut;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left >= length - 1e-6 && i < pts.length - 1) { left -= length; continue; }
        arms[node].push({ px: a[0] + (b[0] - a[0]) * left / length, pz: a[1] + (b[1] - a[1]) * left / length,
          dx: (b[0] - a[0]) / length, dz: (b[1] - a[1]) / length, hw: (road.width?.[0] ?? 7) / 2 });
        break;
      }
    }
  }
  const levels = graph.nodes.map(p => heightAt(...p));
  const junctionCore = new Int32Array(H.length).fill(-1);
  const parent = graph.nodes.map((_, i) => i);
  const root = id => { while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; } return id; };
  for (let n = 0; n < arms.length; n++) {
    if (arms[n].length < 2) continue;
    const boundary = junctionBoundary(arms[n], graph.nodes[n]);
    const shoulder = 12;
    const minX = Math.min(...boundary.map(p => p[0])) - shoulder, maxX = Math.max(...boundary.map(p => p[0])) + shoulder;
    const minZ = Math.min(...boundary.map(p => p[1])) - shoulder, maxZ = Math.max(...boundary.map(p => p[1])) + shoulder;
    for (let j = Math.max(0, Math.floor((minZ + half) / res)); j <= Math.min(N - 1, Math.ceil((maxZ + half) / res)); j++) {
      for (let i = Math.max(0, Math.floor((minX + half) / res)); i <= Math.min(N - 1, Math.ceil((maxX + half) / res)); i++) {
        const x = -half + (i + 0.5) * res, z = -half + (j + 0.5) * res;
        if (isWater(x, z)) continue;
        let inside = false, distance = Infinity;
        for (let k = 0, prev = boundary.length - 1; k < boundary.length; prev = k++) {
          const a = boundary[prev], b = boundary[k];
          if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
          const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2));
          distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
        }
        // Keep the common node inside its bed even for an acute/concave fan.
        inside ||= Math.hypot(x - graph.nodes[n][0], z - graph.nodes[n][1]) <= res * 2;
        // A full-resolution cell outside the boundary keeps interpolation flat
        // under the shared mouth vertices, then blends into the existing bed.
        const t = inside ? 1 : Math.max(0, 1 - Math.max(0, distance - res * 2) / shoulder);
        const index = j * N + i;
        if (t >= 1) {
          if (junctionCore[index] >= 0) parent[root(n)] = root(junctionCore[index]);
          junctionCore[index] = n; H[index] = levels[n];
        } else if (t > 0 && junctionCore[index] < 0) H[index] += (levels[n] - H[index]) * t * t * (3 - 2 * t);
      }
    }
  }
  // Adjacent short-block junctions can share a collar. Give their overlapping
  // beds one common level rather than letting the last write create a step.
  const sums = new Float64Array(graph.nodes.length), counts = new Uint32Array(graph.nodes.length);
  for (let n = 0; n < arms.length; n++) if (arms[n].length >= 2) { sums[root(n)] += levels[n]; counts[root(n)]++; }
  for (let i = 0; i < H.length; i++) if (junctionCore[i] >= 0) {
    const group = root(junctionCore[i]); H[i] = sums[group] / counts[group];
  }
}
