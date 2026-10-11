import { describe, expect, it } from 'vitest';
import { NPC } from '../../src/world/launchpad/constants';
import { GATED, KINDS, summarize, type Kind, type WorldResult } from './launchpad-summary';

/** A world row with the given bot P&L, deployed cash and ledger gap; the shape counts are a healthy launch cohort (80% dead within 7 days,
 *  2% graduated, no 10x), so only the bots and the ledger decide the gate. */
function row(seed: string, kind: Kind, pnl: number, deployed = 1_000, unledgered = 0): WorldResult {
  return {
    seed, kind, pnl, deployed, gx: 0.01, residualMax: 0, idleDrift: 0, leftover: 0, marked: 0, unledgered,
    stats: {
      launches: 100, cohortLaunches: 100, deadWithin7: 80, deadWithin7Early: 0, graduated: 2, tenX: 0,
      npcLife: -5, npcLifeN: 100, allLaunches: 100, npcNet: -10,
    },
  };
}

/** Two seeds of every kind: a losing bot for each gated strategy and an idle control with no drift. */
function world(seeds: string[], pnlOf: (k: Kind) => number = () => -50, unledgeredOf: (k: Kind) => number = () => 0): WorldResult[] {
  return seeds.flatMap((s) => KINDS.map((k) => row(s, k, k === 'none' ? 0 : pnlOf(k), 1_000, unledgeredOf(k))));
}

const input = (per: WorldResult[]) => ({ prefix: 'lx', seeds: 2, days: 30, complete: true, per, NPC });

/** the L8.3 summary: the gate, the ledger check and the shard merge (lead-launchpad.md L8.3, review item 9) */
describe('L8.3 the gate summary', () => {
  it('passes a clean run with losing bots and a closed ledger', () => {
    const s = summarize(input(world(['lx-01', 'lx-02'])));
    expect(GATED.every((k) => s.strategies[k]!.pass)).toBe(true);
    expect(s.ledgerMax).toBe(0);
    expect(s.gate).toBe(true);
  });

  it('fails the gate when any bot cash move is unledgered, however small (review item 9)', () => {
    const s = summarize(input(world(['lx-01', 'lx-02'], () => -50, (k) => (k === 'sniper' ? 0.5 : 0))));
    expect(s.ledgerMax).toBeCloseTo(0.5, 12);
    expect(s.gate).toBe(false);
    // a sub-cent gap is float noise, not an unledgered flow
    const noise = summarize(input(world(['lx-01', 'lx-02'], () => -50, () => 1e-9)));
    expect(noise.gate).toBe(true);
  });

  it('fails a bot whose bound is above zero, and reports the strategy by name', () => {
    const per = world(['lx-01', 'lx-02'], (k) => (k === 'sniper' ? 40 : -50));
    const s = summarize(input(per));
    expect(s.strategies.sniper!.pass).toBe(false);
    expect(s.strategies.retail!.pass).toBe(true);
    expect(s.gate).toBe(false);
  });

  it('a merged run equals the single run over the same worlds, whatever the split (the shard merge)', () => {
    const per = world(['lx-01', 'lx-02', 'lx-03', 'lx-04']).map((r, i) => ({ ...r, pnl: r.pnl + (i % 7) * 3, unledgered: 0 }));
    const whole = summarize({ prefix: 'lx', seeds: 4, days: 30, complete: true, per, NPC });
    // the shards are contiguous seed ranges, in seed order; merging their rows in that order is the same list
    const parts = [per.slice(0, 11), per.slice(11, 22), per.slice(22, 33), per.slice(33)];
    const merged = summarize({ prefix: 'lx', seeds: 4, days: 30, complete: true, per: parts.flat(), NPC });
    expect(merged).toEqual(whole);
    expect(merged.seedsDone).toBe(4);
  });
});
