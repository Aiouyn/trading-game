import { describe, expect, it } from 'vitest';
import { LP, LP_K } from './constants';
import { cashReserveAt, curveProgress, feeSplit, formulaCashAt, quoteBuy, quoteSell, spotAt } from './curve';


describe('bonding curve (L3)', () => {
  it('starts at the virtual reserves: $15,000 over 1,073,000,000 tokens', () => {
    expect(LP_K).toBe(15_000 * 1_073_000_000);
    expect(cashReserveAt(LP.Y0)).toBeCloseTo(LP.X0, 6);
    expect(spotAt(LP.Y0)).toBeCloseTo(0.00001398, 7);
  });

  it('graduates at 273M tokens: about $43,950 raised and a price near $0.000216', () => {
    expect(LP.Y0 - LP.GRAD_Y).toBe(LP.CURVE_SUPPLY);
    expect(formulaCashAt(LP.GRAD_Y)).toBeGreaterThan(43_900);
    expect(formulaCashAt(LP.GRAD_Y)).toBeLessThan(44_000);
    expect(spotAt(LP.GRAD_Y)).toBeCloseTo(0.000216, 6);
    expect(curveProgress(LP.GRAD_Y)).toBeCloseTo(1, 9);
    expect(curveProgress(LP.Y0)).toBe(0);
  });

  it('splits the 1% fee half to the creator and half to a sink, to the cent', () => {
    for (const n of [1, 99, 100, 12_345, 999_999]) {
      const f = feeSplit(n);
      expect(f.creator + f.sink).toBe(f.fee);
      expect(f.creator).toBeLessThanOrEqual(f.sink);
    }
    expect(feeSplit(10_000)).toEqual({ fee: 100, creator: 50, sink: 50 });
  });

  it('a buy follows the constant product: the curve gets the cash after the fee and the tokens are Y - k/(X+c)', () => {
    const q = quoteBuy(LP.Y0, 10_000);
    if (!q.ok) throw new Error('expected a quote');
    expect(q.feeCents).toBe(100);
    expect(q.cashCents).toBe(9_900);
    expect(q.spendCents).toBe(q.feeCents + q.cashCents);
    expect(q.creatorFeeCents + q.sinkFeeCents).toBe(q.feeCents);
    const want = Math.floor(LP.Y0 - LP_K / (LP.X0 + 99));
    expect(q.tokens).toBe(want);
    const y1 = LP.Y0 - q.tokens;
    // the new reserve keeps k: the formula cash after the buy is at most the cash the curve received (rounding favours the curve)
    expect(cashReserveAt(y1)).toBeLessThanOrEqual(LP.X0 + 99 + 1e-6);
    expect(q.avgPrice).toBeGreaterThan(q.spotBefore);
    expect(q.spotAfter).toBeGreaterThan(q.spotBefore);
  });

  it('a sell pays the curve the formula amount, rounded down to the cent, less the fee', () => {
    const y = LP.Y0 - 5_000_000;
    const s = quoteSell(y, 1_000_000);
    if (!s.ok) throw new Error('expected a quote');
    const gross = LP_K / y - LP_K / (y + 1_000_000);
    expect(s.grossCents).toBe(Math.floor(gross * 100 + 1e-9));
    expect(s.netCents).toBe(s.grossCents - s.feeCents);
    expect(s.creatorFeeCents + s.sinkFeeCents).toBe(s.feeCents);
    expect(s.slippage).toBeGreaterThan(0);
  });

  it('a round trip loses the fees and the slippage (no free money on the curve)', () => {
    const b = quoteBuy(LP.Y0, 5_000);
    if (!b.ok) throw new Error('expected a quote');
    const y1 = LP.Y0 - b.tokens;
    const s = quoteSell(y1, b.tokens);
    if (!s.ok) throw new Error('expected a quote');
    expect(s.netCents).toBeLessThan(b.spendCents);
  });

  it('refuses a sell past the supply, a zero or fractional size, and a buy at or past graduation', () => {
    expect(quoteSell(LP.Y0 - 10, 11)).toEqual({ ok: false, code: 'tooLarge' });
    expect(quoteSell(LP.Y0, 0)).toEqual({ ok: false, code: 'zero' });
    expect(quoteSell(LP.Y0, 1.5)).toEqual({ ok: false, code: 'zero' });
    expect(quoteBuy(LP.GRAD_Y, 1_000)).toEqual({ ok: false, code: 'sold' });
    expect(quoteBuy(LP.Y0, 0)).toEqual({ ok: false, code: 'zero' });
    expect(quoteBuy(LP.Y0, 1)).toMatchObject({ ok: true, tokens: 715 });
  });

  it('clips a buy at the graduation reserve and charges only for what fills', () => {
    const y = LP.GRAD_Y + 1_000;
    const q = quoteBuy(y, 50_000_00);
    if (!q.ok) throw new Error('expected a quote');
    expect(q.tokens).toBe(1_000);
    expect(q.graduates).toBe(true);
    expect(q.spendCents).toBeLessThan(5_000_000);
    expect(q.cashCents).toBeGreaterThanOrEqual(Math.round((LP_K / LP.GRAD_Y - LP_K / y) * 100));
  });

  it('the ticket slippage: a $100 buy at launch is inside the 5% default, a $5,000 buy is not', () => {
    const small = quoteBuy(LP.Y0, 10_000);
    const big = quoteBuy(LP.Y0, 500_000);
    if (!small.ok || !big.ok) throw new Error('expected quotes');
    expect(small.slippage).toBeLessThan(LP.MAX_SLIP);
    expect(big.slippage).toBeGreaterThan(LP.MAX_SLIP);
  });
});
