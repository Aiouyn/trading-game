// Quarterly reports, guidance, and the analysts who cover listed firms.
// Figures come from the firm's own month: sales, costs and the profit the economy already booked.
// A few days before the print the finance desk and the people they trust hold that number.
// Funds and households then trade the surprise on the order book.
import { type Module, type World } from '../../kernel/index.ts';
import { CEO_POSITION } from '../economy/content.ts';
import { BANK, DEP, type EconState, type Firm } from '../economy/index.ts';
import { thought } from '../economy/people.ts';
import { cancelOrder, submitOrder } from '../markets/index.ts';
import { askFirm, contactsOf } from '../social/index.ts';

const REMOVE_AFTER = CEO_POSITION.removeAfter;

interface Know { tab: Int32Array | null; mask: number; n: number; bits: Uint32Array | null }
interface SocFact {
  id: number; eventId: number; day: number; year: number; tag: string; msg: string;
  firms: number[]; instrs: string[]; shock: null; profit: number;
  bad: boolean; intensity: number; hold: number; pub: boolean; drop: boolean;
  pubDay: number; first: number; firstDay: number; know: Know | null;
}
interface Soc { facts: SocFact[]; insiderFact: Int32Array; yCreated: number; yHit: number; yPub: number; yDelay: number }
interface Stock { instr: string; issuer: string; last: number }
interface Mkt { stocks?: Stock[]; funds?: { id: string; style: string }[] }
interface Call { person: number; forecast: number }
interface Analyst {
  person: number; desk: string; firms: number[]; bank: boolean;
  calls: number; hits: number; absErr: number; yCalls: number; yHits: number; yAbs: number;
}
interface Report {
  issuer: string; name: string; firm: number; day: number; text: string;
  revenue: number; costs: number; profit: number; eps: number; cash: number; debt: number;
  consensus: number; surprise: number; beat: boolean; event: number; px: number; pxAfter: number;
}
interface Wave { instr: string; issuer: string; side: 'buy' | 'sell'; left: number; momentum: boolean }
interface Resting { actor: string; id: number; until: number }

interface Book {
  rev: Float64Array; cost: Float64Array; profit: Float64Array; months: Uint8Array;
  snapRev: Float64Array; snapCost: Float64Array; snapDay: Int32Array;
  prevMonthly: Float64Array; hasPrev: Uint8Array; guide: Float64Array; hasGuide: Uint8Array;
  previewFact: Int32Array;
  causes: number[][]; openEv: number[][]; knowers: number[][]; locked: Call[][];
  analysts: Analyst[];
  bankEq: number; bankProfit: number; bankMonths: number; bankPrev: number; bankHasPrev: number;
  bankGuide: number; bankHasGuide: number; bankLocked: Call[]; bankCauses: number[];
  reports: Report[]; waves: Wave[]; resting: Resting[];
  yReports: number; ySurprise: number; yBeats: number; root: number;
}

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): Book => w.state.earnings as Book;
const mkt = (w: World): Mkt | undefined => w.state.markets as Mkt | undefined;
const soc = (w: World): Soc | undefined => {
  const st = w.state.social as Soc | undefined;
  if (!st?.facts || !st.insiderFact) return undefined;
  return st;
};

function growF(a: Float64Array, n: number): Float64Array {
  if (a.length >= n) return a;
  let cap = Math.max(16, a.length);
  while (cap < n) cap *= 2;
  const b = new Float64Array(cap);
  b.set(a);
  return b;
}
function growU(a: Uint8Array, n: number): Uint8Array {
  if (a.length >= n) return a;
  let cap = Math.max(16, a.length);
  while (cap < n) cap *= 2;
  const b = new Uint8Array(cap);
  b.set(a);
  return b;
}
function growI(a: Int32Array, n: number, fill: number): Int32Array {
  if (a.length >= n) return a;
  let cap = Math.max(16, a.length);
  while (cap < n) cap *= 2;
  const b = new Int32Array(cap);
  if (fill) b.fill(fill);
  b.set(a);
  return b;
}
function needN(w: World): number {
  const firms = econ(w).firms;
  let n = firms.length;
  for (const f of firms) if (f.idx + 1 > n) n = f.idx + 1;
  return n;
}
function fit(b: Book, n: number): void {
  while (b.causes.length < n) { b.causes.push([]); b.openEv.push([]); b.knowers.push([]); b.locked.push([]); }
  b.rev = growF(b.rev, n); b.cost = growF(b.cost, n); b.profit = growF(b.profit, n);
  b.snapRev = growF(b.snapRev, n); b.snapCost = growF(b.snapCost, n); b.prevMonthly = growF(b.prevMonthly, n); b.guide = growF(b.guide, n);
  b.months = growU(b.months, n); b.hasPrev = growU(b.hasPrev, n); b.hasGuide = growU(b.hasGuide, n);
  b.snapDay = growI(b.snapDay, n, -1); b.previewFact = growI(b.previewFact, n, -1);
}

function usd(cents: number): string {
  const s = Math.round(cents), sign = s < 0 ? '-' : '', a = Math.abs(s);
  if (a >= 1e8) return `${sign}$${(a / 1e8).toFixed(2)}M`;
  if (a >= 1e5) return `${sign}$${(a / 1e5).toFixed(1)}k`;
  return `${sign}$${(a / 100).toFixed(0)}`;
}
function sharesOf(w: World, issuer: string): number {
  return Math.max(1, Math.round(w.ledger.issued.get('eq:' + issuer) ?? 0));
}
function debtOf(w: World, f: Firm): number {
  return Math.round((w.ledger.issued.get('loan:' + f.id) ?? 0) + (w.ledger.issued.get('cf:' + f.id) ?? 0));
}
function stockOf(w: World, issuer: string): Stock | undefined {
  const stocks = mkt(w)?.stocks;
  if (!stocks) return undefined;
  for (const st of stocks) if (st.issuer === issuer) return st;
  return undefined;
}
function listed(w: World, issuer: string): boolean { return !!stockOf(w, issuer); }
function pickCauses(w: World, issuer: string, causes: number[], root: number): number[] {
  const own: number[] = [], rest: number[] = [];
  for (const id of uniq(causes)) {
    const e = w.events.get(id);
    if (!e) continue;
    if (e.actor === issuer || e.kind.startsWith('firm.') || e.kind.startsWith('shock.')) own.push(id);
    else rest.push(id);
  }
  const why = uniq([...own.slice(-4), ...rest.slice(-2)]);
  if (!why.length) why.push(root);
  return why;
}
function uniq(ids: number[]): number[] {
  const out: number[] = [];
  for (const id of ids) if (id >= 0 && !out.includes(id)) out.push(id);
  return out;
}
function paperOf(w: World): { id: string; name: string } {
  for (const f of econ(w).firms) if (f.good === 'NEWS') return { id: f.id, name: f.name };
  return { id: '', name: 'The paper' };
}

function hashPerson(person: number, mask: number): number {
  let x = Math.imul(person ^ (person >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) & mask;
}
function makeKnow(ids: number[]): Know {
  let cap = 8;
  while (cap < ids.length * 2) cap <<= 1;
  const tab = new Int32Array(cap);
  tab.fill(-1);
  const mask = cap - 1;
  let n = 0;
  for (const person of ids) {
    if (person < 0) continue;
    let h = hashPerson(person, mask), guard = 0;
    while (tab[h] !== -1 && guard++ <= mask) {
      if (tab[h] === person) { h = -1; break; }
      h = (h + 1) & mask;
    }
    if (h >= 0 && tab[h] === -1) { tab[h] = person; n++; }
  }
  return { tab, mask, n, bits: null };
}

function pushFact(w: World, fact: SocFact): void {
  const st = soc(w);
  if (!st) return;
  fact.id = st.facts.length;
  st.facts.push(fact);
  st.yCreated++;
  if (fact.pub && fact.year === w.year) { st.yPub++; st.yHit++; }
}
function blankFact(w: World, tag: string, eventId: number, msg: string, profit: number, pub: boolean): SocFact {
  return {
    id: 0, eventId, day: w.day, year: w.year, tag, msg, firms: [], instrs: [], shock: null, profit,
    bad: false, intensity: 0, hold: 0, pub, drop: false, pubDay: pub ? w.day : -1, first: -1, firstDay: w.day, know: null,
  };
}

/** The desk, the chief, and the contacts they actually trust. Law reads this same set. */
function desk(w: World, f: Firm): number[] {
  const P = econ(w).P;
  const staff = f.staff.filter((i) => i !== f.ceo && i < P.n && P.alive(i));
  staff.sort((a, b) => P.diligence[b] - P.diligence[a] || P.skill[b] - P.skill[a] || a - b);
  const ids: number[] = [];
  const add = (i: number): void => { if (i >= 0 && i < P.n && P.alive(i) && !ids.includes(i)) ids.push(i); };
  add(f.ceo);
  for (const i of staff) { if (ids.length >= 4) break; add(i); }
  const ranked: { who: number; trust: number }[] = [];
  for (const i of ids) for (const c of contactsOf(w, i)) if (c.trust >= 48) ranked.push({ who: c.who, trust: c.trust });
  ranked.sort((a, b) => b.trust - a.trust || a.who - b.who);
  for (const c of ranked) { if (ids.length >= 20) break; add(c.who); }
  return ids;
}

function quality(w: World, person: number): number {
  const P = econ(w).P;
  const skill = Math.max(0, Math.min(1, (P.skill[person] - 0.5) / 2.5));
  return skill * 0.55 + (P.diligence[person] / 100) * 0.45;
}
function biasOf(w: World, person: number): number {
  const P = econ(w).P;
  const raw = ((P.greed[person] - 50) - (P.anxiety[person] - 35)) / 600;
  return raw * (1 - P.diligence[person] / 140);
}
function shadeOf(w: World, ceo: number): number {
  if (ceo < 0) return 1;
  const P = econ(w).P;
  let s = 1;
  if (P.mood[ceo] >= 60 && P.anxiety[ceo] <= 40) s += 0.06 + (P.mood[ceo] - 60) / 500;
  if (P.greed[ceo] >= 58 && P.diligence[ceo] <= 48) s += 0.08 + (P.greed[ceo] - 58) / 400;
  if (P.anxiety[ceo] >= 70) s -= 0.07;
  return Math.max(0.8, Math.min(1.35, s));
}
function operatingMonth(f: Firm): number {
  const sales = Math.max(0, f.expSales) * 30;
  return sales * f.price - sales * f.unitCost;
}

function coverAll(b: Book, n: number): void {
  if (!b.analysts.length) return;
  const seen = new Uint8Array(n);
  for (const a of b.analysts) for (const fi of a.firms) if (fi >= 0 && fi < n) seen[fi] = 1;
  for (let fi = 0; fi < n; fi++) if (!seen[fi]) {
    for (let k = 0; k < 3; k++) b.analysts[(fi * 3 + k) % b.analysts.length].firms.push(fi);
  }
}
function pickAnalysts(w: World, b: Book): void {
  const s = econ(w), P = s.P, chosen = new Set<number>(), ceos = new Set<number>();
  for (const f of s.firms) if (f.ceo >= 0) ceos.add(f.ceo);
  const rank = (i: number): number => P.skill[i] * 50 + P.diligence[i];
  for (const f of s.firms) if (f.good === 'BANKING') {
    const pool = f.staff.filter((i) => i !== f.ceo && P.alive(i) && !chosen.has(i));
    pool.sort((a, c) => rank(c) - rank(a) || a - c);
    for (const i of pool.slice(0, 6)) {
      chosen.add(i);
      b.analysts.push({ person: i, desk: f.name, firms: [], bank: true, calls: 0, hits: 0, absErr: 0, yCalls: 0, yHits: 0, yAbs: 0 });
    }
  }
  const funds = mkt(w)?.funds?.map((f) => f.id) ?? [];
  const pool: number[] = [];
  for (const h of s.investors) {
    if (!h.id.startsWith('p_')) continue;
    const i = +h.id.slice(2);
    if (i >= 0 && P.alive(i) && !chosen.has(i) && !ceos.has(i)) pool.push(i);
  }
  pool.sort((a, c) => P.diligence[c] - P.diligence[a] || P.skill[c] - P.skill[a] || a - c);
  const take = Math.min(pool.length, Math.max(8, funds.length * 3));
  for (let k = 0; k < take; k++) {
    chosen.add(pool[k]);
    b.analysts.push({
      person: pool[k], desk: funds.length ? funds[k % funds.length] : 'fund', firms: [], bank: false,
      calls: 0, hits: 0, absErr: 0, yCalls: 0, yHits: 0, yAbs: 0,
    });
  }
  if (!b.analysts.some((a) => a.bank)) for (let k = 0; k < Math.min(4, b.analysts.length); k++) b.analysts[k].bank = true;
  coverAll(b, s.firms.length);
}

function score(a: Analyst, forecast: number, actual: number, consensus: number): void {
  const err = Math.abs(forecast - actual);
  a.calls++; a.yCalls++; a.absErr += err; a.yAbs += err;
  if (err < Math.abs(consensus - actual)) { a.hits++; a.yHits++; }
}

function learnedMonth(w: World, person: number, f: Firm, knowers: number[], pace: number): number | undefined {
  let informed: number | undefined;
  for (const c of contactsOf(w, person)) if (knowers.includes(c.who) && c.trust >= 40) { informed = pace; break; }
  if (knowers.includes(person)) informed = pace;
  let best = -1, trust = 39;
  for (const c of contactsOf(w, person)) if (c.trust > trust) { trust = c.trust; best = c.slot; }
  if (best >= 0) {
    const got = askFirm(w, person, best, f.id);
    const st = soc(w);
    if (st && informed === undefined) for (const fact of got.facts) {
      const row = st.facts[fact.factId];
      if (row && !row.drop && row.tag === 'insider.profit') informed = row.profit;
    }
  }
  return informed;
}

function monthGuess(w: World, f: Firm, person: number, done: number, doneProfit: number, informed: number | undefined): number {
  const interest = Math.round(debtOf(w, f) * (econ(w).policyRate + 0.03) / 12);
  const run = done > 0 ? doneProfit / done : operatingMonth(f) - interest;
  const b = book(w);
  const stale = b.hasPrev[f.idx] ? b.prevMonthly[f.idx] : run;
  const priceCh = f.mPrice0 > 0 ? f.price / f.mPrice0 - 1 : 0;
  const tight = Math.min(10, f.mStockDays) / 10;
  const q = quality(w, person);
  const smart = run * (1 + priceCh * 0.4 - tight * 0.08);
  let guess = stale * (1 - q) + smart * q;
  if (informed !== undefined) guess = guess * (1 - q) + informed * q;
  return guess * (1 + biasOf(w, person));
}

function lockFirm(w: World, f: Firm, pace: number): void {
  const b = book(w), P = econ(w).P, fi = f.idx;
  const row = b.locked[fi];
  row.length = 0;
  const done = b.months[fi], doneProfit = b.profit[fi];
  const know = b.knowers[fi];
  for (const a of b.analysts) {
    if (!a.firms.includes(fi) || !P.alive(a.person)) continue;
    const informed = learnedMonth(w, a.person, f, know, pace);
    const guess = monthGuess(w, f, a.person, done, doneProfit, informed);
    row.push({ person: a.person, forecast: Math.round(doneProfit + guess) });
  }
}
function lockBank(w: World): void {
  const b = book(w), P = econ(w).P;
  b.bankLocked = [];
  const run = b.bankMonths > 0 ? b.bankProfit / b.bankMonths : b.bankPrev;
  const stale = b.bankHasPrev ? b.bankPrev : run;
  for (const a of b.analysts) {
    if (!a.bank || !P.alive(a.person)) continue;
    const q = quality(w, a.person);
    const guess = (stale * (1 - q) + run * q) * (1 + biasOf(w, a.person) * 0.5);
    b.bankLocked.push({ person: a.person, forecast: Math.round(b.bankProfit + guess) });
  }
}

function consensusOf(calls: Call[], fallback: number): number {
  if (!calls.length) return Math.round(fallback);
  let sum = 0;
  for (const c of calls) sum += c.forecast;
  return Math.round(sum / calls.length);
}

function place(w: World, actor: string, instr: string, side: 'buy' | 'sell', qty: number, limit: number | null, until: number): void {
  if (qty < 1 || !w.ledger.actors.has(actor) || !mkt(w)) return;
  const id = limit === null
    ? submitOrder(w, actor, { instr, side, qty })
    : submitOrder(w, actor, { instr, side, qty, limit });
  book(w).resting.push({ actor, id, until });
}
function react(w: World, issuer: string, side: 'buy' | 'sell', momentum: boolean): void {
  const st = stockOf(w, issuer);
  const m = mkt(w);
  if (!st || !m || st.last < 1) return;
  const limit = Math.max(1, Math.round(st.last * (side === 'buy' ? 1.018 : 0.982)));
  let salt = 0;
  for (let i = 0; i < issuer.length; i++) salt = (salt + issuer.charCodeAt(i) * (i + 3)) % 997;
  for (const fund of m.funds ?? []) {
    if (fund.style !== 'value' && !(momentum && fund.style === 'momentum')) continue;
    const cash = Math.floor(w.ledger.balance(fund.id, DEP));
    const held = Math.floor(w.ledger.balance(fund.id, st.instr));
    const qty = side === 'buy' ? Math.min(250, Math.floor(cash * 0.025 / limit)) : Math.min(250, Math.floor(held * 0.06));
    place(w, fund.id, st.instr, side, qty, limit, w.day + 1);
  }
  const investors = econ(w).investors;
  for (let k = 0; k < investors.length; k++) {
    if ((k * 5 + salt) % 19 !== 0) continue;
    const id = investors[k].id;
    const cash = Math.floor(w.ledger.balance(id, DEP));
    const held = Math.floor(w.ledger.balance(id, st.instr));
    const qty = side === 'buy' ? Math.min(30, Math.floor(cash * 0.03 / limit)) : Math.min(30, held);
    place(w, id, st.instr, side, qty, limit, w.day + 1);
  }
}
function queueReact(w: World, issuer: string, surprise: number): void {
  if (!(Math.abs(surprise) >= 0.008) || !stockOf(w, issuer)) return;
  const side: 'buy' | 'sell' = surprise > 0 ? 'buy' : 'sell';
  const days = Math.abs(surprise) >= 0.12 ? 3 : Math.abs(surprise) >= 0.05 ? 2 : 1;
  const momentum = Math.abs(surprise) >= 0.08;
  react(w, issuer, side, momentum);
  const st = stockOf(w, issuer);
  if (days > 1 && st) book(w).waves.push({ instr: st.instr, issuer, side, left: days - 1, momentum });
}

function causesNow(w: World, f: Firm): number[] {
  const s = econ(w), ev: number[] = [];
  if (f.stockoutEv !== undefined) ev.push(f.stockoutEv);
  if (f.inputShortEv !== undefined) ev.push(f.inputShortEv);
  if (f.layoffEv !== undefined) ev.push(f.layoffEv);
  for (const x of s.shocks) {
    const d = x.def;
    if (d.prod[f.good] !== undefined || d.prod.ALL !== undefined || d.demand[f.good] !== undefined) ev.push(x.ev);
  }
  return uniq(ev);
}

function finishReport(w: World, issuer: string, name: string, firm: number, revenue: number, costs: number, profit: number, cash: number, debt: number, calls: Call[], fallback: number, causes: number[], prevGuide: number | undefined, nextGuide: number, ceo: number): void {
  const b = book(w), s = econ(w);
  const actual = Math.round(profit);
  const consensus = consensusOf(calls, fallback);
  const scale = Math.max(s.wage * 30, Math.abs(consensus), Math.abs(actual), 1);
  const surprise = (actual - consensus) / scale;
  const beat = actual > consensus;
  const sh = sharesOf(w, issuer);
  const eps = actual / sh;
  const q = Math.floor((w.month % 12) / 3) + 1;
  let text = `${name} Q${q}: revenue ${usd(revenue)}, costs ${usd(costs)}, profit ${usd(actual)}, EPS $${(eps / 100).toFixed(2)}, cash ${usd(cash)}, debt ${usd(debt)}; consensus ${usd(consensus)} (${beat ? 'beat' : actual < consensus ? 'miss' : 'met'} ${(surprise * 100).toFixed(1)}%)`;
  if (prevGuide !== undefined) text += `; guidance was ${usd(prevGuide)}`;
  text += `; guides ${usd(nextGuide)} next quarter`;
  const why = pickCauses(w, issuer, causes, b.root || w.genesis);
  const event = w.events.emit('earnings.report', text, why, issuer);
  const paper = paperOf(w);
  w.events.emit('news.story', `${paper.name}: ${text}`, [event], paper.id || undefined);
  const news = blankFact(w, 'firm.succession', event, text, actual, true);
  if (firm >= 0) { news.firms.push(firm); news.instrs.push('eq:' + issuer); }
  news.first = ceo;
  pushFact(w, news);
  const st = soc(w);
  if (st && firm >= 0 && firm < st.insiderFact.length && b.previewFact[firm] >= 0) {
    const prev = st.facts[b.previewFact[firm]];
    if (prev && !prev.drop) { prev.pub = true; prev.pubDay = w.day; }
    if (st.insiderFact[firm] === b.previewFact[firm]) st.insiderFact[firm] = -1;
  }
  for (const c of calls) {
    const a = b.analysts.find((x) => x.person === c.person);
    if (a) score(a, c.forecast, actual, consensus);
  }
  const px = stockOf(w, issuer)?.last ?? 0;
  b.reports.push({
    issuer, name, firm, day: w.day, text, revenue: Math.round(revenue), costs: Math.round(costs), profit: actual,
    eps, cash, debt, consensus, surprise, beat, event, px, pxAfter: 0,
  });
  b.yReports++; b.ySurprise += surprise; if (beat) b.yBeats++;
  queueReact(w, issuer, surprise);
  if (prevGuide !== undefined && ceo >= 0 && s.P.alive(ceo)) {
    const gap = prevGuide - actual;
    if (gap > Math.max(Math.abs(prevGuide) * 0.12, s.wage * 20)) {
      const f = firm >= 0 ? s.firms[firm] : undefined;
      thought(w, s, ceo, 55, `a guidance miss at ${name}`, event);
      w.events.emit('earnings.standing', `${s.P.name(ceo)} loses standing after ${name} missed its guidance`, [event], issuer);
      if (f) f.badMonths = Math.min(REMOVE_AFTER - 1, f.badMonths + 2);
    }
  }
  w.events.emit('earnings.guidance', `${name} guides ${usd(nextGuide)} for next quarter`, [event], issuer);
}

function reportFirm(w: World, f: Firm): void {
  const b = book(w), fi = f.idx;
  if (b.snapDay[fi] === w.day) {
    if (f.priceEv !== undefined) b.openEv[fi].push(f.priceEv);
    const macro = econ(w);
    if (macro.macroEv >= 0) b.openEv[fi].push(macro.macroEv);
    if (macro.wageEv >= 0) b.openEv[fi].push(macro.wageEv);
    if (macro.rateEv >= 0) b.openEv[fi].push(macro.rateEv);
    b.causes[fi].push(...b.openEv[fi]);
    const rev = Math.round(b.snapRev[fi]);
    const profit = Math.round(f.lastProfit);
    b.rev[fi] += rev; b.profit[fi] += profit; b.cost[fi] += rev - profit; b.months[fi]++;
    b.openEv[fi] = [];
  }
  if (w.month % 3 !== fi % 3) return;
  if (!listed(w, f.id)) return;
  const months = b.months[fi];
  const actual = b.profit[fi];
  const monthly = months > 0 ? actual / months : 0;
  const prevGuide = b.hasGuide[fi] ? b.guide[fi] : undefined;
  const calls = b.locked[fi];
  const fallback = Math.round((b.hasPrev[fi] ? b.prevMonthly[fi] : monthly) * Math.max(1, months));
  const next = Math.round(monthly * 3 * shadeOf(w, f.ceo));
  const cash = Math.round(w.ledger.balance(f.id, DEP));
  finishReport(w, f.id, f.name, fi, b.rev[fi], b.cost[fi], actual, cash, debtOf(w, f), calls, fallback, b.causes[fi], prevGuide, next, f.ceo);
  b.rev[fi] = 0; b.cost[fi] = 0; b.profit[fi] = 0; b.months[fi] = 0; b.causes[fi] = []; b.locked[fi] = [];
  b.prevMonthly[fi] = monthly; b.hasPrev[fi] = 1; b.guide[fi] = next; b.hasGuide[fi] = 1;
  b.knowers[fi] = [];
}

function reportBank(w: World): void {
  if (!listed(w, BANK)) return;
  const b = book(w);
  const eq = Math.round(w.ledger.netWorth(BANK));
  const monthProfit = eq - b.bankEq;
  b.bankProfit += monthProfit; b.bankMonths++; b.bankEq = eq;
  if (sMacro(w) >= 0) b.bankCauses.push(sMacro(w));
  if (w.month % 3 !== 2) return;
  const months = b.bankMonths;
  const actual = b.bankProfit;
  const monthly = months > 0 ? actual / months : 0;
  const prevGuide = b.bankHasGuide ? b.bankGuide : undefined;
  const fallback = Math.round((b.bankHasPrev ? b.bankPrev : monthly) * Math.max(1, months));
  const next = Math.round(monthly * 3);
  const revenue = actual >= 0 ? actual : 0;
  const costs = actual >= 0 ? 0 : -actual;
  finishReport(w, BANK, 'the bank', -1, revenue, costs, actual, Math.round(w.ledger.balance(BANK, DEP)), Math.round(w.ledger.issued.get(DEP) ?? 0), b.bankLocked, fallback, b.bankCauses, prevGuide, next, -1);
  b.bankProfit = 0; b.bankMonths = 0; b.bankCauses = []; b.bankLocked = [];
  b.bankPrev = monthly; b.bankHasPrev = 1; b.bankGuide = next; b.bankHasGuide = 1;
}

function sMacro(w: World): number {
  const id = econ(w).macroEv;
  return id >= 0 ? id : -1;
}

function previewFirm(w: World, f: Firm): void {
  const b = book(w), fi = f.idx;
  const seen = (w.day % 30) + 1;
  const partial = f.mRev - f.mCost;
  const interest = debtOf(w, f) * (econ(w).policyRate + 0.03) / 12;
  const pace = partial * (30 / seen) - interest;
  const ids = desk(w, f);
  b.knowers[fi] = ids;
  const st = soc(w);
  if (st && fi < st.insiderFact.length) {
    const old = b.previewFact[fi];
    if (old >= 0 && st.facts[old] && !st.facts[old].drop) { st.facts[old].drop = true; st.facts[old].know = null; }
    const qtd = Math.round(b.profit[fi] + pace);
    const msg = `${f.name} finance desk has the quarter at ${usd(qtd)} with ${30 - seen} days still to run`;
    const why = uniq([...b.causes[fi], ...causesNow(w, f)]);
    if (!why.length) why.push(book(w).root || w.genesis);
    const ev = w.events.emit('earnings.preview', msg, why.slice(-4), f.id);
    const fact = blankFact(w, 'insider.profit', ev, msg, Math.round(pace), false);
    fact.firms.push(fi); fact.instrs.push('eq:' + f.id); fact.know = makeKnow(ids); fact.first = ids[0] ?? -1;
    pushFact(w, fact);
    b.previewFact[fi] = fact.id;
    st.insiderFact[fi] = fact.id;
  }
  lockFirm(w, f, pace);
  tradeInside(w, f, ids, pace);
}
function tradeInside(w: World, f: Firm, ids: number[], pace: number): void {
  const b = book(w), P = econ(w).P, st = stockOf(w, f.id);
  if (!st) return;
  const done = b.months[f.idx];
  const privateQ = b.profit[f.idx] + pace;
  const pub = (b.hasPrev[f.idx] ? b.prevMonthly[f.idx] : (done > 0 ? b.profit[f.idx] / done : operatingMonth(f))) * (done + 1);
  const scale = Math.max(econ(w).wage * 30, Math.abs(pub), Math.abs(privateQ), 1);
  const edge = (privateQ - pub) / scale;
  if (Math.abs(edge) < 0.04) return;
  const side: 'buy' | 'sell' = edge > 0 ? 'buy' : 'sell';
  const ranked = ids.filter((i) => P.alive(i) && P.greed[i] >= 52 && P.greed[i] > P.diligence[i] * 0.85);
  ranked.sort((a, c) => (P.greed[c] - P.diligence[c]) - (P.greed[a] - P.diligence[a]) || a - c);
  if (f.ceo >= 0 && P.alive(f.ceo) && !ranked.includes(f.ceo) && P.greed[f.ceo] >= 45) ranked.unshift(f.ceo);
  let n = 0;
  for (const i of ranked) {
    if (n >= 3) break;
    const held = Math.floor(w.ledger.balance(P.id(i), st.instr));
    const cash = Math.floor(w.ledger.balance(P.id(i), DEP));
    const qty = side === 'buy' ? Math.min(12, Math.floor(cash * 0.04 / Math.max(1, st.last))) : Math.min(12, held);
    if (qty < 1) continue;
    place(w, P.id(i), st.instr, side, qty, null, w.day + 1);
    n++;
  }
}

function blank(n: number, root: number): Book {
  const z = (fill = 0) => { const a = new Float64Array(n); if (fill) a.fill(fill); return a; };
  const preview = new Int32Array(n); preview.fill(-1);
  const snapDay = new Int32Array(n); snapDay.fill(-1);
  return {
    rev: z(), cost: z(), profit: z(), months: new Uint8Array(n),
    snapRev: z(), snapCost: z(), snapDay, prevMonthly: z(), hasPrev: new Uint8Array(n), guide: z(), hasGuide: new Uint8Array(n),
    previewFact: preview, causes: Array.from({ length: n }, () => []), openEv: Array.from({ length: n }, () => []),
    knowers: Array.from({ length: n }, () => []), locked: Array.from({ length: n }, () => []),
    analysts: [], bankEq: 0, bankProfit: 0, bankMonths: 0, bankPrev: 0, bankHasPrev: 0, bankGuide: 0, bankHasGuide: 0,
    bankLocked: [], bankCauses: [], reports: [], waves: [], resting: [], yReports: 0, ySurprise: 0, yBeats: 0, root,
  };
}

function lineOf(a: Analyst, w: World): string {
  const rate = a.yCalls ? a.yHits / a.yCalls : 0;
  return `${econ(w).P.name(a.person)} ${a.yHits}/${a.yCalls} (${(rate * 100).toFixed(0)}%)`;
}

export const earnings: Module = {
  id: 'earnings',

  init(w) {
    const n = needN(w);
    const b = blank(n, 0);
    w.state.earnings = b;
    b.root = w.events.emit('earnings.open', 'an earnings calendar opens for the listed firms', [w.genesis]);
    b.bankEq = Math.round(w.ledger.netWorth(BANK));
    pickAnalysts(w, b);
  },

  dayClose(w) {
    const b = book(w);
    if (!b) return;
    const n = needN(w);
    fit(b, n);
    const still: Resting[] = [];
    for (const o of b.resting) {
      if (o.until > w.day) { still.push(o); continue; }
      if (mkt(w)) cancelOrder(w, o.actor, o.id);
    }
    b.resting = still;
    for (let i = b.reports.length - 1; i >= 0; i--) {
      const r = b.reports[i];
      if (w.day - r.day > 5) break;
      if (w.day > r.day && w.day <= r.day + 4) {
        const px = stockOf(w, r.issuer)?.last ?? 0;
        if (px > 0) r.pxAfter = px;
      }
    }
    const keep: Wave[] = [];
    for (const wave of b.waves) {
      react(w, wave.issuer, wave.side, wave.momentum);
      wave.left--;
      if (wave.left > 0) keep.push(wave);
    }
    b.waves = keep;
    if ((w.day + 1) % 30 === 0) {
      for (const f of econ(w).firms) {
        if (f.idx >= n) continue;
        b.snapRev[f.idx] = f.mRev; b.snapCost[f.idx] = f.mCost; b.snapDay[f.idx] = w.day;
        b.openEv[f.idx] = causesNow(w, f);
      }
    }
    if (w.day % 30 === 22) {
      for (const f of econ(w).firms) if (w.month % 3 === f.idx % 3 && listed(w, f.id)) previewFirm(w, f);
      if (w.month % 3 === 2 && listed(w, BANK)) lockBank(w);
    }
  },

  monthEnd(w) {
    const b = book(w);
    if (!b) return;
    fit(b, needN(w));
    coverAll(b, econ(w).firms.length);
    reportBank(w);
    for (const f of econ(w).firms) reportFirm(w, f);
  },

  stats(w) {
    const b = book(w);
    let best: Analyst | undefined, worst: Analyst | undefined;
    for (const a of b.analysts) {
      if (a.yCalls < 1) continue;
      const better = (x: Analyst, y: Analyst): boolean => {
        const rx = x.yHits / x.yCalls, ry = y.yHits / y.yCalls;
        if (rx !== ry) return rx > ry;
        return x.yAbs / x.yCalls < y.yAbs / y.yCalls || (x.yAbs === y.yAbs && x.person < y.person);
      };
      if (!best || better(a, best)) best = a;
      if (!worst || better(worst, a)) worst = a;
    }
    const out = {
      reports: b.yReports,
      surprise: b.yReports ? +(b.ySurprise / b.yReports).toFixed(3) : 0,
      beats: b.yReports ? +(b.yBeats / b.yReports).toFixed(2) : 0,
      best: best ? lineOf(best, w) : '-',
      worst: worst ? lineOf(worst, w) : '-',
    };
    b.yReports = 0; b.ySurprise = 0; b.yBeats = 0;
    for (const a of b.analysts) { a.yCalls = 0; a.yHits = 0; a.yAbs = 0; }
    return out;
  },
};

/** Last reports for one issuer, oldest first. Used by the headless check. */
export function recentReports(w: World, issuer: string, n: number): Report[] {
  const rows = book(w).reports.filter((r) => r.issuer === issuer);
  return rows.slice(-n);
}
