import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONALITIES } from '../src/personalities.js';
import { generateCity } from '../src/gen.js';
import { auditCityAccess } from '../src/access-audit.js';

let avalon;
before(async () => {
  avalon = await generateCity(PERSONALITIES.avalon);
});

function fixture({ width = 4, water = false, obstacle = false, grade = false } = {}) {
  const N = 40, RES = 1, S = 40;
  const H = Float32Array.from({ length: N * N }, (_, k) => {
    const x = k % N - 19.5, y = Math.floor(k / N) - 19.5;
    return water && x > 1 ? -1 : grade ? 2 + y * 0.14 : 2;
  });
  const building = { id: 1, x: 0, y: 0, rot: 0, w: 4, dp: 4, type: 'row', front: -1,
    accessMode: 'road', entryThreshold: [0, -2], entryGate: [0, -2],
    accessPath: { kind: 'track', width, edgeId: 0, pts: [[0, -2], [0, -10]] } };
  return { P: { id: 'avalon', seed: 1 }, N, RES, S, H,
    buildings: [building, ...(obstacle ? [{ id: 2, x: 1.5, y: -6, rot: 0, w: 1, dp: 2, accessMode: 'landmark' }] : [])],
    roadGraph: { nodes: [[-10, -12], [10, -12]], edges: [{ id: 0, a: 0, b: 1, cls: 4, pts: [[-10, -12], [10, -12]] }] },
    network: [{ cls: 4, edgeId: 0, hw: [2, 2] }] };
}

test('buildings without recorded access paths are reported as legacy, never as a pass', () => {
  const city = fixture();
  city.buildings[0].accessPath = undefined;
  const report = auditCityAccess(city);
  assert.equal(report.occupiedInvalid, 0);
  assert.equal(report.legacyUnaudited, 1);
  assert.equal(report.auditedRoadServed, 0);
});

test('independent audit rejects water and footprints at the full corridor edge', () => {
  assert.equal(auditCityAccess(fixture()).occupiedInvalid, 0);
  assert.ok(auditCityAccess(fixture({ water: true })).failures.some(f => f.reason === 'corridor-water-crossing'));
  assert.ok(auditCityAccess(fixture({ obstacle: true })).failures.some(f => f.reason === 'footprint-collision'));
});

test('vehicle grade limit is 0.12, without an extra permissive tolerance', () => {
  assert.ok(auditCityAccess(fixture({ grade: true })).failures.some(f => f.reason === 'excessive-grade'));
});

test('Avalon passes independent access audit with occupiedInvalid = 0', () => {
  const report = auditCityAccess(avalon);
  assert.equal(report.occupiedInvalid, 0, JSON.stringify(report.failures.slice(0, 5)));
  assert.ok(report.auditedRoadServed > 0);
});

test('audit catches broken path starting away from entrance, crossing water, or connecting to isolated road', () => {
  const target = avalon.buildings.find((b) => b.accessMode === 'road');
  assert.ok(target);

  // 1. Broken start point (rear wall shortcut)
  const brokenStart = {
    ...avalon,
    buildings: avalon.buildings.map((b) =>
      b.id === target.id
        ? { ...b, accessPath: { ...b.accessPath, pts: [[b.entryThreshold[0] + 10, b.entryThreshold[1] + 10], ...b.accessPath.pts.slice(1)] } }
        : b
    ),
  };
  assert.ok(auditCityAccess(brokenStart).occupiedInvalid > 0);

  // 2. Unreachable isolated road component (not connected to any arterial)
  const isolatedEdgeId = 999999;
  const n0 = avalon.roadGraph.nodes.length, n1 = n0 + 1;
  const endPt = target.accessPath.pts[target.accessPath.pts.length - 1];
  const brokenIsolated = {
    ...avalon,
    roadGraph: {
      nodes: [...avalon.roadGraph.nodes, [endPt[0], endPt[1]], [endPt[0] + 20, endPt[1]]],
      edges: [...avalon.roadGraph.edges, { id: isolatedEdgeId, a: n0, b: n1, cls: 2, level: 'local', pts: [[endPt[0], endPt[1]], [endPt[0] + 20, endPt[1]]] }],
    },
    buildings: avalon.buildings.map((b) =>
      b.id === target.id
        ? { ...b, accessPath: { ...b.accessPath, edgeId: isolatedEdgeId } }
        : b
    ),
  };
  const isoReport = auditCityAccess(brokenIsolated);
  assert.ok(isoReport.occupiedInvalid > 0);
  assert.ok(isoReport.failures.some((f) => f.reason === 'isolated-road-component'));
});
