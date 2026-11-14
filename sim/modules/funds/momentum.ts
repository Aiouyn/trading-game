// Buy what has already been rising, and sell it when the rise fades.
import { type World } from '../../kernel/index.ts';
import { care, driftOf, dropOrders, held, navOf, placeEq, stocksOf, type Fund } from './book.ts';

export function momentum(w: World, f: Fund): void {
  dropOrders(w, f);
  const bar = 0.012 * care(w, f);
  const rows = stocksOf(w).map((st) => ({ st, d: driftOf(st) }));
  rows.sort((a, b) => b.d - a.d || (a.st.instr < b.st.instr ? -1 : 1));
  const nav = Math.max(1, navOf(w, f));
  const budget = nav * 0.11;
  const winners = rows.filter((r) => r.d > bar).slice(0, 3);
  const keep = new Set(winners.map((r) => r.st.instr));
  for (const st of stocksOf(w)) {
    const q = held(w, f.id, st.instr);
    if (q < 1 || keep.has(st.instr)) continue;
    if (driftOf(st) < bar * 0.4) placeEq(w, f, st.instr, 'sell', Math.ceil(q * 0.5), 0.012, 'rest');
  }
  for (const r of winners) {
    const px = Math.max(1, r.st.last);
    const want = Math.min(200, Math.floor(budget / px));
    const have = held(w, f.id, r.st.instr);
    if (want > have + 4) placeEq(w, f, r.st.instr, 'buy', want - have, 0.012, 'rest');
  }
}
