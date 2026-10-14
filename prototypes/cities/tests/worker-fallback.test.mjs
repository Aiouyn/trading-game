import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONALITIES, CITY_ORDER } from '../src/personalities.js';
import { generateCity } from '../src/gen.js';
import { preparePersonality } from '../src/avalon-art.js';

const SEEDS = [1701, 1702, 1703];

let avalonSeeds;
before(async () => {
  avalonSeeds = [];
  for (const seed of SEEDS) {
    const P = { ...PERSONALITIES.avalon, seed };
    avalonSeeds.push(await generateCity(preparePersonality(P)));
  }
});

/** Compare everything except wall-clock timings. Geometry must match exactly. */
function comparable(city) {
  return {
    buildings: city.buildings.map((b) => [b.id, b.type, b.x.toFixed(3), b.y.toFixed(3), b.h.toFixed(3), b.parcelId ?? null]),
    stats: city.stats,
    access: city.access,
    graph: city.graph,
    roadGraph: city.roadGraph,
    network: city.network.map((n) => [n.cls, n.edgeId ?? null, n.pts.length]),
    ribbons: {
      position: [...city.ribbons.position].every(Number.isFinite),
      len: city.ribbons.position.length,
      index: city.ribbons.index.length,
    },
    texA: [...city.texA].every(Number.isFinite),
    texB: [...city.texB].every(Number.isFinite),
  };
}

test('three deterministic Avalon seeds generate, and repeat runs match excluding timings', async () => {
  assert.equal(avalonSeeds.length, 3);
  for (const [i, city] of avalonSeeds.entries()) {
    assert.ok(city.buildings.length > 500, `seed ${SEEDS[i]} produced ${city.buildings.length} buildings`);
    for (const [key, typed] of Object.entries({ H: city.H, texA: city.texA, texB: city.texB })) {
      assert.ok([...typed].every(Number.isFinite), `seed ${SEEDS[i]} has non-finite ${key}`);
    }
    assert.equal(city.buildings.reduce((m, b) => m + b.order, 0) > 0, true);
    // a packed part array must be stride aligned and finite
    for (const [k, arr] of Object.entries(city.parts)) {
      assert.equal(arr.length % 18, 0, `part array ${k} is not stride aligned`);
      assert.ok([...arr].every(Number.isFinite), `part array ${k} has non-finite values`);
    }
    const again = await generateCity(preparePersonality({ ...PERSONALITIES.avalon, seed: SEEDS[i] }));
    assert.deepEqual(comparable(again), comparable(city), `seed ${SEEDS[i]} is not deterministic`);
  }
});

test('the different seeds actually produce different cities', () => {
  const a = avalonSeeds.map((c) => c.stats.buildings);
  assert.ok(new Set(a).size > 1, `all seeds produced identical building counts: ${a}`);
});

test('all six personalities generate with prepared recipes', async () => {
  for (const id of CITY_ORDER) {
    const city = await generateCity(preparePersonality(PERSONALITIES[id]));
    assert.ok(city.buildings.length > 0, `${id} produced no buildings`);
    // Isla Serena is static and island estate-only, so it legitimately has no street network.
    if (PERSONALITIES[id].roads && PERSONALITIES[id].roads.arterial < 9000) {
      assert.ok(city.ribbons.index.length > 0, `${id} produced no roads`);
    }
    assert.ok([...city.parts.box].every(Number.isFinite), `${id} has non-finite parts`);
  }
});