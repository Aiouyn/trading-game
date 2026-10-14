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

test('addEntrance places door and lintel on supported ordinary building facades and skips containers', () => {
  const ctx = makeCtx();
  const d = { id: 'oldharbor', tier: 'mid', facade: [0x9c5a43], roof: [0x4a4540] };
  const rec = buildArchetype('house', { x: 0, y: 0, rot: 0, w: 10, dp: 10, h: 8, d, key: 0.1, front: -1 }, ctx);
  const boxes = ctx.parts.g.box;
  // A house normally has 1 body box; with addEntrance it has 2 extra boxes (door + lintel) at z = -10 * 0.8 * 0.5 - 0.025 = -4.025
  const count = boxes.length / 18;
  assert.ok(count >= 3, `expected at least 3 boxes on house, got ${count}`);
  let foundDoor = false;
  for (let i = 0; i < boxes.length; i += 18) {
    if (boxes[i + 13] === rec.id && Math.abs(boxes[i + 2] - (-4.025)) < 1e-4 && Math.abs(boxes[i + 5] - 0.06) < 1e-4) {
      foundDoor = true;
    }
  }
  assert.ok(foundDoor, 'expected door box on front facade at z = -4.025');

  const ctx2 = makeCtx();
  buildArchetype('containers', { x: 0, y: 0, rot: 0, w: 14, dp: 6, h: 8, d, key: 0.1, front: -1 }, ctx2);
  for (let i = 0; i < ctx2.parts.g.box.length; i += 18) {
    assert.notEqual(ctx2.parts.g.box[i + 5], 0.06, 'containers should not receive a door');
  }
});

test('addShopFrontage attaches a dark sign panel and frame above the entrance without altering building footprint or ID', async () => {
  const { addShopFrontage } = await import('../src/archetypes.js');
  const ctx = makeCtx();
  const d = { id: 'oldharbor', tier: 'mid', facade: [0x9c5a43], roof: [0x4a4540] };
  const rec = buildArchetype('row', { x: 15, y: -10, rot: 0, w: 9, dp: 14, h: 12, d, key: 0.2, front: -1 }, ctx);
  const beforeLen = ctx.parts.g.box.length;
  const beforeSnap = { id: rec.id, x: rec.x, y: rec.y, w: rec.w, dp: rec.dp };
  addShopFrontage(ctx.parts, rec);
  assert.ok(ctx.parts.g.box.length > beforeLen, 'expected shop frontage parts added');
  assert.deepEqual({ id: rec.id, x: rec.x, y: rec.y, w: rec.w, dp: rec.dp }, beforeSnap);
});
