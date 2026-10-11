import { describe, expect, it } from 'vitest';
import type { Fill } from '@/engine';
import { fillNotice } from './players';

function fill(side: 'buy' | 'sell', qty: number, price: number, fee: number): Fill {
  return { orderId: 'o1', playerId: 'u1', assetId: 'HLCN', side, qty, price, fee, tick: 1, mid: price };
}

describe('fill notices (the inbox line and the toast)', () => {
  it('reads "Bought 5 HLCN at 177.22 · cost $887.10 · fee $1.00", with the cost including the fee', () => {
    const n = fillNotice(fill('buy', 5, 177.22, 1), 0, false);
    expect(n.text).toBe('Bought 5 HLCN at 177.22 · cost $887.10 · fee $1.00');
    expect(n.msg).toEqual({ key: 'fill.bought', vars: { qty: '5', asset: 'HLCN', price: '177.22', amount: '887.10', fee: '1.00' } });
    expect(n.tone).toBe('gain');
  });

  it('a sale is "Sold" with the proceeds after its fee', () => {
    const n = fillNotice(fill('sell', 5, 177.22, 1), 5, false);
    expect(n.text).toBe('Sold 5 HLCN at 177.22 · proceeds $885.10 · fee $1.00');
    expect(n.msg?.key).toBe('fill.sold');
    expect(n.tone).toBe('loss');
  });

  it('a sell past a flat position opens a short ("Shorted"), and a buy that closes a short is "Covered"', () => {
    expect(fillNotice(fill('sell', 5, 100, 0.5), 0, false).text).toBe('Shorted 5 HLCN at 100 · proceeds $499.50 · fee $0.50');
    expect(fillNotice(fill('sell', 5, 100, 0.5), -2, false).msg?.key).toBe('fill.shorted');
    expect(fillNotice(fill('buy', 5, 100, 0.5), -5, false).text).toBe('Covered 5 HLCN at 100 · cost $500.50 · fee $0.50');
    expect(fillNotice(fill('buy', 5, 100, 0.5), 3, false).msg?.key).toBe('fill.bought');
  });

  it('a liquidation says so, in the sold or covered form', () => {
    expect(fillNotice(fill('sell', 5, 100, 1), 5, true).text).toBe('Liquidated: sold 5 HLCN at 100 · proceeds $499.00 · fee $1.00');
    expect(fillNotice(fill('buy', 5, 100, 1), -5, true).msg?.key).toBe('fill.forced.covered');
  });
});
