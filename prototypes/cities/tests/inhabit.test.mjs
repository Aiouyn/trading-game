import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, lease, rename, upgrade, validateStoredState } from '../src/inhabit.js';

const units = [
  { id: 'p1/shop-1', buildingId: 'b1', ownerId: 'city:avalon', use: 'shop', leasable: true, cost: 600 },
  { id: 'p1/shop-2', buildingId: 'b1', ownerId: 'city:avalon', use: 'shop', leasable: true, cost: 800 },
  { id: 'p1/upstairs-1', buildingId: 'b1', ownerId: 'city:avalon', use: 'office', leasable: false, occupantId: 'npc:harbor-ledger', cost: 0 },
];

test('leasing changes occupancy and cash, never building ownership, and coexists with a second tenant in the same building', () => {
  const before = initialState('avalon:1701:v2');
  const after = lease(before, units, units[0].id);
  assert.equal(after.cash, 4400);
  assert.equal(before.cash, 5000);
  assert.equal(units[0].ownerId, 'city:avalon');
  assert.equal(units[2].occupantId, 'npc:harbor-ledger');
  assert.equal(after.leases[units[0].id].companyId, 'demo:company');
  assert.throws(() => lease(after, units, units[0].id), /already-leased/);
  assert.throws(() => lease(after, units, 'missing-unit'), /unavailable-unit/);
  assert.throws(() => lease(after, units, units[2].id), /unavailable-unit/);
  assert.equal(Object.keys(lease(after, units, units[1].id).leases).length, 2);
});

test('insufficient cash cannot partially mutate the state', () => {
  const before = { ...initialState('w'), cash: 10 };
  assert.throws(() => lease(before, units, units[0].id), /insufficient-cash/);
  assert.equal(before.cash, 10);
  assert.deepEqual(before.leases, {});
});

test('name is safe text and frontage improves once', () => {
  const held = lease(initialState('w'), units, units[0].id);
  assert.equal(rename(held, ' A&B   Coffee ').company.name, 'A&B Coffee');
  assert.throws(() => rename(held, '<script>'), /invalid-name/);
  assert.throws(() => rename(held, '   '), /invalid-name/);
  assert.throws(() => rename(held, 'x'.repeat(33)), /invalid-name/);
  const improved = upgrade(held, units[0].id);
  assert.equal(improved.cash, 4100);
  assert.equal(improved.leases[units[0].id].stage, 1);
  assert.throws(() => upgrade(improved, units[0].id), /already-improved/);
  assert.throws(() => upgrade(held, 'p1/shop-2'), /not-leased/);
});

test('validateStoredState rejects corrupt or stale worldKey payloads', () => {
  const valid = lease(initialState('avalon:1701:v2'), units, units[0].id);
  assert.equal(validateStoredState({ schema: 1, worldKey: 'avalon:1701:v2', state: valid }, 'avalon:1701:v2', units).status, 'ok');
  assert.equal(validateStoredState({ schema: 1, worldKey: 'avalon:1701:old', state: valid }, 'avalon:1701:v2', units).status, 'stale');
  assert.equal(validateStoredState({ schema: 99, worldKey: 'avalon:1701:v2', state: valid }, 'avalon:1701:v2', units).status, 'invalid');
  assert.equal(validateStoredState(null, 'avalon:1701:v2', units).status, 'empty');
});

test('buildDemoUnits selects deterministic serviced shop premises in Old Harbor, Westbank and Northgate plus multi-tenant unit', async () => {
  const { buildDemoUnits } = await import('../src/demo-units.js');
  const { PERSONALITIES } = await import('../src/personalities.js');
  const { generateCity } = await import('../src/gen.js');
  const city = await generateCity(PERSONALITIES.avalon);
  const res1 = buildDemoUnits(city);
  const res2 = buildDemoUnits(city);
  assert.deepEqual(res1, res2);
  assert.equal(res1.offers.length, 3);
  assert.deepEqual(res1.offers.map(o => o.districtId), ['oldharbor', 'westbank', 'northgate']);
  assert.deepEqual(res1.offers.map(o => o.cost), [600, 800, 1000]);
  for (const offer of res1.offers) {
    assert.equal(offer.available, true);
    assert.ok(offer.id.endsWith('/ground/shop-1'));
    assert.equal(offer.ownerId, 'city:avalon');
    assert.equal(offer.use, 'shop');
    assert.equal(offer.leasable, true);
    const b = city.buildings[offer.buildingId - 1];
    assert.ok(b.accessPath && b.accessPath.pts.length >= 2);
    assert.ok(!b.company && !b.crown && b.kind !== 'Landmark');
  }
  // Multi-occupancy: at least one building has a second non-leasable unit
  const multi = res1.units.filter(u => !u.leasable);
  assert.equal(multi.length, 1);
  assert.equal(multi[0].buildingId, res1.offers[0].buildingId);
});
