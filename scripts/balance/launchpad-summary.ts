// The Launchpad gate's summary (lead-launchpad.md L8.1 to L8.3). Pure: the single-process harness (launchpad.ts) and the shard merge
// (launchpad-shards.ts) both call summarize() on the same per-world results, so a merged run prints the same numbers as one process.

import type { NPC as NpcConstants } from '../../src/world/launchpad/constants';
import { mean, oneSided95, pnlPerDollar, strategyPasses } from './launchpad-stat';

export const START_CASH = 20_000;

/** the gated strategies, in the order every world list is built (paired seeds: each seed runs the pure NPC world, then these) */
export const GATED = ['creatorDump', 'sniper', 'flipper', 'buzzPumper', 'retail', 'viralChaser', 'pumpSeller', 'postGradBuyer', 'frontRunner', 'floorSprayer'] as const;
export type Gated = (typeof GATED)[number];
/** a world with no bot: the pure NPC world of the seed (the shape, the NPC net and the idle control are read here) */
export type Kind = Gated | 'none';
export const KINDS: readonly Kind[] = ['none', ...GATED];

export interface WorldStats {
  launches: number;
  cohortLaunches: number;
  deadWithin7: number;
  deadWithin7Early: number;
  graduated: number;
  tenX: number;
  npcLife: number;
  npcLifeN: number;
  allLaunches: number;
  npcNet: number;
}

export interface WorldResult {
  seed: string;
  kind: Kind;
  /** the bot's Launchpad P&L (its cash flows, horizon liquidation included) and the cash it put in */
  pnl: number;
  deployed: number;
  /** the GX buy-and-hold over the horizon (reported beside, not the benchmark) */
  gx: number;
  residualMax: number;
  idleDrift: number;
  /** the positions the book could not take at the horizon, valued at a mark (in pnl) */
  marked: number;
  /** the positions that could not be valued at all (fail the bot; zero by construction, see liquidate()) */
  leftover: number;
  /** the bot's cash change that its Launchpad commands and its own creator fees do not account for (must be zero, review item 9) */
  unledgered: number;
  stats: WorldStats;
}

export interface SummaryInput {
  prefix: string;
  /** the number of seeds the run covers (the planned count when partial) */
  seeds: number;
  days: number;
  complete: boolean;
  per: WorldResult[];
  NPC: typeof NpcConstants;
}

/** The gate summary of a set of worlds. The same input gives the same output, whichever process ran the worlds. */
export function summarize(input: SummaryInput) {
  const { prefix, seeds, days, complete, per, NPC } = input;
  const byKind = (k: Kind) => per.filter((r) => r.kind === k);
  const strategies = Object.fromEntries(GATED.map((k) => {
    const rs = byKind(k);
    const ratios = rs.map((r) => pnlPerDollar(r.pnl, r.deployed));
    const bound = oneSided95(ratios);
    // v1.2 review item 2: a position the book could not take is unvalued in the P&L, so any leftover fails the bot (no bias toward a pass)
    const leftover = rs.reduce((a, r) => a + r.leftover, 0);
    return [k, {
      seeds: rs.length,
      meanPnlPerDollar: mean(ratios),
      oneSided95: bound,
      pass: strategyPasses(ratios, leftover),
      meanPnl: mean(rs.map((r) => r.pnl)),
      meanDeployed: mean(rs.map((r) => r.deployed)),
      meanReturnOnStart: mean(rs.map((r) => r.pnl / START_CASH)),
      gxMean: mean(rs.map((r) => r.gx)),
      leftover,
      marked: rs.reduce((a, r) => a + r.marked, 0),
      worldShape: {
        dead7dFromDay3: rs.reduce((a, r) => a + r.stats.deadWithin7, 0) / Math.max(1, rs.reduce((a, r) => a + r.stats.cohortLaunches, 0)),
        graduationRate: rs.reduce((a, r) => a + r.stats.graduated, 0) / Math.max(1, rs.reduce((a, r) => a + r.stats.launches, 0)),
      },
    }];
  }));
  const none = byKind('none');
  const totalLaunches = none.reduce((a, r) => a + r.stats.launches, 0);
  const cohortTotal = none.reduce((a, r) => a + r.stats.cohortLaunches, 0);
  const dead7 = none.reduce((a, r) => a + r.stats.deadWithin7, 0) / Math.max(1, cohortTotal);
  const dead7Early = none.reduce((a, r) => a + r.stats.deadWithin7Early, 0) / Math.max(1, totalLaunches - cohortTotal);
  const grad = none.reduce((a, r) => a + r.stats.graduated, 0) / Math.max(1, totalLaunches);
  const tenX = none.reduce((a, r) => a + r.stats.tenX, 0) / Math.max(1, totalLaunches);
  const residual = Math.max(0, ...per.map((r) => r.residualMax));
  const ledgerMax = Math.max(0, ...per.map((r) => Math.abs(r.unledgered)));
  const idleZeroOk = none.every((r) => Math.abs(r.idleDrift) < 1e-9);
  const npcNetPerToken = none.reduce((a, r) => a + r.stats.npcLife, 0) / Math.max(1, none.reduce((a, r) => a + r.stats.npcLifeN, 0));
  const npcNetBooked = none.reduce((a, r) => a + r.stats.npcNet, 0) / Math.max(1, none.reduce((a, r) => a + r.stats.allLaunches, 0));
  const npcOk = npcNetPerToken <= 0;
  const shape = {
    deadWithin7dFromDay3: dead7, deadWithin7dDay0to2Reported: dead7Early, graduationRate: grad, tenXRate: tenX,
    deadOk: dead7 >= 0.7, gradOk: grad >= 0.01 && grad <= 0.05, tenXOk: tenX <= 0.005,
    idleZeroOk, npcNetPerToken, npcNetBookedPerToken: npcNetBooked, npcOk, launchesObserved: totalLaunches,
  };
  const botsOk = GATED.every((k) => strategies[k]!.pass);
  const gate = complete && botsOk && shape.deadOk && shape.gradOk && shape.tenXOk && residual < 0.005 && ledgerMax < 0.005 && idleZeroOk && npcOk;
  return {
    prefix, seeds, seedsDone: new Set(per.map((r) => r.seed)).size, complete, days, gxMean: mean(none.map((r) => r.gx)),
    strategies, shape, residualMax: residual, ledgerMax, gate, NPC, perWorld: per,
  };
}

/** The short printed form of a summary (the per-world rows are left out). */
export function printedOf(summary: ReturnType<typeof summarize>) {
  return {
    prefix: summary.prefix, seeds: summary.seeds, days: summary.days, launches: summary.shape.launchesObserved, gxMean: summary.gxMean,
    strategies: Object.fromEntries(GATED.map((k) => [k, { meanPnlPerDollar: summary.strategies[k]!.meanPnlPerDollar, oneSided95: summary.strategies[k]!.oneSided95, leftover: summary.strategies[k]!.leftover, marked: summary.strategies[k]!.marked, pass: summary.strategies[k]!.pass }])),
    shape: summary.shape, residualMax: summary.residualMax, ledgerMax: summary.ledgerMax, gate: summary.gate,
  };
}
