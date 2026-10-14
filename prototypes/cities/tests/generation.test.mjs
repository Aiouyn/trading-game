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

test('generated driveways retain parent graph edge provenance', () => {
  const drives = avalon.network.filter((n) => n.cls <= 1);
  assert.ok(drives.length > 0);
  const edgeIds = new Set(avalon.roadGraph.edges.map((e) => e.id));
  for (const d of drives) {
    assert.ok(Number.isInteger(d.edgeId) && edgeIds.has(d.edgeId), `driveway missing valid parent edgeId: ${d.edgeId}`);
  }
});
