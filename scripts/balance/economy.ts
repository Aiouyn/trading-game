/**
 * Five-year world economy check (Phase 4 O-6, docs/V1-PHASE4.md 2.2b). Runs the world (game.ts) headless with NPC
 * competition present and three styled human-like players, and reports the money supply, the stabilizer, the faucet and
 * sink split and median net worth by rank. run.ts is the market-engine harness (no businesses, no shops, no stabilizer),
 * so it cannot run this check; this script is the world-level one.
 *
 * Styles (as in wealth.ts): average (well-run settings, online 16 of 24 game days), managed (2-star manager hired at
 * each purchase, well-run settings, once per 24 game days), neglected (sets nothing, once per 24 game days). Each style
 * buys the best income per dollar its cash and rank allow, and starts from the join grant (no credit).
 *
 *   npx tsx scripts/balance/economy.ts [seed=econ-1] [years=5]
 *
 * Output: one JSON line per game year (`kind: "year"`), a progress line every 28 game days (`kind: "progress"`) so a long
 * run shows it is moving, and a final line (`kind: "final"`). The supply is the stabilizer's measure: positive net worth
 * per player (boards.ts stabilizerSupply). The target growth is 1% per game day (STABILIZER_TARGET).
 */
import { BUSINESSES, TIERS } from '../../src/content/businesses';
import { rankIndex } from '../../src/content/lifestyle';
import { SHOP } from '../../src/content/shops';
import { applyCommand, createGame, stepGame } from '../../src/world/game';
import { STABILIZER_TARGET, stabilizerSupply } from '../../src/world/boards';
import { TPD, bizDef, cashOf } from '../../src/world/core';
import { wellRunCommands } from '../../src/world/shops';
import { managerPrepayCost } from '../../src/world/shopRules';
import type { GameState } from '../../src/world/types';

type Style = 'average' | 'managed' | 'neglected';
const STYLES: Style[] = ['average', 'managed', 'neglected'];
const CITIES = ['avalon', 'nordhaven', 'meridia', 'sundara', 'kaiyo', 'serena'];
const YEAR_DAYS = 252;
const PROGRESS_DAYS = 28;
/** Managed style hires a 2-star manager at purchase (S3). */
const MANAGED_STARS = 2;

const [seed = 'econ-1', yearsArg = '5'] = process.argv.slice(2);
const years = Number(yearsArg);
const DAYS = Math.round(years * YEAR_DAYS);

/** Online pattern as in wealth.ts: once per 24 game days for managed and neglected, 16 of 24 for average. */
function online(style: Style, day: number): boolean {
  if (style === 'average') return day % 24 < 16;
  return day % 24 === 0;
}

/**
 * Buys the best income per dollar the cash and rank allow (up to four a check-in). A managed purchase only happens when
 * the cash also covers the prepaid manager salary, and the hire is asserted, so a managed owner is never left unmanaged.
 */
function buyGreedy(g: GameState, pid: string, style: Style): void {
  const p = g.players[pid]!;
  const r = rankIndex(p.rankId);
  for (let k = 0; k < 4; k++) {
    const cash = cashOf(g, pid) * 0.9;
    const mine = Object.values(g.businesses).filter((b) => b.ownerId === pid);
    const count = (tier: number) => mine.filter((b) => bizDef(b).tier === tier).length;
    const need = (d: { cost: number; income: number }) => d.cost + (style === 'managed' ? managerPrepayCost(MANAGED_STARS, d.income) : 0);
    const best = BUSINESSES.filter((d) => need(d) <= cash && rankIndex(TIERS[d.tier - 1]!.rank) <= r && count(d.tier) < TIERS[d.tier - 1]!.max)
      .sort((a, b) => b.income / b.cost - a.income / a.cost || a.id.localeCompare(b.id))[0];
    if (!best) return;
    // a city locked at the player's rank refuses the purchase, so try the cities in rotation until one takes it
    const first = (mine.length + (pid.length * 7)) % CITIES.length;
    let bizId: string | null = null;
    for (let c = 0; c < CITIES.length && bizId === null; c++) {
      const r2 = applyCommand(g, pid, { type: 'biz.buy', defId: best.id, cityId: CITIES[(first + c) % CITIES.length]! });
      if (r2.ok) bizId = (r2.data as { id: string }).id;
    }
    if (bizId === null) return;
    if (style === 'managed') {
      const hire = applyCommand(g, pid, { type: 'biz.manager.hire', bizId, stars: MANAGED_STARS });
      if (!hire.ok) throw new Error(`manager hire failed for ${pid}: ${hire.error}`);
    }
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
}

const g: GameState = createGame(seed, { warmupDays: 2, npcs: true });
const pids: Record<Style, string> = { average: 'econ-average', managed: 'econ-managed', neglected: 'econ-neglected' };
for (const st of STYLES) {
  applyCommand(g, pids[st], { type: 'join', handle: pids[st], country: 'AV' });
  g.players[pids[st]]!.onboarding.skipped = true;
}
const supply = () => stabilizerSupply(g);
const sums = (rec: Record<string, number>) => Object.values(rec).reduce((a, b) => a + b, 0);
const start = g.market.tick;
let lastDay = -1;
let engaged = 0;
let engagements = 0;
let wasEngaged = false;
let daysOverTarget = 0;
let maxSink = 1;
let maxDailyGrowth = -Infinity;
let prevSupply = 0;
let startSupply = 0;
let yearStartSupply = 0;
let yearStartFaucets = 0;
let yearStartSinks = 0;
let yearStartShopSinks = 0;
let yearEngaged = 0;

const yearRows: Record<string, unknown>[] = [];

for (let t = 0; t < DAYS * TPD; t++) {
  const day = Math.floor((g.market.tick - start) / TPD);
  if ((g.market.tick - start) % TPD === 0 && day !== lastDay) {
    lastDay = day;
    for (const st of STYLES) {
      const pid = pids[st];
      const on = online(st, day);
      if (g.players[pid]!.online !== on) applyCommand(g, pid, { type: 'presence', online: on });
      if (!on) continue;
      buyGreedy(g, pid, st);
      if (st !== 'neglected') {
        for (const b of Object.values(g.businesses)) if (b.ownerId === pid) for (const c of wellRunCommands(b.id)) applyCommand(g, pid, c);
      }
    }
    const s = supply();
    if (day === 0) startSupply = s;
    if (prevSupply > 0) {
      const growth = s / prevSupply - 1;
      maxDailyGrowth = Math.max(maxDailyGrowth, growth);
      if (growth > STABILIZER_TARGET) daysOverTarget++;
    }
    prevSupply = s;
    const engagedNow = g.economy.stabilizer.sinkMult > 1.0005;
    if (engagedNow) { engaged++; yearEngaged++; if (!wasEngaged) engagements++; }
    wasEngaged = engagedNow;
    maxSink = Math.max(maxSink, g.economy.stabilizer.sinkMult);
    if (yearStartSupply === 0) {
      yearStartSupply = s;
      yearStartFaucets = sums(g.economy.faucets);
      yearStartSinks = sums(g.economy.sinks);
      yearStartShopSinks = Object.entries(g.economy.sinks).filter(([k]) => k.startsWith('shop')).reduce((a, [, v]) => a + v, 0);
    }
    if ((day + 1) % PROGRESS_DAYS === 0) {
      console.log(JSON.stringify({ kind: 'progress', seed, day: day + 1, supply: Math.round(s), sinkMult: Number(g.economy.stabilizer.sinkMult.toFixed(3)), engagedDays: engaged }));
    }
    if ((day + 1) % YEAR_DAYS === 0) {
      const faucets = sums(g.economy.faucets);
      const sinks = sums(g.economy.sinks);
      const shopSinks = Object.entries(g.economy.sinks).filter(([k]) => k.startsWith('shop')).reduce((a, [, v]) => a + v, 0);
      const yearDays = YEAR_DAYS;
      yearRows.push({
        kind: 'year', seed, year: (day + 1) / YEAR_DAYS, day: day + 1,
        supply: Math.round(s),
        supplyGrowthYear: Number((s / yearStartSupply - 1).toFixed(4)),
        supplyGrowthPerDay: Number(((s / yearStartSupply) ** (1 / yearDays) - 1).toFixed(5)),
        faucetsYear: Math.round(faucets - yearStartFaucets), sinksYear: Math.round(sinks - yearStartSinks),
        shopSinkShareYear: Number(((shopSinks - yearStartShopSinks) / Math.max(1, sinks - yearStartSinks)).toFixed(3)),
        stabilizerDaysEngagedYear: yearEngaged, stabilizerDaysEngagedTotal: engaged, engagements,
        maxSinkMult: Number(maxSink.toFixed(3)), moneyIndex: Number(g.economy.moneyIndex.toFixed(3)),
        styles: Object.fromEntries(STYLES.map((st) => [st, Math.round(g.players[pids[st]]!.netWorth)])),
      });
      yearStartSupply = s;
      yearStartFaucets = faucets;
      yearStartSinks = sinks;
      yearStartShopSinks = shopSinks;
      yearEngaged = 0;
      console.log(JSON.stringify(yearRows[yearRows.length - 1]));
    }
  }
  stepGame(g);
}

const byRank = (ids: string[]) => {
  const out: Record<string, { n: number; median: number }> = {};
  const groups = new Map<string, number[]>();
  for (const id of ids) {
    const p = g.players[id]!;
    groups.set(p.rankId, [...(groups.get(p.rankId) ?? []), p.netWorth]);
  }
  for (const [rank, xs] of groups) out[rank] = { n: xs.length, median: Math.round(median(xs)) };
  return out;
};
const humans = Object.values(pids);
const npcs = Object.values(g.players).filter((p) => p.npc).map((p) => p.id);
console.log(JSON.stringify({
  kind: 'final', seed, years, days: DAYS, targetGrowthPerDay: STABILIZER_TARGET,
  startSupply: Math.round(startSupply), endSupply: Math.round(supply()),
  overallGrowthPerDay: Number(((supply() / startSupply) ** (1 / DAYS) - 1).toFixed(5)),
  daysOverTarget, maxDailyGrowth: Number(maxDailyGrowth.toFixed(4)),
  stabilizerDaysEngaged: engaged, engagements, maxSinkMult: Number(maxSink.toFixed(3)),
  medianNetWorthByRank: { styled: byRank(humans), npc: byRank(npcs) },
  valueWindowDays: SHOP.value.window,
  styled: Object.fromEntries(STYLES.map((st) => [st, {
    businesses: Object.values(g.businesses).filter((b) => b.ownerId === pids[st]).length,
    managed: Object.values(g.businesses).filter((b) => b.ownerId === pids[st] && b.shop.managerStars > 0).length,
    cash: Math.round(cashOf(g, pids[st])), rank: g.players[pids[st]]!.rankId, netWorth: Math.round(g.players[pids[st]]!.netWorth),
  }])),
}));
