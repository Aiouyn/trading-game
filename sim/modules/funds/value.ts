// Price against book and against the earnings the firm already reported.
import { type World } from '../../kernel/index.ts';
import { bookPerShare, care, dropOrders, econ, firmOf, held, navOf, placeEq, sharesOut, stocksOf, type Fund } from './book.ts';

export function value(w: World, f: Fund): void {
  dropOrders(w, f);
  const s = econ(w);
  const strict = care(w, f);
  const hurdle = s.policyRate + 0.03;
  const rows: { instr: string; score: number }[] = [];
  for (const st of stocksOf(w)) {
    if (st.last < 1) continue;
    const firm = firmOf(w, st.issuer);
    if (firm?.closed) continue;
    const book = bookPerShare(w, st.issuer, st.instr);
    const sh = sharesOut(w, st.instr);
    const earn = firm ? Math.max(0, firm.lastProfit) * 12 / sh : Math.max(0, st.profitEma) * 12 / sh;
    const cheap = book / st.last;
    const yieldGap = st.last > 0 ? earn / st.last - hurdle : 0;
    const score = cheap + yieldGap * 4;
    if (cheap > 1.02 * strict || yieldGap > 0.015 * strict) rows.push({ instr: st.instr, score });
  }
  rows.sort((a, b) => b.score - a.score || (a.instr < b.instr ? -1 : 1));
  const pick = new Set(rows.slice(0, 6).map((r) => r.instr));
  const nav = Math.max(1, navOf(w, f));
  for (const st of stocksOf(w)) {
    const q = held(w, f.id, st.instr);
    if (q < 1) continue;
    const firm = firmOf(w, st.issuer);
    const sh = sharesOut(w, st.instr);
    const earn = firm ? Math.max(0, firm.lastProfit) * 12 / sh : Math.max(0, st.profitEma) * 12 / sh;
    const ey = st.last > 0 ? earn / st.last : 0;
    const miss = (st.printUntil ?? 0) >= w.day && (st.printDir ?? 0) < 0;
    // A cheap name that then misses is the trap: sell the line, do not average down.
    if (miss || (!pick.has(st.instr) && (ey < hurdle * 0.85 || st.last > bookPerShare(w, st.issuer, st.instr) * 1.08))) {
      const qty = placeEq(w, f, st.instr, 'sell', q, miss ? 0.02 : 0.01, 'rest');
      if (miss && qty >= 1 && (st.printEv ?? -1) >= 0) {
        w.events.emit('fund.trap', `${f.name} sells ${st.instr} after the earnings miss`, [st.printEv ?? w.genesis], f.id);
      }
    }
  }
  for (const r of rows.slice(0, 6)) {
    const st = stocksOf(w).find((x) => x.instr === r.instr);
    if (!st) continue;
    if ((st.printUntil ?? 0) >= w.day && (st.printDir ?? 0) < 0) continue;
    const cap = Math.floor(sharesOut(w, st.instr) * 0.08);
    const want = Math.min(cap, Math.floor(nav * 0.16 / Math.max(1, st.last)));
    const have = held(w, f.id, st.instr);
    if (want > have + 3) placeEq(w, f, st.instr, 'buy', want - have, 0.012, 'rest');
  }
}
