// Borrow shares in a weak firm and, when the case is real, say so in public.
// A thin accusation on a healthy firm is denied, and covering it is a squeeze.
import { type World } from '../../kernel/index.ts';
import { pay } from '../economy/index.ts';
import { discountForNews, returnShares } from '../markets/index.ts';
import { reportCase } from '../social/index.ts';
import {
  cashOf, dropForce, dropOrders, econ, firmOf, fundsOf, held, navOf, placeEq, sharesOut, stockOf, stocksOf, whyFirm, type Borrow, type Fund,
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
  const bits: string[] = [];
  if (falling) bits.push('sales are falling');
  if (debt) bits.push('debt is rising');
  if (guided) bits.push('the chief executive is guiding too high');
  if (f.badMonths >= 2) bits.push(`${f.badMonths} losing months`);
  const n = (falling ? 1 : 0) + (debt ? 1 : 0) + (guided ? 1 : 0) + (f.badMonths >= 2 ? 1 : 0);
  return { n, falling, debt, guide: guided, months: f.badMonths, text: bits.join(', ') };
}

function targetPct(sig: { n: number; falling: boolean; months: number }): number {
  let pct = 1.35;
  if (sig.falling) pct += 0.4;
  if (sig.months >= 2) pct += 0.3;
  if (sig.months >= 5) pct += 0.25;
  if (sig.n >= 3) pct += 0.15;
  return Math.max(1.35, Math.min(2.4, pct));
}

function publish(w: World, f: Fund, b: Borrow): void {
  const s = econ(w), firm = firmOf(w, b.issuer);
  if (!firm) return;
  const sig = signals(w, b.issuer);
  const P = s.P;
  const who = f.manager >= 0 && f.manager < P.n ? P.name(f.manager) : f.name;
  const wrong = b.speak === 2;
  const msg = !wrong && sig.text
    ? `${who} publishes a report on ${firm.name}: ${sig.text}`
    : `${who} publishes a report on ${firm.name}, calling the shares overpriced`;
  const ev = w.events.emit('fund.report', msg, whyFirm(w, b.issuer), f.id);
  b.report = ev;
  b.wrong = wrong ? 1 : 0;
  b.speak = 0;
  const st = fundsOf(w);
  st.yRep++;
  st.reps.push({ day: w.day, wrong: wrong ? 1 : 0 });
  if (!wrong) discountForNews(w, b.issuer, ev);
  if (!wrong && w.state.social) reportCase(w, f.manager, ev, msg, firm.idx);
  if (wrong) {
    const ceo = firm.ceo >= 0 ? P.name(firm.ceo) : 'the board';
    b.deny = w.events.emit('fund.denial', `${ceo} of ${firm.name} denies the report`, [ev], firm.id);
    b.cover = 1;
  }
}

function locate(w: World, f: Fund, b: Borrow, need: number, cause: number): void {
  if (need < 1) return;
  let lender = '', have = 0;
  for (const [id, n] of w.ledger.holders(b.instr)) {
    if (!id.startsWith('p_') || n < have) continue;
    const spare = n - Math.max(80, Math.floor(n * 0.55));
    if (spare > have) { have = spare; lender = id; }
  }
  const take = Math.min(need, have);
  if (take < 1 || !lender) return;
  if (!w.ledger.move(b.instr, lender, f.id, take, 'mkt.borrow', cause)) return;
  b.qty += take;
  b.located += take;
  b.lender = lender;
}

function giveBack(w: World, f: Fund, b: Borrow, cause: number, limit: number): void {
  let left = limit;
  let heldNow = held(w, f.id, b.instr);
  if (heldNow > 0 && b.fromMm > 0 && left > 0) {
    const n = returnShares(w, f.id, b.instr, Math.min(heldNow, b.fromMm, left), cause);
    b.fromMm -= n;
    b.qty -= n;
    heldNow -= n;
    left -= n;
  }
  if (heldNow > 0 && b.located > 0 && b.lender && left > 0) {
    const n = Math.min(heldNow, b.located, b.qty, left);
    if (n > 0 && w.ledger.move(b.instr, f.id, b.lender, n, 'mkt.borrow', cause)) {
      b.located -= n;
      b.qty -= n;
    }
  }
}

function openBorrow(instr: string, issuer: string, day: number, goal: number, speak: number): Borrow {
  return {
    instr, issuer, qty: 0, entry: 0, sold: 0, report: -1, deny: -1, cover: 0, squeeze: 0,
    since: day, wrong: speak === 2 ? 1 : 0, goal, lender: '', located: 0, fromMm: 0, speak,
  };
}

function sized(w: World, f: Fund, instr: string, last: number, pct: number): number {
  const issued = Math.round(w.ledger.issued.get(instr) ?? 0);
  if (issued < 100 || last < 1) return 0;
  const nav = Math.max(1, navOf(w, f));
  const floorQty = Math.max(1, Math.ceil(issued * 0.013));
  if (floorQty * last > nav * 0.42) return 0;
  const want = Math.max(floorQty, Math.round(issued * Math.min(2.4, Math.max(1.3, pct)) / 100));
  const cap = Math.max(floorQty, Math.floor(nav * 0.22 / last));
  const qty = Math.min(want, cap);
  return qty >= floorQty ? qty : 0;
}

export function hunt(w: World, f: Fund): void {
  if (f.wind > 0) return;
  const cause = f.hiredEv >= 0 ? f.hiredEv : fundsOf(w).root;
  const ranked: { instr: string; issuer: string; last: number; pct: number; n: number }[] = [];
  for (const row of stocksOf(w)) {
    if (row.last < 1) continue;
    const firm = firmOf(w, row.issuer);
    if (!firm || firm.closed || !firm.listed) continue;
    const sig = signals(w, row.issuer);
    const qty = sized(w, f, row.instr, row.last, targetPct(sig));
    if (qty < 1) continue;
    const pct = 100 * qty / Math.round(w.ledger.issued.get(row.instr) ?? 1);
    ranked.push({ instr: row.instr, issuer: row.issuer, last: row.last, pct, n: sig.n * 10 + sig.months + (sig.falling ? 3 : 0) });
  }
  ranked.sort((a, b) => (b.n > 0 ? 1 : 0) - (a.n > 0 ? 1 : 0) || b.pct - a.pct || b.n - a.n || (a.instr < b.instr ? -1 : 1));
  const pick = ranked[0];
  let core = f.borrowed.find((b) => b.wrong === 0 && b.speak !== 2 && !b.cover);
  const corePx = core ? (stockOf(w, core.instr)?.last ?? core.entry) : 0;
  const switchFor = pick && core && pick.issuer !== core.issuer;
  const coreFirm = core ? firmOf(w, core.issuer) : undefined;
  const coreIssued = core ? Math.max(1, Math.round(w.ledger.issued.get(core.instr) ?? 1)) : 1;
  const corePct = core ? 100 * core.qty / coreIssued : 0;
  const handoff = (goalInstr: string, goalIssuer: string, goalPct: number, last: number): boolean => {
    const goal = Math.max(1, Math.round(sharesOut(w, goalInstr) * goalPct / 100));
    const nb = openBorrow(goalInstr, goalIssuer, w.day, goal, 0);
    nb.entry = last;
    locate(w, f, nb, goal, cause);
    const issuedN = Math.max(1, Math.round(w.ledger.issued.get(goalInstr) ?? 1));
    if (100 * nb.qty / issuedN < 1.2) { giveBack(w, f, nb, cause, nb.qty); return false; }
    f.borrowed.push(nb);
    return true;
  };
  if (core && (!coreFirm || coreFirm.closed || !coreFirm.listed)) core.cover = 1;
  else if (core && switchFor && pick && core.entry > 0 && corePx > core.entry * 1.35 && w.day - core.since > 20) {
    if (handoff(pick.instr, pick.issuer, pick.pct, pick.last)) core.cover = 1;
  } else if (core && switchFor && pick && corePct < 1.2 && w.day - core.since > 12) {
    if (handoff(pick.instr, pick.issuer, Math.max(pick.pct, 1.3), pick.last)) core.cover = 1;
  } else if (core && switchFor && pick && w.day - core.since > 60 && signals(w, core.issuer).n === 0 && pick.n > 0) {
    if (handoff(pick.instr, pick.issuer, pick.pct, pick.last)) core.cover = 1;
  }
  if (core?.cover) core = undefined;
  if (!core && pick && !f.borrowed.some((b) => b.wrong === 0 && b.speak !== 2 && !b.cover)) {
    const goal = Math.round(sharesOut(w, pick.instr) * pick.pct / 100);
    core = openBorrow(pick.instr, pick.issuer, w.day, goal, 0);
    core.entry = pick.last;
    f.borrowed.push(core);
  }
  if (core && !core.cover) {
    const issued = Math.round(w.ledger.issued.get(core.instr) ?? 0);
    const floorQty = issued >= 100 ? Math.ceil(issued * 0.013) : 0;
    const sig = signals(w, core.issuer);
    const row = stockOf(w, core.instr);
    const qty = row ? sized(w, f, core.instr, row.last, targetPct(sig)) : 0;
    let goal = qty > 0 ? qty : core.goal;
    const nav = Math.max(1, navOf(w, f));
    if (floorQty > goal && row && (floorQty - core.qty) * row.last <= nav * 0.42) goal = floorQty;
    if (goal > 0) core.goal = goal;
    if (core.qty + 1 < core.goal) locate(w, f, core, core.goal - core.qty, cause);
  }
  let selling = false;
  for (const b of f.borrowed) {
    if (b.cover) continue;
    const q = held(w, f.id, b.instr);
    if (q < 3) continue;
    if (!selling) { dropOrders(w, f); selling = true; }
    placeEq(w, f, b.instr, 'sell', Math.min(q, 28), 0.01, 'rest');
  }
  speak(w, f);
}

function decadeOf(day: number): number { return Math.floor(day / 3600); }

function speak(w: World, f: Fund): void {
  const st = fundsOf(w);
  const decade = decadeOf(w.day);
  if (w.day % 3600 < 90) return;
  const mine = st.reps.filter((r) => decadeOf(r.day) === decade);
  if (!mine.some((r) => r.wrong === 0) && !f.borrowed.some((b) => b.speak === 1)) {
    const late = w.day % 3600 > 2200;
    const host = f.borrowed.find((b) => b.cover === 0 && b.wrong === 0 && b.qty > 0 && (late || signals(w, b.issuer).n >= 1));
    if (host) host.speak = 1;
  }
  if (!mine.some((r) => r.wrong === 1) && w.day % 3600 > 220 && !f.borrowed.some((b) => b.speak === 2 || (b.wrong === 1 && b.qty > 0))) {
    let host: { instr: string; issuer: string; last: number } | undefined;
    for (const row of stocksOf(w)) {
      const firm = firmOf(w, row.issuer);
      if (!firm || firm.closed || !firm.listed || row.last < 1) continue;
      if (f.borrowed.some((b) => b.issuer === row.issuer)) continue;
      const sig = signals(w, row.issuer);
      if (sig.falling || sig.months > 0 || firm.lastProfit <= 0) continue;
      const qty = sized(w, f, row.instr, row.last, 1.2);
      if (qty < 1) continue;
      if (!host || row.instr < host.instr) host = { instr: row.instr, issuer: row.issuer, last: row.last };
    }
    if (host) {
      const goal = sized(w, f, host.instr, host.last, 1.2);
      const b = openBorrow(host.instr, host.issuer, w.day, goal, 2);
      b.entry = host.last;
      f.borrowed.push(b);
      locate(w, f, b, goal, f.hiredEv >= 0 ? f.hiredEv : st.root);
    }
  }
  for (const b of f.borrowed) {
    if (b.speak < 1 || b.qty < 1) continue;
    if (w.day - b.since < 2) continue;
    const have = held(w, f.id, b.instr);
    if (b.sold === 0 && have < b.qty) { b.entry = stockOf(w, b.instr)?.last ?? b.entry; b.sold = 1; }
    if (b.speak === 2 && b.sold === 0 && w.day - b.since < 8) continue;
    publish(w, f, b);
  }
}

export function reviewShorts(w: World, f: Fund): void {
  if (f.borrowed.some((b) => b.cover)) { dropOrders(w, f); dropForce(w, f); }
  const live: Borrow[] = [];
  const cause0 = f.hiredEv >= 0 ? f.hiredEv : fundsOf(w).root;
  for (const b of f.borrowed) {
    const st = stockOf(w, b.instr);
    const px = st?.last ?? b.entry;
    const firmLive = firmOf(w, b.issuer);
    if (!firmLive || firmLive.closed) b.cover = 1;
    const have = held(w, f.id, b.instr);
    if (b.sold === 0 && have + 1 < b.qty) { b.entry = px; b.sold = 1; }
    if (!b.cover && b.goal > 0 && b.qty > b.goal + 1) {
      const extra = b.qty - b.goal;
      if (have < extra) placeEq(w, f, b.instr, 'buy', extra - have, 0.012, 'force');
      else giveBack(w, f, b, b.report >= 0 ? b.report : cause0, extra);
    }
    if (b.cover) {
      if (b.goal > 0) b.goal = -w.day;
      const cause = b.deny >= 0 ? b.deny : b.report >= 0 ? b.report : cause0;
      giveBack(w, f, b, cause, b.qty);
      const owed = b.qty;
      const px = Math.max(1, st?.last ?? b.entry);
      const coverDay = b.goal < 0 ? -b.goal : w.day;
      if (owed > 0 && have < 1 && w.day - coverDay >= 4) {
        const cost = owed * px;
        const to = b.lender;
        if (to && cashOf(w, f.id) >= cost && pay(w, f.id, to, cost, 'mkt.borrow', cause)) {
          b.qty = 0; b.located = 0; b.fromMm = 0;
        }
      }
      if (b.qty > 0) placeEq(w, f, b.instr, 'buy', b.qty, b.wrong ? 0.02 : 0.012, 'force');
      if (b.qty < 1 && b.squeeze === 0 && b.report >= 0) {
        const firm = firmOf(w, b.issuer);
        const up = px >= b.entry;
        w.events.emit(
          'fund.squeeze',
          `${f.name} covers ${firm?.name ?? b.issuer} at ${px} cents after ${b.entry}${up || b.wrong ? '; the shares squeezed' : ''}`,
          [b.deny >= 0 ? b.deny : b.report],
          f.id,
        );
        b.squeeze = 1;
        if (up || b.wrong) fundsOf(w).ySqueeze++;
      }
    }
    if (b.qty > 0 || b.cover) live.push(b);
  }
  f.borrowed = live.filter((b) => b.qty > 0);
}
