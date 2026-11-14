// Two-sided quotes, skewed when the book already holds the name. Inventory is the risk.
import { type World } from '../../kernel/index.ts';
import { dropOrders, firmOf, held, placeEq, stocksOf, type Fund } from './book.ts';

export function quant(w: World, f: Fund): void {
  dropOrders(w, f);
  const all = stocksOf(w).filter((st) => st.last > 1 && !firmOf(w, st.issuer)?.closed);
  if (!all.length) return;
  const n = Math.min(6, all.length);
  const start = (w.day * n) % all.length;
  for (let k = 0; k < n; k++) {
    const st = all[(start + k) % all.length];
    const have = held(w, f.id, st.instr);
    if (have > 48) {
      placeEq(w, f, st.instr, 'sell', have - 24, 0.004, 'rest');
      continue;
    }
    // A negative thru rests behind the quote. Inventory leans the quote, it does not cross it.
    const skew = Math.max(-0.003, Math.min(0.003, (have - 12) * 0.00012));
    if (have < 36) placeEq(w, f, st.instr, 'buy', 14, -(0.009 + skew), 'rest');
    if (have > 6) placeEq(w, f, st.instr, 'sell', Math.min(14, have), -(0.007 - skew), 'rest');
  }
}
