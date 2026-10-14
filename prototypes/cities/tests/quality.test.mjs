import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, qualityWindow } from '../src/quality.js';

test('qualityWindow drops tier only after 3 consecutive slow active windows and ignores idle, hidden or manual', () => {
  assert.equal(QUALITY.high.dpr, 1.5);
  assert.equal(QUALITY.balanced.detail, 0.5);
  assert.equal(QUALITY.low.detail, 0);

  let state = { tier: 'high', slow: 0 };
  state = qualityWindow(state, { p95: 40, active: true, hidden: false, manual: false });
  assert.deepEqual(state, { tier: 'high', slow: 1 });
  state = qualityWindow(state, { p95: 40, active: true, hidden: false, manual: false });
  assert.deepEqual(state, { tier: 'high', slow: 2 });

  // Idle or hidden window is ignored without advancing or resetting slow pressure
  assert.deepEqual(qualityWindow(state, { p95: 50, active: false, hidden: false, manual: false }), { tier: 'high', slow: 2 });
  assert.deepEqual(qualityWindow(state, { p95: 50, active: true, hidden: true, manual: false }), { tier: 'high', slow: 2 });
  assert.deepEqual(qualityWindow(state, { p95: 50, active: true, hidden: false, manual: true }), { tier: 'high', slow: 2 });

  // Fast active window resets pressure
  assert.deepEqual(qualityWindow(state, { p95: 16, active: true, hidden: false, manual: false }), { tier: 'high', slow: 0 });

  // 3rd consecutive slow active window drops high -> balanced, then balanced -> low, and never oscillates up
  state = qualityWindow(state, { p95: 38, active: true, hidden: false, manual: false });
  assert.deepEqual(state, { tier: 'balanced', slow: 0 });
  for (let i = 0; i < 3; i++) state = qualityWindow(state, { p95: 38, active: true, hidden: false, manual: false });
  assert.deepEqual(state, { tier: 'low', slow: 0 });
  state = qualityWindow(state, { p95: 8, active: true, hidden: false, manual: false });
  assert.deepEqual(state, { tier: 'low', slow: 0 });
});
