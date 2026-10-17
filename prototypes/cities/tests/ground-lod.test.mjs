import test from 'node:test';
import assert from 'node:assert/strict';
import { protectedGroundVertices } from '../src/ground-lod.js';

test('coarse terrain protects carriageways, junction interiors and building foundations', () => {
  const city = { S: 400, network: [{ hw: 7, pts: [[-100, 0], [100, 0]] }],
    roadGraph: { nodes: [[0, 0], [-100, 0], [100, 0]], edges: [{ a: 0, b: 1 }, { a: 0, b: 2 }] },
    buildings: [{ x: 100, y: 100, w: 20, dp: 20 }] };
  const mask = protectedGroundVertices(city, 80);
  const at = (x, z) => mask[Math.round((z + 200) / 5) * 81 + Math.round((x + 200) / 5)];
  assert.equal(at(50, 0), 1); assert.equal(at(0, 35), 1); assert.equal(at(110, 110), 1);
  assert.equal(at(-150, -150), 0);
});
