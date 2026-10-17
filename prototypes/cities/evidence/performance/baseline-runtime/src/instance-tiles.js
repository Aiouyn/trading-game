// Two passes into exact-size typed arrays. Avoid boxing every float of every
// building/tree instance in temporary JS arrays during scene loading.
export function packInstanceTiles(arr, { stride = 18, half, tile = 400, tree = false, smallLimit = 3 }) {
  const groups = new Map();
  const keyAt = o => {
    const span = Math.max(arr[o + 3], arr[o + 5]);
    const detail = !tree && arr[o + 13] > 0 && arr[o + 4] < 3 && arr[o + 10] !== 7;
    const small = detail && span < smallLimit;
    const medium = detail && !small && span < 9;
    return (small ? 2 : medium ? 1 : 0) * 1048576 + (Math.floor((arr[o] + half) / tile) + 512) * 1024 + Math.floor((arr[o + 2] + half) / tile) + 512;
  };
  for (let o = 0; o < arr.length; o += stride) {
    const key = keyAt(o);
    let t = groups.get(key);
    if (!t) {
      const span = Math.max(arr[o + 3], arr[o + 5]);
      const detail = !tree && arr[o + 13] > 0 && arr[o + 4] < 3 && arr[o + 10] !== 7;
      const small = detail && span < smallLimit;
      groups.set(key, t = { small, medium: detail && !small && span < 9, count: 0, cursor: 0,
        minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity });
    }
    t.count++;
    const radius = Math.hypot(arr[o + 3], arr[o + 5]) / 2;
    t.minX = Math.min(t.minX, arr[o] - radius); t.maxX = Math.max(t.maxX, arr[o] + radius);
    t.minY = Math.min(t.minY, arr[o + 1]); t.maxY = Math.max(t.maxY, arr[o + 1] + arr[o + 4]);
    t.minZ = Math.min(t.minZ, arr[o + 2] - radius); t.maxZ = Math.max(t.maxZ, arr[o + 2] + radius);
  }
  for (const t of groups.values()) t.data = new Float32Array(t.count * stride);
  for (let o = 0; o < arr.length; o += stride) {
    const t = groups.get(keyAt(o)), end = t.cursor + stride;
    for (let q = t.cursor, i = o; q < end; q++, i++) t.data[q] = arr[i];
    t.cursor = end;
  }
  return [...groups.values()];
}
