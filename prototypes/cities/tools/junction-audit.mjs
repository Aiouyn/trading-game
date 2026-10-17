import { generateCity } from '../src/gen.js';
import { PERSONALITIES } from '../src/personalities.js';
const id = process.argv[2] ?? 'avalon';
const c = await generateCity(PERSONALITIES[id]), r = c.ribbons;
let count = 0, buried = 0, min = Infinity, max = -Infinity, invalid = 0, buriedCenters = 0;
const examples = [];
for (let i = 0; i < r.side.length; i++) if (r.side[i] === 9) {
  count++;
  const x = r.position[i * 3], y = r.position[i * 3 + 1], z = r.position[i * 3 + 2];
  const ix = Math.max(0, Math.min(c.N - 1, Math.floor((x + c.S / 2) / c.RES))), iz = Math.max(0, Math.min(c.N - 1, Math.floor((z + c.S / 2) / c.RES)));
  const clearance = y - c.H[iz * c.N + ix];
  if (![x, y, z, clearance].every(Number.isFinite)) invalid++;
  min = Math.min(min, clearance); max = Math.max(max, clearance);
  if (clearance < 0) { buried++; if (examples.length < 6) examples.push({ x, y, z, clearance, order: r.order[i] }); }
}
for (let k = 0; k < r.index.length; k += 3) {
  const ids = [r.index[k], r.index[k + 1], r.index[k + 2]];
  if (!ids.every(i => r.side[i] === 9)) continue;
  const p = [0, 1, 2].map(axis => ids.reduce((sum, i) => sum + r.position[i * 3 + axis], 0) / 3);
  const ix = Math.max(0, Math.min(c.N - 1, Math.floor((p[0] + c.S / 2) / c.RES)));
  const iz = Math.max(0, Math.min(c.N - 1, Math.floor((p[2] + c.S / 2) / c.RES)));
  if (p[1] < c.H[iz * c.N + ix]) buriedCenters++;
}
console.log(JSON.stringify({ city: id, count, invalid, buried, buriedCenters, min, max, examples }, null, 2));
if (invalid || buried || buriedCenters) process.exitCode = 1;
