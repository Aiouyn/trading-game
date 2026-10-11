/**
 * Five-year economy check for the money supply and the stabilizer (Phase 4, ruling O-6; docs/V1-PHASE4.md section 2.2b).
 *
 * Runs the full world (NPCs present, the app's own tick rate) for a number of game years on one seed, and reports:
 *  - supply growth: the players' money (the stabilizer's supply, boards.ts), its mean growth a game day over the run and
 *    the share of game days whose trailing 7-day growth is above the stabilizer target;
 *  - engagement: the game days on which the stabilizer's sink multiplier was above 1 (it engaged);
 *  - faucet and sink split: the booked totals over the run, and each side's top sources by share;
 *  - net worth by rank at the end of the run (the top ranks and the median).
 *
 *   npx tsx scripts/balance/economy.ts [seed=economy-1] [years=5] [out=]
 *
 * One line of JSON is printed per seed (the summary); with `out`, a CSV of the day rows is written there too. The run is
 * long (about 15 to 35 minutes a seed at the app's 720 ticks a game day), so run one seed at a time.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createGame, stepGame } from '../../src/world/game';
import { STABILIZER_TARGET, STABILIZER_WINDOW } from '../../src/world/boards';
import { TPD, today } from '../../src/world/core';
import type { GameState } from '../../src/world/types';

const seed = process.argv[2] ?? 'economy-1';
const years = Number(process.argv[3] ?? '5');
const outDir = process.argv[4] ?? '';
const DAYS = Math.round(years * 365);

interface DayRow { day: number; supply: number; sinkMult: number; faucets: number; sinks: number }

function supplyOf(g: GameState): number {
  let s = 0;
  for (const p of Object.values(g.players)) s += Math.max(0, p.netWorth);
  return s;
}

function totals(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

/** The top sources of a booked map, as shares of its total (the key and its share, largest first). */
function topShares(map: Record<string, number>, n: number): { key: string; share: number }[] {
  const tot = totals(map);
  if (tot <= 0) return [];
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, v]) => ({ key, share: Math.round((v / tot) * 1000) / 1000 }));
}

const g = createGame(seed);
const rows: DayRow[] = [];
let lastDay = today(g);
const day0Supply = supplyOf(g);
const endDay = lastDay + DAYS;
const faucets0 = totals(g.economy.faucets);
const sinks0 = totals(g.economy.sinks);
const started = Date.now();

while (today(g) < endDay) {
  stepGame(g);
  const d = today(g);
  if (d !== lastDay) {
    lastDay = d;
    rows.push({
      day: d,
      supply: supplyOf(g),
      sinkMult: g.economy.stabilizer.sinkMult,
      faucets: totals(g.economy.faucets),
      sinks: totals(g.economy.sinks),
    });
  }
}

// supply growth: the mean daily growth over the run, and the trailing-window growth against the target
const supplies = [day0Supply, ...rows.map((r) => r.supply)];
const runDays = rows.length;
const meanGrowth = runDays > 0 && day0Supply > 0 ? Math.pow(supplies[supplies.length - 1]! / day0Supply, 1 / runDays) - 1 : 0;
let windowed = 0;
let windows = 0;
for (let k = STABILIZER_WINDOW; k < supplies.length; k++) {
  const base = supplies[k - STABILIZER_WINDOW]!;
  if (base <= 0) continue;
  windows++;
  const growth = Math.pow(supplies[k]! / base, 1 / STABILIZER_WINDOW) - 1;
  if (growth > STABILIZER_TARGET) windowed++;
}
const engaged = rows.filter((r) => r.sinkMult > 1 + 1e-9).length;
const maxSink = rows.reduce((m, r) => Math.max(m, r.sinkMult), 1);

// net worth by rank at the end of the run, over every player (NPCs included, as the stabilizer's supply is)
const nw = Object.values(g.players).map((p) => p.netWorth).sort((a, b) => b - a);
const at = (rank: number) => Math.round(nw[Math.min(nw.length - 1, rank - 1)] ?? 0);
const median = nw.length ? Math.round(nw[nw.length >> 1]!) : 0;

const faucetsNet = totals(g.economy.faucets) - faucets0;
const sinksNet = totals(g.economy.sinks) - sinks0;

const summary = {
  seed,
  years,
  gameDays: runDays,
  players: nw.length,
  seconds: Math.round((Date.now() - started) / 1000),
  supply: { start: Math.round(day0Supply), end: Math.round(supplies[supplies.length - 1]!), meanGrowthPerDay: Number((meanGrowth * 100).toFixed(3)) },
  windows: { count: windows, aboveTargetShare: windows ? Number((windowed / windows).toFixed(3)) : 0, target: STABILIZER_TARGET },
  engagement: { daysEngaged: engaged, maxSinkMult: Number(maxSink.toFixed(3)) },
  flows: {
    faucets: Math.round(faucetsNet),
    sinks: Math.round(sinksNet),
    sinkShareOfFlow: faucetsNet + sinksNet > 0 ? Number((sinksNet / (faucetsNet + sinksNet)).toFixed(3)) : 0,
    topFaucets: topShares(g.economy.faucets, 5),
    topSinks: topShares(g.economy.sinks, 5),
  },
  netWorthByRank: { r1: at(1), r3: at(3), r10: at(10), r30: at(30), r100: at(100), median },
  ticksPerDay: TPD,
};

console.log(JSON.stringify(summary));

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  const csv = ['day,supply,sinkMult,faucets,sinks', ...rows.map((r) => `${r.day},${r.supply.toFixed(2)},${r.sinkMult.toFixed(4)},${r.faucets.toFixed(2)},${r.sinks.toFixed(2)}`)];
  writeFileSync(path.join(outDir, `economy-${seed}.csv`), csv.join('\n') + '\n');
  writeFileSync(path.join(outDir, `economy-${seed}.json`), JSON.stringify(summary, null, 2) + '\n');
}
