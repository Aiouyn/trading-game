import test from 'node:test';
import assert from 'node:assert/strict';
import { cityCacheKey } from '../src/cache-key.js';
import { GEN_VERSION } from '../src/citycache.js';

test('cityCacheKey distinguishes id, seed and version', () => {
  const k1 = cityCacheKey('avalon', 1701, 'inhabitable-v2-1');
  assert.equal(k1, cityCacheKey('avalon', 1701, 'inhabitable-v2-1'));
  assert.notEqual(k1, cityCacheKey('avalon', 1702, 'inhabitable-v2-1'));
  assert.notEqual(k1, cityCacheKey('kaiyo', 1701, 'inhabitable-v2-1'));
  assert.notEqual(k1, cityCacheKey('avalon', 1701, 'gen-1'));
  assert.equal(GEN_VERSION, 'inhabitable-v2-18');
});
