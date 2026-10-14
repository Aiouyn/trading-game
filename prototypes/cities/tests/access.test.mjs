import test from 'node:test';
import assert from 'node:assert/strict';
import { entranceOf, routeGrid } from '../src/access.js';
test('entrance uses the front, not the nearest arbitrary wall', () => {
  assert.deepEqual(entranceOf({ x: 0, y: 0, rot: 0, dp: 10, front: -1 }), [0, -5]);
  const [x, y] = entranceOf({ x: 0, y: 0, rot: Math.PI / 2, dp: 10, front: -1 });
  assert.ok(Math.abs(x - 5) < 1e-8 && Math.abs(y) < 1e-8);
});
test('routes around a wall deterministically without diagonal corner-cutting', () => {
  const options = {
    start: [0, 0], goal: [10, 0], step: 1, margin: 4,
    canStand: (x, y) => !(x >= 4 && x <= 6 && Math.abs(y) <= 2),
  };
  const path = routeGrid(options);
  assert.ok(path && path.some(([, y]) => Math.abs(y) > 2));
  assert.deepEqual(path, routeGrid(options));
  assert.ok(path.every(([x, y]) => options.canStand(x, y)));
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i][0] - path[i - 1][0]), dy = Math.abs(path[i][1] - path[i - 1][1]);
    assert.ok(dx === 0 || dy === 0, 'cardinal steps only');
  }
});
test('unreachable entrance reports no route', () => {
  assert.equal(routeGrid({ start: [0, 0], goal: [10, 0], step: 1, margin: 2,
    canStand: (x, y) => (x === 0 && y === 0) || (x === 10 && y === 0) }), null);
});

test('corridor width and grade callbacks reject wet edges and steep grades', () => {
  // Water at y > 0.5: centre line y=0 is dry, but half-width 0.9 reaches y=0.9 which is wet
  const isDryPoint = (x, y) => y <= 0.5;
  const hw = 0.9;
  const canStandCorridor = (x, y) =>
    isDryPoint(x, y) && isDryPoint(x - hw, y) && isDryPoint(x + hw, y) && isDryPoint(x, y - hw) && isDryPoint(x, y + hw);
  assert.equal(routeGrid({
    start: [0, 0], goal: [6, 0], step: 1, margin: 0,
    canStand: canStandCorridor,
  }), null);
  // Detour to y = -1 stays dry across full width
  const detour = routeGrid({
    start: [0, -1], goal: [6, -1], step: 1, margin: 2,
    canStand: canStandCorridor,
  });
  assert.ok(detour && detour.every(([, y]) => y <= -0.4));

  // Grade check: cliff at x=3 rises 1m in 1m step (grade 1.0 > 0.15 footpath max) unless going around y=2
  const heightAt = (x, y) => (x >= 3 && Math.abs(y) < 1.5 ? 2 : 0);
  const canStepGrade = (a, b) => {
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (dist === 0) return true;
    return Math.abs(heightAt(b[0], b[1]) - heightAt(a[0], a[1])) / dist <= 0.15;
  };
  assert.equal(routeGrid({
    start: [0, 0], goal: [6, 0], step: 1, margin: 0,
    canStand: () => true, canStep: canStepGrade,
  }), null);
});
