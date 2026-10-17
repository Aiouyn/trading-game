import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONALITIES } from '../src/personalities.js';
import { generateCity } from '../src/gen.js';

let avalon, avalonRepeat;
before(async () => {
  avalon = await generateCity(PERSONALITIES.avalon);
  avalonRepeat = await generateCity(PERSONALITIES.avalon);
});

test('ordinary buildings have unique stable parcelId and blockKey across repeat runs', () => {
  const ordinary = avalon.buildings.filter((b) => b.kind !== 'Landmark' && b.kind !== 'Island estate');
  assert.ok(ordinary.length > 0);
  const seen = new Set();
  for (const b of ordinary) {
    assert.equal(typeof b.parcelId, 'string', `building ${b.id} missing parcelId`);
    assert.ok(b.parcelId.startsWith('avalon:1701:p:'));
    assert.ok(!seen.has(b.parcelId), `duplicate parcelId: ${b.parcelId}`);
    seen.add(b.parcelId);
    assert.ok(Number.isInteger(b.blockKey) && b.blockKey >= 0, `building ${b.id} invalid blockKey: ${b.blockKey}`);
  }
  const repeatOrdinary = avalonRepeat.buildings.filter((b) => b.kind !== 'Landmark' && b.kind !== 'Island estate');
  assert.deepEqual(ordinary.map((b) => b.parcelId), repeatOrdinary.map((b) => b.parcelId));
  assert.deepEqual(ordinary.map((b) => b.blockKey), repeatOrdinary.map((b) => b.blockKey));
});

test('exported roadGraph has valid finite nodes and edge endpoints matching nodes within 0.01 m', () => {
  assert.ok(avalon.roadGraph, 'roadGraph missing');
  const { nodes, edges } = avalon.roadGraph;
  assert.equal(avalon.graph.nodes, nodes.length);
  assert.ok(edges.length > 0);
  for (const [x, y] of nodes) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
  }
  for (const e of edges) {
    assert.ok(Number.isInteger(e.id) && e.id >= 0);
    assert.ok(Number.isInteger(e.a) && e.a >= 0 && e.a < nodes.length);
    assert.ok(Number.isInteger(e.b) && e.b >= 0 && e.b < nodes.length);
    assert.ok(e.pts.length >= 2);
    for (const [px, py] of e.pts) {
      assert.ok(Number.isFinite(px) && Number.isFinite(py));
    }
    const na = nodes[e.a], nb = nodes[e.b];
    const p0 = e.pts[0], p1 = e.pts[e.pts.length - 1];
    assert.ok(Math.hypot(p0[0] - na[0], p0[1] - na[1]) <= 0.01, `edge ${e.id} start mismatch`);
    assert.ok(Math.hypot(p1[0] - nb[0], p1[1] - nb[1]) <= 0.01, `edge ${e.id} end mismatch`);
  }
});

test('Avalon has one connected road network and no internal arterial dead ends', () => {
  const { nodes, edges } = avalon.roadGraph;
  const inc = nodes.map(() => []);
  for (const e of edges) { inc[e.a].push(e); inc[e.b].push(e); }
  const start = edges[0].a, seen = new Set([start]), queue = [start];
  while (queue.length) for (const e of inc[queue.pop()]) {
    for (const id of [e.a, e.b]) if (!seen.has(id)) { seen.add(id); queue.push(id); }
  }
  for (let i = 0; i < nodes.length; i++) {
    if (inc[i].length) assert.ok(seen.has(i), `isolated road node ${i}`);
    if (inc[i].length === 1 && inc[i][0].cls === 4) {
      assert.ok(Math.max(...nodes[i].map(Math.abs)) >= avalon.S / 2 - 40, `arterial dead end ${nodes[i]}`);
    }
  }
  assert.equal(avalon.bridges.length, 3);
});

test('generated driveways retain parent graph edge provenance', () => {
  const drives = avalon.network.filter((n) => n.cls <= 1);
  assert.ok(drives.length > 0);
  const edgeIds = new Set(avalon.roadGraph.edges.map((e) => e.id));
  for (const d of drives) {
    assert.ok(Number.isInteger(d.edgeId) && edgeIds.has(d.edgeId), `driveway missing valid parent edgeId: ${d.edgeId}`);
  }
});

test('Avalon exports parcelDiagnostics and reconciled candidate/served/vacant/rejected counts', () => {
  assert.ok(Array.isArray(avalon.parcelDiagnostics));
  assert.ok(avalon.parcelDiagnostics.length > 0);
  const a = avalon.access;
  assert.ok(Number.isInteger(a.candidateCount) && a.candidateCount > 0);
  assert.equal(a.servedCount + a.vacantCount + a.rejectedCount, a.candidateCount);
  assert.equal(a.servedCount, avalon.stats.lots);
});

test('crossing paint never crosses water or sits on a bridge span', () => {
  const r = avalon.ribbons;
  const distToPolyline = (x, z, pts) => {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
    return best;
  };
  const cellAt = (x, z) => Math.floor((z + avalon.S / 2) / avalon.RES) * avalon.N + Math.floor((x + avalon.S / 2) / avalon.RES);
  let paintCount = 0, overWater = 0, onBridge = 0;
  for (let i = 0; i < r.side.length; i++) {
    if (r.side[i] !== 8) continue;
    paintCount++;
    const x = r.position[i * 3], z = r.position[i * 3 + 2];
    if (avalon.H[cellAt(x, z)] < 0) overWater++;
  }
  assert.ok(paintCount > 0, 'no junction paint was generated at all, so this proves nothing');
  assert.equal(overWater, 0, 'crossing paint over water');
  for (const b of avalon.bridges ?? []) {
    for (let i = 0; i < r.side.length; i++) {
      if (r.side[i] !== 8) continue;
      const x = r.position[i * 3], z = r.position[i * 3 + 2];
      if (distToPolyline(x, z, b.pts) <= 14) { onBridge++; break; }
    }
  }
  assert.equal(onBridge, 0, 'crossing paint on a bridge span');
});

test('shared junction surfaces are finite and stay above the terrain bed', () => {
  const r = avalon.ribbons;
  assert.ok(r.position.every(Number.isFinite));
  let checked = 0;
  for (let i = 0; i < r.side.length; i++) if (r.side[i] === 9) {
    const x = r.position[i * 3], y = r.position[i * 3 + 1], z = r.position[i * 3 + 2];
    const ix = Math.max(0, Math.min(avalon.N - 1, Math.floor((x + avalon.S / 2) / avalon.RES)));
    const iz = Math.max(0, Math.min(avalon.N - 1, Math.floor((z + avalon.S / 2) / avalon.RES)));
    assert.ok(y >= avalon.H[iz * avalon.N + ix] + 0.05, `junction vertex buried at ${x},${z}`);
    checked++;
  }
  assert.ok(checked > 100);
});
