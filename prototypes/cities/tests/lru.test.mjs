import test from 'node:test';
import assert from 'node:assert/strict';
import { LRU } from '../src/lru.js';

test('LRU bounds size, refreshes order on get, and replaces existing keys without growing', () => {
  const cache = new LRU(2);
  cache.set('avalon', { id: 'avalon' });
  cache.set('kaiyo', { id: 'kaiyo' });
  assert.equal(cache.size, 2);
  // Access avalon so kaiyo becomes oldest
  assert.equal(cache.get('avalon')?.id, 'avalon');
  // Replacing avalon does not grow size
  cache.set('avalon', { id: 'avalon-2' });
  assert.equal(cache.size, 2);
  // Adding meridia evicts kaiyo
  cache.set('meridia', { id: 'meridia' });
  assert.equal(cache.size, 2);
  assert.equal(cache.has('kaiyo'), false);
  assert.equal(cache.get('avalon')?.id, 'avalon-2');
  assert.equal(cache.get('meridia')?.id, 'meridia');
  assert.deepEqual(cache.keys(), ['avalon', 'meridia']);
});
