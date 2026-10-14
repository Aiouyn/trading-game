import test from 'node:test';
import assert from 'node:assert/strict';
import { Parts, buildArchetype } from '../src/archetypes.js';
import { rng } from '../src/noise.js';

function makeCtx() {
  const buildings = [];
  return {
    P: { id: 'avalon', palette: { tree: [0x4a6b3f, 0x5c7c4e, 0x3b5832] } },
    R: rng(1701),
    parts: new Parts(),
    heightAt: () => 2,
    dWaterAt: () => 50,
    distAt: () => ({ id: 'oldharbor', tier: 'mid', facade: [0x9c5a43], roof: [0x4a4540] }),
    addBuilding: (rec) => { rec.id = buildings.length + 1; buildings.push(rec); return rec.id; },
  };
}

test('buildArchetype retains entrance front orientation', () => {
  const ctx = makeCtx();
  const d = { id: 'oldharbor', tier: 'mid', facade: [0x9c5a43], roof: [0x4a4540] };
  const rec = buildArchetype('row', { x: 10, y: 20, rot: 0, w: 8, dp: 12, h: 12, d, key: 0.2, front: 1 }, ctx);
  assert.equal(rec.front, 1);
  const recDefault = buildArchetype('row', { x: 20, y: 20, rot: 0, w: 8, dp: 12, h: 12, d, key: 0.2 }, ctx);
  assert.equal(recDefault.front, -1);
});
