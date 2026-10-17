import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNoise } from '../src/noise.js';

test('allocation-free gradient sampling preserves the existing seeded noise exactly', () => {
  const inputs = [[0, 0], [0.125, 1.75], [-12.4, 33.7], [100.01, -50.3]];
  const fixtures = [
    [1701, [[0, 0.1405717365341995], [-0.3673765685278714, -0.23372937458516724], [-0.5705303975764715, -0.35216924120213083], [0.22248908562617808, 0.17005675808147766]]],
    [4242, [[0, -0.1268793146235546], [-0.4026915500970892, -0.33688271596179026], [-0.46019426835956556, -0.3511444204749933], [-0.39914658654007684, -0.14024061353189535]]],
  ];
  for (const [seed, expected] of fixtures) {
    const n = makeNoise(seed);
    assert.deepEqual(inputs.map(p => [n.noise(...p), n.fbm(...p, 3)]), expected);
  }
});
