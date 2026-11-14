// Managers with a track record. Investors arrive after a good year and leave after a bad one.
// A loss that the leverage cannot carry is a blow-up: that fund sells, and anyone in the same names sells with it.
import { type Module, type World } from '../../kernel/index.ts';
import { pay } from '../economy/index.ts';
import { PRISON } from '../economy/people.ts';
import { tradeFuture } from '../commodities/index.ts';
import { cancelOrder } from '../markets/index.ts';
import { actOnVotes, activism, announce, settleCampaigns } from './activism.ts';
import {
  LABEL, cashOf, dropForce, econ, fundsOf, held, managers, navOf, placeEq, sharesOut, stocksOf, withhold,
  type Fund, type FundsState, type Strat, type Ticket,
} from './book.ts';
import { macro } from './macro.ts';
import { momentum } from './momentum.ts';
import { quant } from './quant.ts';
import { reviewShorts, shortSell } from './short.ts';
import { value } from './value.ts';

const SHARES = 1_000_000;

interface Spec { id: string; strat: Strat; slice: number; lever: number }
const SPECS: Spec[] = [
  { id: 'hf_mom', strat: 'momentum', slice: 0.016, lever: 0 },
  { id: 'hf_value', strat: 'value', slice: 0.014, lever: 0 },
  { id: 'hf_macro', strat: 'macro', slice: 0.012, lever: 1 },
  { id: 'hf_quant', strat: 'quant', slice: 0.012, lever: 0 },
  { id: 'hf_short', strat: 'short', slice: 0.011, lever: 1 },
  { id: 'hf_act', strat: 'activist', slice: 0.014, lever: 0 },
];

function blank(spec: Spec): Fund {
  return {
    id: spec.id, name: LABEL[spec.strat], strat: spec.strat, manager: -1, hiredEv: -1, hiredDay: 0,
    down: 0, year0: 1, nav: 1, peak: 1, yBps: 0, wind: 0, cool: 0, need: 0, pushed: -10, flowEv: -1,
    orders: [], force: [], borrowed: [], camp: null, pend: null, note: '', lever: spec.lever,
  };
}

function scoreOf(w: World, i: number, strat: Strat): number {
  const P = econ(w).P;
  switch (strat) {
    case 'momentum': return P.greed[i] * 2 + (100 - P.diligence[i]) + P.skill[i] * 8;
    case 'value': return P.diligence[i] * 2 + (100 - P.greed[i]) + P.skill[i] * 12;
    case 'macro': return P.skill[i] * 40 + P.diligence[i];
    case 'quant': return P.diligence[i] * 2 + P.skill[i] * 25;
    case 'short': return P.diligence[i] * 1.4 + P.skill[i] * 18 + P.greed[i] * 0.35;
    case 'activist': return P.greed[i] + P.skill[i] * 20 + P.diligence[i] * 0.3;
    default: { const n: never = strat; return n; }
  }
}

function pickManager(w: World, strat: Strat): number {
  const s = econ(w), P = s.P, taken = managers(w);
  const ceos = new Set<number>();
  for (const f of s.firms) if (!f.closed && f.ceo >= 0) ceos.add(f.ceo);
  let best = -1, score = -1;
  for (let i = 0; i < P.n; i++) {
    if (taken.has(i) || ceos.has(i) || !P.adult(w, i) || (P.flags[i] & PRISON) !== 0) continue;
    if (P.skill[i] < 1.05) continue;
    const sc = scoreOf(w, i, strat);
    if (sc > score) { score = sc; best = i; }
  }
  return best;
}

function capitalise(w: World, id: string, slice: number, base: number[], ids: string[]): void {
  const L = w.ledger;
  L.addActor(id, 'fund');
  L.define({ id: 'eq:' + id, kind: 'share', issuer: id });
  const paid: { id: string; cents: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    const cents = Math.floor(base[i] * slice);
    if (cents > 0 && pay(w, ids[i], id, cents, 'genesis.equity', w.genesis)) paid.push({ id: ids[i], cents });
  }
  const total = paid.reduce((a, p) => a + p.cents, 0);
  let left = SHARES;
  for (let i = 0; i < paid.length; i++) {
    const sh = i === paid.length - 1 ? left : (total > 0 ? Math.round(SHARES * paid[i].cents / total) : 0);
    left -= sh;
    if (sh > 0) L.issue('eq:' + id, paid[i].id, sh, 'genesis.equity', w.genesis);
  }
}

function hire(w: World, f: Fund, cause: number, why: string): void {
  const P = econ(w).P;
  const i = pickManager(w, f.strat);
  if (i < 0) return;
  f.manager = i;
  f.hiredDay = w.day;
  f.hiredEv = w.events.emit('fund.hired', `${P.name(i)} ${why} the ${f.name} fund`, [cause], f.id);
  f.down = 0;
}

function replaceManager(w: World, f: Fund, cause: number, why: string): void {
  const P = econ(w).P;
  const old = f.manager;
  const name = old >= 0 && old < P.n ? P.name(old) : 'the manager';
  const ev = w.events.emit('fund.fired', `${name} is fired from ${f.name} ${why}`, [cause], f.id);
  f.manager = -1;
  hire(w, f, ev, 'takes over');
}

function aliveManager(w: World, f: Fund): boolean {
  const P = econ(w).P, i = f.manager;
  return i >= 0 && i < P.n && P.alive(i) && (P.flags[i] & PRISON) === 0;
}

function pain(w: World, f: Fund): number[] {
  const out: number[] = [];
  const mv = w.events.last('mkt.move');
  if (mv !== undefined) out.push(mv);
  const rate = econ(w).rateEv;
  if (rate >= 0) out.push(rate);
  for (const b of f.borrowed) {
    if (b.deny >= 0) out.push(b.deny);
    else if (b.report >= 0) out.push(b.report);
  }
  if (!out.length) out.push(fundsOf(w).root);
  return [...new Set(out)].slice(0, 4);
}

function unload(w: World, f: Fund, cause: number, tell: boolean): void {
  dropForce(w, f);
  const rows = stocksOf(w)
    .map((st) => ({ instr: st.instr, mv: held(w, f.id, st.instr) * st.last, qty: held(w, f.id, st.instr) }))
    .filter((r) => r.qty >= 8);
  rows.sort((a, b) => b.mv - a.mv || (a.instr < b.instr ? -1 : 1));
  for (const r of rows.slice(0, 3)) {
    const sell = Math.max(1, Math.floor(r.qty * (f.wind > 0 ? 0.5 : 0.35)));
    placeEq(w, f, r.instr, 'sell', sell, 0.012, 'force');
    if (!tell) continue;
    const peers = fundsOf(w).funds
      .filter((o) => o.id !== f.id && held(w, o.id, r.instr) >= 12)
      .sort((a, b) => held(w, b.id, r.instr) - held(w, a.id, r.instr) || (a.id < b.id ? -1 : 1))
      .slice(0, 2);
    for (const o of peers) {
      const q = held(w, o.id, r.instr);
      const ss = Math.max(1, Math.floor(q * 0.18));
      placeEq(w, o, r.instr, 'sell', ss, 0.012, 'force');
      w.events.emit('fund.crowd', `${o.name} sells ${r.instr} with ${f.name}`, [cause], o.id);
    }
  }
}

function blow(w: World, f: Fund): void {
  const ev = w.events.emit('fund.blowup', `${f.name} is leveraged and has to sell`, pain(w, f), f.id);
  fundsOf(w).yBlow++;
  f.wind = 14;
  f.cool = w.day + 480;
  f.flowEv = ev;
  for (const b of f.borrowed) b.cover = 1;
  if (f.note && w.state.commodities) {
    tradeFuture(w, f.id, f.note, 3, 0, 'flat');
    f.note = '';
  }
  unload(w, f, ev, true);
  if (aliveManager(w, f)) replaceManager(w, f, ev, 'after the blow-up');
}

function subscribe(w: World, f: Fund, frac: number, cause: number): void {
  const nav = navOf(w, f);
  const eq = 'eq:' + f.id;
  const total = Math.round(w.ledger.issued.get(eq) ?? 0);
  if (nav < 1000 || total < 1) return;
  const s = econ(w);
  const rows = s.investors
    .map((h) => ({ id: h.id, spare: Math.floor(cashOf(w, h.id) - s.wage * 60) }))
    .filter((r) => r.spare > s.wage * 30);
  rows.sort((a, b) => b.spare - a.spare || (a.id < b.id ? -1 : 1));
  let left = Math.floor(nav * frac);
  for (const r of rows.slice(0, 24)) {
    if (left < 200) break;
    const room = Math.min(left, Math.floor(r.spare * 0.03));
    const sh = Math.floor(room * total / nav);
    const cost = sh > 0 ? Math.round(sh * nav / total) : 0;
    if (cost < 1 || cost > cashOf(w, r.id)) continue;
    if (!pay(w, r.id, f.id, cost, 'fund.subscribe', cause)) continue;
    w.ledger.issue(eq, r.id, sh, 'fund.subscribe', cause);
    left -= cost;
  }
}

function redeem(w: World, f: Fund, frac: number, cause: number): void {
  const nav = navOf(w, f);
  const eq = 'eq:' + f.id;
  const total = Math.round(w.ledger.issued.get(eq) ?? 0);
  if (nav < 1000 || total < 2) return;
  const want = Math.floor(nav * frac);
  const have = Math.floor(cashOf(w, f.id) * 0.82);
  if (have < Math.min(want, 500)) {
    f.need = want;
    f.flowEv = cause;
    return;
  }
  const spend = Math.min(want, have);
  const shWant = Math.min(total - 1, Math.max(1, Math.floor(spend * total / nav)));
  const holders = [...w.ledger.holders(eq)].filter(([, n]) => n > 0);
  let leftSh = shWant;
  for (let i = 0; i < holders.length && leftSh > 0; i++) {
    const [id, n] = holders[i];
    const sh = Math.min(n, i === holders.length - 1 ? leftSh : Math.floor(shWant * n / total));
    if (sh < 1) continue;
    const c = Math.round(sh * nav / total);
    if (c < 1 || cashOf(w, f.id) < c) continue;
    if (!pay(w, f.id, id, c, 'fund.redeem', cause)) continue;
    if (!w.ledger.redeem(eq, id, sh, 'fund.redeem', cause)) {
      pay(w, id, f.id, c, 'fund.redeem', cause);
      continue;
    }
    leftSh -= sh;
    withhold(w, id, c, cause);
  }
  if (leftSh > shWant * 0.5) f.need = Math.floor(leftSh * nav / total);
}

function yearEnd(w: World, f: Fund): void {
  const nav = navOf(w, f);
  const bps = f.year0 > 0 ? Math.round((nav - f.year0) / f.year0 * 10000) : 0;
  f.yBps = bps;
  f.nav = nav;
  const why = econ(w).macroEv >= 0 ? [econ(w).macroEv] : [fundsOf(w).root];
  if (bps > 700) {
    const ev = w.events.emit('fund.flow', `${f.name} takes in money after a ${(bps / 100).toFixed(1)}% year`, why, f.id);
    f.flowEv = ev;
    subscribe(w, f, 0.05, ev);
  } else if (bps < -300) {
    const ev = w.events.emit('fund.flow', `${f.name} returns money after a ${(bps / 100).toFixed(1)}% year`, why, f.id);
    f.flowEv = ev;
    redeem(w, f, bps < -1200 ? 0.12 : 0.06, ev);
    if (f.need > 0) {
      const sale = w.events.emit('fund.forced', `${f.name} must sell to pay investors back`, [ev], f.id);
      unload(w, f, sale, true);
      f.pushed = w.day;
    }
  }
  if (bps < -200) f.down++; else f.down = 0;
  if (f.wind === 0 && w.day - f.hiredDay > 300 && aliveManager(w, f) && (f.down >= 2 || bps < -1800)) {
    replaceManager(w, f, f.flowEv >= 0 ? f.flowEv : why[0], 'after the losses');
  }
  f.year0 = Math.max(1, navOf(w, f));
}

function act(w: World, f: Fund): void {
  if (f.wind > 0) {
    if (w.day % 2 === 0) unload(w, f, f.flowEv >= 0 ? f.flowEv : fundsOf(w).root, false);
    return;
  }
  switch (f.strat) {
    case 'quant': quant(w, f); break;
    case 'momentum': if (w.day % 10 === 1) momentum(w, f); break;
    case 'value': if (w.day % 10 === 3) value(w, f); break;
    case 'macro': if (w.day % 10 === 5) macro(w, f); break;
    case 'short': if (w.day % 20 === 7) shortSell(w, f); break;
    case 'activist': if (w.day % 8 === 2) activism(w, f); break;
    default: { const n: never = f.strat; void n; }
  }
}

export const funds: Module = {
  id: 'funds',

  init(w) {
    const st: FundsState = { funds: [], root: -1, yCamp: 0, yBlow: 0, yRep: 0, shortHi: 0, reported: [] };
    w.state.funds = st;
    if (!w.state.markets) return;
    st.root = w.events.emit('funds.open', 'six funds open, each with a manager', [w.genesis]);
    const s = econ(w);
    const ids = s.investors.map((h) => h.id);
    const base = ids.map((id) => cashOf(w, id));
    for (const spec of SPECS) {
      capitalise(w, spec.id, spec.slice, base, ids);
      const f = blank(spec);
      st.funds.push(f);
      hire(w, f, st.root, 'is hired to run');
      const nav = navOf(w, f);
      f.nav = nav;
      f.peak = nav;
      f.year0 = Math.max(1, nav);
    }
  },

  tick(w, t) {
    if (t !== 0) return;
    const st = w.state.funds as FundsState | undefined;
    if (!st?.funds.length) return;
    for (const f of st.funds) act(w, f);
  },

  dayClose(w) {
    const st = w.state.funds as FundsState | undefined;
    if (!st?.funds.length) return;
    for (const f of st.funds) {
      const keep: Ticket[] = [];
      for (const o of f.force) {
        if (w.day > o.day + 3) cancelOrder(w, f.id, o.id);
        else keep.push(o);
      }
      f.force = keep;
      const nav = navOf(w, f);
      f.nav = nav;
      if (nav > f.peak) f.peak = nav;
      announce(w, f);
      actOnVotes(w, f);
      if (f.borrowed.length) reviewShorts(w, f);
    }
    let hi = 0;
    for (const f of st.funds) for (const b of f.borrowed) {
      const out = sharesOut(w, b.instr);
      if (out > 0 && b.qty > 0) hi = Math.max(hi, 100 * b.qty / out);
    }
    if (hi > st.shortHi) st.shortHi = hi;
    if (w.day > 420) {
      for (const f of st.funds) {
        if (f.wind > 0 || w.day < f.cool) continue;
        let shortLoss = 0;
        for (const b of f.borrowed) {
          if (!b.sold) continue;
          const row = stocksOf(w).find((x) => x.instr === b.instr);
          if (row) shortLoss += b.qty * (row.last - b.entry);
        }
        const crushed = f.peak > 0 && f.nav < f.peak * 0.45;
        if ((f.lever && shortLoss > Math.max(1, f.nav) * 0.22) || crushed) blow(w, f);
      }
    }
    for (const f of st.funds) if (f.wind > 0) f.wind--;
  },

  monthEnd(w) {
    const st = w.state.funds as FundsState | undefined;
    if (!st?.funds.length) return;
    const s = econ(w);
    for (const f of st.funds) {
      if (aliveManager(w, f)) {
        const nav = navOf(w, f);
        const c = Math.round(nav * 0.0006);
        if (c > 0 && cashOf(w, f.id) > c * 4 && pay(w, f.id, s.P.id(f.manager), c, 'fund.salary', f.hiredEv >= 0 ? f.hiredEv : st.root)) s.P.incWeek[f.manager] += c;
      } else if (!aliveManager(w, f)) {
        const cause = f.manager >= 0 && f.manager < s.P.n && s.P.lastEv[f.manager] >= 0 ? s.P.lastEv[f.manager] : st.root;
        f.manager = -1;
        hire(w, f, cause, 'replaces a manager who left');
      }
      settleCampaigns(w, f);
      if (f.need > 0 && cashOf(w, f.id) > f.need * 0.65) {
        const nav = Math.max(1, navOf(w, f));
        redeem(w, f, Math.min(0.2, f.need / nav), f.flowEv >= 0 ? f.flowEv : st.root);
        if (cashOf(w, f.id) < f.need) f.need = Math.floor(f.need * 0.5); else f.need = 0;
      } else if (f.need > 0 && w.day - f.pushed > 8) {
        const sale = w.events.emit('fund.forced', `${f.name} sells to meet redemptions`, [f.flowEv >= 0 ? f.flowEv : st.root], f.id);
        unload(w, f, sale, true);
        f.pushed = w.day;
      }
      if ((w.day + 1) % 360 === 0) yearEnd(w, f);
    }
  },

  stats(w) {
    const st = w.state.funds as FundsState | undefined;
    if (!st?.funds.length) return { best: '-', worst: '-', campaigns: 0, blowups: 0 };
    const aum = (strat: Strat): number => st.funds.filter((f) => f.strat === strat).reduce((t, f) => t + navOf(w, f), 0) / 1e8;
    const ranked = [...st.funds].sort((a, b) => b.yBps - a.yBps || (a.id < b.id ? -1 : 1));
    const fmt = (f: Fund): string => `${f.name} ${(f.yBps / 100).toFixed(1)}%`;
    const out = {
      aumMom: +aum('momentum').toFixed(2),
      aumValue: +aum('value').toFixed(2),
      aumMacro: +aum('macro').toFixed(2),
      aumQuant: +aum('quant').toFixed(2),
      aumShort: +aum('short').toFixed(2),
      aumAct: +aum('activist').toFixed(2),
      fundBest: fmt(ranked[0]),
      fundWorst: fmt(ranked[ranked.length - 1]),
      short_pct: +st.shortHi.toFixed(3),
      campaigns: st.yCamp,
      blowups: st.yBlow,
      briefs: st.yRep,
    };
    st.yCamp = 0; st.yBlow = 0; st.yRep = 0; st.shortHi = 0;
    return out;
  },
};
