// Price against book and against the earnings the firm already reported.
import { type World } from '../../kernel/index.ts';
import { bookPerShare, care, dropOrders, econ, firmOf, held, navOf, placeEq, sharesOut, stocksOf, type Fund } from './book.ts';

export function value(w: World, f: Fund): void {
  dropOrders(w, f);
  const s = econ(w);
  const strict = care(w, f);
  const rows: { instr: string; score: number }[] = [];
  for (const st of stocksOf(w)) {
    if (st.last < 1) continue;
    const firm = firmOf(w, st.issuer);
    if (firm?.closed) continue;
    const book = bookPerShare(w, st.issuer, st.instr);
    const sh = sharesOut(w, st.instr);
    const earn = firm ? Math.max(0, firm.lastProfit) * 12 / sh : Math.max(0, st.profitEma) * 12 / sh;
    const cheap = book / st.last;
    const yieldGap = st.last > 0 ? earn / st.last - (s.policyRate + 0.03) : 0;
    const score = cheap + yieldGap * 4;
    if (cheap > 1.02 * strict || yieldGap > 0.015 * strict) rows.push({ instr: st.instr, score });
  }
  rows.sort((a, b) => b.score - a.score || (a.instr < b.instr ? -1 : 1));
  const pick = new Set(rows.slice(0, 3).map((r) => r.instr));
  const nav = Math.max(1, navOf(w, f));
  for (const st of stocksOf(w)) {
    const q = held(w, f.id, st.instr);
    if (q < 1) continue;
    if (pick.has(st.instr)) continue;
    const book = bookPerShare(w, st.issuer, st.instr);
    if (st.last > book * 1.08) placeEq(w, f, st.instr, 'sell', q, 0.01, 'rest');
  }
  for (const r of rows.slice(0, 3)) {
    const st = stocksOf(w).find((x) => x.instr === r.instr);
    if (!st) continue;
    const want = Math.min(120, Math.floor(nav * 0.06 / Math.max(1, st.last)));
    const have = held(w, f.id, st.instr);
    if (want > have + 3) placeEq(w, f, st.instr, 'buy', want - have, 0.012, 'rest');
  }
}
