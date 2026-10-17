import { describe, expect, it } from 'vitest';
import type { Order } from '@/engine';
import {
  alertDir, alertFired, buildLevels, defaultExitPrice, exitRole, levelMove, orderPrice, pnlIfClosed, priceOfY, priceSideRefusal, roundPrice, yOfPrice,
  type LevelFormat, type PriceScale,
} from './chartLevels';

/** A linear scale: 200 at the top row (y 0), 2 pixels per dollar going down. */
const scale: PriceScale = {
  priceToY: (p) => (200 - p) * 2,
  yToPrice: (y) => 200 - y / 2,
};

const fmt: LevelFormat = {
  avg: (p, usd, pct) => `avg ${p} ${usd.toFixed(2)} ${pct.toFixed(4)}`,
  exit: (k, p, usd) => `${k} ${p} ${usd.toFixed(2)}`,
  order: (side, type, p, q) => `${side} ${type} ${p} ${q}`,
  alert: (p) => `alert ${p}`,
  addTp: '+ TP',
  addSl: '+ SL',
};

function order(over: Partial<Order>): Order {
  return {
    id: 'o1', playerId: 'me', assetId: 'HLCN', side: 'sell', type: 'limit', qty: 10, tif: 'gtc', status: 'open',
    placedTick: 0, triggered: false, filledQty: 0, avgFillPrice: 0, feesPaid: 0, ...over,
  };
}

describe('price and pixel helpers', () => {
  it('FX and memecoin trailing lines and refusal prices use the asset tick', () => {
    const fx = order({ type: 'trailing', side: 'sell', trailRef: 1.08123, trailPct: 0.01 });
    expect(orderPrice(fx, 'forex')).toBe(1.07042);
    const meme = order({ type: 'trailing', side: 'sell', trailRef: 0.0000082, trailPct: 0.01 });
    expect(orderPrice(meme, 'crypto')).toBeCloseTo(0.000008118, 12);
    expect(priceSideRefusal(fx, 'tp', 1, 1.08123, 'forex')!.vars.price).toBe(1.08123);
    const levels = buildLevels({ assetClass: 'crypto', qty: 0, avgCost: 0, closeTotal: 0, orders: [meme], alerts: [], fmt });
    expect(levels[0]!.price).toBeCloseTo(0.000008118, 12);
  });
  it('a price and its pixel row convert both ways on a linear scale', () => {
    for (const p of [150, 179.37, 199.99]) {
      const y = yOfPrice(scale, p)!;
      expect(priceOfY(scale, y)).toBeCloseTo(p, 2);
    }
    expect(yOfPrice(scale, 180)).toBe(40);
    expect(priceOfY(scale, 40)).toBe(180);
  });

  it('a pixel row rounds to the cent at a dollar and up, and to four places below', () => {
    expect(roundPrice(180.456)).toBe(180.46);
    expect(roundPrice(0.123456)).toBe(0.1235);
    expect(priceOfY(scale, 40.7)).toBeCloseTo(179.65, 2);
  });

  it('a row off the scale, or a price that is not positive, has no pixel or price', () => {
    const cut: PriceScale = { priceToY: () => null, yToPrice: () => null };
    expect(yOfPrice(cut, 100)).toBeNull();
    expect(priceOfY(cut, 10)).toBeNull();
    expect(yOfPrice(scale, 0)).toBeNull();
    expect(yOfPrice(scale, -3)).toBeNull();
    expect(priceOfY(scale, 500)).toBeNull(); // 200 - 250 is negative
  });
});

describe('P&L if closed now', () => {
  it('a long books what it sells for, after the exit fee, less its cost', () => {
    // bought 10 at 100 (cost 100 a share with its fee), closing sells at 110 for 1099 after the fee
    expect(pnlIfClosed(10, 100, 1099)).toEqual({ usd: 99, pct: 0.099 });
  });

  it('a short books what it sold for less what it costs to cover', () => {
    // sold 10 short at 100, covering costs 1005 with its fee: the short made 1000 - 1005 + ... = -5 after fees
    expect(pnlIfClosed(-10, 100, 1005).usd).toBeCloseTo(-5, 6);
    expect(pnlIfClosed(-10, 100, 905).usd).toBeCloseTo(95, 6);
  });

  it('no position, or no cost, books nothing', () => {
    expect(pnlIfClosed(0, 100, 500)).toEqual({ usd: 0, pct: 0 });
    expect(pnlIfClosed(5, 0, 500)).toEqual({ usd: 0, pct: 0 });
  });
});

describe('level moves and default legs', () => {
  it('a take-profit above a long is a gain; a stop-loss on a short above the cost is a loss', () => {
    expect(levelMove(10, 100, 110)).toEqual({ usd: 100, pct: 0.1 });
    const short = levelMove(-10, 100, 105);
    expect(short.usd).toBeCloseTo(-50, 6);
    expect(short.pct).toBeCloseTo(-0.05, 6);
  });

  it('a new +TP and +SL start 5% up and 3% down on a long, mirrored on a short', () => {
    expect(defaultExitPrice('tp', 10, 100)).toBe(105);
    expect(defaultExitPrice('sl', 10, 100)).toBe(97);
    expect(defaultExitPrice('tp', -10, 100)).toBe(95);
    expect(defaultExitPrice('sl', -10, 100)).toBe(103);
  });
});

describe('orders as lines', () => {
  it('a limit draws its limit, a stop and a stop-limit their stop, a trailing stop its trigger', () => {
    expect(orderPrice(order({ type: 'limit', limitPrice: 120 }))).toBe(120);
    expect(orderPrice(order({ type: 'stop', stopPrice: 95 }))).toBe(95);
    expect(orderPrice(order({ type: 'stop_limit', stopPrice: 95, limitPrice: 94 }))).toBe(95);
    expect(orderPrice(order({ type: 'trailing', side: 'sell', trailRef: 100, trailPct: 0.05 }))).toBe(95);
    expect(orderPrice(order({ type: 'trailing', side: 'buy', trailRef: 100, trailPct: 0.05 }))).toBe(105);
    expect(orderPrice(order({ type: 'market' }))).toBeNull();
  });

  it('a reduce-only or bracket sell limit on a long is the take-profit; a sell stop is the stop-loss', () => {
    expect(exitRole(order({ type: 'limit', reduceOnly: true }), 10)).toBe('tp');
    expect(exitRole(order({ type: 'stop', ocoGroup: 'x' }), 10)).toBe('sl');
    expect(exitRole(order({ type: 'limit' }), 10)).toBeNull();
    expect(exitRole(order({ type: 'limit', side: 'buy', reduceOnly: true }), 10)).toBeNull();
    expect(exitRole(order({ type: 'limit', side: 'buy', reduceOnly: true }), -10)).toBe('tp');
    expect(exitRole(order({ type: 'limit', reduceOnly: true, status: 'filled' }), 10)).toBeNull();
  });
});

describe('alerts', () => {
  it('an alert set above the mid fires on a rise to its price, and one below on a fall', () => {
    expect(alertDir(120, 100)).toBe('above');
    expect(alertDir(80, 100)).toBe('below');
    expect(alertFired({ price: 120, dir: 'above' }, 119.99)).toBe(false);
    expect(alertFired({ price: 120, dir: 'above' }, 120)).toBe(true);
    expect(alertFired({ price: 80, dir: 'below' }, 81)).toBe(false);
    expect(alertFired({ price: 80, dir: 'below' }, 79.5)).toBe(true);
  });
});

describe('buildLevels', () => {
  it('draws the average line with +TP and +SL for the legs it lacks, and the legs and orders after it', () => {
    const levels = buildLevels({
      qty: 10, avgCost: 100, closeTotal: 1099, fmt,
      orders: [
        order({ id: 'tp1', type: 'limit', side: 'sell', limitPrice: 110, reduceOnly: true }),
        order({ id: 'sl1', type: 'stop', side: 'sell', stopPrice: 96, reduceOnly: true }),
        order({ id: 'lmt', type: 'limit', side: 'buy', limitPrice: 90, qty: 4 }),
        order({ id: 'mkt', type: 'market', side: 'buy' }),
      ],
      alerts: [{ id: 'a1', price: 120, dir: 'above' }],
    });
    expect(levels.map((l) => l.id)).toEqual(['avg', 'tp-tp1', 'sl-sl1', 'order-lmt', 'alert-a1']);
    const avg = levels[0]!;
    expect(avg.kind).toBe('avg');
    expect(avg.dashed).toBe(true);
    expect(avg.draggable).toBe(false);
    expect(avg.tone).toBe('gain');
    expect(avg.actions).toBeUndefined();
    expect(levels[1]).toMatchObject({ kind: 'tp', orderId: 'tp1', draggable: true, cancelable: true, tone: 'gain' });
    expect(levels[2]).toMatchObject({ kind: 'sl', orderId: 'sl1', draggable: true, tone: 'loss' });
    expect(levels[3]).toMatchObject({ kind: 'order', orderId: 'lmt', price: 90, draggable: true, tone: 'steel' });
    expect(levels[4]).toMatchObject({ kind: 'alert', alertId: 'a1', price: 120, draggable: false, cancelable: true });
  });

  it('offers +TP and +SL on the average line when the position has no legs', () => {
    const levels = buildLevels({ qty: -10, avgCost: 100, closeTotal: 1005, orders: [], alerts: [], fmt });
    expect(levels).toHaveLength(1);
    expect(levels[0]!.tone).toBe('loss');
    expect(levels[0]!.actions).toEqual([{ key: 'addTp', label: '+ TP' }, { key: 'addSl', label: '+ SL' }]);
  });

  it('draws nothing for a flat account with no orders, and skips a filled order', () => {
    expect(buildLevels({ qty: 0, avgCost: 0, closeTotal: 0, orders: [order({ status: 'filled', type: 'limit', limitPrice: 99 })], alerts: [], fmt })).toEqual([]);
  });

  it('a second take-profit is a working order, not a second leg; a trailing stop cannot be dragged', () => {
    const levels = buildLevels({
      qty: 10, avgCost: 100, closeTotal: 1000, fmt,
      orders: [
        order({ id: 'a', type: 'limit', reduceOnly: true, limitPrice: 110 }),
        order({ id: 'b', type: 'limit', reduceOnly: true, limitPrice: 115 }),
        order({ id: 'tr', type: 'trailing', side: 'sell', trailRef: 100, trailPct: 0.05 }),
      ],
      alerts: [],
    });
    expect(levels.map((l) => l.id)).toEqual(['avg', 'tp-a', 'order-b', 'order-tr']);
    expect(levels.find((l) => l.id === 'order-tr')).toMatchObject({ draggable: false, cancelable: true, price: 95 });
  });
});

describe('the side rules against the price (a leg or stop on the wrong side fills or fires at once)', () => {
  it('a stop waits past the mid: a buy above it, a sell below it', () => {
    expect(priceSideRefusal({ side: 'buy', type: 'stop' }, null, 101, 100)).toBeNull();
    expect(priceSideRefusal({ side: 'buy', type: 'stop' }, null, 99, 100)).toMatchObject({ key: 'broker.refuse.stopBuy' });
    expect(priceSideRefusal({ side: 'sell', type: 'stop_limit' }, null, 101, 100)).toMatchObject({ key: 'broker.refuse.stopSell' });
  });

  it('a long take-profit sits above the mid and its stop-loss below; a short is the reverse', () => {
    expect(priceSideRefusal({ side: 'sell', type: 'limit' }, 'tp', 101, 100)).toBeNull();
    expect(priceSideRefusal({ side: 'sell', type: 'limit' }, 'tp', 100, 100)).toMatchObject({ key: 'broker.refuse.tpAbove', vars: { price: 100, mid: 100 } });
    expect(priceSideRefusal({ side: 'sell', type: 'stop' }, 'sl', 99, 100)).toBeNull();
    expect(priceSideRefusal({ side: 'sell', type: 'stop' }, 'sl', 101, 100)).toMatchObject({ key: 'broker.refuse.slBelow' });
    expect(priceSideRefusal({ side: 'buy', type: 'limit' }, 'tp', 99, 100)).toBeNull();
    expect(priceSideRefusal({ side: 'buy', type: 'limit' }, 'tp', 101, 100)).toMatchObject({ key: 'broker.refuse.tpBelow' });
    expect(priceSideRefusal({ side: 'buy', type: 'stop' }, 'sl', 101, 100)).toBeNull();
    expect(priceSideRefusal({ side: 'buy', type: 'stop' }, 'sl', 99, 100)).toMatchObject({ key: 'broker.refuse.slAbove' });
  });

  it('a plain limit is no side refusal (a marketable limit is a warning on the ticket)', () => {
    expect(priceSideRefusal({ side: 'buy', type: 'limit' }, null, 101, 100)).toBeNull();
  });

  it('a +TP or +SL the price has already passed starts 1% beyond the price', () => {
    expect(defaultExitPrice('tp', 10, 100, 110)).toBe(111.1);
    expect(defaultExitPrice('sl', 10, 100, 90)).toBe(89.1);
    expect(defaultExitPrice('tp', 10, 100, 100)).toBe(105);
    expect(defaultExitPrice('sl', -10, 100, 110)).toBe(111.1);
    expect(defaultExitPrice('tp', -10, 100, 90)).toBe(89.1);
  });

  it('a leg line says its $ and % move at the price it is dragged to', () => {
    const levels = buildLevels({
      qty: 10, avgCost: 100, closeTotal: 0, alerts: [], fmt,
      orders: [order({ id: 'tp1', side: 'sell', type: 'limit', reduceOnly: true, limitPrice: 105, qty: 10 })],
    });
    const tp = levels.find((l) => l.kind === 'tp')!;
    expect(tp.labelAt!(110)).toBe('tp 110 100.00');
  });
});
