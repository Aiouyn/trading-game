// Mean price path of NPC-launched tokens relative to the price 2 ticks after launch (lead probe, spec v1.4). Usage: npx tsx scripts/balance/launchpad-path.ts '{"NPC_KEY":value}'
import { createGame, stepGame } from '../../src/world/game';
import { TPD } from '../../src/world/core';
import { NPC } from '../../src/world/launchpad/constants';
import { spotAt } from '../../src/world/launchpad/curve';
Object.assign(NPC, JSON.parse(process.argv[2] ?? '{}'));
const OFF = [10, 30, 60, 120, 240, 720, 1440, 2880];
const acc: Record<number, number[]> = {}; OFF.forEach((o) => (acc[o] = []));
for (const seed of ['pp-1', 'pp-2']) {
  const g = createGame(seed, { warmupDays: 0, npcs: false, launchpadNpc: true });
  g.market = { ...g.market, tick: 2 * TPD + 1 };
  const base: Record<string, number> = {};
  for (let k = 0; k < 6 * TPD; k++) {
    stepGame(g);
    const s = g.launchpad; if (!s) continue;
    for (const tk of s.order) {
      const t = s.tokens[tk]!; const age = g.market.tick - t.createdTick;
      if (age === 2) base[tk] = spotAt(t.y);
      if (base[tk] && OFF.includes(age)) acc[age]!.push((t.status === 'live' ? spotAt(t.y) : t.status === 'graduated' ? NaN : spotAt(t.y)) / base[tk]! - 1);
    }
  }
}
for (const o of OFF) { const v = acc[o]!.filter((x) => !isNaN(x)); const m = v.reduce((a, b) => a + b, 0) / v.length; const med = v.sort((a, b) => a - b)[v.length >> 1]; const up40 = v.filter((x) => x >= 0.4).length / v.length; console.log(`age ${o}: n=${v.length} mean ${(m * 100).toFixed(2)}% median ${(med * 100).toFixed(2)}% P(>=+40%) ${(up40 * 100).toFixed(1)}%`); }
