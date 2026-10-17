import { writeFileSync } from 'node:fs';
import { generateCity } from '../src/gen.js';
import { PERSONALITIES } from '../src/personalities.js';

const city = await generateCity(PERSONALITIES.avalon);
const { nodes, edges } = city.roadGraph;
const inc = nodes.map(() => []);
for (const e of edges) { inc[e.a].push(e); inc[e.b].push(e); }
let components = 0, acute = 0;
const acuteDetails = [];
const visited = new Set();
for (let i = 0; i < nodes.length; i++) {
  if (!inc[i].length || visited.has(i)) continue;
  components++;
  const stack = [i]; visited.add(i);
  while (stack.length) for (const e of inc[stack.pop()]) {
    for (const n of [e.a, e.b]) if (!visited.has(n)) { visited.add(n); stack.push(n); }
  }
}
for (let i = 0; i < nodes.length; i++) {
  if (inc[i].length < 3) continue;
  const angles = inc[i].map(e => {
    const pts = e.a === i ? e.pts : [...e.pts].reverse();
    const p = pts.find(p => Math.hypot(p[0] - nodes[i][0], p[1] - nodes[i][1]) >= 15) ?? pts.at(-1);
    return Math.atan2(p[1] - nodes[i][1], p[0] - nodes[i][0]);
  }).sort((a, b) => a - b);
  if (angles.some((a, k) => ((angles[(k + 1) % angles.length] - a + Math.PI * 2) % (Math.PI * 2)) < Math.PI / 6)) {
    acute++; acuteDetails.push({ p: nodes[i], arms: inc[i].map(e => ({ id: e.id, level: e.level, cls: e.cls })) });
  }
}
const internalEnds = nodes.flatMap((p, i) => inc[i].length === 1 && Math.max(Math.abs(p[0]), Math.abs(p[1])) < city.S / 2 - 40 ? [{ p, cls: inc[i][0].cls }] : []);
const result = { buildings: city.buildings.length, roadKm: city.stats.roadKm, components, edges: edges.length,
  internalDeadEnds: internalEnds.length, arterialDeadEnds: internalEnds.filter(e => e.cls === 4).length,
  acuteJunctionsUnder30Degrees: acute, acuteDetails, bridges: city.bridges.length, internalEnds, graph: city.graph.stats, access: city.access };
writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
