// Full terrain resolution around gameplay geometry. Only open landscape may
// use a looser mesh error in balanced/low mode, keeping road beds unbroken.
export function protectedGroundVertices(city, cells) {
  const side = cells + 1, step = city.S / cells, half = city.S / 2;
  const mask = new Uint8Array(side * side);
  const stamp = (x, z, radius) => {
    const minX = Math.max(0, Math.floor((x - radius + half) / step));
    const maxX = Math.min(cells, Math.ceil((x + radius + half) / step));
    const minZ = Math.max(0, Math.floor((z - radius + half) / step));
    const maxZ = Math.min(cells, Math.ceil((z + radius + half) / step));
    for (let j = minZ; j <= maxZ; j++) for (let i = minX; i <= maxX; i++) mask[j * side + i] = 1;
  };
  for (const road of city.network ?? []) {
    const radius = (road.hw ?? 5) + step * 1.5;
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i];
      const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let s = 0; s <= count; s++) stamp(a[0] + (b[0] - a[0]) * s / count, a[1] + (b[1] - a[1]) * s / count, radius);
    }
  }
  if (city.roadGraph) {
    const degree = new Uint16Array(city.roadGraph.nodes.length);
    for (const e of city.roadGraph.edges) { degree[e.a]++; degree[e.b]++; }
    city.roadGraph.nodes.forEach((p, n) => { if (degree[n] >= 2) stamp(...p, 42); });
  }
  for (const b of city.buildings ?? []) stamp(b.x, b.y, Math.hypot(b.w ?? 8, b.dp ?? 10) / 2 + step);
  return mask;
}
