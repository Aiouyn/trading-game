export function entranceOf({ x, y, rot, dp, front = -1 }) {
  if (![x, y, rot, dp].every(Number.isFinite) || dp <= 0 || ![-1, 1].includes(front)) {
    throw new TypeError('invalid entrance geometry');
  }
  return [x - Math.sin(rot) * dp * 0.5 * front,
          y + Math.cos(rot) * dp * 0.5 * front];
}

// Cardinal-grid A*: deterministic, bounded and intentionally free of generator globals.
// Callbacks must validate the full corridor width and grade, not just point occupancy.
// Reused lattice. A generation stamp means "touched by this search"; a second array means "expanded".
let gridGen = 1;
let gridSeen = new Uint16Array(0);
let gridClosed = new Uint16Array(0);
let gridCost = new Uint16Array(0);
let gridParent = new Int32Array(0);
let heapId = new Int32Array(1024);
let heapF = new Int32Array(1024);

export function routeGrid({ start, goal, step = 2, margin = 20, maxVisited = 4096,
  canStand, canStep = () => true }) {
  if (!(step > 0) || !(maxVisited > 0) || !Number.isFinite(margin) || margin < 0) {
    throw new TypeError('invalid route limits');
  }
  // Anchor the lattice to the actual entrance: rounding a fractional start onto
  // a blocked neighbour must not make a valid entrance unreachable.
  const originX = start[0] + Math.floor((Math.min(start[0], goal[0]) - margin - start[0]) / step) * step;
  const originY = start[1] + Math.floor((Math.min(start[1], goal[1]) - margin - start[1]) / step) * step;
  const nx = Math.ceil((Math.max(start[0], goal[0]) + margin - originX) / step) + 1;
  const ny = Math.ceil((Math.max(start[1], goal[1]) + margin - originY) / step) + 1;
  const cells = nx * ny;
  if (cells > 1000000) return null;
  const point = (id) => [originX + (id % nx) * step, originY + Math.floor(id / nx) * step];
  const index = (p) => Math.round((p[1] - originY) / step) * nx + Math.round((p[0] - originX) / step);
  const s = index(start), g = index(goal);
  const ps = point(s), pg = point(g);
  if (!canStand(start[0], start[1]) || !canStand(goal[0], goal[1]) || !canStand(ps[0], ps[1]) || !canStand(pg[0], pg[1])
      || !canStep(start, ps) || !canStep(pg, goal)) return null;
  if (gridSeen.length < cells) {
    gridSeen = new Uint16Array(cells);
    gridClosed = new Uint16Array(cells);
    gridCost = new Uint16Array(cells);
    gridParent = new Int32Array(cells);
  }
  const stamp = gridGen++;
  if (gridGen === 65535) { gridSeen.fill(0); gridClosed.fill(0); gridGen = 1; }
  const gx = g % nx, gy = Math.floor(g / nx);
  const heuristic = (id) => Math.abs(id % nx - gx) + Math.abs(Math.floor(id / nx) - gy);
  let hn = 0;
  const less = (i, j) => heapF[i] < heapF[j] || (heapF[i] === heapF[j] && heapId[i] < heapId[j]);
  const push = (id, f) => {
    if (hn >= heapId.length) {
      const nId = new Int32Array(heapId.length * 2), nF = new Int32Array(heapF.length * 2);
      nId.set(heapId); nF.set(heapF);
      heapId = nId; heapF = nF;
    }
    let i = hn++;
    heapId[i] = id; heapF[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(i, p)) break;
      const idT = heapId[i]; heapId[i] = heapId[p]; heapId[p] = idT;
      const fT = heapF[i]; heapF[i] = heapF[p]; heapF[p] = fT;
      i = p;
    }
  };
  const pop = () => {
    const id = heapId[0];
    hn--;
    if (hn) {
      heapId[0] = heapId[hn]; heapF[0] = heapF[hn];
      let i = 0;
      for (;;) {
        let j = i;
        const l = i * 2 + 1, r = l + 1;
        if (l < hn && less(l, j)) j = l;
        if (r < hn && less(r, j)) j = r;
        if (j === i) break;
        const idT = heapId[i]; heapId[i] = heapId[j]; heapId[j] = idT;
        const fT = heapF[i]; heapF[i] = heapF[j]; heapF[j] = fT;
        i = j;
      }
    }
    return id;
  };
  gridSeen[s] = stamp;
  gridCost[s] = 0;
  gridParent[s] = -1;
  push(s, heuristic(s));
  let visited = 0;
  while (hn && visited < maxVisited) {
    const id = pop();
    if (gridClosed[id] === stamp) continue;
    if (id === g) {
      const ids = [g];
      while (ids[ids.length - 1] !== s) ids.push(gridParent[ids[ids.length - 1]]);
      const path = [start, ...ids.reverse().map(point), goal];
      return path.filter((p, i) => i === 0 || p[0] !== path[i - 1][0] || p[1] !== path[i - 1][1]);
    }
    gridClosed[id] = stamp;
    visited++;
    const x = id % nx, y = Math.floor(id / nx);
    const ax = originX + x * step, ay = originY + y * step;
    const n = gridCost[id] + 1;
    for (let k = 0; k < 4; k++) {
      const xx = x + (k === 0 ? 1 : k === 2 ? -1 : 0);
      const yy = y + (k === 1 ? 1 : k === 3 ? -1 : 0);
      if ((xx | yy) < 0 || xx >= nx || yy >= ny) continue;
      const next = yy * nx + xx;
      if (gridClosed[next] === stamp) continue;
      if (gridSeen[next] === stamp && n >= gridCost[next]) continue;
      const bx = originX + xx * step, by = originY + yy * step;
      if (!canStand(bx, by) || !canStep([ax, ay], [bx, by])) continue;
      gridSeen[next] = stamp;
      gridCost[next] = n;
      gridParent[next] = id;
      push(next, n + heuristic(next));
    }
  }
  return null;
}
