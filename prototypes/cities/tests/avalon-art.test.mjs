import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSONALITIES } from '../src/personalities.js';
import { preparePersonality, avalonHeight } from '../src/avalon-art.js';

test('preparePersonality returns other cities unchanged and never mutates its input', () => {
  const kaiyo = PERSONALITIES.kaiyo;
  assert.equal(preparePersonality(kaiyo), kaiyo);
  const avalon = PERSONALITIES.avalon;
  const before = JSON.stringify(avalon.districts.map((d) => d.height));
  const prepared = preparePersonality(avalon);
  assert.notEqual(prepared, avalon);
  assert.equal(JSON.stringify(avalon.districts.map((d) => d.height)), before, 'input personality mutated');
  assert.ok(prepared.districts.every((d, i) => d !== avalon.districts[i] || d.id !== 'oldharbor'));
});

test('Old Harbor keeps a masonry palette and a 3-5 storey band', () => {
  const d = preparePersonality(PERSONALITIES.avalon).districts.find((x) => x.id === 'oldharbor');
  assert.deepEqual(d.height, [14, 0.12, 9, 21]);
  assert.ok(d.height[2] >= 9 && d.height[3] <= 21, 'no towers in the old fabric');
  assert.deepEqual(d.types, [['row', 4], ['midrise', 1]]);
  assert.ok(d.facade.every((c) => d.facade.includes(c)));
  assert.equal(d.interior, false, 'lots must front a real street');
});

test('Gilt Hill keeps scatter placement and low heights', () => {
  const d = preparePersonality(PERSONALITIES.avalon).districts.find((x) => x.id === 'gilthill');
  assert.equal(d.placement, 'scatter');
  assert.ok(d.height[3] <= 15);
});

test('recipes add no roof, interior or customization fields', () => {
  const allowed = new Set(PERSONALITIES.avalon.districts.flatMap((d) => Object.keys(d)));
  // Reject invented per-district customization switches (roof colour, interiors, terraces,
  // planting). Existing layout flags such as `interior` and `placement` are allowed.
  const forbidden = /custom|roofStyle|roofColor|terrace|patio|garden|furnish|awning|decor|upgrade/i;
  for (const d of preparePersonality(PERSONALITIES.avalon).districts) {
    for (const k of Object.keys(d)) {
      assert.ok(!forbidden.test(k), `customization field added by the art recipes: ${k}`);
      assert.ok(allowed.has(k), `unknown district field added by the art recipes: ${k}`);
    }
  }
});

test('avalonHeight is order independent, block correlated and bounded', () => {
  const d = preparePersonality(PERSONALITIES.avalon).districts.find((x) => x.id === 'oldharbor');
  const base = avalonHeight('oldharbor', 12345, 10, 10, 18);
  assert.equal(base, avalonHeight('oldharbor', 12345, 10, 10, 18), 'not deterministic');
  assert.ok(base >= 9 && base <= 21, `outside the district band: ${base}`);
  // same block, neighbouring parcels: a shared cornice within 1.2 m
  const a = avalonHeight('oldharbor', 12345, 10, 10, 18);
  const b = avalonHeight('oldharbor', 12345, 12, 10, 18);
  assert.ok(Math.abs(a - b) <= 1.2, 'adjacent parcels in a block vary too much');
  // different seed must actually change the world
  assert.notEqual(avalonHeight('oldharbor', 12345, 10, 10, 18), avalonHeight('oldharbor', 12345, 10, 10, 18, 1702));
  assert.equal(d.height.length, 4);
});

test('districts without a masonry recipe keep the proposed height', () => {
  assert.equal(avalonHeight('midtown', 1, 0, 0, 120), 120);
  assert.equal(avalonHeight('docks', 1, 0, 0, 12), 12);
});