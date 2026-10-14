import test from 'node:test';
import assert from 'node:assert/strict';
import { parcelId } from '../src/parcel-id.js';
test('parcel identity is deterministic and independent of array position', () => {
  const a = parcelId('avalon', 1701, 10, -20, 0);
  const list = [[-5, 2], [10, -20]].map(([x, y]) => parcelId('avalon', 1701, x, y, 0));
  assert.equal(a, list[1]);
  assert.notEqual(a, parcelId('avalon', 1702, 10, -20, 0));
  assert.notEqual(a, parcelId('kaiyo', 1701, 10, -20, 0));
});
test('invalid geometry is rejected', () => {
  assert.throws(() => parcelId('avalon', 1701, NaN, 0, 0), TypeError);
});
