// Surveyed corridors for Avalon's existing geography. x east, y south, metres.
export function avalonRoadPlan(P, noise) {
  const lines = [];
  const add = (cls, pts, level = 'avenue', requiredAccess = true) => lines.push({ cls, pts, level, requiredAccess });
  const curve = (a, b, c, d) => Array.from({ length: 61 }, (_, i) => {
    const t = i / 60, u = 1 - t;
    return [0, 1].map(k => u ** 3 * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t ** 3 * d[k]);
  });
  // First shoreline south of the city, including the old harbor basin. Keep
  // the full carriageway behind inlets, rather than following an approximate coast.
  const shore = x => {
    let y = -180;
    while (y < 650 && P.terrain(x, y, noise) >= 0) y += 2;
    return y;
  };
  const quayY = x => Math.min(...[-24, -12, 0, 12, 24].map(dx => shore(x + dx))) - 38;
  add(3, Array.from({ length: 162 }, (_, i) => { const x = -1190 + i * 10; return [x, quayY(x)]; }), 'waterfront');
  add(4, [[-160, -1190], [-160, quayY(-160)]], 'west-spine');
  add(4, [[300, -1190], [300, quayY(300)]], 'central-spine');
  add(4, [[900, -1190], [900, 420]], 'port-spine');
  // Aligned river crossings with straight approaches, away from the harbor mouth.
  add(4, [[-160, -960], [1190, -960]], 'north-crossing');
  const approach = curve([-1190, -180], [-700, -180], [-650, -480], [-160, -480]);
  add(4, [...approach, [1190, -480]], 'city-crossing');
  add(3, [[300, -120], [900, -120]], 'south-crossing');
  const outerHill = curve(approach[8], [-1080, -650], [-650, -1040], [-160, -840]);
  const innerHill = curve(approach[30], [approach[30][0] - 100, approach[30][1] - 180], [-420, -650], [-160, -600]);
  add(3, outerHill, 'hill-collector');
  add(3, innerHill, 'hill-collector');
  const crossHill = (aRoad, ai, bRoad, bi) => {
    const a = aRoad[ai], b = bRoad[bi];
    const normalControl = (road, i, target) => {
      const p = road[i], before = road[i - 1], after = road[i + 1];
      let nx = before[1] - after[1], ny = after[0] - before[0];
      const length = Math.hypot(nx, ny);
      if (nx * (target[0] - p[0]) + ny * (target[1] - p[1]) < 0) { nx = -nx; ny = -ny; }
      return [p[0] + nx / length * 120, p[1] + ny / length * 120];
    };
    return curve(a, normalControl(aRoad, ai, b), normalControl(bRoad, bi, a), b);
  };
  add(2, crossHill(outerHill, 18, innerHill, 44), 'hill-loop');
  add(2, crossHill(outerHill, 9, approach, 23), 'hill-loop');
  // Connected port service loop and access onto each existing finger pier.
  add(3, [[700, -120], [700, 420], [1080, 420], [1080, -120], [900, -120]], 'port-service');
  for (const y of [60, 240]) add(2, [[700, y], [1080, y]], 'port-local');
  for (const x of [800, 1000]) add(2, [[x, -120], [x, 420]], 'port-local');
  for (const x of [720, 840, 960, 1080]) {
    let end = 420;
    while (end < 760 && P.terrain(x, end + 2, noise) >= 0) end += 2;
    if (end > 440) add(2, [[x, 420], [x, end - 16]], 'pier-access', true);
  }
  return lines;
}

// Continue the tangent to an actual segment, not an arbitrary nearby sample.
// Require a >=45 degree crossing and a dry, moderate-grade approach.
export function extendStreetEnds(pts, lines, { isWater, maxDistance = 130, slopeAt = () => 0 }) {
  for (const start of [true, false]) {
    const p = start ? pts[0] : pts.at(-1);
    const q = start ? pts[Math.min(4, pts.length - 1)] : pts[Math.max(0, pts.length - 5)];
    const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (len < 1) continue;
    const dx = (p[0] - q[0]) / len, dy = (p[1] - q[1]) / len;
    let best = null, distance = maxDistance;
    for (const line of lines) for (let i = 1; i < line.pts.length; i++) {
      const a = line.pts[i - 1], b = line.pts[i];
      const sx = b[0] - a[0], sy = b[1] - a[1], sl = Math.hypot(sx, sy);
      const cross = dx * sy - dy * sx;
      if (sl < 0.01 || Math.abs(cross) / sl < Math.SQRT1_2) continue;
      const ax = a[0] - p[0], ay = a[1] - p[1];
      const t = (ax * sy - ay * sx) / cross, u = (ax * dy - ay * dx) / cross;
      if (t < 0 || t >= distance || u < 0 || u > 1) continue;
      let clear = true;
      for (let s = 0; s <= t; s += 2) {
        const x = p[0] + dx * s, y = p[1] + dy * s;
        if (isWater(x, y) || slopeAt(x, y) > 0.3) { clear = false; break; }
      }
      const hit = [p[0] + dx * t, p[1] + dy * t];
      if (clear && !isWater(...hit)) { distance = t; best = hit; }
    }
    if (!best || distance < 0.01) continue;
    const count = Math.ceil(distance / 5);
    const extra = Array.from({ length: count }, (_, i) => [p[0] + (best[0] - p[0]) * (i + 1) / count, p[1] + (best[1] - p[1]) * (i + 1) / count]);
    if (start) pts.unshift(...extra.reverse()); else pts.push(...extra);
  }
  return pts;
}

// Remove redundant sliver-block sides at acute junctions. Never remove a bridge
// in the graph-theory sense, a planned corridor, or the sole access to a street.
export function refineAvalonJunctions(graph) {
  let removed = 0;
  for (;;) {
    const inc = graph.nodes.map(() => []);
    for (const e of graph.edges) { inc[e.a].push(e); inc[e.b].push(e); }
    const redundant = edge => {
      const seen = new Set([edge.a]), queue = [edge.a];
      while (queue.length) for (const e of inc[queue.pop()]) {
        if (e === edge) continue;
        const next = seen.has(e.a) ? e.b : e.a;
        if (next === edge.b) return true;
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
      return false;
    };
    let drop = null;
    for (let n = 0; n < inc.length && !drop; n++) {
      if (inc[n].length < 3) continue;
      const origin = graph.nodes[n];
      const arms = inc[n].map(e => {
        const pts = e.a === n ? e.pts : [...e.pts].reverse();
        const p = pts.find(p => Math.hypot(p[0] - origin[0], p[1] - origin[1]) >= 15) ?? pts.at(-1);
        return { e, angle: Math.atan2(p[1] - origin[1], p[0] - origin[0]) };
      }).sort((a, b) => a.angle - b.angle);
      for (let i = 0; i < arms.length && !drop; i++) {
        const a = arms[i], b = arms[(i + 1) % arms.length];
        if ((b.angle - a.angle + Math.PI * 2) % (Math.PI * 2) >= Math.PI / 6) continue;
        drop = [a.e, b.e].filter(e => !e.requiredAccess && e.cls < 4).sort((a, b) => a.cls - b.cls).find(redundant);
      }
    }
    if (!drop) break;
    graph.edges = graph.edges.filter(e => e !== drop); removed++;
  }
  graph.deg = new Int32Array(graph.nodes.length);
  graph.edges.forEach((e, id) => { e.id = id; graph.deg[e.a]++; graph.deg[e.b]++; });
  graph.stats.acuteRedundantArms = removed;
  graph.stats.edges = graph.edges.length;
  graph.stats.junctions = Array.from(graph.deg).filter(d => d >= 3).length;
  return graph;
}
