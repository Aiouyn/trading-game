// Rates, the exchange rate, and commodity futures. Equities are the same view, in the firms that dig and pump.
import { type World } from '../../kernel/index.ts';
import { LOT, submitBondOrder } from '../bonds/index.ts';
import { futuresPrice, tradeFuture } from '../commodities/index.ts';
import { bondOpen, bondsOf, cashOf, dropOrders, econ, firmOf, held, navOf, placeEq, stocksOf, type Fund } from './book.ts';

function probe(w: World, actor: string, good: string, months: number): number {
  return tradeFuture(w, actor, good, months, 0, 'long').net;
}
function lotOf(w: World, good: string): number {
  const books = (w.state.commodities as { books?: { good: string; lot: number }[] } | undefined)?.books ?? [];
  for (const b of books) if (b.good === good) return b.lot;
  return 0;
}
function aim(w: World, f: Fund, good: string, months: number, target: number, px: number): number {
  const lot = lotOf(w, good);
  const nav = Math.max(1, navOf(w, f));
  const notional = Math.abs(target) * Math.max(1, px) * Math.max(1, lot);
  const use = notional > nav * 0.22 ? 0 : target;
  const cur = probe(w, f.id, good, months);
  const d = use - cur;
  if (d > 0) tradeFuture(w, f.id, good, months, d, 'long');
  else if (d < 0) tradeFuture(w, f.id, good, months, -d, 'short');
  return use;
}
function flatGood(w: World, f: Fund, good: string): void {
  if (!good) return;
  tradeFuture(w, f.id, good, 3, 0, 'flat');
}

function namesFor(w: World, good: string): string[] {
  const out: string[] = [];
  for (const st of stocksOf(w)) {
    const firm = firmOf(w, st.issuer);
    if (firm && !firm.closed && firm.good === good) out.push(st.instr);
  }
  out.sort();
  return out;
}

export function macro(w: World, f: Fund): void {
  dropOrders(w, f);
  const s = econ(w);
  const ab = w.state.abroad as { mid?: number; mMid0?: number } | undefined;
  const fx = ab && ab.mMid0 ? (ab.mid ?? 0) / ab.mMid0 - 1 : 0;
  const oil0 = futuresPrice(w, 'CRUDE_OIL', 0);
  const oil3 = futuresPrice(w, 'CRUDE_OIL', 3);
  const tight = oil0 > 0 && oil3 > 0 && oil0 > oil3 * 1.015;
  const slack = oil0 > 0 && oil3 > 0 && oil3 > oil0 * 1.015;
  const cold = s.unemployment > 0.085;
  const hot = s.unemployment < 0.045 && s.policyRate < 0.035;
  const nav = Math.max(1, navOf(w, f));

  const ten = bondsOf(w).find((b) => b.tenor === '10y' && b.faceLeft >= LOT);
  if (ten && !bondOpen(w, f.id, ten.id) && ten.last > 0) {
    const face = held(w, f.id, ten.id);
    const room = Math.min(LOT * 12, Math.floor(nav * 0.28 / ten.last) * LOT);
    if (cold && face + LOT <= room && cashOf(w, f.id) > ten.last * 2) submitBondOrder(w, f.id, ten.id, 'buy', LOT, Math.max(1, Math.round(ten.last * 1.002)));
    if (hot && face >= LOT) submitBondOrder(w, f.id, ten.id, 'sell', Math.min(face, LOT * 2), Math.max(1, Math.round(ten.last * 0.998)));
  }

  const wantOil = tight || fx > 0.025 ? 1 : slack || fx < -0.025 ? -1 : 0;
  if (f.note && f.note !== 'CRUDE_OIL') { flatGood(w, f, f.note); f.note = ''; }
  if (oil0 > 0) {
    const used = aim(w, f, 'CRUDE_OIL', 3, wantOil, oil3 || oil0);
    f.note = used !== 0 || probe(w, f.id, 'CRUDE_OIL', 3) !== 0 ? 'CRUDE_OIL' : '';
  }

  const tilt = (good: string, buy: boolean): void => {
    const instr = namesFor(w, good)[0];
    if (!instr) return;
    const st = stocksOf(w).find((x) => x.instr === instr);
    if (!st || st.last < 1) return;
    const have = held(w, f.id, instr);
    if (buy) {
      const want = Math.min(160, Math.floor(nav * 0.12 / st.last));
      if (want > have + 2) placeEq(w, f, instr, 'buy', want - have, 0.012, 'rest');
    } else if (have > 0) placeEq(w, f, instr, 'sell', have, 0.01, 'rest');
  };
  tilt('CRUDE_OIL', tight || fx > 0.03);
  tilt('COPPER', fx > 0.02 && !cold);
  tilt('GRAIN', cold);
}
