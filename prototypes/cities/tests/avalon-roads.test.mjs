import test from 'node:test';
import assert from 'node:assert/strict';
import { avalonRoadPlan, extendStreetEnds, refineAvalonJunctions } from '../src/avalon-roads.js';
import { PERSONALITIES } from '../src/personalities.js';
import { makeNoise } from '../src/noise.js';

test('street continuation intersects the actual carriageway at a right angle', () => {
  const pts = [[0, 0], [20, 0], [40, 0]];
  extendStreetEnds(pts, [{ pts: [[100, -83], [100, 67]] }], { isWater: () => false });
  assert.deepEqual(pts.at(-1), [100, 0]);
  assert.ok(pts.every(p => p[1] === 0));
});

test('street continuation refuses water, steep ground, and shallow-angle junctions', () => {
  const line = [{ pts: [[100, -83], [100, 67]] }];
  for (const options of [{ isWater: x => x > 60 && x < 70 }, { isWater: () => false, slopeAt: () => 0.4 }]) {
    const pts = [[0, 0], [20, 0], [40, 0]];
    extendStreetEnds(pts, line, options);
    assert.deepEqual(pts.at(-1), [40, 0]);
  }
  const pts = [[0, 0], [20, 0], [40, 0]];
  extendStreetEnds(pts, [{ pts: [[60, -10], [160, 10]] }], { isWater: () => false });
  assert.deepEqual(pts.at(-1), [40, 0]);
});

test('surveyed plan crosses water only on the three designated inland crossings', () => {
  const P = PERSONALITIES.avalon, n = makeNoise(P.seed);
  const plan = avalonRoadPlan(P, n);
  const wet = new Set();
  for (const road of plan) {
    assert.ok(P.terrain(...road.pts[0], n) >= 0, `${road.level} begins in water`);
    assert.ok(P.terrain(...road.pts.at(-1), n) >= 0, `${road.level} ends in water`);
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i];
      const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
      for (let s = 0; s <= count; s++) {
        if (P.terrain(a[0] + (b[0] - a[0]) * s / count, a[1] + (b[1] - a[1]) * s / count, n) < 0) wet.add(road.level);
      }
    }
  }
  assert.deepEqual([...wet].sort(), ['city-crossing', 'north-crossing', 'south-crossing']);
});

test('acute-junction cleanup retains the sole route into a neighborhood', () => {
  const nodes = [[0, 0], [100, 0], [-100, 0], [100, 20]];
  const edges = [1, 2, 3].map(b => ({ a: 0, b, cls: b === 3 ? 2 : 4, pts: [nodes[0], nodes[b]] }));
  const g = refineAvalonJunctions({ nodes, edges, stats: {} });
  assert.equal(g.edges.length, 3);
});
