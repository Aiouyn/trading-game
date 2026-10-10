import { describe, expect, it } from 'vitest';
import { credit, transfer } from './core';
import { applyCommand, createGame, stepGame } from './game';
import { dayClose } from './close';
import { playerView } from './view';
import type { GameState } from './types';

// The day change and "since you arrived" count trading and income only: grants, transfers and loans move their baselines
// (core.ts shiftBaselines), so they never read as a gain or a loss.

function joined(seed: string, handles: string[]): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  handles.forEach((id, i) => {
    const r = applyCommand(g, id, { type: 'join', handle: `trader_${i}`, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
  });
  return g;
}

/** The status-strip figures for one player: today's change (net worth less the day start) and the arrival change. */
function figures(g: GameState, pid: string) {
  const v = playerView(g, pid)!;
  return { today: v.netWorth.total - v.player.dayStart.netWorth, arrival: v.arrival.change, total: v.netWorth.total };
}

describe('external cash leaves the day and arrival figures alone', () => {
  it('an admin grant is not a day gain or an arrival gain', () => {
    const g = joined('external-grant', ['u1']);
    const before = figures(g, 'u1');
    const digestBefore = g.players.u1!.digestNetWorth;
    applyCommand(g, 'u1', { type: 'admin.grant', amount: 5000 });
    const after = figures(g, 'u1');
    expect(g.players.u1!.digestNetWorth).toBeCloseTo(digestBefore + 5000, 6);
    expect(after.total).toBeCloseTo(before.total + 5000, 6);
    expect(after.today).toBeCloseTo(before.today, 6);
    expect(after.arrival).toBeCloseTo(before.arrival, 6);
  });

  it('the sign-up grant is not an arrival gain: a new player starts at zero', () => {
    const g = joined('external-signup', ['u1']);
    expect(figures(g, 'u1').arrival).toBeCloseTo(0, 6);
    expect(figures(g, 'u1').today).toBeCloseTo(0, 6);
  });

  it('a transfer moves both sides and neither shows a day change', () => {
    const g = joined('external-transfer', ['u1', 'u2']);
    const a = figures(g, 'u1');
    const b = figures(g, 'u2');
    transfer(g, 'u1', 'u2', 300);
    expect(figures(g, 'u1').total).toBeCloseTo(a.total - 300, 6);
    expect(figures(g, 'u2').total).toBeCloseTo(b.total + 300, 6);
    expect(figures(g, 'u1').today).toBeCloseTo(a.today, 6);
    expect(figures(g, 'u2').today).toBeCloseTo(b.today, 6);
    expect(figures(g, 'u1').arrival).toBeCloseTo(a.arrival, 6);
    expect(figures(g, 'u2').arrival).toBeCloseTo(b.arrival, 6);
  });

  it("a grant during a day is left out of that day's close card",{ timeout: 60_000 }, () => {
    const g = joined('external-close', ['u1']);
    while (g.market.tick < 720 + 300) stepGame(g);
    applyCommand(g, 'u1', { type: 'admin.grant', amount: 5000 });
    while (g.market.tick < 2 * 720) stepGame(g);
    const card = dayClose(g, 'u1', 1)!;
    expect(card.nwChange).toBeCloseTo(0, 6);
  });

  it('income still moves the day change', () => {
    const g = joined('external-income', ['u1']);
    const before = figures(g, 'u1');
    credit(g, 'u1', 120, 'business income');
    expect(figures(g, 'u1').today).toBeCloseTo(before.today + 120, 6);
    expect(figures(g, 'u1').arrival).toBeCloseTo(before.arrival + 120, 6);
  });
});
