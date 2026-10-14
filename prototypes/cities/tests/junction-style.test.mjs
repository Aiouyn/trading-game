import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleJunctionArm } from '../src/junction-style.js';

test('eligibleJunctionArm allows at-grade sidewalked class >= 3 junctions and rejects driveways, rail, bridges, docks and duplicates', () => {
  const seen = new Set();
  const base = {
    nodeId: 4,
    armId: '10:a',
    degree: 3,
    cls: 3,
    walk: 2,
    length: 25,
    rail: false,
    bridge: false,
    portService: false,
    seen,
  };
  assert.equal(eligibleJunctionArm(base), true);
  // Duplicate nodeId + armId rejected
  assert.equal(eligibleJunctionArm(base), false);

  assert.equal(eligibleJunctionArm({ ...base, armId: '11:a', degree: 2, seen: new Set() }), false);
  assert.equal(eligibleJunctionArm({ ...base, armId: '12:a', cls: 2, seen: new Set() }), false);
  assert.equal(eligibleJunctionArm({ ...base, armId: '13:a', cls: 1, seen: new Set() }), false);
  assert.equal(eligibleJunctionArm({ ...base, armId: '14:a', walk: 0, seen: new Set() }), false);
  assert.equal(eligibleJunctionArm({ ...base, armId: '15:a', length: 12, seen: new Set() }), false);
  assert.equal(eligibleJunctionArm({ ...base, armId: '16:a', rail: true, seen: new Set() }), false);
  assert.equal(eligibleJunctionArm({ ...base, armId: '17:a', bridge: true, seen: new Set() }), false);
  assert.equal(eligibleJunctionArm({ ...base, armId: '18:a', portService: true, seen: new Set() }), false);
});
