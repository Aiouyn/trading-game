import test from 'node:test';
import assert from 'node:assert/strict';
import { packInstanceTiles } from '../src/instance-tiles.js';

test('tile packing preserves every instance and stable ordering within a tile', () => {
  const source = new Float32Array(18 * 5);
  for (let i = 0; i < 5; i++) source.set([i % 2 ? 800 : -200, 2, -200, 12, 20, 10, 0, 0.5, 0.4, 0.3, 1, 3, 3, i + 1, 0, 0.5, 2, 0], i * 18);
  const before = source.slice();
  const groups = packInstanceTiles(source, { half: 1200 });
  assert.equal(groups.length, 2);
  assert.equal(groups.reduce((s, t) => s + t.count, 0), 5);
  const ids = groups.map(t => Array.from({ length: t.count }, (_, i) => t.data[i * 18 + 13]));
  assert.deepEqual(ids, [[1, 3, 5], [2, 4]]);
  assert.deepEqual(source, before);
  for (const t of groups) assert.equal(t.data.byteLength, t.count * 18 * 4);
});

test('narrow building bodies and roof silhouettes are never discarded as small decorative parts', () => {
  const source = new Float32Array(18 * 3);
  source.set([0, 0, 0, 5, 15, 6, 0, 0.5, 0.4, 0.3, 1, 3, 3, 1, 0, 0.5, 0, 0]);
  source.set([0, 15, 0, 5, 2, 6, 0, 0.3, 0.3, 0.3, 7, 3, 3, 1, 0, 0.5, 0, 0], 18);
  source.set([0, 17, 0, 1, 1, 1, 0, 0.3, 0.3, 0.3, 0, 3, 3, 1, 0, 0.5, 0, 0], 36);
  const groups = packInstanceTiles(source, { half: 1200 });
  assert.equal(groups.find(g => !g.small && !g.medium).count, 2);
  assert.equal(groups.find(g => g.small).count, 1);
});
