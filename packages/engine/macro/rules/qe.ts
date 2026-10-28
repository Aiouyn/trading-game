// T04-09 QE / HOLD / QT (04 §3.8.5): the meeting decision, holdings and caps, and the day's purchase or runoff plan. 04 posts nothing for
// QE trades: the plan becomes pool orders (poolOrders.ts) that 05 fills as MKT_TRADE.
import { divRoundHalfEven, mulRate, MICRO_N, roundHalfEven, TICKS_PER_GAME_DAY, type Money, type Qty, type StoreRead } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import type { MacroPorts } from '../ports';
import { macroTables, type AssetPurchaseProgram, type BlocId, type BlocMacroState, type CentralBank } from '../schema';
import { monthStartDay, quarterStartDay, tradingDaysOfPeriod } from './calendar';
import { effectiveMark } from './t03Stubs';

export const HOLDINGS_CAP_GDP = 0.35, QT_RUNOFF_CAP = 0.015, PYN_SALES_CAP = 0.005;
const EPS = 1e-12, YEAR_TICKS = 364 * TICKS_PER_GAME_DAY;
const e6 = (r: number): bigint => BigInt(roundHalfEven(r * 1e6));

/** Reads the CB's position on one line: G7 `ctx.ledger.position(cbkId(b), assetId)` (unit decision: StoreRead carries no ledger reads). */
export type PositionOf = (assetId: string) => Qty;

export type QeDecision = { state: AssetPurchaseProgram['state']; purchasesPerMonth: Money; eligible: AssetPurchaseProgram['eligible']; mode: 'ELB' | 'DYSFUNCTION' | null; reason: string };

export function purchasesSize(elb: number, iStar: number, nominalGdp: Money, dysfunction: boolean): Money {
  let share = Math.min(0.015, Math.max(0.0025, (0.0025 * (elb - iStar)) / 0.01));
  if (dysfunction) share = Math.max(share, 0.005);
  return mulRate(nominalGdp, e6(share));
}

function mix(fsi: number, securitizationCrisis: boolean): AssetPurchaseProgram['eligible'] {
  if (fsi <= 0.5) return { govBonds: 1, corpIG: 0, abs: 0 };
  return securitizationCrisis ? { govBonds: 0.8, corpIG: 0.1, abs: 0.1 } : { govBonds: 0.8, corpIG: 0.2, abs: 0 };
}

/** Meeting step: start (ELB or DYSFUNCTION), QE → HOLD when i* > elb + 0.0025, HOLD → QT when i ≥ r*_cb + π* − 0.005 with holdings > 0;
 *  QT with no holdings left → NONE. One transition per meeting; an unchanged state keeps its size and mix. */
export function qeDecision(cb: CentralBank, x: { i: number; iStar: number; elb: number; rStarCb: number; target: number; fsi: number; lowDepthDays: number;
  nominalGdp: Money; holdingsGdp: number; securitizationCrisis: boolean; bloc: BlocId }): QeDecision {
  const q = cb.qe, keep: QeDecision = { state: q.state, purchasesPerMonth: q.purchasesPerMonth, eligible: q.eligible, mode: null, reason: 'UNCHANGED' };
  const elbMode = Math.abs(x.i - x.elb) < EPS && x.iStar < x.elb - 0.005 - EPS, dys = x.fsi > 0.6 && x.lowDepthDays >= 3;
  if (q.state === 'QE' && x.iStar > x.elb + 0.0025 + EPS) return { state: 'HOLD', purchasesPerMonth: 0n, eligible: q.eligible, mode: null, reason: 'QE_HOLD' };
  if (elbMode || dys) {
    const mode = elbMode ? 'ELB' : 'DYSFUNCTION';
    return { state: 'QE', purchasesPerMonth: purchasesSize(x.elb, x.iStar, x.nominalGdp, !elbMode), eligible: mix(x.fsi, x.securitizationCrisis), mode,
      reason: q.state === 'QE' ? 'QE_CONTINUE' : 'QE_START' };
  }
  if (q.state === 'HOLD' && x.i >= x.rStarCb + x.target - 0.005 - EPS && x.holdingsGdp > 0) return { ...keep, state: 'QT', purchasesPerMonth: 0n, reason: 'QT_START' };
  if (q.state === 'QT' && x.holdingsGdp <= 0) return { ...keep, state: 'NONE', purchasesPerMonth: 0n, reason: 'QT_END' };
  return keep;
}

export function lineCapRoom(holdQty: Qty, faceOutstanding: Qty): Qty { const r = faceOutstanding / 2n - holdQty; return r > 0n ? r : 0n; }

interface Line { assetId: string; faceOutstanding: Qty; maturityTick: number; kind: 'GOV' | 'CORP' | 'ABS' }
const byId = (a: { assetId: string }, c: { assetId: string }): number => (a.assetId < c.assetId ? -1 : a.assetId > c.assetId ? 1 : 0);
function linesOf(store: StoreRead, b: BlocId, ports: MacroPorts): Line[] {
  const out: Line[] = [];
  for (const l of ports.assets.sovereignLines(store, govId(b))) out.push({ assetId: l.assetId, faceOutstanding: l.faceOutstanding, maturityTick: l.maturityTick, kind: 'GOV' });
  for (const l of ports.assets.qeEligibleLines(store, b, 'CORP_IG')) out.push({ ...l, kind: 'CORP' });
  for (const l of ports.assets.qeEligibleLines(store, b, 'ABS_SENIOR')) out.push({ ...l, kind: 'ABS' });
  return out.sort(byId);
}
/** micro-unit price per face micro-unit: 05 fair price, else the 03 mark, else par (unit decision). */
function priceOf(store: StoreRead, ports: MacroPorts, assetId: string, tick: number): bigint {
  return ports.markets.fairPriceOf(store, assetId) ?? effectiveMark(store, assetId, tick) ?? MICRO_N;
}
const gdpOf = (store: StoreRead, b: BlocId): Money => store.get<BlocMacroState>(macroTables.bloc.name, b)?.nominalGdp ?? 0n;

export function holdingsOf(store: StoreRead, b: BlocId, ports: MacroPorts, position: PositionOf, tick = 0):
  { byLine: { assetId: string; qty: Qty; value: Money; faceOutstanding: Qty }[]; total: Money; gdpShare: number } {
  const byLine: { assetId: string; qty: Qty; value: Money; faceOutstanding: Qty }[] = [];
  let total = 0n;
  for (const l of linesOf(store, b, ports)) {
    const qty = position(l.assetId);
    if (qty === 0n) continue;
    const value = divRoundHalfEven(qty * priceOf(store, ports, l.assetId, tick), MICRO_N);
    byLine.push({ assetId: l.assetId, qty, value, faceOutstanding: l.faceOutstanding }); total += value;
  }
  const gdp = gdpOf(store, b);
  return { byLine, total, gdpShare: gdp > 0n ? Number(total) / Number(gdp) : 0 };
}

const monthLen = (start: number): number => (start - quarterStartDay(start) === 56 ? 35 : 28);
/** Trading days of the game month left from `gameDay` (inclusive). */
export function tradingDaysLeftInMonth(b: BlocId, gameDay: number): number {
  const m = monthStartDay(gameDay);
  return tradingDaysOfPeriod(b, m, monthLen(m)).filter((d) => d >= gameDay).length;
}
const cbOf = (store: StoreRead, b: BlocId): CentralBank | undefined => store.get<CentralBank>(macroTables.cb.name, cbkId(b));
const monthTotals = (q: AssetPurchaseProgram, gameDay: number): { bought: Money; sold: Money; runoff: Money } =>
  q.month && q.month.start === monthStartDay(gameDay) ? q.month : { bought: 0n, sold: 0n, runoff: 0n };

/** Spread `amount` (money) over `lines` pro rata to outstanding face, convert with the line price, clip to line-cap and total-cap room. */
function spreadBuys(store: StoreRead, ports: MacroPorts, lines: Line[], amount: Money, position: PositionOf, room: { left: Money }, tick: number,
  out: { assetId: string; side: 'BUY' | 'SELL'; face: Qty }[]): void {
  let faceSum = 0n;
  for (const l of lines) faceSum += l.faceOutstanding;
  if (amount <= 0n || faceSum === 0n) return;
  for (const l of lines) {
    const px = priceOf(store, ports, l.assetId, tick);
    let money = (amount * l.faceOutstanding) / faceSum;
    if (money > room.left) money = room.left;
    let face = (money * MICRO_N) / px;
    const cap = lineCapRoom(position(l.assetId), l.faceOutstanding);
    if (face > cap) face = cap;
    if (face <= 0n) continue;
    room.left -= divRoundHalfEven(face * px, MICRO_N);
    out.push({ assetId: l.assetId, side: 'BUY', face });
  }
}

/** The day's trades for bloc b on a trading day: QE buys ((target − bought) ÷ trading days left), HOLD reinvestment of the face maturing
 *  today, QT runoff (≤ 0.015 × holdings per month, the rest reinvested) and PYN active sales (≤ 0.005 × holdings per month). Non-trading day → []. */
export function dailyProgram(store: StoreRead, b: BlocId, gameDay: number, ports: MacroPorts, position: PositionOf):
  { assetId: string; side: 'BUY' | 'SELL'; face: Qty }[] {
  const cb = cbOf(store, b), daysLeft = tradingDaysLeftInMonth(b, gameDay);
  if (!cb || cb.qe.state === 'NONE' || daysLeft === 0 || !tradingDaysOfPeriod(b, gameDay, 1).length) return [];
  const tick = gameDay * TICKS_PER_GAME_DAY, q = cb.qe, mt = monthTotals(q, gameDay), lines = linesOf(store, b, ports);
  const gov = lines.filter((l) => l.kind === 'GOV' && l.maturityTick - tick >= 2 * YEAR_TICKS && l.maturityTick - tick <= 30 * YEAR_TICKS);
  const h = holdingsOf(store, b, ports, position, tick), gdp = gdpOf(store, b);
  const room = { left: mulRate(gdp, e6(q.holdingsCapGdp || HOLDINGS_CAP_GDP)) - h.total };
  const out: { assetId: string; side: 'BUY' | 'SELL'; face: Qty }[] = [];
  if (q.state === 'QE') {
    const left = q.purchasesPerMonth - mt.bought;
    if (left <= 0n) return [];
    const daily = left / BigInt(daysLeft);
    spreadBuys(store, ports, gov, mulRate(daily, e6(q.eligible.govBonds)), position, room, tick, out);
    spreadBuys(store, ports, lines.filter((l) => l.kind === 'CORP'), mulRate(daily, e6(q.eligible.corpIG)), position, room, tick, out);
    spreadBuys(store, ports, lines.filter((l) => l.kind === 'ABS'), mulRate(daily, e6(q.eligible.abs)), position, room, tick, out);
    return out.sort(byId);
  }
  let maturing = 0n;   // face maturing today, valued at par (it redeems at par)
  for (const l of lines) if (l.maturityTick >= tick && l.maturityTick < tick + TICKS_PER_GAME_DAY) maturing += position(l.assetId);
  let reinvest = maturing;
  if (q.state === 'QT') {
    const capLeft = mulRate(h.total, e6(q.qtRunoffCapPerMonth || QT_RUNOFF_CAP)) - mt.runoff;
    reinvest = maturing - (capLeft <= 0n ? 0n : maturing < capLeft ? maturing : capLeft);
  }
  spreadBuys(store, ports, gov, reinvest, position, room, tick, out);
  if (q.state === 'QT' && b === 'PYN') {
    const salesLeft = mulRate(h.total, e6(PYN_SALES_CAP)) - mt.sold;
    if (salesLeft > 0n) {
      const daily = salesLeft / BigInt(daysLeft);
      let held = 0n;
      for (const r of h.byLine) held += r.value;
      for (const r of h.byLine) {
        const px = priceOf(store, ports, r.assetId, tick);
        let face = ((daily * r.value) / held) * MICRO_N / px;
        if (face > r.qty) face = r.qty;
        if (face > 0n) out.push({ assetId: r.assetId, side: 'SELL', face });
      }
    }
  }
  return out.sort(byId);
}

/** QT runoff of the day (maturing − reinvested), for the month total; 0 outside QT. */
export function runoffOfDay(store: StoreRead, b: BlocId, gameDay: number, ports: MacroPorts, position: PositionOf): Money {
  const cb = cbOf(store, b);
  if (!cb || cb.qe.state !== 'QT') return 0n;
  const tick = gameDay * TICKS_PER_GAME_DAY, mt = monthTotals(cb.qe, gameDay);
  let maturing = 0n;
  for (const l of linesOf(store, b, ports)) if (l.maturityTick >= tick && l.maturityTick < tick + TICKS_PER_GAME_DAY) maturing += position(l.assetId);
  const capLeft = mulRate(holdingsOf(store, b, ports, position, tick).total, e6(cb.qe.qtRunoffCapPerMonth || QT_RUNOFF_CAP)) - mt.runoff;
  return capLeft <= 0n ? 0n : maturing < capLeft ? maturing : capLeft;
}
