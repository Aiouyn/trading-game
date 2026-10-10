import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { universeConfig } from './universe';
import { estimateFill, halfSpread, impact, liquidationEquity, openAccount, placeOrder, portfolio } from './trading';
import { freeCash, freeQty, realizeToFlat } from './hunt-helpers';
import type { WorldConfig, WorldState } from './types';

/**
 * X3 · Money at absurd scale (Tape, hunts v1; harness id huge_money_invalid). A player with $1e12 or $1e15 trades the
 * game universe for one game year at 24 ticks a day (full ecology, rates, options, listings, world events). On buy days
 * each tick spends a share of the largest quantity that the live cash can pay for (estimateFill total within 97% of the
 * cash, bisection), so the order is sized against the cash that is there at that tick. On sell days the position in the
 * asset bought the day before is sold evenly over the day. Every buy and sell must fill: a rejected order fails the test.
 *
 * Invalid means: a NaN or Infinity in equity, cash, fees, peak or liquidation equity; a non-positive asset price; negative
 * cash; or accounting drift, i.e. realized + unrealized + interest + dividends − borrow fees − interest paid ≠ equity −
 * startingCash beyond 1e-9 of the scale of the numbers. Orders above 2^53 units are refused (validate), so sizing stops there.
 *
 * F7 (Phase 1): a long's liquidation proceeds floor at 0, and a sale fill never prices below 0, so liquidation equity is
 * at least cash on every tick (this test holds no shorts; the cover-cost bound is in the long/short unit test below).
 * The price response is still unbounded at this size except through F8 (the close caps own flow at 3 x ADV, ecology.ts):
 * scripts/balance/huge-money.ts measures it on tape-01. The test logs the largest move, asserts every price stays finite and
 * positive, that liquidation equity is finite and not below cash on every tick, that the peak liquidation mark is returned
 * by selling down (within 5%), and that a mid mark does not lift the peak.
 */
const TPD = 24;
const DAYS = 252;
const cfg: WorldConfig = universeConfig({ ticksPerDay: TPD });
const PID = 'huge';
// buy day k holds ROTATION[k % 3]: one crypto that prices at 1e-6 (FROG: the cap binds at $1e12), one stock, one crypto
const ROTATION = ['FROG', 'HLCN', 'SYN'];

/** the largest whole (or fractional, for crypto) quantity whose estimated total fits in `budget`, at most 2^53 units */
function largestBuy(s: WorldState, assetId: string, budget: number, whole: boolean): number {
  const i = s.config.assets.findIndex((a) => a.id === assetId);
  const px = Math.exp(s.assets[i]!.lnP);
  const fits = (q: number) => estimateFill(s, { assetId, side: 'buy', qty: q }).total <= budget;
  let lo = 0;
  let hi = Math.min(Number.MAX_SAFE_INTEGER, (2 * budget) / px);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return whole ? Math.floor(lo) : lo;
}

interface YearRun {
  state: WorldState;
  fills: number;
  orders: number;
  rejects: Record<string, number>;
  minCash: number;
  /** the largest |lnP − ln(initialPrice)| any traded asset reached on any tick */
  maxAbsLnMove: number;
  /** the asset and tick that reached maxAbsLnMove */
  maxAt: string;
  /** ticks on which liquidation equity was not finite (must be 0) */
  nonFiniteLiq: number;
  /** ticks on which liquidation equity was below cash (must be 0: longs only, proceeds floor at 0; F7) */
  belowCash: number;
  /** the largest liquidation equity over the year, and the world at that tick (the peak rank and licences read) */
  peakLiq: number;
  peakState: WorldState;
}

/** one game year: buy on even days (sized to live cash, split over the day's ticks), sell the same asset on the next day */
function oneYear(cash: number, seed: string): YearRun {
  let s: WorldState = openAccount(createWorld(seed, cfg), PID, cash);
  let fills = 0;
  let orders = 0;
  let minCash = Infinity;
  let maxAbsLnMove = 0;
  let maxAt = '';
  let nonFiniteLiq = 0;
  let belowCash = 0;
  let peakLiq = -Infinity;
  let peakState = s;
  const rejects: Record<string, number> = {};
  const place = (assetId: string, side: 'buy' | 'sell', qty: number) => {
    const r = placeOrder(s, { playerId: PID, assetId, side, type: 'market', qty });
    orders++;
    if (r.order.status === 'rejected') rejects[r.order.rejectReason ?? 'unknown'] = (rejects[r.order.rejectReason ?? 'unknown'] ?? 0) + 1;
    s = r.state;
  };
  let bought = '';
  for (let d = 0; d < DAYS; d++) {
    const buyDay = d % 2 === 0;
    if (buyDay) bought = ROTATION[(d / 2) % ROTATION.length]!;
    const i = s.config.assets.findIndex((a) => a.id === bought);
    const whole = s.config.assets[i]!.qtyStep === 1;
    for (let t = 0; t < TPD; t++) {
      const ticksLeft = TPD - t;
      if (buyDay) {
        const affordable = largestBuy(s, bought, 0.97 * freeCash(s, PID), whole);
        const want = whole ? Math.floor(affordable / ticksLeft) : affordable / ticksLeft;
        if (want > 0) place(bought, 'buy', want);
      } else {
        const held = freeQty(s, PID, bought);
        const want = whole ? Math.floor(held / ticksLeft) : held / ticksLeft;
        if (want > 0) place(bought, 'sell', want);
      }
      const res = step(s);
      s = res.state;
      fills += res.fills.filter((f) => f.playerId === PID).length;
      minCash = Math.min(minCash, s.accounts[PID]!.cash);
      const liq = liquidationEquity(s, PID);
      if (!Number.isFinite(liq)) nonFiniteLiq++;
      if (liq < s.accounts[PID]!.cash) belowCash++;
      if (liq > peakLiq) { peakLiq = liq; peakState = s; }
      for (const id of ROTATION) {
        const j = s.config.assets.findIndex((a) => a.id === id);
        const move = Math.abs(s.assets[j]!.lnP - Math.log(s.config.assets[j]!.initialPrice));
        if (move > maxAbsLnMove) { maxAbsLnMove = move; maxAt = `${id} tick ${s.tick}`; }
      }
    }
  }
  return { state: s, fills, orders, rejects, minCash, maxAbsLnMove, maxAt, nonFiniteLiq, belowCash, peakLiq, peakState };
}

/** The scale-aware drift of the trading identity, as a fraction of the largest number in it. */
function driftOf(s: WorldState): { drift: number; scale: number } {
  const a = s.accounts[PID]!;
  const p = portfolio(s, PID);
  const lhs = p.realizedPnl + p.unrealizedPnl + (a.interestEarned ?? 0) + (a.dividends ?? 0) - (a.interestPaid ?? 0) - (a.borrowPaid ?? 0);
  const rhs = p.equity - a.startingCash;
  const scale = Math.max(Math.abs(p.equity), Math.abs(a.startingCash), 1);
  return { drift: Math.abs(lhs - rhs), scale };
}

describe('X3 huge money: a game year at $1e12 and $1e15 stays finite and balanced (huge_money_invalid = 0)', () => {
  for (const cash of [1e12, 1e15]) {
    it(`huge_money_invalid at $${cash.toExponential(0)} cash, one game year, 24 ticks a day`, { timeout: 60_000 }, () => {
      const r = oneYear(cash, 'tape-01');
      const p = portfolio(r.state, PID);
      const a = r.state.accounts[PID]!;
      console.log(`huge_money $${cash.toExponential(0)}: orders ${r.orders}, fills ${r.fills}, rejects ${JSON.stringify(r.rejects)}, equity ${p.equity.toExponential(4)}, cash ${a.cash.toExponential(4)}, fees ${p.feesPaid.toExponential(4)}, peak ${p.peakEquity.toExponential(4)}, liquidation ${p.liquidationEquity.toExponential(4)}, largest |lnP − ln P0| ${r.maxAbsLnMove.toFixed(2)} at ${r.maxAt}`);
      expect(r.fills).toBeGreaterThan(0);
      expect(r.rejects).toEqual({}); // sized to live cash: every order the test sends must be accepted
      for (const v of [p.equity, a.cash, p.feesPaid, p.peakEquity, p.liquidationEquity, p.realizedPnl, p.unrealizedPnl, p.totalPnl]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      for (const asset of r.state.assets) {
        expect(Number.isFinite(asset.lnP)).toBe(true);
      }
      // liquidation equity is finite and never below cash: this year holds longs only, and a long's exit proceeds floor at
      // 0 (F7), so liquidation is cash plus non-negative proceeds. The peak reads liquidation value only, so the mid mark
      // (at $1e15 about 8e33 at year end, some 8000 times the peak) must not lift it.
      expect(Number.isFinite(p.liquidationEquity)).toBe(true);
      expect(Number.isFinite(liquidationEquity(r.state, PID))).toBe(true);
      expect(liquidationEquity(r.state, PID)).toBeGreaterThanOrEqual(r.state.accounts[PID]!.cash);
      // The engine peak starts at the starting cash (openAccount sets peakEquity to it) and rises at each tick's clearing, so
      // it cannot exceed max(startingCash, the best liquidation this loop saw). The old check `peakEquity < equity` assumed the
      // year-end mid mark sits above the peak; after F7 it does not (at $1e12 the year ends at cash, 4.5e9, under a 1e12 start
      // peak), so it is replaced by this bound. The two samples differ only on a day's close tick (the engine marks before the
      // ecology reprices the close, this loop after), so this is a check on tape-01, not an identity.
      expect(p.peakEquity).toBeLessThanOrEqual(Math.max(a.startingCash, r.peakLiq) * (1 + 1e-9) + 1e-6);
      expect(r.minCash).toBeGreaterThanOrEqual(0);
      const { drift, scale } = driftOf(r.state);
      expect(drift / scale).toBeLessThanOrEqual(1e-9);
      // liquidation equity is finite on every tick, not only at year end
      expect(r.nonFiniteLiq).toBe(0);
      expect(r.belowCash).toBe(0);
      // the peak liquidation mark is backed by proceeds: selling down from the tick it peaked (realize to flat, 200 days
      // at most) returns at least 95% of it. The mid mark is not: it is orders of magnitude above what sells return.
      // 200 days, not 100: on the calibrated path (V1-PHASE1 F1, merged with F8) the $1e15 peak takes 137 days to flatten,
      // and HLCN is halted until 5 days after the peak; before the calibration the same peak flattened in 73 days. The
      // 95% proceeds bound is the claim, and it holds on the day flat is reached.
      const rz = realizeToFlat(r.peakState, PID, 200);
      console.log(`huge_money_peak $${cash.toExponential(0)}: liquidation peak ${r.peakLiq.toExponential(4)} at tick ${r.peakState.tick}; realize to flat from there: flat day ${rz.flatDay}, cash ${rz.cash.toExponential(4)} (${(rz.cash / r.peakLiq).toFixed(4)} of the peak)`);
      expect(rz.flatDay).toBeGreaterThan(0);
      expect(rz.cash).toBeGreaterThanOrEqual(0.95 * r.peakLiq);
    });
  }
});

describe('X3 huge money: quantities above 2^53 units are refused, not rounded', () => {
  it('rejects a whole-unit or fractional order above the cap with a reason, and touches nothing', () => {
    const s = openAccount(createWorld('huge-reject', cfg), PID, 1e15);
    const big = placeOrder(s, { playerId: PID, assetId: 'FROG', side: 'buy', type: 'market', qty: 1e17 });
    expect(big.order.status).toBe('rejected');
    expect(big.order.rejectReason).toBe('quantity above 2^53 units');
    expect(big.state.accounts[PID]).toEqual(s.accounts[PID]);
    const stock = placeOrder(s, { playerId: PID, assetId: 'HLCN', side: 'buy', type: 'market', qty: 2 ** 54 });
    expect(stock.order.rejectReason).toBe('quantity above 2^53 units');
    // the cap itself is still a legal size
    const ok = placeOrder(s, { playerId: PID, assetId: 'FROG', side: 'buy', type: 'market', qty: Number.MAX_SAFE_INTEGER });
    expect(ok.order.rejectReason).toBeUndefined();
  });
});

/**
 * F7 (Phase 1 huge money): selling shares never pays negative money. At $1e12 of one stock the impact term passes 1, which
 * made a long's modelled exit price, and so its liquidation proceeds, negative. The floor is 0: a long is worth nothing
 * beyond cash at that size, and a short still pays its cover cost (the only term that can go below cash).
 */
describe('F7 liquidation floor: a sale never pays below zero, a short keeps its cover cost', () => {
  it('a long too big to exit at a positive price marks at cash, and the sell estimate is not negative', () => {
    // SYN at $1e13: the sale impact is about 10 x mid, so the unfloored exit price would be negative (the F7 case)
    let s = openAccount(createWorld('f7-long', cfg), PID, 1e6);
    const i = s.config.assets.findIndex((a) => a.id === 'SYN');
    const px = Math.exp(s.assets[i]!.lnP);
    const qty = 1e13 / px;
    s = { ...s, accounts: { ...s.accounts, [PID]: { ...s.accounts[PID]!, positions: { SYN: { qty, avgCost: px, realizedPnl: 0 } } } } };
    expect(estimateFill(s, { assetId: 'SYN', side: 'sell', qty }).price).toBe(0);
    const liq = liquidationEquity(s, PID);
    expect(Number.isFinite(liq)).toBe(true);
    expect(liq).toBeCloseTo(1e6, 6);
  });

  it('a short at the same size pays its cover cost: liquidation equity is at least cash minus the cover cost', () => {
    let s = openAccount(createWorld('f7-short', cfg), PID, 1e6);
    const i = s.config.assets.findIndex((a) => a.id === 'SYN');
    const px = Math.exp(s.assets[i]!.lnP);
    const qty = 1e13 / px;
    s = { ...s, accounts: { ...s.accounts, [PID]: { ...s.accounts[PID]!, positions: { SYN: { qty: -qty, avgCost: px, realizedPnl: 0 } } } } };
    const liq = liquidationEquity(s, PID);
    // the cover cost is what buying the short back costs at the same impact and fee (estimateFill's buy total). A short is
    // not floored, so liquidation equity is cash less that cover: the lower bound the floor must not break, and an exact match
    const cover = estimateFill(s, { assetId: 'SYN', side: 'buy', qty }).total;
    expect(cover).toBeGreaterThan(qty * px); // the impact at this size costs more than the mid
    expect(Number.isFinite(liq)).toBe(true);
    expect(liq).toBeGreaterThanOrEqual(1e6 - cover - 1e-9 * cover);
    expect(Math.abs(liq - (1e6 - cover))).toBeLessThanOrEqual(1e-9 * cover);
    expect(liq).toBeLessThan(1e6 - qty * px);
  });

  it('below the floor a fill prices exactly as the unfloored formula: the floor only changes a sale that would pay below 0', () => {
    // mid · (1 ∓ (spread + impact)), the same operations and order as execPrice, so the match is exact, not to a tolerance
    const s = openAccount(createWorld('f7-id', cfg), PID, 1e6);
    for (const id of ['SYN', 'HLCN', 'AURH']) {
      const i = s.config.assets.findIndex((a) => a.id === id);
      const p = Math.exp(s.assets[i]!.lnP);
      for (const notional of [1e2, 1e4, 1e6]) {
        const qty = notional / p;
        const c = halfSpread(s, i) + impact(s, i, qty * p);
        const sell = p * (1 - c);
        const buy = p * (1 + c);
        expect(sell).toBeGreaterThan(0); // the unfloored branch is the one under test
        expect(estimateFill(s, { assetId: id, side: 'sell', qty }).price).toBe(sell);
        expect(estimateFill(s, { assetId: id, side: 'buy', qty }).price).toBe(buy);
      }
    }
  });
});
