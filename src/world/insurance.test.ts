import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { INSURANCE, insuranceWeek, insuredLoss, insuredValue, setInsurance } from './insurance';
import { creditExternal, touch } from './core';
import { TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import type { GameState } from './types';

const pid = 'p-insured';
const cents = (x: number) => Math.round(x * 100) / 100;

function world(): GameState {
  const g = createGame('insurance-test', { warmupDays: 1, npcs: false });
  applyCommand(g, pid, { type: 'join', handle: 'insured', country: 'XX' });
  g.players[pid]!.rankId = 'R5';
  creditExternal(g, pid, 50_000_000, 'test grant');
  g.market = { ...g.market, tick: 100 };
  return g;
}

/** Give the player a collectible, so there is a value to insure. */
function ownCollectible(g: GameState, itemId = 'sneakers', paid = 2400): void {
  g.players[pid]!.lifestyle.push({ uid: `${pid}-test-${itemId}`, itemId, paid, boughtTick: 0 });
}

/** A hostile session on the player: enough to count as an active breach. */
function openBreach(g: GameState): void {
  g.cyber.entries[`hostile-${pid}`] = {
    id: `hostile-${pid}`, ownerId: pid, codename: 'Test', load: 0.1, firstSeenTick: g.market.tick, lastHandshakeTick: g.market.tick,
    tag: null, hostile: { attackerId: 'attacker', strength: 'tap', progress: 0, startTick: g.market.tick },
  } as unknown as GameState['cyber']['entries'][string];
  touch(g);
}

describe('insurance switch', () => {
  it('goes on and off, and off is always allowed', () => {
    const g = world();
    expect(setInsurance(g, pid, true).ok).toBe(true);
    expect(g.players[pid]!.insurance!.on).toBe(true);
    expect(g.market.accounts[INSURANCE.insurerId]).toBeDefined();
    expect(setInsurance(g, pid, false).ok).toBe(true);
    expect(g.players[pid]!.insurance!.on).toBe(false);
  });

  it('cannot go on during an active breach, and cannot go on within 24 hours after one', () => {
    const g = world();
    openBreach(g);
    const during = setInsurance(g, pid, true);
    expect(during.ok).toBe(false);
    expect(during.error).toMatch(/active breach/);
    delete g.cyber.entries[`hostile-${pid}`];
    touch(g);
    g.cyber.breachedAt = { [pid]: g.market.tick - 1 };
    const after = setInsurance(g, pid, true);
    expect(after.ok).toBe(false);
    expect(after.error).toMatch(/24 hours/);
    g.cyber.breachedAt = { [pid]: g.market.tick - INSURANCE.breachLockTicks };
    expect(setInsurance(g, pid, true).ok).toBe(true);
  });
});

describe('insurance premium', () => {
  it('charges 0.4% of the insured value each real week, as a sink, to the cent', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    const value = insuredValue(g, pid);
    expect(value).toBeGreaterThan(0);
    g.market = { ...g.market, tick: TOURNAMENT_WEEK_TICKS };
    const cash = g.market.accounts[pid]!.cash;
    const sinks = g.economy.sinks['insurance premium'] ?? 0;
    insuranceWeek(g, null);
    const premium = cents(value * INSURANCE.premiumRate);
    expect(cents(cash - g.market.accounts[pid]!.cash)).toBe(premium);
    expect(cents((g.economy.sinks['insurance premium'] ?? 0) - sinks)).toBe(premium);
  });

  it('charges nothing between week starts, and nothing when the policy is off', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    const cash = g.market.accounts[pid]!.cash;
    g.market = { ...g.market, tick: TOURNAMENT_WEEK_TICKS + 1 };
    insuranceWeek(g, null);
    expect(g.market.accounts[pid]!.cash).toBe(cash);
    setInsurance(g, pid, false);
    g.market = { ...g.market, tick: 2 * TOURNAMENT_WEEK_TICKS };
    insuranceWeek(g, null);
    expect(g.market.accounts[pid]!.cash).toBe(cash);
  });

  it('lapses a policy whose premium is more than the owner\'s spendable cash', () => {
    const g = world();
    g.players[pid]!.lifestyle = [{ uid: 'x', itemId: 'old-master', paid: 68_000_000, boughtTick: 0 }];
    setInsurance(g, pid, true);
    g.market.accounts[pid] = { ...g.market.accounts[pid]!, cash: 1 };
    g.market = { ...g.market, tick: TOURNAMENT_WEEK_TICKS };
    insuranceWeek(g, null);
    expect(g.players[pid]!.insurance!.on).toBe(false);
  });
});

describe('insurance claims', () => {
  it('pays the loss less the 10% deductible, capped at 80% of the loss, from the insurer as a transfer', () => {
    const g = world();
    setInsurance(g, pid, true);
    const insurer = g.market.accounts[INSURANCE.insurerId]!.cash;
    const player = g.market.accounts[pid]!.cash;
    const faucets = JSON.stringify(g.economy.faucets);
    const sinks = JSON.stringify(g.economy.sinks);
    const r = insuredLoss(g, pid, 1000, 'hack');
    expect(r.covered).toBe(900);
    expect(r.payout).toBe(800);
    expect(cents(insurer - g.market.accounts[INSURANCE.insurerId]!.cash)).toBe(800);
    expect(cents(g.market.accounts[pid]!.cash - player)).toBe(800);
    expect(JSON.stringify(g.economy.faucets)).toBe(faucets);
    expect(JSON.stringify(g.economy.sinks)).toBe(sinks);
    expect(g.players[pid]!.insurance!.paidOut).toBe(800);
  });

  it('pays nothing without a policy in force', () => {
    const g = world();
    expect(insuredLoss(g, pid, 1000, 'hack').payout).toBe(0);
  });

  it('pays no more than the insurer holds', () => {
    const g = world();
    setInsurance(g, pid, true);
    g.market.accounts[INSURANCE.insurerId] = { ...g.market.accounts[INSURANCE.insurerId]!, cash: 300 };
    const r = insuredLoss(g, pid, 1000, 'fire');
    expect(r.payout).toBe(300);
    expect(g.market.accounts[INSURANCE.insurerId]!.cash).toBe(0);
  });

  it('keeps the money identity: the insurer capital is the only faucet, and no claim touches a sink', () => {
    const g = world();
    setInsurance(g, pid, true);
    expect(g.economy.faucets['insurer capital']).toBe(INSURANCE.insurerCapital);
    const total = (x: GameState) => Object.values(x.market.accounts).reduce((s, a) => s + a.cash, 0);
    const before = total(g);
    insuredLoss(g, pid, 5000, 'theft');
    expect(total(g)).toBeCloseTo(before, 6);
  });
});
