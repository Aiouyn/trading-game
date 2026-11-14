// Borrow shares in a weak firm and say so in public. A denial, or a price that rises through the sale, is a squeeze.
import { type World } from '../../kernel/index.ts';
import { borrowShares, discountForNews, returnShares } from '../markets/index.ts';
import { reportCase } from '../social/index.ts';
import {
  care, cashOf, dropForce, dropOrders, econ, firmOf, fundsOf, held, navOf, placeEq, stockOf, stocksOf, whyFirm, type Borrow, type Fund,
} from './book.ts';

interface Earn { guide: Float64Array; hasGuide: Uint8Array }

function earnOf(w: World): Earn | undefined {
  const e = w.state.earnings as Earn | undefined;
  if (!e?.guide || !e.hasGuide) return undefined;
  return e;
}

function signals(w: World, issuer: string): { n: number; falling: boolean; debt: boolean; guide: boolean; months: number; text: string } {
  const s = econ(w), f = firmOf(w, issuer);
  if (!f) return { n: 0, falling: false, debt: false, guide: false, months: 0, text: '' };
  const falling = f.soldEma + 1 < f.madeEma * 0.9 || f.lostEma > Math.max(1, f.soldEma) * 0.12;
  const loan = Math.round((w.ledger.issued.get('loan:' + f.id) ?? 0) + (w.ledger.issued.get('cf:' + f.id) ?? 0));
  const debt = loan > f.eff * s.wage * 80;
  const book = earnOf(w);
  const guided = !!book && f.idx < book.hasGuide.length && book.hasGuide[f.idx] === 1 && book.guide[f.idx] > Math.max(1, f.lastProfit) * 3 * 1.3;
  const months = f.badMonths >= 2;
  const bits: string[] = [];
  if (falling) bits.push('sales are falling');
  if (debt) bits.push('debt is rising');
  if (guided) bits.push('the chief executive is guiding too high');
  if (months) bits.push(`${f.badMonths} losing months`);
  const n = (falling ? 1 : 0) + (debt ? 1 : 0) + (guided ? 1 : 0) + (months ? 1 : 0);
  return { n, falling, debt, guide: guided, months: f.badMonths, text: bits.join(', ') };
}

function publish(w: World, f: Fund, b: Borrow): void {
  const s = econ(w), firm = firmOf(w, b.issuer), st = stockOf(w, b.instr);
  if (!firm || !st) return;
  const sig = signals(w, b.issuer);
  const P = s.P;
  const who = f.manager >= 0 && f.manager < P.n ? P.name(f.manager) : f.name;
  const msg = sig.text
    ? `${who} publishes a report on ${firm.name}: ${sig.text}`
    : `${who} publishes a report on ${firm.name}, calling the shares overpriced`;
  const ev = w.events.emit('fund.report', msg, whyFirm(w, b.issuer), f.id);
  b.report = ev;
  fundsOf(w).yRep++;
  fundsOf(w).reported.push(b.issuer);
  const wrong = firm.badMonths < 2 && firm.lastProfit > 0 && !sig.debt && !sig.falling;
  b.wrong = wrong ? 1 : 0;
  discountForNews(w, b.issuer, ev);
  if (w.state.social) reportCase(w, f.manager, ev, msg, firm.idx);
  if (wrong) {
    const ceo = firm.ceo >= 0 ? P.name(firm.ceo) : 'the board';
    b.deny = w.events.emit('fund.denial', `${ceo} of ${firm.name} denies the report`, [ev], firm.id);
  }
}

export function shortSell(w: World, f: Fund): void {
  if (f.borrowed.some((b) => b.cover)) return;
  dropOrders(w, f);
  const st = fundsOf(w);
  const open = new Set(f.borrowed.map((b) => b.issuer));
  const loose = st.reported.length < 2 && (care(w, f) < 1 || (f.manager >= 0 && econ(w).P.greed[f.manager] >= 60));
  const bar = loose ? 1 : 2;
  let best: { issuer: string; instr: string; last: number; n: number } | undefined;
  for (const row of stocksOf(w)) {
    if (row.last < 1 || open.has(row.issuer)) continue;
    const firm = firmOf(w, row.issuer);
    if (!firm || firm.closed || !firm.listed) continue;
    const sig = signals(w, row.issuer);
    const known = st.reported.includes(row.issuer);
    const late = w.year >= 3 && st.reported.length === 0;
    if (!(known ? sig.falling || sig.months >= 2 : sig.n >= bar || late)) continue;
    if (!best || sig.n > best.n || (sig.n === best.n && row.instr < best.instr)) best = { issuer: row.issuer, instr: row.instr, last: row.last, n: sig.n };
  }
  if (!best || f.borrowed.length >= 2) return;
  const nav = Math.max(1, navOf(w, f));
  const qty = Math.min(70, Math.floor(nav * 0.08 / best.last));
  if (qty < 6) return;
  const cause = f.hiredEv >= 0 ? f.hiredEv : st.root;
  const got = borrowShares(w, f.id, best.instr, qty, cause);
  if (got < 4) return;
  f.borrowed.push({
    instr: best.instr, issuer: best.issuer, qty: got, entry: best.last, sold: 0,
    report: -1, deny: -1, cover: 0, squeeze: 0, since: w.day, wrong: 0,
  });
  placeEq(w, f, best.instr, 'sell', got, 0.012, 'rest');
  if (cashOf(w, f.id) < 0) return;
}

export function reviewShorts(w: World, f: Fund): void {
  if (f.borrowed.some((b) => b.cover)) { dropOrders(w, f); dropForce(w, f); }
  const live: Borrow[] = [];
  for (const b of f.borrowed) {
    const st = stockOf(w, b.instr);
    const px = st?.last ?? b.entry;
    const have = held(w, f.id, b.instr);
    if (b.sold === 0 && have < b.qty) { b.entry = px; b.sold = 1; }
    if (f.strat === 'short' && b.report < 0 && w.day - b.since >= 2 && b.qty > 0 && !fundsOf(w).reported.includes(b.issuer)) publish(w, f, b);
    const loss = b.sold === 1 && px > b.entry * 1.05;
    const banked = b.sold === 1 && px < b.entry * 0.9 && w.day - b.since > 16;
    const denied = b.wrong === 1 && w.day - b.since >= 6;
    if ((loss || banked || denied || w.day - b.since > 90) && !b.cover) b.cover = 1;
    if (b.cover) {
      const heldNow = held(w, f.id, b.instr);
      if (heldNow > 0) {
        const cause = b.deny >= 0 ? b.deny : b.report >= 0 ? b.report : f.hiredEv;
        const n = returnShares(w, f.id, b.instr, Math.min(heldNow, b.qty), cause);
        b.qty -= n;
      }
      if (b.qty > 0) placeEq(w, f, b.instr, 'buy', b.qty, b.wrong ? 0.018 : 0.012, 'force');
      if (b.qty < 1 && b.squeeze === 0 && (b.report >= 0 || b.wrong === 1)) {
        const firm = firmOf(w, b.issuer);
        const cause = b.deny >= 0 ? b.deny : b.report >= 0 ? b.report : f.hiredEv;
        const up = px > b.entry;
        w.events.emit(
          'fund.squeeze',
          `${f.name} covers ${firm?.name ?? b.issuer} at ${px} cents after ${b.entry}${up ? '; the shares squeezed' : ''}`,
          [cause],
          f.id,
        );
        b.squeeze = 1;
      }
    }
    if (b.qty > 0) live.push(b);
  }
  f.borrowed = live;
}
