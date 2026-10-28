// T04-09 reserve managers (04 §6.4) and quarterly profit remittance (04 §3.8.5 last bullet).
import { divRoundHalfEven, MICRO_N, roundHalfEven, type Ccy, type Money, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type CentralBank, type NpcPoolOrder } from '../schema';
import { tradingDayIndexInQuarter } from './calendar';
import { iocLimit } from './poolOrders';
import { accountsOfEntity, periodNet } from './t03Stubs';

type Bucket = 'FDL_BONDS' | 'EUN_BONDS' | 'GOLD' | 'NKR_BONDS' | 'PYN_BONDS';
export const RESERVE_TARGET: Readonly<{ FDL_BONDS: 0.60; EUN_BONDS: 0.20; GOLD: 0.10; NKR_BONDS: 0.05; PYN_BONDS: 0.05 }> =
  Object.freeze({ FDL_BONDS: 0.60, EUN_BONDS: 0.20, GOLD: 0.10, NKR_BONDS: 0.05, PYN_BONDS: 0.05 });
const BUCKETS: readonly Bucket[] = ['FDL_BONDS', 'EUN_BONDS', 'GOLD', 'NKR_BONDS', 'PYN_BONDS'];
const BOND_BLOC: Partial<Record<Bucket, BlocId>> = { FDL_BONDS: 'FDL', EUN_BONDS: 'EUN', NKR_BONDS: 'NKR', PYN_BONDS: 'PYN' };
const REBAL_DAYS = 5;

/** The CB's own-currency bucket dropped, the rest renormalized (SRL has none: the table as is). */
export function reserveTargets(own: BlocId): Record<Bucket, number> {
  const drop = BUCKETS.find((k) => BOND_BLOC[k] === own);
  const sum = BUCKETS.reduce((s, k) => (k === drop ? s : s + RESERVE_TARGET[k]), 0);
  const out = {} as Record<Bucket, number>;
  for (const k of BUCKETS) out[k] = k === drop ? 0 : roundHalfEven((RESERVE_TARGET[k] / sum) * 1e6) / 1e6;
  return out;
}

/** First 5 trading days of a quarter: per bond bucket, (target − current) at fair value ÷ trading days left in the window, as an IOC order on
 *  that bloc's on-the-run 10y at the §6.3 limit. Current value per bucket from `cb.reserves` (FDL cash; otherFx at spot). Unit decisions:
 *  bond holdings are tracked in `cb.reserves` cash terms (06 has no reserve-bond port), and GOLD orders wait for a gold asset id
 *  (MISSING EXPORT: T06 gold assetId), so the GOLD bucket only counts toward the total. */
export function reserveRebalanceOrders(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): NpcPoolOrder[] {
  const cb = ctx.store.get<CentralBank>(macroTables.cb.name, cbkId(b)), gameDay = Math.floor(ctx.tick / 720);
  const k = tradingDayIndexInQuarter(b, gameDay);
  if (!cb || k === null || k >= REBAL_DAYS) return [];
  const spot = (c: BlocId): number => (c === 'FDL' ? 1 : ports.markets.fxSpot(ctx.store, c as Ccy) ?? BLOC_DEFAULTS[c].fx0);
  const goldPx = ports.assets.commodityClose(ctx.store, 'GOLD') ?? 0;
  const cur: Record<Bucket, number> = { FDL_BONDS: Number(cb.reserves.fdl), GOLD: (Number(cb.reserves.gold) * goldPx), EUN_BONDS: 0, NKR_BONDS: 0, PYN_BONDS: 0 };
  for (const c of ['EUN', 'NKR', 'PYN'] as const) cur[`${c}_BONDS`] = Number(cb.reserves.otherFx[c] ?? 0n) * spot(c);
  const total = BUCKETS.reduce((s, x) => s + cur[x], 0), tg = reserveTargets(b), out: NpcPoolOrder[] = [];
  for (const x of BUCKETS) {
    const bb = BOND_BLOC[x];
    if (!bb || bb === b) continue;
    const line = ports.assets.sovereignLines(ctx.store, govId(bb)).find((l) => l.onTheRun && l.tenor === 'N10Y');
    if (!line) continue;
    const gapFdl = (tg[x] * total - cur[x]) / (REBAL_DAYS - k), fair = ports.markets.fairPriceOf(ctx.store, line.assetId) ?? MICRO_N;
    const local = BigInt(roundHalfEven(Math.abs(gapFdl) / spot(bb)));
    const qty = divRoundHalfEven(local * MICRO_N, fair);
    if (qty <= 0n) continue;
    const side = gapFdl > 0 ? 'BUY' : 'SELL', h = ports.markets.makerHalfSpread(ctx.store, line.assetId) ?? 0;
    out.push({ id: `rr_${b}_${x}_${ctx.tick}`, poolId: `CB:${b}`, assetId: line.assetId, side, qty, limitPrice: iocLimit(fair, h, side), tif: 'TICK', tick: ctx.tick, purpose: 'RESERVE_REBAL' });
  }
  return out;
}

/** Quarter close: net income = −Σ periodNet(QUARTER) over the cbk's 4xxx and 5xxx accounts; positive → CBK_PROFIT_REMITTANCE to the
 *  treasury, losses retained. Returns the amount posted (0n when none). */
export function remitProfit(ctx: PhaseCtx, b: BlocId): Money {
  const q = Math.floor(Math.floor(ctx.tick / 720) / 91);
  let net = 0n;
  for (const a of accountsOfEntity(ctx.store, cbkId(b))) if (a.code >= 4000 && a.code < 6000) net -= periodNet(ctx.store, a.key, 'QUARTER', q);
  if (net <= 0n) return 0n;
  ctx.ledger.pay(cbkId(b), govId(b), net, b as Ccy, 'CBK_PROFIT_REMITTANCE');
  return net;
}
