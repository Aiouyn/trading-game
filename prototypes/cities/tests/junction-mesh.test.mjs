import test from 'node:test';
import assert from 'node:assert/strict';
import { junctionSetbacks, sliceProfile, junctionBoundary, gradeJunctionTerrain } from '../src/junction-mesh.js';

const cross = () => {
  const nodes = [[0, 0], [100, 0], [0, 100], [-100, 0], [0, -100]];
  const roads = nodes.slice(1).map((p, i) => ({ a: 0, b: i + 1, pts: [nodes[0], p], cls: 3, width: [10, 10] }));
  return { nodes, roads, deg: new Int32Array([4, 1, 1, 1, 1]) };
};

test('junction collars leave a drivable strip on short blocks and retain terminal ends', () => {
  const g = cross(), cuts = junctionSetbacks(g.roads, g.nodes, g.deg);
  for (const road of g.roads) { assert.ok(cuts.get(road)[0] > 5); assert.equal(cuts.get(road)[1], 0); }
  const short = { a: 0, b: 1, pts: [[0, 0], [10, 0]], cls: 3, width: [10, 10] };
  const all = [short, ...g.roads.slice(1), { a: 1, b: 5, pts: [[10, 0], [10, 100]], cls: 3, width: [10, 10] }];
  const c = junctionSetbacks(all, [...g.nodes, [10, 100]], new Int32Array([4, 2, 1, 1, 1, 1])).get(short);
  assert.ok(c[0] + c[1] <= 8);
});

test('profile slicing gives exact shared mouth coordinates without modifying the source', () => {
  const profile = { pts: [[0, 0], [10, 0], [20, 0]], y: [4, 4, 4], ground: [3, 3, 3], wet: [false, false, false] };
  const result = sliceProfile(profile, 3, 5);
  assert.deepEqual(result.pts, [[3, 0], [10, 0], [15, 0]]);
  assert.deepEqual(profile.pts, [[0, 0], [10, 0], [20, 0]]);
});

test('the shared crossing fan has finite consistently ordered triangles and four open mouths', () => {
  const arms = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(a => ({ px: Math.cos(a) * 12, pz: Math.sin(a) * 12, dx: Math.cos(a), dz: Math.sin(a), hw: 5 }));
  const boundary = junctionBoundary(arms, [0, 0]);
  assert.equal(boundary.mouthEdges.size, 4);
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    assert.ok(a.every(Number.isFinite));
    assert.ok(a[0] * b[1] - a[1] * b[0] > 0, 'fan triangle folds over a neighboring triangle');
  }
});

test('junction cut/fill creates a common bed on a slope and preserves water cells', () => {
  const g = cross(), N = 120, half = 120, res = 2;
  const H = Float32Array.from({ length: N * N }, (_, k) => (k % N) > 110 ? -2 : 10 + ((k % N) - N / 2) * 0.15);
  const heightAt = (x, z) => H[Math.floor((z + half) / res) * N + Math.floor((x + half) / res)];
  gradeJunctionTerrain(g.roads, { nodes: g.nodes, deg: g.deg }, { H, N, res, half, heightAt, isWater: (x, z) => heightAt(x, z) < 0 });
  assert.ok(Math.abs(heightAt(0, 0) - heightAt(4, 0)) < 0.001);
  assert.equal(heightAt(110, 0), -2);
  assert.ok(H.every(Number.isFinite));
});
