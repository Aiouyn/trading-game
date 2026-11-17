// Buy what has already been rising, and sell it when the rise fades.
import { type World } from '../../kernel/index.ts';
import { care, driftOf, dropOrders, held, navOf, placeEq, sharesOut, stocksOf, type Fund } from './book.ts';

export function momentum(w: World, f: Fund): void {
  dropOrders(w, f);
  const bar = 0.012 * care(w, f);
  const rows = stocksOf(w).map((st) => ({ st, d: driftOf(st) }));
  rows.sort((a, b) => b.d - a.d || (a.st.instr < b.st.instr ? -1 : 1));
  const nav = Math.max(1, navOf(w, f));
  const budget = nav * 0.22;
  const winners = rows.filter((r) => r.d > bar && !((r.st.printUntil ?? 0) >= w.day && (r.st.printDir ?? 0) < 0)).slice(0, 4);
  const keep = new Set(winners.map((r) => r.st.instr));
  for (const st of stocksOf(w)) {
    const q = held(w, f.id, st.instr);
    if (q < 1) continue;
    const miss = (st.printUntil ?? 0) >= w.day && (st.printDir ?? 0) < 0;
    if (!miss && (keep.has(st.instr) || driftOf(st) >= bar * 0.4)) continue;
    const qty = placeEq(w, f, st.instr, 'sell', Math.ceil(q * (miss ? 0.85 : 0.5)), miss ? 0.02 : 0.012, 'rest');
    if (miss && qty >= 1 && (st.printEv ?? -1) >= 0) {
      w.events.emit('fund.crash', `${f.name} sells ${st.instr} as the run breaks`, [st.printEv ?? w.genesis], f.id);
    }
  }
  const each = Math.max(1, winners.length);
  for (const r of winners) {
    const px = Math.max(1, r.st.last);
    const cap = Math.floor(sharesOut(w, r.st.instr) * 0.06);
    const want = Math.min(cap, Math.floor(budget / each / px));
    const have = held(w, f.id, r.st.instr);
    if (want > have + 4) placeEq(w, f, r.st.instr, 'buy', want - have, 0.012, 'rest');
  }
}
