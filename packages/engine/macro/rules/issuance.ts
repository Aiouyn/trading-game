// T04-11 debt management (04 §3.10.1–§3.10.2): gross financing need, issuance mix, auction sizes, new-line coupons, the quarter's auction rows
// and their announcement 3 trading days ahead.
import { fromMoney, MICRO_N, TICKS_PER_GAME_DAY, toMoney, type PhaseCtx, type Qty, type StoreRead, type Tick } from '@tycoon/engine-core';
import { govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type CurveState, type FiscalState, type SovAuction, type SovereignIssue,
  type Tenor as SchemaTenor } from '../schema';
import { auctionsInQuarter, quarterStartDay } from './calendar';
import { nsZero } from './nelsonSiegel';

const D = TICKS_PER_GAME_DAY, FACE_STEP = 1_000_000, COUPON_STEP = 125;   // coupon grid 0.00125 = 125 / 100,000 (exact in binary at every grid point)
export type Tenor = SchemaTenor | 'N10Y_FDL';

/** §3.10.1 shares of GFN (`macro_issue_mix_<default|srl>_<tenor>`, registry rows MISSING EXPORT T23: this table is the single source, AC-04-11-MIXSTUB). */
export const ISSUE_MIX: Readonly<Record<'DEFAULT' | 'SRL', Record<Tenor, number>>> = Object.freeze({
  DEFAULT: { B3M: 0.12, B6M: 0.12, B1Y: 0.06, N2Y: 0.15, N5Y: 0.20, N10Y: 0.22, N30Y: 0.08, L10Y: 0.05, N10Y_FDL: 0 },
  SRL: { B3M: 0.16, B6M: 0.16, B1Y: 0.08, N2Y: 0.15, N5Y: 0.15, N10Y: 0.10, N30Y: 0, L10Y: 0, N10Y_FDL: 0.20 },
});
export const mixOf = (b: BlocId): Record<Tenor, number> => ISSUE_MIX[b === 'SRL' ? 'SRL' : 'DEFAULT'];

/** GFN = deficit/4 + maturing face + (28/364·spending − cash buffer), floored at 0 (all in currency units). */
export function grossFinancingNeed(f: FiscalState, annualDeficit: number, annualSpending: number, maturingInQuarter: number): number {
  return Math.max(0, annualDeficit / 4 + maturingInQuarter + ((28 / 364) * annualSpending - fromMoney(f.cashBuffer)));
}
/** floor(share·GFN/n / 1e6)·1e6 face units, as Qty (micro); 0 when the tenor has no auction. */
export function auctionSize(gfn: number, share: number, auctionsOfTenor: number): Qty {
  if (auctionsOfTenor <= 0) return 0n;
  return BigInt(Math.floor((share * gfn) / auctionsOfTenor / FACE_STEP)) * BigInt(FACE_STEP) * MICRO_N;
}
export function newLineCoupon(yWi: number): number { return (Math.floor(yWi / 0.00125) * COUPON_STEP) / 100_000; }
export function sovereignAssetId(b: BlocId, tenor: Tenor, maturityDay: number): string { return `ast_SOV_${b}_${tenor}_${maturityDay}`; }

const BILL_DAYS: Partial<Record<Tenor, number>> = { B3M: 91, B6M: 182, B1Y: 364 };
const NOTE_YEARS: Partial<Record<Tenor, number>> = { N2Y: 2, N5Y: 5, N10Y: 10, N30Y: 30, L10Y: 10, N10Y_FDL: 10 };
export const tenorDays = (t: Tenor): number => BILL_DAYS[t] ?? 364 * (NOTE_YEARS[t] ?? 0);
export const isBill = (t: Tenor): boolean => BILL_DAYS[t] !== undefined;

/** 05 last traded yield of the line, else the bloc's Nelson–Siegel zero at the maturity, else (no curve row yet) the bloc's genesis policy rate. */
export function whenIssuedYield(store: StoreRead, b: BlocId, assetId: string | null, maturityYears: number, ports: MacroPorts): number {
  const y = assetId !== null ? ports.markets.lineYield(store, assetId) : null;
  if (y !== null) return y;
  const c = store.get<CurveState>(macroTables.curve.name, b);
  return c ? nsZero(c.ns, maturityYears) : BLOC_DEFAULTS[b].initialPolicyRate;
}

type Line = { assetId: string; tenor: Tenor; maturityTick: Tick; onTheRun: boolean; couponRate: number };
/** mac.issue rows of the government plus 06's lines (mac.issue wins on the same id), sorted by id. */
export function linesOf(store: StoreRead, b: BlocId, ports: MacroPorts): Line[] {
  const gov = govId(b), out: Line[] = [];
  for (const i of store.iter<SovereignIssue & { id: string }>(macroTables.issue.name)) if (i.govId === gov) out.push(i);
  for (const l of ports.assets.sovereignLines(store, gov)) if (!out.some((x) => x.assetId === l.assetId)) out.push(l);
  return out.sort((x, y) => (x.assetId < y.assetId ? -1 : x.assetId > y.assetId ? 1 : 0));
}
const faceOf = (store: StoreRead, b: BlocId, ports: MacroPorts, from: Tick, to: Tick): number => {
  let s = 0;
  const gov = govId(b), seen: string[] = [];
  for (const i of store.iter<SovereignIssue & { id: string }>(macroTables.issue.name)) {
    if (i.govId !== gov) continue;
    seen.push(i.assetId);
    if (i.maturityTick >= from && i.maturityTick < to) s += Number(i.faceOutstanding / MICRO_N);
  }
  for (const l of ports.assets.sovereignLines(store, gov)) if (!seen.includes(l.assetId) && l.maturityTick >= from && l.maturityTick < to) s += Number(l.faceOutstanding / MICRO_N);
  return s;
};

/** Quarter start (trading day 1, caller's schedule): GFN and the quarter's auction rows (syndicated rows are T04-12's, no auction row).
 *  Idempotent: auction ids are `auc_<BLOC>_<tenor>_<day>`; an existing row is kept as is. */
const POST_LOT = 1000n * MICRO_N;
export function planQuarter(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): SovAuction[] {
  const s = ctx.store, bloc = s.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!bloc) return [];
  const qs = quarterStartDay(Math.floor(ctx.tick / D)), gov = govId(b), f = bloc.fiscal, gdp = fromMoney(bloc.nominalGdp);
  const cash = ctx.ledger.cash(gov, b);
  const gfn = grossFinancingNeed({ ...f, cashBuffer: cash }, f.deficitGdp * gdp, f.spendingGdp * gdp, faceOf(s, b, ports, qs * D, (qs + 91) * D));
  const sched = auctionsInQuarter(b, qs, ctx.params).filter((a) => !a.syndicated);
  const mix = mixOf(b), current: Partial<Record<Tenor, string>> = {};
  for (const l of linesOf(s, b, ports)) if (l.onTheRun) current[l.tenor] = l.assetId;
  let carry = f.shortfallCarry ?? 0n;
  const out: SovAuction[] = [];
  for (const a of sched) {
    const id = `auc_${b}_${a.tenor}_${a.dayIndex}`, have = s.get<SovAuction>(macroTables.auction.name, id);
    if (have) { out.push(have); continue; }
    const n = sched.filter((x) => x.tenor === a.tenor).length;
    let size = auctionSize(gfn, mix[a.tenor], n);
    if (a.tenor === 'B3M' && carry > 0n) { size += carry; carry = 0n; }
    if (bloc.sovereign.status === 'POST_RESTRUCTURING') size = (size / 2n / POST_LOT) * POST_LOT;   // T04-13: 50% of plan for 364 days after an exchange
    const reopen = !isBill(a.tenor) && !a.newLine ? current[a.tenor] : undefined;
    const assetId = reopen ?? sovereignAssetId(b, a.tenor, a.dayIndex + tenorDays(a.tenor));
    if (!isBill(a.tenor)) current[a.tenor] = assetId;
    const row: SovAuction = { id, govId: gov, assetId, tenor: a.tenor, reopening: reopen !== undefined, announceTick: a.announceTick, bidOpenTick: a.bidOpenTick,
      auctionTick: a.auctionTick, offeredFace: size, whenIssuedYield: null, bids: [] };
    s.put<SovAuction>(macroTables.auction.name, row);
    out.push(row);
  }
  const { shortfallCarry: _drop, ...rest } = f;
  s.put(macroTables.bloc.name, { ...bloc, fiscal: { ...rest, grossFinancingNeedQuarter: toMoney(gfn, b), ...(carry > 0n ? { shortfallCarry: carry } : {}) } });
  return out;
}

/** t = macro_auction_announce_tick, 3 trading days ahead: y_WI, a new line's coupon and mac.issue row, `macro.sov.auction.announced` PUBLIC. */
export function announceDue(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store, at = ctx.params.int('macro_auction_tick');
  for (const b of BLOC_ORDER) {
    const due = [...s.index<SovAuction>(macroTables.auction.name, 'govId', govId(b))].filter((a) => a.announceTick === ctx.tick && a.whenIssuedYield === null)
      .sort((x, y) => (x.id < y.id ? -1 : 1));
    for (const a of due) {
      const line = linesOf(s, b, ports).find((l) => l.assetId === a.assetId);
      const auctionDay = Math.floor(a.auctionTick / D), maturityTick = line?.maturityTick ?? (auctionDay + tenorDays(a.tenor)) * D + at;
      const yWi = whenIssuedYield(s, b, a.reopening ? a.assetId : null, (maturityTick - a.auctionTick) / D / 364, ports);
      const couponRate = a.reopening && line ? line.couponRate : newLineCoupon(yWi);
      if (!a.reopening) s.put<SovereignIssue & { id: string }>(macroTables.issue.name, { id: a.assetId, assetId: a.assetId, govId: a.govId, tenor: a.tenor, ccy: b, couponRate,
        issueTick: a.auctionTick, maturityTick, faceOutstanding: 0n, inflationLinked: a.tenor === 'L10Y', fxDenominated: false, cac: { threshold: 0.75, aggregated: true }, onTheRun: false });
      s.put<SovAuction>(macroTables.auction.name, { ...a, whenIssuedYield: yWi });
      ctx.emit('macro.sov.auction.announced', [a.govId], { auctionId: a.id, govId: a.govId, assetId: a.assetId, tenor: a.tenor, reopening: a.reopening, announceTick: a.announceTick,
        bidOpenTick: a.bidOpenTick, auctionTick: a.auctionTick, offeredFace: a.offeredFace.toString(), whenIssuedYield: yWi }, 'PUBLIC');
    }
  }
}
