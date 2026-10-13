import { describe, expect, it } from 'vitest';
import { founded, stepEngineTo, advanceTo } from './b1fixture';

/**
 * Run-to-run determinism of a company world (V1-PHASE9 9C.3). The company fingerprint pinned in engine staging (c5dd6665...dfab35c,
 * the company_print_full_npc_untouched gate) is not in this worktree, so no pinned value is checked here. What this checks: the
 * same seed, run twice on the engine path (every tick a real stepGame, the sector factor of O-12 drawn from the engine's streams),
 * gives the identical company world and market state.
 */
function stateOf(g: ReturnType<typeof founded>['g']): string {
  return JSON.stringify({ tick: g.market.tick, companies: g.companies, assets: g.market.assets, cash: Object.values(g.market.accounts).map((a) => a.cash) });
}

describe('company world determinism (V1-PHASE9 9C.3)', () => {
  it('the same seed run twice on the engine path gives an identical company world (the sector cursors included)', () => {
    const a = founded('det-company-1');
    const b = founded('det-company-1');
    stepEngineTo(a.g, 70);
    stepEngineTo(b.g, 70);
    expect(stateOf(a.g)).toBe(stateOf(b.g));
    // the sector cursors hold the engine's state: each company sector is at the engine's current tick
    for (const s of Object.values(a.g.companies!.sectors)) expect(s.tick).toBe(a.g.market.tick);
  }, 120_000);

  it('a different seed gives a different company world (the test is not vacuous)', () => {
    const a = founded('det-company-1');
    const b = founded('det-company-2');
    advanceTo(a.g, 80);
    advanceTo(b.g, 80);
    expect(stateOf(a.g)).not.toBe(stateOf(b.g));
  });
});
