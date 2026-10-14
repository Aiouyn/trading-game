import test from 'node:test';
import assert from 'node:assert/strict';
import { SegGrid } from '../src/roadgraph.js';
import { planEntranceAccess, resolveEntranceAccess, collectGoalCandidates, thresholdOf } from '../src/entrance-access.js';

function makeEnv({ isWater = () => false, isBlocked = () => false, heightAt = () => 1 } = {}) {
  return { isWater, isBlocked, heightAt };
}

test('driveway checks its full 3.4m width, including the goal and entrance', () => {
  const net = new SegGrid(12);
  net.add(-30, -15, 30, -15, 3.5, { cls: 2, edgeId: 5 });
  const lot = { x: 0, y: 0, rot: 0, hw: 5, hd: 5, type: 'house', front: -1, d: { tier: 'rural' } };
  const result = resolveEntranceAccess({ lot, net, isWater: (x) => Math.abs(x) > 1.4 });
  assert.equal(result.status, 'unserviceable', '4m farm corridor cannot fit on a 2.8m dry strip');
});

test('a blocked street goal or threshold is never exempt from collision checks', () => {
  const net = new SegGrid(12);
  net.add(-30, -12, 30, -12, 3.5, { cls: 2, edgeId: 5 });
  const lot = { x: 0, y: 0, rot: 0, hw: 5, hd: 5, type: 'house', front: -1, d: { tier: 'mid' } };
  assert.equal(resolveEntranceAccess({ lot, net, isBlocked: () => true }).status, 'unserviceable');
});

test('rear wall near a road does not pass when front entrance faces away and is blocked', () => {
  // Street runs along y = 7 (behind building). Building at (0,0), dp=10, front=-1 -> entrance at (0, -5), rear at (0, +5)
  const net = new SegGrid(12);
  net.add(-20, 7, 20, 7, 3.5, { cls: 2, edgeId: 1, a: 0, b: 1 });
  const lot = { x: 0, y: 0, rot: 0, hw: 4, hd: 5, dp: 10, front: -1, type: 'row', d: { tier: 'mid' } };
  // Block everything in front of building (y <= -4) except threshold itself, and building footprint itself (-4..4, -5..5)
  const res = resolveEntranceAccess({
    lot,
    net,
    ...makeEnv({
      isBlocked: (x, y) => {
        if (Math.abs(x) <= 4 && y > -4.8 && y <= 5) return true; // building interior
        if (y < -5.5) return true; // wall blocking front
        if (Math.abs(x) <= 20 && y >= -5.5 && y <= 5 && Math.abs(x) > 0.5) return true; // side walls blocking detour
        return false;
      },
    }),
  });
  assert.equal(res.status, 'unserviceable');
  assert.ok(res.reason);
});

test('excludes rail, open-water segments and elevated bridge decks as street goals', () => {
  const net = new SegGrid(12);
  net.add(-20, -8, 20, -8, 3.5, { cls: 3, edgeId: 10, rail: true });
  net.add(-20, -9, 20, -9, 3.5, { cls: 3, edgeId: 11, bridge: true });
  net.add(-20, -10, 20, -10, 3.5, { cls: 3, edgeId: 12 }); // on water
  const cands = collectGoalCandidates([0, -5], net, 30, {
    isWater: (x, y) => y <= -9.5,
    isBridgeAt: (x, y, tag) => Boolean(tag?.bridge),
  });
  assert.equal(cands.length, 0);
});

test('direct entry, obstacle detour and shared public lane succeed with explicit path.kind and threshold-to-gate', () => {
  const net = new SegGrid(12);
  net.add(-30, -12, 30, -12, 3.5, { cls: 2, edgeId: 5, a: 0, b: 1 });
  // House has depthFactor 0.8 -> threshold at y = -4, gate at y = -5
  const houseLot = { x: 0, y: 0, rot: 0, hw: 5, hd: 5, dp: 10, front: -1, type: 'house', d: { tier: 'outer' } };
  const thr = thresholdOf(houseLot);
  assert.deepEqual(thr, [0, -4]);

  // Direct route
  const direct = resolveEntranceAccess({
    lot: houseLot,
    net,
    ...makeEnv(),
  });
  assert.equal(direct.status, 'served');
  assert.equal(direct.edgeId, 5);
  assert.ok(['pedestrian', 'driveway', 'track'].includes(direct.path.kind));
  assert.deepEqual(direct.path.pts[0], [0, -4]);

  // Obstacle detour around (0, -7)
  const detoured = resolveEntranceAccess({
    lot: houseLot,
    net,
    ...makeEnv({
      isBlocked: (x, y) => Math.abs(x) <= 2 && y <= -6 && y >= -7.5,
    }),
  });
  assert.equal(detoured.status, 'served');
  assert.equal(detoured.edgeId, 5);
  assert.ok(detoured.path.pts.some(([x]) => Math.abs(x) > 2));
});

test('reserving an entrance corridor prevents a second adjacent lot from blocking the first entrance', async () => {
  const { reserveLotCorridor } = await import('../src/entrance-access.js');
  const occ = new Uint8Array(100 * 100);
  const cellAt = (x, y) => {
    const i = Math.floor((x + 50) / 1), j = Math.floor((y + 50) / 1);
    return i < 0 || j < 0 || i >= 100 || j >= 100 ? -1 : j * 100 + i;
  };
  // First lot at (0, 0) with front = -1 (entrance at (0, -5) reaching street at (0, -11))
  reserveLotCorridor({ x: 0, y: 0, rot: 0, hw: 4, hd: 5, front: -1 }, [0, -11], 2.0, (x, y) => {
    const k = cellAt(x, y);
    if (k >= 0) occ[k] = 1;
  });
  // A second lot attempting to sit in front of the first lot at (0, -8) must see occupied cells
  assert.equal(occ[cellAt(0, -8)], 1);
});
