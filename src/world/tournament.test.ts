import { describe, expect, it } from 'vitest';
import {
  HOUSE_STRATEGIES, TOURNAMENT, divisionOf, tournamentConfig, entryHash, houseActor, maxDrawdownOf, rankRows, runIsolated, runTournamentWeek,
  seedCommitment, sharpeOf, weekSeeds, type TournamentActor, type TournamentRow,
} from './tournament';

const SHORT = 2;
/** real listed stocks of the game universe, so the runs actually trade */
const ASSETS = tournamentConfig().assets.filter((a) => a.assetClass === 'stock' && a.listed !== false).slice(0, 6).map((a) => a.id);
const actor = (over: Partial<TournamentActor> = {}): TournamentActor => ({
  id: 'entrant', strategy: 'momentum', assets: ASSETS, allocation: 0.5, mcs: 90, ...over,
});

describe('tournament divisions and seeds', () => {
  it('divides entries by AI tier: Laptop T0-T1, Startup T2-T3, Frontier T4-T5', () => {
    expect(divisionOf(10)).toBe('laptop');
    expect(divisionOf(59)).toBe('laptop');
    expect(divisionOf(60)).toBe('startup');
    expect(divisionOf(199)).toBe('startup');
    expect(divisionOf(200)).toBe('startup');
    expect(divisionOf(599)).toBe('startup');
    expect(divisionOf(600)).toBe('frontier');
    expect(divisionOf(2000)).toBe('frontier');
  });

  it('derives the three secret seeds deterministically from the week and its secret', () => {
    const a = weekSeeds('w1', 'secret-a');
    expect(a).toHaveLength(TOURNAMENT.seeds);
    expect(new Set(a).size).toBe(TOURNAMENT.seeds);
    expect(weekSeeds('w1', 'secret-a')).toEqual(a);
    expect(weekSeeds('w2', 'secret-a')).not.toEqual(a);
    expect(weekSeeds('w1', 'secret-b')).not.toEqual(a);
  });

  it('commits to the seeds: a changed seed changes the commitment', () => {
    const seeds = weekSeeds('w1', 'secret-a');
    const c = seedCommitment(seeds);
    expect(seedCommitment([...seeds])).toBe(c);
    expect(seedCommitment([seeds[0]!, seeds[2]!, seeds[1]!])).not.toBe(c);
  });

  it('hashes an entry at lock over its frozen fields', () => {
    const h = entryHash(actor(), 'alpha', 'w1');
    expect(entryHash(actor(), 'alpha', 'w1')).toBe(h);
    expect(entryHash(actor({ allocation: 0.6 }), 'alpha', 'w1')).not.toBe(h);
    expect(entryHash(actor({ mcs: 91 }), 'alpha', 'w1')).not.toBe(h);
    expect(entryHash(actor(), 'beta', 'w1')).not.toBe(h);
  });
});

describe('tournament scoring', () => {
  it('annualises the Sharpe of daily returns and is zero for a flat or too-short path', () => {
    expect(sharpeOf([100, 100, 100], 252)).toBe(0);
    expect(sharpeOf([100], 252)).toBe(0);
    const up = [100, 101, 102.5, 101.5, 103];
    expect(sharpeOf(up, 252)).toBeGreaterThan(0);
    // the same path annualised over more days is larger by sqrt(days)
    expect(sharpeOf(up, 252) / sharpeOf(up, 63)).toBeCloseTo(Math.sqrt(4), 6);
  });

  it('measures the largest peak-to-trough fall', () => {
    expect(maxDrawdownOf([100, 120, 90, 110])).toBeCloseTo(0.25, 9);
    expect(maxDrawdownOf([100, 110, 120])).toBe(0);
  });

  it('ranks qualified first, then Sharpe, then total return, then id', () => {
    const row = (id: string, sharpe: number, totalReturn: number, qualified = true): TournamentRow => ({
      id, kind: 'entry', handle: id, mcs: 1, score: { sharpe, totalReturn, qualified, runs: [] },
    });
    const ranked = rankRows([row('c', 1, 0.1), row('a', 1, 0.2), row('d', 9, 0.9, false), row('b', 2, 0)]).map((r) => r.id);
    expect(ranked).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('isolated runs', () => {
  it('reproduce exactly from the seed, the frozen entry and the horizon', () => {
    const seed = weekSeeds('w1', 'secret-a')[0]!;
    const a = runIsolated(seed, actor(), SHORT);
    const b = runIsolated(seed, actor(), SHORT);
    expect(b).toEqual(a);
    expect(a.equity).toHaveLength(SHORT + 1);
    expect(a.equity[0]).toBe(TOURNAMENT.startingCash);
  });

  it('change with the seed', () => {
    const [s0, s1] = weekSeeds('w1', 'secret-a');
    const a = runIsolated(s0!, actor(), SHORT);
    const b = runIsolated(s1!, actor(), SHORT);
    expect(b.equity).not.toEqual(a.equity);
  });

  it('disqualify an entry that places fewer than the minimum trades in a seed', () => {
    // an allocation of 0.01 cannot buy one share of a long-priced asset: the run places no orders
    const seed = weekSeeds('w1', 'secret-a')[0]!;
    const r = runIsolated(seed, actor({ allocation: 0.0001 }), SHORT);
    expect(r.trades).toBeLessThan(TOURNAMENT.minTrades);
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('trades');
  });

  it('gives each house AI its own fixed id and its strategy', () => {
    for (const s of HOUSE_STRATEGIES) {
      const h = houseActor(s);
      expect(h.id).toBe(`house:${s}`);
      expect(h.strategy).toBe(s);
      expect(h.assets.length).toBeGreaterThan(0);
    }
  });
});

describe('weekly tournament', () => {
  it('re-runs to the same rows from the published seeds (reproducible after the reveal)', () => {
    const seeds = weekSeeds('w1', 'secret-a');
    const entries = [{ id: 'p1', handle: 'alpha', actor: actor() }];
    const first = runTournamentWeek(seeds, entries, { days: SHORT });
    const again = runTournamentWeek(seeds, entries, { days: SHORT });
    expect(again).toEqual(first);
    const houses = first.filter((r) => r.kind === 'house');
    expect(houses.map((r) => r.id).sort()).toEqual(HOUSE_STRATEGIES.map((s) => `house:${s}`).sort());
  });

  it('scores the median over the seeds, and the house rows have no division', () => {
    const seeds = weekSeeds('w1', 'secret-a');
    const rows = runTournamentWeek(seeds, [{ id: 'p1', handle: 'alpha', actor: actor() }], { days: 1 });
    const entry = rows.find((r) => r.id === 'p1')!;
    expect(entry.division).toBe('startup');
    expect(entry.score.runs).toHaveLength(seeds.length);
    const sorted = entry.score.runs.map((r) => r.sharpe).sort((x, y) => x - y);
    expect(entry.score.sharpe).toBeCloseTo(sorted[1]!, 12);
    expect(rows.find((r) => r.kind === 'house')!.division).toBeUndefined();
  });
});
