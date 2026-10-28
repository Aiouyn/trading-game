// T04-09 step 12: a deterministic stub of 05 for 04's tests. One line; an exogenous NPC sell flow per tick that, unopposed, lifts the yield
// by `driftPerTick`; single-price clearing of the tick's CB pool orders against it; the yield follows the clearing price through the supplied
// price/yield functions. Exposes `poolFills` / `lineYield` / `fairPriceOf` / `lineAdv` for the ports.
import { MICRO_N, roundHalfEven, type Money, type Qty } from '@tycoon/engine-core';
import type { NpcPoolOrder } from '../schema';

export interface MarketStubOpts { assetId: string; y0: number; driftPerTick: number; sellFlowPerTick: Qty /* face, = ADV */;
  priceOfYield(y: number): number /* clean per 100 */; yieldOfPrice(per100: number): number }
export interface StubFill { assetId: string; side: 'BUY' | 'SELL'; qty: Qty; notional: Money; ccy: 'PYN' }
export interface MarketStub { step(tick: number, orders: readonly NpcPoolOrder[]): StubFill[]; yield(): number;
  poolFills(tick: number, poolId: string): StubFill[]; fairPrice(): bigint; adv(): number }

export function createMarketStub(o: MarketStubOpts): MarketStub {
  let y = o.y0;
  const fills: Record<string, StubFill[]> = {};
  const pxE6 = (per100: number): bigint => BigInt(roundHalfEven((per100 / 100) * 1e6));
  return {
    step(tick, orders) {
      const unopposed = y + o.driftPerTick, pxFree = pxE6(o.priceOfYield(unopposed));
      // best CB bid on the line at or above the unopposed price; it absorbs the flow up to its size at its limit
      const bids = orders.filter((r) => r.assetId === o.assetId && r.side === 'BUY' && r.limitPrice !== undefined && r.limitPrice > pxFree)
        .sort((a, c) => (a.limitPrice! > c.limitPrice! ? -1 : a.limitPrice! < c.limitPrice! ? 1 : 0));
      let left = o.sellFlowPerTick, px = pxFree;
      const out: StubFill[] = [];
      for (const b of bids) {
        if (left <= 0n) break;
        const q = b.qty < left ? b.qty : left;
        out.push({ assetId: o.assetId, side: 'BUY', qty: q, notional: (q * b.limitPrice!) / MICRO_N, ccy: 'PYN' });
        left -= q; px = b.limitPrice!;
      }
      y = left > 0n ? unopposed : o.yieldOfPrice((Number(px) / 1e6) * 100);   // flow fully absorbed → yield held at the bid
      fills[`${tick}:${bids[0]?.poolId ?? ''}`] = out;
      return out;
    },
    yield: () => y,
    poolFills: (tick, poolId) => fills[`${tick}:${poolId}`] ?? [],
    fairPrice: () => pxE6(o.priceOfYield(y)),
    adv: () => Number(o.sellFlowPerTick),
  };
}
