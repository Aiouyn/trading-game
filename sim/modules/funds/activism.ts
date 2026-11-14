// Build a stake. Above 5% it is news. Then ask for a dividend, a sale, or a new chief, and count the votes.
import { type World } from '../../kernel/index.ts';
import { pay } from '../economy/index.ts';
import { leaveJob, setSimDay, succession } from '../economy/people.ts';
import {
  cashOf, econ, firmOf, fundsOf, held, sharesOut, stockByIssuer, stockOf, stocksOf,
  whyFirm, withhold, type Demand, type Fund,
} from './book.ts';

function causeOf(w: World, f: Fund): number {
  return f.hiredEv >= 0 ? f.hiredEv : fundsOf(w).root;
}

function roomIn(w: World, instr: string): number {
  let room = 0;
  for (const [hid, n] of w.ledger.holders(instr)) {
    if (!hid.startsWith('p_')) continue;
    const spare = n - Math.max(20, Math.floor(n * 0.35));
    if (spare >= 8) room += spare;
  }
  return room;
}

function takeStake(w: World, f: Fund, instr: string, need: number, last: number): boolean {
  if (need < 1) return false;
  const px = Math.max(1, Math.round(last * 1.02));
  if (cashOf(w, f.id) < need * px) return false;
  const sellers: { id: string; room: number }[] = [];
  for (const [hid, n] of w.ledger.holders(instr)) {
    if (!hid.startsWith('p_')) continue;
    const room = n - Math.max(20, Math.floor(n * 0.35));
    if (room >= 8) sellers.push({ id: hid, room });
  }
  sellers.sort((a, b) => b.room - a.room || (a.id < b.id ? -1 : 1));
  let room = 0;
  for (const s of sellers) room += s.room;
  if (room < need) return false;
  const cause = causeOf(w, f);
  const got: { id: string; q: number }[] = [];
  let left = need;
  for (const s of sellers) {
    if (left < 1) break;
    const q = Math.min(left, s.room);
    const cost = q * px;
    if (!pay(w, f.id, s.id, cost, 'fund.stake', cause)) break;
    if (!w.ledger.move(instr, s.id, f.id, q, 'fund.stake', cause)) {
      pay(w, s.id, f.id, cost, 'fund.stake', cause);
      break;
    }
    got.push({ id: s.id, q });
    left -= q;
  }
  if (left < 1) return true;
  for (const g of got) {
    const cost = g.q * px;
    if (!pay(w, g.id, f.id, cost, 'fund.stake', cause)) continue;
    if (!w.ledger.move(instr, f.id, g.id, g.q, 'fund.stake', cause)) pay(w, f.id, g.id, cost, 'fund.stake', cause);
  }
  return false;
}

function returnStake(w: World, f: Fund, instr: string): void {
  let left = held(w, f.id, instr);
  if (left < 1) return;
  const st = stockOf(w, instr);
  const px = Math.max(1, st?.last ?? 1);
  const cause = causeOf(w, f);
  const buyers: { id: string; cash: number }[] = [];
  for (const [id, n] of w.ledger.holders('dep')) {
    if (!id.startsWith('p_') || n < px) continue;
    buyers.push({ id, cash: Math.floor(n) });
  }
  buyers.sort((a, b) => b.cash - a.cash || (a.id < b.id ? -1 : 1));
  for (const b of buyers) {
    if (left < 1) break;
    const afford = Math.floor(cashOf(w, b.id) / px);
    const q = Math.min(left, afford);
    if (q < 1) continue;
    const cost = q * px;
    if (!pay(w, b.id, f.id, cost, 'fund.stake', cause)) continue;
    if (!w.ledger.move(instr, f.id, b.id, q, 'fund.stake', cause)) {
      pay(w, f.id, b.id, cost, 'fund.stake', cause);
      continue;
    }
    left -= q;
  }
}

export function activism(w: World, f: Fund): void {
  if (f.wind > 0 || w.day < f.cool) return;
  if (f.camp && f.camp.phase === 0) {
    const c = f.camp;
    const st = stockOf(w, c.instr);
    const need = Math.ceil(sharesOut(w, c.instr) * 0.051);
    const gap = need - held(w, f.id, c.instr);
    if (gap < 1) return;
    if (st && w.day - c.day <= 3 && takeStake(w, f, c.instr, gap, st.last)) return;
    returnStake(w, f, c.instr);
    f.camp = null;
    f.cool = w.day + 10;
    return;
  }
  if (f.camp) return;
  const cash = cashOf(w, f.id);
  let best: { instr: string; issuer: string; firm: number; gap: number; last: number; score: number } | undefined;
  for (const st of stocksOf(w)) {
    const firm = firmOf(w, st.issuer);
    if (!firm || firm.closed || !firm.listed || st.last < 1) continue;
    const out = sharesOut(w, st.instr);
    const need = Math.ceil(out * 0.051);
    const gap = need - held(w, f.id, st.instr);
    if (gap < 1) {
      f.camp = { issuer: st.issuer, instr: st.instr, firm: firm.idx, demand: 'dividend', phase: 0, stakeEv: -1, campEv: -1, day: w.day };
      return;
    }
    if (gap > 1 && (cash < gap * Math.round(st.last * 1.02) || roomIn(w, st.instr) < gap)) continue;
    const cost = gap * Math.round(st.last * 1.02);
    if (cost > cash * 0.7 || cost < 1) continue;
    const score = firm.badMonths * 3 + (firm.lastDividend > 0 ? 2 : 0) - cost / Math.max(1, cash);
    if (!best || score > best.score || (score === best.score && st.instr < best.instr)) {
      best = { instr: st.instr, issuer: st.issuer, firm: firm.idx, gap, last: st.last, score };
    }
  }
  if (!best || !takeStake(w, f, best.instr, best.gap, best.last)) return;
  f.camp = { issuer: best.issuer, instr: best.instr, firm: best.firm, demand: 'dividend', phase: 0, stakeEv: -1, campEv: -1, day: w.day };
}

function demandOf(_w: World, _issuer: string): Demand {
  return 'dividend';
}

function board(w: World, issuer: string, holders: [string, number][]): Set<string> {
  const s = econ(w), b = new Set<string>();
  const firm = firmOf(w, issuer);
  if (firm && firm.ceo >= 0) b.add(s.P.id(firm.ceo));
  let top = '', n = 0;
  for (const [id, sh] of holders) if (sh > n) { top = id; n = sh; }
  if (top) b.add(top);
  return b;
}

function favors(w: World, id: string, demand: Demand, onBoard: boolean, issuer: string): boolean {
  const s = econ(w), firm = firmOf(w, issuer);
  if (id.startsWith('hf_act')) return true;
  switch (demand) {
    case 'dividend':
      if (onBoard && id.startsWith('p_')) {
        const i = +id.slice(2);
        return i >= 0 && i < s.P.n && s.P.greed[i] >= 72;
      }
      if (id.startsWith('p_')) {
        const i = +id.slice(2);
        return i >= 0 && i < s.P.n && s.P.greed[i] >= 38;
      }
      return !onBoard;
    case 'ceo':
      if (onBoard && firm && firm.ceo >= 0 && id === s.P.id(firm.ceo)) return false;
      return (firm?.badMonths ?? 0) >= 3;
    case 'sale':
      if (onBoard) return (firm?.badMonths ?? 0) >= 5;
      if (id.startsWith('p_')) {
        const i = +id.slice(2);
        return i >= 0 && i < s.P.n && s.P.greed[i] >= 48;
      }
      return id.startsWith('fund_value') || id.startsWith('hf_value') || (firm?.badMonths ?? 0) >= 2;
    default: {
      const n: never = demand;
      return n;
    }
  }
}

export function settleCampaigns(w: World, f: Fund): void {
  const c = f.camp;
  if (!c || c.phase !== 1 || w.day - c.day < 28) return;
  const firm = firmOf(w, c.issuer);
  const st = stockByIssuer(w, c.issuer);
  if (!firm || firm.closed || !st) { f.camp = null; return; }
  const holders = [...w.ledger.holders(c.instr)].filter(([, n]) => n > 0);
  const total = holders.reduce((t, [, n]) => t + n, 0);
  const seat = board(w, c.issuer, holders);
  let yes = 0;
  const voters = new Set<string>();
  for (const [id, n] of holders) {
    if (!favors(w, id, c.demand, seat.has(id), c.issuer)) continue;
    yes += n;
    voters.add(id);
  }
  const pass = total > 0 && yes * 2 > total;
  const pct = total > 0 ? Math.round(100 * yes / total) : 0;
  const word = c.demand === 'dividend' ? 'a higher dividend' : c.demand === 'ceo' ? 'a new chief executive' : 'a sale of the firm';
  const msg = pass
    ? `holders of ${firm.name} vote for ${word}, ${pct}% in favour`
    : `the board of ${firm.name} holds ${word}: ${pct}% of the shares were in favour`;
  const vote = w.events.emit('fund.vote', msg, [c.campEv], firm.id);
  if (pass) {
    if (c.demand === 'ceo') replaceChief(w, f, firm.idx, vote);
    else f.pend = { issuer: c.issuer, kind: c.demand, ev: vote, day: w.day + (c.demand === 'dividend' ? 12 : 1), firm: firm.idx };
  }
  returnStake(w, f, c.instr);
  f.camp = null;
  f.cool = w.day + 150;
}

function replaceChief(w: World, f: Fund, firmIdx: number, cause: number): void {
  const s = econ(w), firm = s.firms[firmIdx];
  if (!firm || firm.closed || firm.ceo < 0) return;
  const old = firm.ceo;
  setSimDay(w.day);
  const ev = w.events.emit('fund.ceo', `${s.P.name(old)} is removed as chief executive of ${firm.name} after the vote`, [cause], firm.id);
  succession(w, s, firm, old, 'lost an activist vote', ev);
  if (s.P.employer[old] === firm.idx) leaveJob(s, old);
  s.P.lastEv[old] = ev;
  void f;
}

export function actOnVotes(w: World, f: Fund): void {
  const p = f.pend;
  if (!p || w.day < p.day) return;
  const s = econ(w), firm = s.firms[p.firm];
  f.pend = null;
  if (!firm || firm.closed) return;
  if (p.kind === 'dividend') paySpecial(w, firm.idx, p.ev);
  else if (p.kind === 'sale') sellFirm(w, f, firm.idx, p.ev);
}

function paySpecial(w: World, firmIdx: number, cause: number): void {
  const s = econ(w), firm = s.firms[firmIdx];
  const buf = Math.round(firm.eff * s.wage * 18);
  const spare = Math.floor(cashOf(w, firm.id) - buf);
  const cents = Math.max(0, Math.min(spare > 0 ? Math.floor(spare * 0.12) : 0, Math.round(firm.eff * s.wage * 4)));
  if (cents < 100) {
    w.events.emit('fund.dividend', `${firm.name} agrees a special dividend, but the cash is already spoken for`, [cause], firm.id);
    return;
  }
  const instr = 'eq:' + firm.id;
  const total = Math.round(w.ledger.issued.get(instr) ?? 0);
  if (total < 1) return;
  const holders = [...w.ledger.holders(instr)].filter(([, n]) => n > 0);
  let paid = 0;
  for (const [id, n] of holders) {
    const a = Math.floor(cents * n / total);
    if (a < 1 || id === firm.id) continue;
    if (!pay(w, firm.id, id, a, 'fund.dividend', cause)) continue;
    paid += a;
    withhold(w, id, a, cause);
  }
  w.events.emit('fund.dividend', `${firm.name} pays a special dividend of ${paid} cents`, [cause], firm.id);
}

function sellFirm(w: World, f: Fund, firmIdx: number, cause: number): void {
  const s = econ(w), target = s.firms[firmIdx];
  const st = stockByIssuer(w, target.id);
  if (!st || st.last < 1) return;
  const buyers = s.firms.filter((x) => !x.closed && x.idx !== target.idx && x.good === target.good);
  buyers.sort((a, b) => cashOf(w, b.id) - cashOf(w, a.id) || a.idx - b.idx);
  const buyer = buyers[0];
  const offer = Math.max(1, Math.ceil(st.last * 1.08));
  if (!buyer) {
    w.events.emit('fund.sale', `no rival can buy ${target.name}, and the bid is withdrawn`, [cause], target.id);
    return;
  }
  const instr = 'eq:' + target.id;
  const holders = [...w.ledger.holders(instr)].filter(([id, n]) => n > 0 && id !== buyer.id);
  holders.sort((a, b) => (a[0] === f.id ? -1 : b[0] === f.id ? 1 : b[1] - a[1]));
  let moved = 0, spent = 0;
  const floor = Math.round(buyer.eff * s.wage * 21);
  for (const [id, n] of holders) {
    const spare = Math.floor(cashOf(w, buyer.id) - floor);
    const qty = Math.min(n, Math.floor(spare / offer));
    if (qty < 1) break;
    const c = qty * offer;
    if (!pay(w, buyer.id, id, c, 'fund.sale', cause)) break;
    if (!w.ledger.move(instr, id, buyer.id, qty, 'fund.sale', cause)) {
      pay(w, id, buyer.id, c, 'fund.sale', cause);
      break;
    }
    moved += qty;
    spent += c;
  }
  const msg = moved > 0
    ? `${buyer.name} buys ${moved} shares of ${target.name} at ${offer} cents (${spent} cents) after the vote`
    : `${buyer.name} cannot fund a bid for ${target.name}`;
  w.events.emit('fund.sale', msg, [cause], buyer.id);
}

export function announce(w: World, f: Fund): void {
  const c = f.camp;
  if (!c || c.phase !== 0) return;
  const firm = firmOf(w, c.issuer);
  const st = stockByIssuer(w, c.issuer);
  if (!firm || !st) return;
  const out = sharesOut(w, c.instr);
  const have = held(w, f.id, c.instr);
  if (out < 1 || have / out < 0.05) return;
  const pct = (100 * have / out).toFixed(1);
  const P = econ(w).P;
  const who = f.manager >= 0 && f.manager < P.n ? P.name(f.manager) : f.name;
  c.stakeEv = w.events.emit('fund.stake', `${who} discloses a ${pct}% stake in ${firm.name}`, whyFirm(w, c.issuer), f.id);
  c.demand = demandOf(w, c.issuer);
  const ask = c.demand === 'dividend' ? 'a higher dividend' : c.demand === 'ceo' ? 'a new chief executive' : 'a sale of the firm';
  c.campEv = w.events.emit('fund.campaign', `${who} of ${f.name} demands ${ask} at ${firm.name}`, [c.stakeEv], f.id);
  c.phase = 1;
  c.day = w.day;
  fundsOf(w).yCamp++;
}
