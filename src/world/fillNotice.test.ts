import { describe, expect, it } from 'vitest';
import type { Fill } from '@/engine';
import { translate } from '@/i18n';
import { fillNotice } from './players';

function fill(side: 'buy' | 'sell', qty: number, price: number, fee: number): Fill {
  return { orderId: 'o1', playerId: 'u1', assetId: 'HLCN', side, qty, price, fee, tick: 1, mid: price };
}

describe('fill notices (the inbox line and the toast)', () => {
  it('reads "Bought 5 HLCN at 177.22 · cost $887.10 · fee $1.00", with the cost including the fee', () => {
    const n = fillNotice(fill('buy', 5, 177.22, 1), 0, false);
    expect(n.text).toBe('Bought 5 HLCN at 177.22 · cost $887.10 · fee $1.00');
    // the numbers are locale tokens: the viewer's locale formats them (see i18n formatNumberToken)
    expect(n.msg).toEqual({ key: 'fill.bought', vars: { qty: '#n:5,0,4', asset: 'HLCN', price: '#n:177.22,0,2', amount: '#n:887.1,2,2', fee: '#n:1,2,2' } });
    expect(n.tone).toBe('gain');
  });

  it('reads in French with a decimal comma and the cost in dollars after the amount (the fill toast, fr)', () => {
    const m = fillNotice(fill('buy', 5, 177.22, 1), 0, false).msg!;
    const fr = translate('fr', m.key, m.vars);
    expect(fr).toBe('Achat de 5 HLCN à 177,22 · coût 887,10 $ · frais 1,00 $');
    expect(fr).not.toContain('177.22');
    expect(translate('en', m.key, m.vars)).toBe('Bought 5 HLCN at 177.22 · cost $887.10 · fee $1.00');
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
