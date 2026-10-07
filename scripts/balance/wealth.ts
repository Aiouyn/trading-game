/**
 * Wealth-curve balance check (bible Part I: day 1 ~$15k → day 7 ~$500k → day 21 ~$20M for a
 * median engaged player). Simulates a tycoon-minded player who reinvests in the best-payback
 * businesses and upgrades, is online 16 real hours a day, and sleeps 8 (offline rules apply).
 *   npx tsx scripts/balance/wealth.ts [seed] [realDays=7]
 */
import { BUSINESSES, TIERS, UPGRADES, upgradeCost } from '../../src/content/businesses';
import { rankIndex } from '../../src/content/lifestyle';
import { applyCommand, createGame, stepGame } from '../../src/world/game';
import { TPD, cashOf } from '../../src/world/core';
import { CITY_DEMAND } from '../../src/world/assets';
import type { GameState } from '../../src/world/types';

const seed = process.argv[2] ?? 'wealth';
const realDays = Number(process.argv[3] ?? 7);
const g: GameState = createGame(seed, { warmupDays: 1 });
applyCommand(g, 'bot', { type: 'join', handle: 'median', country: 'AV' });
const p = g.players.bot!;
p.onboarding.skipped = true;

const cities = ['avalon', 'nordhaven', 'meridia', 'sundara', 'kaiyo', 'serena'];

function act(gs: GameState): void {
  const rIdx = rankIndex(p.rankId);
  // keep a 5% cash buffer, then buy the best payback we can afford, spreading across cities and sectors
  for (let k = 0; k < 4; k++) {
    const cash = cashOf(gs, 'bot') * 0.95;
    let best: { score: number; run: () => boolean } | null = null;
    for (const d of BUSINESSES) {
      if (d.cost > cash || rankIndex(TIERS[d.tier - 1]!.rank) > rIdx) continue;
      if (Object.values(gs.businesses).filter((b) => b.ownerId === "bot" && BUSINESSES.find((x) => x.id === b.defId)!.tier === d.tier).length >= TIERS[d.tier - 1]!.max) continue;
      for (const c of cities) {
        const city = c === 'avalon' ? 0 : c === 'nordhaven' || c === 'meridia' ? 2 : c === 'serena' ? 4 : 3;
        if (rIdx < city) continue;
        const crowd = Object.values(gs.businesses).filter((b) => b.cityId === c && BUSINESSES.find((x) => x.id === b.defId)!.sector === d.sector).length;
        const score = (d.income * (CITY_DEMAND[c] ?? 1)) / d.cost / (1 + 0.25 * crowd) + d.cost / 1e12;
        if (!best || score > best.score) best = { score, run: () => applyCommand(gs, 'bot', { type: 'biz.buy', defId: d.id, cityId: c }).ok };
      }
    }
    // save up for the next tier: while one is unlocked with a free slot, only cheap upgrades
    const mineByTier = (t: number) => Object.values(gs.businesses).filter((b) => b.ownerId === "bot" && BUSINESSES.find((x) => x.id === b.defId)!.tier === t).length;
    const goal = BUSINESSES.filter((d) => rankIndex(TIERS[d.tier - 1]!.rank) <= rIdx && d.cost > cash && mineByTier(d.tier) < TIERS[d.tier - 1]!.max).sort((a, b) => b.tier - a.tier || a.cost - b.cost)[0];
    const upgradeCap = goal ? goal.cost * 0.03 : Infinity;
    for (const b of Object.values(gs.businesses)) {
      if (b.ownerId !== "bot") continue;
      const def = BUSINESSES.find((x) => x.id === b.defId)!;
      for (const u of UPGRADES) {
        const lvl = b.levels[u.id];
        if (lvl >= 5 || u.id === 'automation' && lvl >= 2) continue;
        const cost = upgradeCost(def.cost, lvl);
        if (cost > cash || cost > upgradeCap) continue;
        const gain = u.id === 'staff' ? 0.12 : u.id === 'equipment' ? 0.1 : u.id === 'research' ? 0.08 : u.id === 'location' ? 0.1 : u.id === 'marketing' ? 0.1 : 0.05;
        const score = (b.incomePerDay * gain) / cost;
        if (!best || score > best.score) best = { score, run: () => applyCommand(gs, 'bot', { type: 'biz.upgrade', bizId: b.id, axis: u.id }).ok };
      }
    }
    if (!best || !best.run()) break;
  }
  for (const c of p.contracts) if (c.done && !c.claimed) applyCommand(gs, 'bot', { type: 'contract.claim', contractId: c.id });
}

const t0 = Date.now();
const checkpoints = new Map<number, number>();
const totalTicks = realDays * 24 * TPD;
for (let t = 0; t < totalTicks; t++) {
  const hourOfRealDay = Math.floor((t / TPD) % 24);
  const online = hourOfRealDay < 16;
  if (p.online !== online) applyCommand(g, 'bot', { type: 'presence', online });
  stepGame(g);
  if (online && t % 120 === 0) act(g);
  if ((t + 1) % (24 * TPD) === 0) {
    const day = (t + 1) / (24 * TPD);
    checkpoints.set(day, p.netWorth);
    const inc = Object.values(g.businesses).filter((b) => b.ownerId === 'bot').reduce((s, b) => s + b.incomePerDay, 0);
    console.log(`real day ${day}: net worth $${Math.round(p.netWorth).toLocaleString('en-US')} · rank ${p.rankId} · ${Object.values(g.businesses).filter((b) => b.ownerId === 'bot').length} businesses · $${Math.round(inc).toLocaleString('en-US')}/game day · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
const target: Record<number, number> = { 1: 15_000, 7: 500_000, 21: 20_000_000 };
for (const [d, v] of checkpoints) if (target[d]) console.log(`day ${d}: ${(v / target[d]!).toFixed(2)}× the bible target`);
