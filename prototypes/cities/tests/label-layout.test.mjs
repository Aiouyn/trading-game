import test from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, packLabels } from '../src/label-layout.js';

test('packLabels picks higher priority regardless of input order and respects viewport bounds and exclusions', () => {
  const c1 = { id: 'sel', x: 100, y: 100, w: 60, h: 20, priority: 100 };
  const c2 = { id: 'dist', x: 110, y: 105, w: 80, h: 24, priority: 40 };
  const c3 = { id: 'offscreen', x: -10, y: 50, w: 50, h: 20, priority: 90 };
  const c4 = { id: 'under-panel', x: 1150, y: 80, w: 60, h: 20, priority: 80 };
  const exclusions = [{ x: 1100, y: 50, w: 300, h: 500 }];

  const kept1 = packLabels([c1, c2, c3, c4], 1440, 900, exclusions);
  const kept2 = packLabels([c4, c3, c2, c1], 1440, 900, exclusions);
  assert.deepEqual(kept1, ['sel']);
  assert.deepEqual(kept2, ['sel']);

  // Tie-breaking by id localeCompare
  const t1 = { id: 'b', x: 200, y: 200, w: 50, h: 20, priority: 50 };
  const t2 = { id: 'a', x: 205, y: 200, w: 50, h: 20, priority: 50 };
  assert.deepEqual(packLabels([t1, t2], 1440, 900, []), ['a']);
  assert.deepEqual(packLabels([t2, t1], 1440, 900, []), ['a']);
  assert.equal(overlaps(t1, t2), true);
});
