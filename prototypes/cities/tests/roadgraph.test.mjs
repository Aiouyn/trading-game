import test from 'node:test';
import assert from 'node:assert/strict';
import { planarize, cleanGraph, buildRoadGraph, connectGraph } from '../src/roadgraph.js';

const opts = {
  spacing: { 4: 200, 3: 100, 2: 40 },
  isWater: () => false,
  landAt: () => 0,
};

test('crossings at interior sampled vertices are connected, not visually overlapping roads', () => {
  const g = buildRoadGraph([
    { cls: 4, pts: [[-100, 0], [0, 0], [100, 0]] },
    { cls: 4, pts: [[0, -100], [0, 0], [0, 100]] },
  ], opts);
  assert.equal(Array.from(g.deg).filter(d => d === 4).length, 1);
  assert.equal(g.edges.length, 4);
});

test('a network spanning a river can connect a stray street on either bank', () => {
  const g = planarize([
    { cls: 4, pts: [[-200, 0], [200, 0]] },
    { cls: 2, pts: [[150, 100], [150, 240]] },
  ]);
  const connected = connectGraph(g, {
    landAt: x => Math.abs(x) < 10 ? -1 : x < 0 ? 0 : 1,
    isWater: x => Math.abs(x) < 10,
  });
  assert.equal(connected.stats.linked, 1);
  assert.equal(connected.stats.dropped, 0);
});

test('at-grade X crossing produces one degree-four node', () => {
  const g = buildRoadGraph([
    { cls: 4, level: 'arterial', pts: [[-100, 0], [100, 0]] },
    { cls: 4, level: 'arterial', pts: [[0, -100], [0, 100]] },
  ], opts);
  const deg4 = Array.from(g.deg).filter((d) => d === 4);
  assert.equal(deg4.length, 1);
  assert.equal(g.edges.length, 4);
});

test('T endpoint touching a segment produces one degree-three node', () => {
  const g = buildRoadGraph([
    { cls: 4, level: 'arterial', pts: [[-100, 0], [100, 0]] },
    { cls: 3, level: 'collector', pts: [[0, 2], [0, 100]] },
  ], opts);
  const deg3 = Array.from(g.deg).filter((d) => d === 3);
  assert.equal(deg3.length, 1);
  assert.equal(g.edges.length, 3);
});

test('disconnected parallel street separated beyond snap produces no accidental junction', () => {
  const g = planarize([
    { cls: 3, level: 'collector', pts: [[-100, 0], [100, 0]] },
    { cls: 3, level: 'collector', pts: [[-100, 25], [100, 25]] },
  ]);
  assert.equal(g.edges.length, 2);
  assert.equal(g.nodes.length, 4);
});

test('short legitimate dead end serving a parcel is retained when tagged requiredAccess', () => {
  const g = buildRoadGraph([
    { cls: 4, level: 'arterial', pts: [[-150, 0], [150, 0]] },
    { cls: 2, level: 'local', requiredAccess: true, pts: [[0, 0], [0, 30]] },
  ], opts);
  // Without requiredAccess, a 30m local spur (< SPUR_MAX 60) is pruned; with requiredAccess it is retained
  assert.equal(g.edges.length, 3);
  assert.ok(g.edges.some((e) => e.requiredAccess));
});

test('ordinary self-loop with no frontage is rejected and counted', () => {
  const p = planarize([
    { cls: 4, level: 'arterial', pts: [[-150, 0], [150, 0]] },
    { cls: 2, level: 'local', pts: [[0, 0], [20, 20], [0, 40], [-20, 20], [0, 0]] },
  ]);
  const c = cleanGraph(p, { spacing: opts.spacing, isWater: opts.isWater, smooth: false });
  assert.equal(c.stats.loops, 1);
  assert.ok(!c.edges.some((e) => e.a === e.b));
});
