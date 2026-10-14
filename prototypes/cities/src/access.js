export function entranceOf({ x, y, rot, dp, front = -1 }) {
  if (![x, y, rot, dp].every(Number.isFinite) || dp <= 0 || ![-1, 1].includes(front)) {
    throw new TypeError('invalid entrance geometry');
  }
  return [x - Math.sin(rot) * dp * 0.5 * front,
          y + Math.cos(rot) * dp * 0.5 * front];
}

// Cardinal-grid A*: deterministic, bounded and intentionally free of generator globals.
// Callbacks must validate the full corridor width and grade, not just point occupancy.
export function routeGrid({ start, goal, step = 2, margin = 20, maxVisited = 4096,
  canStand, canStep = () => true }) {
  if (!(step > 0) || !(maxVisited > 0) || !Number.isFinite(margin) || margin < 0) {
    throw new TypeError('invalid route limits');
  }
  // Anchor the lattice to the actual entrance: rounding a fractional start onto
  // a blocked neighbour must not make a valid entrance unreachable.
  const origin = start.map((v, i) => v + Math.floor((Math.min(v, goal[i]) - margin - v) / step) * step);
  const nx = Math.ceil((Math.max(start[0], goal[0]) + margin - origin[0]) / step) + 1;
  const ny = Math.ceil((Math.max(start[1], goal[1]) + margin - origin[1]) / step) + 1;
  if (nx * ny > 1000000) return null;
  const point = id => [origin[0] + (id % nx) * step, origin[1] + Math.floor(id / nx) * step];
  const index = p => Math.round((p[1] - origin[1]) / step) * nx + Math.round((p[0] - origin[0]) / step);
  const s = index(start), g = index(goal);
  const ps = point(s), pg = point(g);
  if (!canStand(...start) || !canStand(...goal) || !canStand(...ps) || !canStand(...pg)
      || !canStep(start, ps) || !canStep(pg, goal)) return null;
  const cost = new Map([[s, 0]]), parent = new Map(), closed = new Set();
  const heuristic = id => Math.abs(id % nx - g % nx) + Math.abs(Math.floor(id / nx) - Math.floor(g / nx));
  const heap = [];
  const less = (a, b) => a.f < b.f || (a.f === b.f && a.id < b.id);
  function push(v) {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]]; i = p;
    }
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let j = i;
        for (const k of [i * 2 + 1, i * 2 + 2]) if (k < heap.length && less(heap[k], heap[j])) j = k;
        if (j === i) break;
        [heap[i], heap[j]] = [heap[j], heap[i]]; i = j;
      }
    }
    return first;
  }
  push({ id: s, f: heuristic(s) });
  while (heap.length && closed.size < maxVisited) {
    const { id } = pop();
    if (closed.has(id)) continue;
    if (id === g) {
      const ids = [g];
      while (ids[ids.length - 1] !== s) ids.push(parent.get(ids[ids.length - 1]));
      const path = [start, ...ids.reverse().map(point), goal];
      return path.filter((p, i) => i === 0 || p[0] !== path[i - 1][0] || p[1] !== path[i - 1][1]);
    }
    closed.add(id);
    const x = id % nx, y = Math.floor(id / nx), a = point(id);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
      const next = yy * nx + xx, b = point(next), n = cost.get(id) + 1;
      if (closed.has(next) || !canStand(...b) || !canStep(a, b) || n >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, n); parent.set(next, id); push({ id: next, f: n + heuristic(next) });
    }
  }
  return null;
}
