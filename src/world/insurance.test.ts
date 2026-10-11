import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { INSURANCE, LOSS, insuranceWeek, insuredLoss, insuredValue, lossDay, setInsurance } from './insurance';
import { creditExternal, touch, TPD } from './core';
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

/** A hostile session on the player, opened directly (the probe's shape). */
function openBreach(g: GameState): string {
  const id = `hostile-${pid}`;
  g.cyber.entries[id] = {
    id, ownerId: pid, codename: 'Test', load: 0.1, firstSeenTick: g.market.tick, lastHandshakeTick: g.market.tick,
    tag: null, flagged: false, hostile: { attackerId: 'attacker', strength: 'tap', progress: 0, startTick: g.market.tick },
  } as unknown as GameState['cyber']['entries'][string];
  touch(g);
  return id;
}

/** Total cash in every account (transfers keep it; faucets add to it; sinks remove it). */
const totalCash = (g: GameState) => Object.values(g.market.accounts).reduce((s, a) => s + a.cash, 0);
const ledgerTotal = (rec: Record<string, number>) => Object.values(rec).reduce((s, x) => s + x, 0);

describe('insurance switch', () => {
  it('goes on and off, and off is always allowed', () => {
    const g = world();
    ownCollectible(g);
    expect(setInsurance(g, pid, true).ok).toBe(true);
    expect(g.players[pid]!.insurance!.on).toBe(true);
    expect(g.market.accounts[INSURANCE.insurerId]).toBeDefined();
    expect(g.insuranceMarket).toBe(true);
    expect(setInsurance(g, pid, false).ok).toBe(true);
    expect(g.players[pid]!.insurance!.on).toBe(false);
  });

  it('refuses a policy on nothing insured', () => {
    const g = world();
    const r = setInsurance(g, pid, true);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('insNothing');
    expect(g.insuranceMarket).toBeUndefined();
  });

  it('cannot go on during an active breach, and cannot go on within 24 hours after one', () => {
    const g = world();
    ownCollectible(g);
    openBreach(g);
    const during = setInsurance(g, pid, true);
    expect(during.ok).toBe(false);
    expect(during.error).toBe('insBreach');
    delete g.cyber.entries[`hostile-${pid}`];
    touch(g);
    g.cyber.breachedAt = { [pid]: g.market.tick - 1 };
    const after = setInsurance(g, pid, true);
    expect(after.ok).toBe(false);
    expect(after.error).toBe('insLockout');
    expect(after.data).toEqual({ hours: 24 });
    g.cyber.breachedAt = { [pid]: g.market.tick - INSURANCE.breachLockTicks };
    expect(setInsurance(g, pid, true).ok).toBe(true);
  });

  it('a session opened and cut within one game day still starts the lockout (the probe)', () => {
    const g = world();
    ownCollectible(g);
    const entry = openBreach(g);
    expect(setInsurance(g, pid, true).error).toBe('insBreach');
    expect(applyCommand(g, pid, { type: 'sec.disconnect', entryId: entry }).ok).toBe(true);
    g.market = { ...g.market, tick: g.market.tick + 60 };
    expect(g.cyber.breachedAt?.[pid]).toBeDefined();
    const r = setInsurance(g, pid, true);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('insLockout');
    g.market = { ...g.market, tick: g.market.tick + INSURANCE.breachLockTicks };
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
  it('pays the loss less the excess (10% of the insured value), capped at 80% of the loss, as a transfer', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    const value = insuredValue(g, pid);
    const excess = cents(value * INSURANCE.deductible);
    const insurer = g.market.accounts[INSURANCE.insurerId]!.cash;
    const player = g.market.accounts[pid]!.cash;
    const faucets = JSON.stringify(g.economy.faucets);
    const sinks = JSON.stringify(g.economy.sinks);
    const r = insuredLoss(g, pid, 1000, 'hack drain');
    expect(r.covered).toBe(cents(1000 - excess));
    expect(r.payout).toBe(cents(Math.min(1000 - excess, 800)));
    expect(cents(insurer - g.market.accounts[INSURANCE.insurerId]!.cash)).toBe(r.payout);
    expect(cents(g.market.accounts[pid]!.cash - player)).toBe(r.payout);
    expect(JSON.stringify(g.economy.faucets)).toBe(faucets);
    expect(JSON.stringify(g.economy.sinks)).toBe(sinks);
    expect(g.players[pid]!.insurance!.paidOut).toBe(r.payout);
  });

  it('the deductible bites on a small loss: a loss under the excess pays nothing', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    const excess = cents(insuredValue(g, pid) * INSURANCE.deductible);
    expect(insuredLoss(g, pid, excess / 2, 'shop theft').payout).toBe(0);
  });

  it('pays nothing without a policy in force', () => {
    const g = world();
    expect(insuredLoss(g, pid, 1000, 'hack drain').payout).toBe(0);
  });

  it('pays no more than the insurer holds', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    g.market.accounts[INSURANCE.insurerId] = { ...g.market.accounts[INSURANCE.insurerId]!, cash: 300 };
    const r = insuredLoss(g, pid, 1000, 'shop fire');
    expect(r.payout).toBe(300);
    expect(g.market.accounts[INSURANCE.insurerId]!.cash).toBe(0);
  });

  it('keeps the money identity: the insurer capital is the only faucet, and no claim touches a sink', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    expect(g.economy.faucets['insurer capital']).toBe(INSURANCE.insurerCapital);
    const before = totalCash(g);
    insuredLoss(g, pid, 5000, 'collectible theft');
    expect(totalCash(g)).toBeCloseTo(before, 6);
  });
});

describe('loss sources', () => {
  it('draws no loss in a world whose insurance market never opened, and keeps its loss stream unseeded', () => {
    const g = world();
    ownCollectible(g);
    const before = JSON.stringify(g.market.accounts);
    for (let d = 0; d < 400; d++) lossDay(g, null);
    expect(JSON.stringify(g.market.accounts)).toBe(before);
    expect(g.rng.losses).toBeUndefined();
  });

  it('a hostile session drains cash as a sink, and an insured player is paid back the insured part', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    openBreach(g);
    const sinks0 = g.economy.sinks['hack drain'] ?? 0;
    const cash0 = g.market.accounts[pid]!.cash;
    lossDay(g, null);
    const drained = (g.economy.sinks['hack drain'] ?? 0) - sinks0;
    expect(drained).toBeGreaterThan(0);
    expect(drained).toBe(cents(g.players[pid]!.netWorth * LOSS.hackDrainPerDay * 1.0));
    expect(g.market.accounts[pid]!.cash).toBeLessThan(cash0);
  });

  it('the loss day keeps the money identity: every faucet and sink it books closes against the accounts', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    openBreach(g);
    const cash0 = totalCash(g);
    const f0 = ledgerTotal(g.economy.faucets);
    const s0 = ledgerTotal(g.economy.sinks);
    for (let d = 0; d < 30; d++) lossDay(g, null);
    expect(cents(totalCash(g) - cash0)).toBeCloseTo(cents((ledgerTotal(g.economy.faucets) - f0) - (ledgerTotal(g.economy.sinks) - s0)), 4);
  });

  it('a collectible theft takes one owned item and pays the claim from the insurer; the item leaves the shelf', () => {
    const g = world();
    ownCollectible(g);
    setInsurance(g, pid, true);
    // force the theft roll by owning the only item and running enough days for the seeded stream to hit it
    let stolen = false;
    for (let d = 0; d < 60000 && !stolen; d++) {
      lossDay(g, null);
      stolen = g.players[pid]!.lifestyle.length === 0;
    }
    expect(stolen).toBe(true);
    expect(g.players[pid]!.insurance!.paidOut).toBeGreaterThan(0);
    expect(g.economy.sinks['collectible theft'] ?? 0).toBe(0);
  });

  it('is deterministic: the same world and days give the same losses', () => {
    const a = world();
    const b = world();
    for (const g of [a, b]) {
      ownCollectible(g);
      setInsurance(g, pid, true);
      openBreach(g);
      for (let d = 0; d < 50; d++) lossDay(g, null);
    }
    expect(JSON.stringify(a.economy)).toBe(JSON.stringify(b.economy));
    expect(JSON.stringify(a.rng.losses)).toBe(JSON.stringify(b.rng.losses));
    expect(TPD).toBeGreaterThan(0);
  });
});
