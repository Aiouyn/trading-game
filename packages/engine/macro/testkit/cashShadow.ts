// E-106 test kit: a cash-applying wrap of the macro world's recording ledger. Every posting moves `${entity}:${ccy}` cash in the shadow the
// way the 03 ledger books it (fx: a pays a1 of c1 to b, b pays a2 of c2 to a). The recording ledger's own reads are unchanged, so the run's
// numbers are those of the plain macro world. 03 is not wired into the macro test kit (T04-21 registerMacroEntities not built).
import type { Id, Money, PhaseCtx } from '@tycoon/engine-core';

export interface CashShadow { cash(e: Id, ccy: string): Money }
export function cashShadow(ctx: PhaseCtx): CashShadow {
  const c: Record<string, bigint> = {}, mv = (e: Id | undefined, ccy: string, d: bigint): void => { if (e) c[`${e}:${ccy}`] = (c[`${e}:${ccy}`] ?? 0n) + d; };
  const l = ctx.ledger as unknown as Record<string, (...a: never[]) => unknown>, o = { ...l };
  const wrap = (k: string, f: (...a: never[]) => void): void => { l[k] = ((...a: never[]) => { const r = o[k]!(...a); f(...a); return r; }) as never; };
  const xfer = (a: Id, b: Id, amt: bigint, ccy: string): void => { mv(a, ccy, -amt); mv(b, ccy, amt); };
  for (const k of ['pay', 'cbCredit', 'cbCreditUnwind', 'elasticIn', 'elasticOut']) wrap(k, xfer as never);
  wrap('swapAsset', ((buyer: Id, seller: Id, _a: string, _q: bigint, amt: bigint, ccy: string) => xfer(buyer, seller, amt, ccy)) as never);
  wrap('mint', ((to: Id, amt: bigint, ccy: string) => mv(to, ccy, amt)) as never);
  wrap('burn', ((from: Id, amt: bigint, ccy: string) => mv(from, ccy, -amt)) as never);
  wrap('fx', ((a: Id, b: Id, c1: string, a1: bigint, c2: string, a2: bigint) => { xfer(a, b, a1, c1); xfer(b, a, a2, c2); }) as never);
  return { cash: (e, ccy) => c[`${e}:${ccy}`] ?? 0n };
}
