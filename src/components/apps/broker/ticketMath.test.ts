import { describe, expect, it } from 'vitest';
import { changeRefusal, checkOrder, engineRefusal, formatRefusalVars, parseDecimal, tradeSummary, type OrderCheck } from './ticketMath';

/** A buy of 10 shares at 100 with a 1-share cash account that can pay for it: a clean base for each rule. */
function base(over: Partial<OrderCheck> = {}): OrderCheck {
  return {
    side: 'buy', type: 'market', qty: 10, mid: 100, ref: 100.05, limit: 0, stop: 0, trail: 5, tp: null, sl: null,
    cash: 5000, bp: 5000, margin: false, total: 1001, notional: 1000.5, held: 0,
    simpleCap: false, capCash: Infinity, capPct: 20, capRank: 'Hustler', locked: false, lockedTier: 'retail',
    shorting: false, opening: 10, committed: 0, canShort: true, shortOk: true, shortCollateral: 0, fee: 1, ...over,
  };
}

describe('parseDecimal', () => {
  it('reads a comma or a dot as the one decimal point', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal(' 3 ')).toBe(3);
  });
  it('reads an empty or broken field as zero', () => {
    expect(parseDecimal('')).toBe(0);
    expect(parseDecimal('abc')).toBe(0);
  });
});

describe('checkOrder: the first failing rule wins and sits under its field', () => {
  it('a clean order has no refusal', () => {
    expect(checkOrder(base())).toEqual({ refusal: null, warning: null });
  });

  it('an empty size is a CTA reason only, with no message under the field', () => {
    const r = checkOrder(base({ qty: 0 })).refusal!;
    expect(r.field).toBe('qty');
    expect(r.key).toBeUndefined();
    expect(r.cta).toBe('broker.cta.size');
  });

  it('a cash account refuses a buy that its fee-included total does not cover, with both numbers', () => {
    const r = checkOrder(base({ cash: 500, total: 1001, bp: 500 })).refusal!;
    expect(r).toMatchObject({ field: 'qty', key: 'broker.refuse.cash', cta: 'broker.cta.cash', vars: { total: 1001, cash: 500 } });
  });

  it('a refused buy names the largest size it affords as Max = X (UX stage 6, weakness 2)', () => {
    const r = checkOrder(base({ cash: 500, total: 1001, bp: 500, max: 4 })).refusal!;
    expect(r).toMatchObject({ key: 'broker.refuse.cashMax', vars: { total: 1001, cash: 500, max: 4 } });
    // no max (a sell, or nothing affordable): the plain refusal
    expect(checkOrder(base({ cash: 500, total: 1001, bp: 500, max: 0 })).refusal).toMatchObject({ key: 'broker.refuse.cash' });
  });

  it('the money in a refusal is formatted with the ticket money formatter, never a raw float (weakness 2)', () => {
    const money = (n: number) => `$${n.toFixed(2)}`;
    const qty = (n: number) => String(n);
    const vars = formatRefusalVars({ total: 101489753.6992725, cash: 5689.56, max: 3, need: 2, bp: 0.5, pct: 20 }, { money, qty });
    expect(vars).toEqual({ total: '$101489753.70', cash: '$5689.56', max: '3', need: '$2.00', bp: '$0.50', pct: 20 });
    expect(formatRefusalVars(undefined, { money, qty })).toBeUndefined();
  });

  it('a margin account is checked against buying power, not cash', () => {
    const margin = base({ margin: true, cash: 50, bp: 200, notional: 1000 });
    // the fee counts against buying power on a margin account too: the need is the total (notional plus fee)
    expect(checkOrder(margin).refusal).toMatchObject({ key: 'broker.refuse.bp', vars: { need: 1001, bp: 200 } });
  });

  it('the simple-mode cap refuses a buy over its share of cash', () => {
    const r = checkOrder(base({ simpleCap: true, capCash: 400, mid: 100, qty: 10 })).refusal!;
    expect(r).toMatchObject({ key: 'broker.firstCap', vars: { pct: 20, rank: 'Hustler' } });
  });

  it('a limit needs a price; a stop needs one too', () => {
    expect(checkOrder(base({ type: 'limit', limit: 0 })).refusal).toMatchObject({ field: 'limit', key: 'broker.refuse.limit' });
    expect(checkOrder(base({ type: 'stop', stop: 0 })).refusal).toMatchObject({ field: 'stop', key: 'broker.refuse.stop' });
  });

  it('a buy stop must sit above the mid and a sell stop below it', () => {
    expect(checkOrder(base({ type: 'stop', stop: 99, mid: 100 })).refusal).toMatchObject({ field: 'stop', key: 'broker.refuse.stopBuy', vars: { mid: 100 } });
    expect(checkOrder(base({ type: 'stop', side: 'sell', stop: 101, mid: 100 })).refusal).toMatchObject({ field: 'stop', key: 'broker.refuse.stopSell' });
    expect(checkOrder(base({ type: 'stop', stop: 101, mid: 100 })).refusal).toBeNull();
    expect(checkOrder(base({ type: 'stop', side: 'sell', stop: 99, mid: 100 })).refusal).toBeNull();
  });

  it('a stop-limit checks its stop side too', () => {
    expect(checkOrder(base({ type: 'stop_limit', limit: 102, stop: 99, mid: 100 })).refusal).toMatchObject({ field: 'stop', key: 'broker.refuse.stopBuy' });
  });

  it('a limit on the marketable side of the mid is allowed, with a warning', () => {
    expect(checkOrder(base({ type: 'limit', limit: 101, mid: 100 }))).toEqual({ refusal: null, warning: 'broker.warn.marketable' });
    expect(checkOrder(base({ type: 'limit', limit: 99, mid: 100 })).warning).toBeNull();
    expect(checkOrder(base({ type: 'limit', side: 'sell', limit: 99, mid: 100 })).warning).toBe('broker.warn.marketable');
  });

  it('a trailing stop stays between 0 and 50 percent', () => {
    expect(checkOrder(base({ type: 'trailing', trail: 60 })).refusal).toMatchObject({ field: 'trail' });
    expect(checkOrder(base({ type: 'trailing', trail: 5 })).refusal).toBeNull();
  });

  it('take-profit and stop-loss are optional, but a set one must be positive and on the profit side of the other', () => {
    expect(checkOrder(base({ tp: null, sl: null })).refusal).toBeNull();
    expect(checkOrder(base({ tp: 105, sl: null })).refusal).toBeNull();
    expect(checkOrder(base({ tp: 0 })).refusal).toMatchObject({ field: 'tp', key: 'broker.refuse.bracket' });
    expect(checkOrder(base({ sl: -1 })).refusal).toMatchObject({ field: 'sl', key: 'broker.refuse.bracket' });
    expect(checkOrder(base({ tp: 95, sl: 97 })).refusal).toMatchObject({ field: 'tp', key: 'broker.refuse.bracketSide' });
    expect(checkOrder(base({ side: 'sell', tp: 95, sl: 105 })).refusal).toBeNull();
    expect(checkOrder(base({ side: 'sell', tp: 105, sl: 95 })).refusal).toMatchObject({ field: 'tp', key: 'broker.refuse.bracketSide' });
  });

  it('a short sale is not refused here: the engine decides it', () => {
    expect(checkOrder(base({ side: 'sell', qty: 10, held: 0, cash: 5000 })).refusal).toBeNull();
  });

  it('a locked license refuses under the whole ticket', () => {
    expect(checkOrder(base({ locked: true, lockedTier: 'pro' })).refusal).toMatchObject({ field: 'general', key: 'broker.refuse.license', vars: { tier: 'pro' } });
  });
});

describe('tradeSummary: the cost before the trade', () => {
  it('a round trip pays two fees and crosses the gap to mid twice; the break-even is the mid a close needs (no double count)', () => {
    const s = tradeSummary({
      side: 'buy', qty: 10, price: 100.05, mid: 100, fee: 1, halfSpreadFrac: 0.0005, cash: 5000, bp: 5000,
      margin: false, shorting: false, total: 1002.5, notional: 1000.5,
    });
    // slippage 0.05 a unit: round trip = 2 fees + 2 × 10 × 0.05 = 2 + 1
    expect(s.roundTrip).toBeCloseTo(3, 6);
    // the fill already sits one gap (0.05) above mid: the break-even adds the exit gap once and the two fees (0.2)
    expect(s.breakEven).toBeCloseTo(100 + 2 * 0.05 + 0.2, 6);
    expect(s.spreadPct).toBeCloseTo(0.001, 6);
    expect(s.spread).toBeCloseTo(0.1, 6);
    expect(s.cashAfter).toBeCloseTo(5000 - 1002.5, 6);
    expect(s.bpAfter).toBeCloseTo(5000 - 1002.5, 6);
  });

  it('a short moves the break-even down and adds the proceeds to cash', () => {
    const s = tradeSummary({
      side: 'sell', qty: 10, price: 99.95, mid: 100, fee: 1, halfSpreadFrac: 0.0005, cash: 5000, bp: 5000,
      margin: false, shorting: true, total: 997.5, notional: 999.5,
    });
    expect(s.breakEven).toBeCloseTo(100 - 2 * 0.05 - 0.2, 6);
    expect(s.cashAfter).toBeCloseTo(5000 + 997.5, 6);
    expect(s.bpAfter).toBeCloseTo(5000 - 999.5, 6);
  });

  it('the spread and the impact are separate lines (R-10-1): half spread on the size, and the own impact on the size', () => {
    const s = tradeSummary({
      side: 'buy', qty: 10, price: 100.06, mid: 100, fee: 1, halfSpreadFrac: 0.0005, impactFrac: 0.0001, cash: 5000, bp: 5000,
      margin: false, shorting: false, total: 1002.5, notional: 1000.6,
    });
    expect(s.spreadCost).toBeCloseTo(10 * 100 * 0.0005, 9);
    expect(s.impactCost).toBeCloseTo(10 * 100 * 0.0001, 9);
  });

  it('an empty size costs nothing to go in and out of', () => {
    const s = tradeSummary({ side: 'buy', qty: 0, price: 100, mid: 100, fee: 0, halfSpreadFrac: 0, cash: 10, bp: 10, margin: false, shorting: false, total: 0, notional: 0 });
    expect(s.roundTrip).toBe(0);
    expect(s.breakEven).toBe(100);
  });
});

describe('engineRefusal: the engine says why, under the field that caused it', () => {
  it('maps the engine codes to their field and copy', () => {
    expect(engineRefusal('insufficient cash', 'buy', true, { cash: 12 })).toEqual({ field: 'qty', key: 'broker.refuse.cashNow', vars: { cash: 12 } });
    expect(engineRefusal('insufficient buying power', 'buy', true, { bp: 3 })).toMatchObject({ field: 'qty', key: 'broker.refuse.bpNow' });
    expect(engineRefusal('stacking', 'sell', true)).toEqual({ field: 'qty', key: 'broker.refuse.stacking' });
    expect(engineRefusal('limit price required', 'buy', true)).toMatchObject({ field: 'limit' });
    expect(engineRefusal('stop price required', 'buy', true)).toMatchObject({ field: 'stop' });
    expect(engineRefusal('bad stop-loss', 'buy', true)).toMatchObject({ field: 'sl' });
  });

  it('a short the account cannot take says so (the engine answers with insufficient position)', () => {
    expect(engineRefusal('insufficient position', 'sell', false)).toEqual({ field: 'qty', key: 'broker.refuse.short' });
    expect(engineRefusal('insufficient position', 'sell', true)).toEqual({ field: 'qty', key: 'broker.refuse.fewer' });
  });

  it('an unknown code keeps the engine words under the CTA', () => {
    expect(engineRefusal('closedWindow', 'buy', true)).toEqual({ field: 'general', key: 'broker.refuse.engine', vars: { reason: 'closedWindow' } });
  });
});

describe('the take-profit and stop-loss against the entry price (they fill or fire at once on the wrong side)', () => {
  it('a long take-profit sits above the entry reference and a long stop-loss below it', () => {
    expect(checkOrder(base({ tp: 100.5 })).refusal).toBeNull(); // the reference is 100.05
    expect(checkOrder(base({ tp: 100.01 })).refusal).toMatchObject({ field: 'tp', key: 'broker.refuse.tpAbove', cta: 'broker.cta.tpSide' });
    expect(checkOrder(base({ sl: 99 })).refusal).toBeNull();
    expect(checkOrder(base({ sl: 101 })).refusal).toMatchObject({ field: 'sl', key: 'broker.refuse.slBelow', cta: 'broker.cta.slSide' });
  });

  it('a short take-profit sits below and a short stop-loss above', () => {
    expect(checkOrder(base({ side: 'sell', tp: 99 })).refusal).toBeNull();
    expect(checkOrder(base({ side: 'sell', tp: 101 })).refusal).toMatchObject({ field: 'tp', key: 'broker.refuse.tpBelow' });
    expect(checkOrder(base({ side: 'sell', sl: 101 })).refusal).toBeNull();
    expect(checkOrder(base({ side: 'sell', sl: 99 })).refusal).toMatchObject({ field: 'sl', key: 'broker.refuse.slAbove' });
  });

  it('a limit entry checks its legs against its own limit, the price the children are placed at', () => {
    expect(checkOrder(base({ type: 'limit', limit: 95, ref: 95, tp: 97 })).refusal).toBeNull();
    expect(checkOrder(base({ type: 'limit', limit: 95, ref: 95, tp: 94 })).refusal).toMatchObject({ key: 'broker.refuse.tpAbove' });
  });
});

describe('changeRefusal: an order change the engine refused reads as copy, never as its raw code', () => {
  it('maps the known reasons to their own line', () => {
    expect(changeRefusal('order is closed', 'sell', true)).toEqual({ key: 'broker.refuse.closed' });
    expect(changeRefusal('below the filled quantity', 'sell', true)).toEqual({ key: 'broker.refuse.belowFilled' });
    expect(changeRefusal('unknown order', 'sell', true)).toEqual({ key: 'broker.refuse.gone' });
    expect(changeRefusal('limit price required', 'buy', true)).toEqual({ key: 'broker.refuse.limit' });
  });

  it('any other reason is the generic line, not the engine words', () => {
    expect(changeRefusal('closedWindow', 'buy', true)).toEqual({ key: 'broker.refuse.engineGeneric' });
  });
});

describe('checkOrder: the short rules (R0 cash-secured short, covered insiders, the aggregate simple cap)', () => {
  const short = (over: Partial<OrderCheck> = {}) => base({
    side: 'sell', qty: 5, ref: 100, total: 499, notional: 500, held: 0, shorting: true, opening: 5,
    shortCollateral: 500, cash: 5000, bp: 5000, ...over,
  });

  it('a short on an account that may short, with the collateral covered, has no refusal', () => {
    expect(checkOrder(short()).refusal).toBeNull();
  });

  it('a short the account may not take is refused under the size, and the CTA says why', () => {
    const r = checkOrder(short({ canShort: false })).refusal;
    expect(r).toMatchObject({ field: 'qty', key: 'broker.refuse.short', cta: 'broker.cta.short' });
  });

  it('selling more than the holding on an account without shorts says so', () => {
    expect(checkOrder(short({ canShort: false, held: 2 })).refusal).toMatchObject({ key: 'broker.refuse.fewer' });
  });

  it('a covered insider may not short its own company', () => {
    expect(checkOrder(short({ shortOk: false })).refusal).toMatchObject({ key: 'broker.refuse.covered', cta: 'broker.cta.covered' });
  });

  it('the short collateral and the fee must fit in buying power', () => {
    expect(checkOrder(short({ bp: 400, shortCollateral: 500 })).refusal).toMatchObject({ key: 'broker.refuse.bp', vars: { need: 501, bp: 400 } });
  });

  it('the simple cap is aggregate: open orders count against it, a sell that opens a short too', () => {
    // 20% of 1000 is 200; 150 is already committed by open orders, so a new 100 short is over the cap
    const over = checkOrder(short({ simpleCap: true, capCash: 200, committed: 150, opening: 1, qty: 1, ref: 100, mid: 100, shortCollateral: 100, total: 99, notional: 100 }));
    expect(over.refusal).toMatchObject({ key: 'broker.firstCap' });
    const under = checkOrder(short({ simpleCap: true, capCash: 200, committed: 50, opening: 1, qty: 1, ref: 100, mid: 100, shortCollateral: 100, total: 99, notional: 100 }));
    expect(under.refusal).toBeNull();
  });

  it('a sell that only closes a holding is not a short, so the short rules do not apply', () => {
    expect(checkOrder(base({ side: 'sell', qty: 3, held: 5, shorting: false, opening: 0, canShort: false, shortOk: false, total: 297, notional: 300 })).refusal).toBeNull();
  });
});

describe('engineRefusal: a covered short', () => {
  it('maps the engine reason to the covered line under the size', () => {
    expect(engineRefusal('covered short', 'sell', true)).toEqual({ field: 'qty', key: 'broker.refuse.covered' });
  });
});
