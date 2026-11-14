// Securities regulator, investigators and courts.
// Insider trades, rugs, dividend fraud and unpaid defaults become offences.
// Investigators are people; each works a few cases. A small careful insider is
// rarely charged. A large or unusual gain usually is, months later. Verdicts can
// be wrong in both directions. Fines move on the ledger. Prison is a flag.
import { DAYS_PER_MONTH, type Module, type World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState } from '../economy/index.ts';
import { PRISON, leaveJob, seekRefresh, setSimDay, succession, thought } from '../economy/people.ts';
import { discountForNews, submitOrder } from '../markets/index.ts';
import { knows, reportCase } from '../social/index.ts';

const SEC = 'sec';
const STAFF_N = 6;
const CASELOAD = 3;
const TRADES = 4;

type Kind = 'insider' | 'manipulation' | 'fraud' | 'debt';
type Phase = 0 | 1 | 2 | 3;
type Side = 'buy' | 'sell';

interface Offence {
  id: number;
  kind: Kind;
  day: number;
  person: number;
  firm: number;
  bank: string;
  gain: number;
  qty: number;
  vol: number;
  knowers: number;
  factId: number;
  factEvent: number;
  tradeEvent: number;
  event: number;
  solid: boolean;
  used: boolean;
}

interface Case {
  off: number;
  investigator: number;
  opened: number;
  phase: Phase;
  detect: number;
  mark: number;
  invEvent: number;
  chargeEvent: number;
  trialEvent: number;
}

interface Pend {
  person: number;
  instr: string;
  side: Side;
  qty: number;
  before: number;
  day: number;
  factId: number;
  factEvent: number;
  firm: number;
  knowers: number;
  vol: number;
  edge: number;
  px: number;
}

interface Snap {
  person: number;
  firm: number;
  instr: string;
  qty: number;
  factId: number;
  factEvent: number;
  knowers: number;
  edge: number;
  vol: number;
  px: number;
}

interface Thin {
  person: number;
  instr: string;
  firm: number;
  qty: number;
  vol: number;
  px: number;
}

interface Crunch { day: number; firm: number; ev: number }

interface KnowPeek { n: number; tab: Int32Array | null; bits: Uint32Array | null }
interface FactPeek {
  id: number;
  eventId: number;
  tag: string;
  firms: number[];
  profit: number;
  pub: boolean;
  drop: boolean;
  know: KnowPeek | null;
}
interface SocPeek { facts: FactPeek[]; insiderFact: Int32Array; contact: Int32Array }
interface StockPeek { instr: string; issuer: string; last: number; hist: { v: number }[] }
interface BankPeek { id: string; failed: boolean }
interface BankBook { banks: BankPeek[]; firmMiss: Uint8Array; ln: number; lnOpen: Uint8Array; lnMiss: Uint8Array }

interface Law {
  staff: number[];
  offences: Offence[];
  cases: Case[];
  pends: Pend[];
  snaps: Snap[];
  thins: Thin[];
  crunch: Crunch[];
  seenKey: Set<string>;
  heat: Int32Array;
  freeAt: Int32Array;
  cells: number[];
  firmHeat: Int32Array;
  firmCut: Int32Array;
  fraudAt: Int32Array;
  nextId: number;
  seen: number;
  root: number;
  paid: number;
  snapDay: number;
  debtMonth: number;
  debtN: number;
  yOff: number;
  yCharge: number;
  yConv: number;
  yWrong: number;
  yFines: number;
  yInside: number;
}

const econ = (w: World): EconState => w.state.economy as EconState;
const lawOf = (w: World): Law => w.state.law as Law;

function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
}
function roll(day: number, id: number, salt: number, p: number): boolean {
  return mix(day, id + 1, salt) % 100 < p;
}
function usd(cents: number): string { return '$' + (Math.abs(Math.round(cents)) / 100).toFixed(0); }
function kindWord(k: Kind): string {
  switch (k) {
    case 'insider': return 'insider trading';
    case 'manipulation': return 'market manipulation';
    case 'fraud': return 'fraud';
    case 'debt': return 'unpaid debt';
    default: { const n: never = k; return n; }
  }
}
function firmName(w: World, firm: number): string {
  if (firm < 0) return 'the market';
  return econ(w).firms[firm]?.name ?? 'the firm';
}
function personOf(actor?: string): number {
  if (!actor || !actor.startsWith('p_')) return -1;
  const n = +actor.slice(2);
  return Number.isInteger(n) && n >= 0 ? n : -1;
}
function centsIn(msg: string): number {
  const mil = msg.match(/([\d.]+)M/);
  if (mil) return Math.round(parseFloat(mil[1]) * 1e8);
  const dol = msg.match(/\$(\d+)/);
  if (dol) return Math.round(+dol[1] * 100);
  const n = msg.match(/(\d[\d,]*)/);
  if (n) return Math.round(+n[1].replace(/,/g, '') * 100);
  return 0;
}
function firmIndex(w: World, id?: string): number {
  if (!id) return -1;
  const firms = econ(w).firms;
  for (let i = 0; i < firms.length; i++) if (firms[i].id === id) return firms[i].idx;
  return -1;
}
function socOf(w: World): SocPeek | undefined {
  const st = w.state.social as SocPeek | undefined;
  if (!st?.facts || !st.insiderFact) return undefined;
  return st;
}
function stocksOf(w: World): StockPeek[] {
  return (w.state.markets as { stocks?: StockPeek[]; root?: number } | undefined)?.stocks ?? [];
}
function mktRoot(w: World): number {
  const r = (w.state.markets as { root?: number } | undefined)?.root;
  return r !== undefined && r >= 0 ? r : lawOf(w).root || w.genesis;
}
function stockByIssuer(w: World, issuer: string): StockPeek | undefined {
  for (const st of stocksOf(w)) if (st.issuer === issuer) return st;
  return undefined;
}
function medianVol(hist: { v: number }[]): number {
  const from = Math.max(0, hist.length - 21);
  const xs: number[] = [];
  for (let i = from; i < hist.length; i++) if (hist[i].v > 0) xs.push(hist[i].v);
  if (!xs.length) return 0;
  xs.sort((a, b) => a - b);
  return xs[xs.length >> 1];
}
function eachKnower(know: KnowPeek | null, fn: (p: number) => void): void {
  if (!know) return;
  if (know.bits) {
    const bits = know.bits;
    for (let word = 0; word < bits.length; word++) {
      let x = bits[word];
      while (x) {
        const bit = x & -x;
        fn((word << 5) + (31 - Math.clz32(bit)));
        x ^= bit;
      }
    }
    return;
  }
  const tab = know.tab;
  if (!tab) return;
  for (let i = 0; i < tab.length; i++) if (tab[i] >= 0) fn(tab[i]);
}
function growFirms(st: Law, n: number): void {
  if (st.firmHeat.length >= n && st.firmCut.length >= n && st.fraudAt.length >= n) return;
  let cap = Math.max(16, st.firmHeat.length);
  while (cap < n) cap *= 2;
  const g = (a: Int32Array): Int32Array => { const x = new Int32Array(cap); x.fill(-1); x.set(a); return x; };
  st.firmHeat = g(st.firmHeat); st.firmCut = g(st.firmCut); st.fraudAt = g(st.fraudAt);
}
function grow(st: Law, n: number): void {
  if (st.heat.length >= n && st.freeAt.length >= n) return;
  let cap = Math.max(16, st.heat.length);
  while (cap < n) cap *= 2;
  const heat = new Int32Array(cap), freeAt = new Int32Array(cap);
  heat.fill(-1); freeAt.fill(-1);
  heat.set(st.heat); freeAt.set(st.freeAt);
  st.heat = heat; st.freeAt = freeAt;
}
function alive(w: World, i: number): boolean {
  const P = econ(w).P;
  return i >= 0 && i < P.n && P.alive(i);
}

function freshenStaff(w: World): void {
  const st = lawOf(w), s = econ(w), P = s.P;
  const keep: number[] = [];
  for (const i of st.staff) {
    const e = P.employer[i];
    if (P.alive(i) && P.adult(w, i) && !(e >= 0 && s.firms[e].ceo === i)) keep.push(i);
  }
  st.staff = keep;
  if (st.staff.length >= STAFF_N) return;
  const pool: number[] = [];
  for (let i = 0; i < P.n; i++) {
    if (st.staff.includes(i) || !P.adult(w, i) || P.age(w, i) < 28 || P.age(w, i) > 60) continue;
    const e = P.employer[i];
    if (e >= 0 && s.firms[e].ceo === i) continue;
    pool.push(i);
  }
  pool.sort((a, b) => P.skill[b] - P.skill[a] || a - b);
  for (const i of pool) {
    if (st.staff.length >= STAFF_N) break;
    st.staff.push(i);
  }
}

function file(w: World, spec: {
  kind: Kind; person: number; firm: number; bank: string; gain: number; qty: number; vol: number;
  knowers: number; factId: number; factEvent: number; tradeEvent: number; solid: boolean; text: string;
}): void {
  if (!alive(w, spec.person) || spec.factEvent < 0) return;
  const st = lawOf(w);
  const key = spec.factId >= 0
    ? spec.kind + ':' + spec.person + ':' + spec.factId
    : spec.kind + ':' + spec.person + ':' + spec.factEvent;
  if (st.seenKey.has(key)) return;
  if (spec.kind === 'debt') {
    if (st.debtMonth !== w.month) { st.debtMonth = w.month; st.debtN = 0; }
    if (st.debtN >= 2) return;
    st.debtN++;
  }
  let recent = 0;
  for (let i = st.offences.length - 1; i >= 0 && recent < 16; i--) {
    if (w.day - st.offences[i].day > 30) break;
    recent++;
  }
  if (recent >= 12) return;
  st.seenKey.add(key);
  const P = econ(w).P;
  const trade = spec.tradeEvent >= 0 ? spec.tradeEvent : spec.factEvent;
  const event = w.events.emit('law.offence', spec.text, [trade], P.id(spec.person));
  st.offences.push({
    id: st.nextId++, kind: spec.kind, day: w.day, person: spec.person, firm: spec.firm, bank: spec.bank,
    gain: Math.max(0, Math.round(spec.gain)), qty: spec.qty, vol: spec.vol, knowers: spec.knowers,
    factId: spec.factId, factEvent: spec.factEvent, tradeEvent: trade, event, solid: spec.solid, used: false,
  });
  st.yOff++;
  if (spec.kind === 'insider') st.yInside++;
}

function release(w: World): void {
  const st = lawOf(w), P = econ(w).P, keep: number[] = [];
  for (const i of st.cells) {
    if (!P.alive(i) || (i < st.freeAt.length && st.freeAt[i] >= 0 && w.day >= st.freeAt[i])) {
      if (i >= 0 && i < P.n) { P.flags[i] &= ~PRISON; seekRefresh(P, i); }
      if (i < st.freeAt.length) st.freeAt[i] = -1;
      continue;
    }
    keep.push(i);
  }
  st.cells = keep;
}

function ingest(w: World): void {
  const st = lawOf(w), end = w.events.count, s = econ(w);
  for (let id = st.seen; id < end; id++) {
    const e = w.events.get(id);
    if (!e) continue;
    if (e.kind === 'firm.cashCrunch') {
      const firm = firmIndex(w, e.actor);
      if (firm >= 0) st.crunch.push({ day: e.day, firm, ev: e.id });
    } else if (e.kind === 'crypto.rug') {
      const person = personOf(e.actor);
      const gain = centsIn(e.msg) || Math.round(s.wage * 30);
      file(w, {
        kind: 'manipulation', person, firm: -1, bank: '', gain, qty: 0, vol: 1, knowers: 8,
        factId: -1, factEvent: e.id, tradeEvent: e.id, solid: true,
        text: `${alive(w, person) ? s.P.name(person) : 'a creator'} pulled a coin pool and kept ${usd(gain)}`,
      });
    } else if (e.kind === 'firm.default' || e.kind === 'loan.default') {
      const gain = centsIn(e.msg);
      if (gain < s.wage * (e.kind === 'firm.default' ? 80 : 600)) continue;
      const person = e.kind === 'loan.default' ? personOf(e.actor) : econ(w).firms[firmIndex(w, e.actor)]?.ceo ?? -1;
      if (!alive(w, person)) continue;
      const firm = e.kind === 'firm.default' ? firmIndex(w, e.actor) : econ(w).P.employer[person];
      file(w, {
        kind: 'debt', person, firm, bank: '', gain, qty: 0, vol: 0, knowers: 1,
        factId: -1, factEvent: e.id, tradeEvent: e.id, solid: true,
        text: `${s.P.name(person)} left ${usd(gain)} unpaid after a default`,
      });
    }
  }
  st.seen = end;
}

function settle(w: World): void {
  const st = lawOf(w), s = econ(w), P = s.P, keep: Pend[] = [];
  for (const p of st.pends) {
    if (w.day <= p.day) { keep.push(p); continue; }
    if (!alive(w, p.person)) continue;
    const now = Math.floor(w.ledger.balance(P.id(p.person), p.instr));
    const delta = now - p.before;
    const filled = p.side === 'buy' ? delta : -delta;
    if (filled < 1) { if (w.day <= p.day + 2) keep.push(p); continue; }
    const qty = Math.min(p.qty, filled);
    const gain = Math.max(1, Math.round(qty * p.px * Math.abs(p.edge)));
    const name = P.name(p.person);
    const trade = w.events.emit('law.trade',
      `${name} ${p.side === 'buy' ? 'bought' : 'sold'} ${qty} shares of ${firmName(w, p.firm)} while its monthly figures were still unpublished`,
      [p.factEvent], P.id(p.person));
    file(w, {
      kind: 'insider', person: p.person, firm: p.firm, bank: '', gain, qty, vol: p.vol, knowers: p.knowers,
      factId: p.factId, factEvent: p.factEvent, tradeEvent: trade, solid: true,
      text: `insider trading by ${name} in ${firmName(w, p.firm)}: ${qty} shares, a gain of ${usd(gain)}, ${p.knowers} people knew`,
    });
  }
  st.pends = keep;
}

interface Cand {
  person: number; firm: number; factId: number; factEvent: number; knowers: number;
  edge: number; vol: number; px: number; instr: string; side: Side; qty: number; gain: number;
}

function consider(w: World): void {
  if (!w.state.markets) return;
  const soc = socOf(w);
  if (!soc) return;
  const st = lawOf(w), s = econ(w), P = s.P;
  const cands: Cand[] = [];
  for (let fi = 0; fi < s.firms.length && fi < soc.insiderFact.length; fi++) {
    const id = soc.insiderFact[fi];
    if (id < 0 || id >= soc.facts.length) continue;
    const fact = soc.facts[id];
    if (!fact || fact.pub || fact.drop || fact.tag !== 'insider.profit') continue;
    const firm = fact.firms[0] ?? fi;
    const f = s.firms[firm];
    if (!f) continue;
    const stock = stockByIssuer(w, f.id);
    if (!stock || stock.last < 1) continue;
    const scale = Math.max(s.wage * 30, Math.abs(f.lastProfit), 1);
    const edge = (fact.profit - f.lastProfit) / scale;
    if (Math.abs(edge) < 0.08) continue;
    const vol = medianVol(stock.hist);
    const knowers = fact.know?.n ?? 0;
    const side: Side = edge > 0 ? 'buy' : 'sell';
    let best: Cand | undefined;
    eachKnower(fact.know, (person) => {
      if (!P.adult(w, person)) return;
      let fear = 0;
      if (firm < st.firmHeat.length && st.firmHeat[firm] >= 0) {
        const age = w.day - st.firmHeat[firm];
        if (age < 360) fear += 70;
        else if (age < 720) fear += 32;
      }
      if (person < st.heat.length && st.heat[person] >= 0 && w.day - st.heat[person] < 500) fear += 28;
      const raw = P.greed[person] - P.diligence[person] * 0.35 - P.anxiety[person] * 0.2;
      const large = raw >= 74 + fear * 0.2;
      if (raw < 56 + fear * 0.42 && !large) return;
      const px = stock.last;
      let qty = 0;
      if (side === 'sell') {
        const have = Math.floor(w.ledger.balance(P.id(person), stock.instr));
        if (have < 2) return;
        const cap = large ? Math.max(12, Math.round((vol || 15) * 3)) : Math.max(1, Math.round((vol || 8) * 0.25));
        qty = Math.min(have, large ? Math.ceil(have * 0.45) : Math.max(1, Math.ceil(have * 0.08)), cap, 400);
      } else {
        const cash = Math.floor(w.ledger.balance(P.id(person), DEP));
        const cap = large ? Math.max(12, Math.round((vol || 15) * 3)) : Math.max(1, Math.round((vol || 8) * 0.25));
        qty = Math.min(Math.floor(cash * (large ? 0.2 : 0.03) / px), cap, 400);
      }
      if (qty < 1) return;
      const gain = Math.round(qty * px * Math.abs(edge));
      if (gain < s.wage) return;
      if (!best || gain > best.gain) best = {
        person, firm, factId: fact.id, factEvent: fact.eventId, knowers, edge, vol, px, instr: stock.instr, side, qty, gain,
      };
    });
    if (best) cands.push(best);
  }
  cands.sort((a, b) => b.gain - a.gain || a.person - b.person);
  const used = new Set<number>();
  let n = 0;
  for (const c of cands) {
    if (n >= TRADES || used.has(c.person)) continue;
    const before = Math.floor(w.ledger.balance(P.id(c.person), c.instr));
    submitOrder(w, P.id(c.person), { instr: c.instr, side: c.side, qty: c.qty });
    st.pends.push({
      person: c.person, instr: c.instr, side: c.side, qty: c.qty, before, day: w.day,
      factId: c.factId, factEvent: c.factEvent, firm: c.firm, knowers: c.knowers, vol: c.vol, edge: c.edge, px: c.px,
    });
    used.add(c.person);
    n++;
  }
}

function snapshot(w: World): void {
  const soc = socOf(w);
  const st = lawOf(w), s = econ(w), P = s.P;
  st.snaps = [];
  st.thins = [];
  st.snapDay = w.day;
  if (!soc) return;
  const facts: FactPeek[] = [];
  for (let fi = 0; fi < soc.insiderFact.length; fi++) {
    const id = soc.insiderFact[fi];
    if (id < 0 || id >= soc.facts.length) continue;
    const fact = soc.facts[id];
    if (!fact || fact.pub || fact.drop || fact.tag !== 'insider.profit') continue;
    facts.push(fact);
  }
  const thin: { instr: string; firm: number; vol: number; px: number }[] = [];
  for (const f of s.firms) {
    const stock = stockByIssuer(w, f.id);
    if (!stock) continue;
    const vol = medianVol(stock.hist);
    if (vol > 0 && vol < 35) thin.push({ instr: stock.instr, firm: f.idx, vol, px: stock.last });
  }
  for (const h of s.investors) {
    if (!h.id.startsWith('p_')) continue;
    const person = +h.id.slice(2);
    if (!P.adult(w, person)) continue;
    for (const fact of facts) {
      if (!knows(w, person, fact.id)) continue;
      const firm = fact.firms[0] ?? -1;
      const f = firm >= 0 ? s.firms[firm] : undefined;
      if (!f) continue;
      const stock = stockByIssuer(w, f.id);
      if (!stock) continue;
      const scale = Math.max(s.wage * 30, Math.abs(f.lastProfit), 1);
      const edge = (fact.profit - f.lastProfit) / scale;
      if (Math.abs(edge) < 0.08) continue;
      st.snaps.push({
        person, firm, instr: stock.instr, qty: Math.floor(w.ledger.balance(h.id, stock.instr)),
        factId: fact.id, factEvent: fact.eventId, knowers: fact.know?.n ?? 0, edge, vol: medianVol(stock.hist), px: stock.last,
      });
    }
    for (const t of thin) {
      st.thins.push({ person, instr: t.instr, firm: t.firm, qty: Math.floor(w.ledger.balance(h.id, t.instr)), vol: t.vol, px: t.px });
    }
  }
}

function incidental(w: World): void {
  const st = lawOf(w), s = econ(w), P = s.P;
  if (st.snapDay < 0 || w.day - st.snapDay > 12) { st.snaps = []; st.thins = []; return; }
  const hits: { sn: Snap; qty: number; gain: number; side: Side }[] = [];
  for (const sn of st.snaps) {
    if (!alive(w, sn.person)) continue;
    const now = Math.floor(w.ledger.balance(P.id(sn.person), sn.instr));
    const delta = now - sn.qty;
    const side: Side | undefined = sn.edge > 0 && delta >= 4 ? 'buy' : sn.edge < 0 && delta <= -4 ? 'sell' : undefined;
    if (!side) continue;
    const qty = Math.abs(delta);
    const gain = Math.round(qty * sn.px * Math.abs(sn.edge));
    if (gain < s.wage * 4) continue;
    hits.push({ sn, qty, gain, side });
  }
  hits.sort((a, b) => b.gain - a.gain || a.sn.person - b.sn.person);
  let n = 0;
  for (const h of hits) {
    if (n >= 2) break;
    const name = P.name(h.sn.person);
    const trade = w.events.emit('law.trade',
      `${name} ${h.side === 'buy' ? 'bought' : 'sold'} ${h.qty} shares of ${firmName(w, h.sn.firm)} while its monthly figures were still unpublished`,
      [h.sn.factEvent], P.id(h.sn.person));
    const before = st.yInside;
    file(w, {
      kind: 'insider', person: h.sn.person, firm: h.sn.firm, bank: '', gain: h.gain, qty: h.qty, vol: h.sn.vol,
      knowers: h.sn.knowers, factId: h.sn.factId, factEvent: h.sn.factEvent, tradeEvent: trade, solid: true,
      text: `insider trading by ${name} in ${firmName(w, h.sn.firm)}: ${h.qty} shares, a gain of ${usd(h.gain)}, ${h.sn.knowers} people knew`,
    });
    if (st.yInside !== before) n++;
  }
  let pump: { t: Thin; qty: number } | undefined;
  for (const t of st.thins) {
    if (!alive(w, t.person)) continue;
    const delta = Math.floor(w.ledger.balance(P.id(t.person), t.instr)) - t.qty;
    if (delta < Math.max(10, t.vol * 4)) continue;
    if (!pump || delta > pump.qty) pump = { t, qty: delta };
  }
  if (pump) {
    const name = P.name(pump.t.person);
    const root = mktRoot(w);
    const gain = Math.round(pump.qty * pump.t.px * 0.08);
    const trade = w.events.emit('law.trade',
      `${name} bought ${pump.qty} shares of ${firmName(w, pump.t.firm)}, several times its usual volume of ${pump.t.vol}`,
      [root], P.id(pump.t.person));
    file(w, {
      kind: 'manipulation', person: pump.t.person, firm: pump.t.firm, bank: '', gain, qty: pump.qty, vol: pump.t.vol,
      knowers: 1, factId: -1, factEvent: root, tradeEvent: trade, solid: true,
      text: `${name} pumped ${firmName(w, pump.t.firm)}, buying ${pump.qty} shares against a usual volume of ${pump.t.vol}`,
    });
  }
  st.snaps = [];
  st.thins = [];
}

function dividendFraud(w: World): void {
  const st = lawOf(w), s = econ(w);
  const from = w.day - 32;
  const hit = new Set<number>();
  for (const c of st.crunch) {
    if (c.day < from || c.firm < 0 || hit.has(c.firm)) continue;
    const f = s.firms[c.firm];
    if (!f || f.closed || c.firm >= st.fraudAt.length || f.lastDividend < s.wage * 20 || f.ceo < 0 || !alive(w, f.ceo)) continue;
    if (st.fraudAt[c.firm] >= 0 && w.day - st.fraudAt[c.firm] < 360) continue;
    hit.add(c.firm);
    st.fraudAt[c.firm] = w.day;
    file(w, {
      kind: 'fraud', person: f.ceo, firm: f.idx, bank: '', gain: f.lastDividend, qty: 0, vol: 0,
      knowers: Math.min(30, f.staff.length), factId: -1, factEvent: c.ev, tradeEvent: c.ev, solid: true,
      text: `${s.P.name(f.ceo)} paid a dividend at ${f.name} in a month the firm could not pay wages`,
    });
  }
  st.crunch = st.crunch.filter((c) => c.day >= from);
}

function bankFraud(w: World): void {
  const book = w.state.banking as BankBook | undefined;
  if (!book?.banks) return;
  const st = lawOf(w), s = econ(w), L = w.ledger;
  for (const bank of book.banks) {
    if (bank.failed) continue;
    const key = 'fraud:' + bank.id + ':' + w.year;
    if (st.seenKey.has(key)) continue;
    let hidden = 0;
    for (const f of s.firms) {
      if (f.closed || f.idx >= book.firmMiss.length || !book.firmMiss[f.idx]) continue;
      const instr = 'cf:' + f.id;
      if (L.instruments.has(instr)) hidden += Math.floor(L.balance(bank.id, instr));
    }
    for (let k = 0; k < book.ln; k++) {
      if (!book.lnOpen[k] || !book.lnMiss[k]) continue;
      const instr = 'pl_' + k;
      if (L.instruments.has(instr)) hidden += Math.floor(L.balance(bank.id, instr));
    }
    const equity = Math.max(1, L.netWorth(bank.id));
    if (hidden < equity * 0.12 || hidden < s.wage * 800) continue;
    const instr = 'eq:' + bank.id;
    let person = -1, sh = 0;
    if (L.instruments.has(instr)) {
      for (const [slot, bal] of L.holdersS(instr)) {
        if (bal <= sh) continue;
        const id = L.ids[slot];
        if (!id?.startsWith('p_')) continue;
        const i = +id.slice(2);
        if (!alive(w, i)) continue;
        sh = bal; person = i;
      }
    }
    if (person < 0) continue;
    const cause = s.rateEv || s.macroEv || st.root;
    const gain = Math.min(hidden, Math.round(Math.max(equity * 0.04, s.wage * 40)));
    st.seenKey.add(key);
    file(w, {
      kind: 'fraud', person, firm: -1, bank: bank.id, gain, qty: 0, vol: 0, knowers: 4,
      factId: -1, factEvent: cause, tradeEvent: cause, solid: true,
      text: `${s.P.name(person)} left ${usd(hidden)} of missed loans unmarked at ${bank.id} while the bank still reported its books`,
    });
  }
}

function fund(w: World): void {
  const st = lawOf(w), s = econ(w), P = s.P;
  const cause = s.macroEv || st.root;
  const ev = w.events.emit('law.budget', 'the treasury funds the securities regulator for the month', [cause], SEC);
  const stipend = Math.round(s.wage * 18);
  const bill = stipend * st.staff.length;
  if (bill > 0) pay(w, GOV, SEC, bill, 'law.budget', ev);
  let paid = 0;
  for (const i of st.staff) {
    if (!P.alive(i)) continue;
    if (Math.floor(w.ledger.balance(SEC, DEP)) < stipend) break;
    if (!pay(w, SEC, P.id(i), stipend, 'law.wage', ev)) break;
    P.incWeek[i] += stipend;
    paid++;
  }
  st.paid = paid;
}

function detectP(off: Offence, skill: number, wage: number): number {
  const g = Math.max(0, Math.min(1, off.gain / Math.max(1, wage * 80)));
  const unusual = off.vol > 0 ? Math.max(0, Math.min(1, off.qty / off.vol / 4)) : off.kind === 'manipulation' ? 0.85 : 0.2;
  const talk = Math.max(0, Math.min(1, off.knowers / 10));
  const sk = Math.max(0, Math.min(1, (skill - 0.6) / 1.8));
  let p = 5 + Math.round(32 * g + 22 * unusual + 16 * talk + 10 * sk);
  if (!off.solid) p = 30;
  const big = off.qty >= Math.max(12, off.vol) || off.gain >= wage * 8 || off.knowers >= 10;
  const small = off.kind === 'insider' && off.gain < wage * 6 && off.qty < Math.max(8, off.vol * 0.45) && off.knowers < 8;
  if (off.solid && small) p = Math.min(p, 8);
  if (off.solid && big) p = Math.max(p, 58);
  if (off.solid && (off.kind === 'manipulation' || off.kind === 'fraud')) p = Math.max(p, 50);
  return Math.max(4, Math.min(78, p));
}
function convictP(off: Offence, detect: number): number {
  if (!off.solid) return 22;
  if (detect >= 58) return 84;
  if (detect >= 40) return 68;
  return 45;
}
function monthsFor(off: Offence, wage: number): number {
  if (off.kind === 'debt') return off.gain >= wage * 500 ? 6 : 0;
  const bold = off.qty >= Math.max(12, off.vol) || off.gain >= wage * 8 || off.kind === 'fraud' || off.kind === 'manipulation';
  if (!bold) return off.gain >= wage * 3 ? 3 : 0;
  return Math.min(24, 5 + Math.round(off.gain / Math.max(1, wage * 20)));
}

function removeChief(w: World, person: number, cause: number, why: string): void {
  const s = econ(w), P = s.P;
  const e = P.employer[person];
  if (e < 0 || s.firms[e].ceo !== person) return;
  setSimDay(w.day);
  const f = s.firms[e];
  const ev = w.events.emit('firm.ceoFired', `${P.name(person)} removed as chief executive after ${why}`, [cause], f.id);
  succession(w, s, f, person, why, ev);
  leaveJob(s, person);
  P.lastEv[person] = ev;
}

function shame(w: World, person: number, ev: number, msg: string, firm: number): void {
  if (w.state.social) reportCase(w, person, ev, msg, firm);
}

function bringCharge(w: World, c: Case, o: Offence): void {
  const s = econ(w), P = s.P, name = P.name(o.person);
  const ev = w.events.emit('law.charge', `${name} is charged with ${kindWord(o.kind)} in ${firmName(w, o.firm)}`, [c.invEvent], P.id(o.person));
  c.chargeEvent = ev;
  c.phase = 1;
  c.mark = w.day;
  lawOf(w).yCharge++;
  removeChief(w, o.person, ev, 'being charged');
  thought(w, s, o.person, 160, 'being charged', ev);
  P.lastEv[o.person] = ev;
  shame(w, o.person, ev, `${name} has been charged with ${kindWord(o.kind)}`, -1);
}
function startTrial(w: World, c: Case, o: Offence): void {
  const s = econ(w), P = s.P, name = P.name(o.person);
  const ev = w.events.emit('law.trial', `the trial of ${name} for ${kindWord(o.kind)} opens`, [c.chargeEvent], P.id(o.person));
  c.trialEvent = ev;
  c.phase = 2;
  c.mark = w.day;
  thought(w, s, o.person, 90, 'standing trial', ev);
  shame(w, o.person, ev, `${name} is on trial`, -1);
}
function markHeat(w: World, o: Offence): void {
  const st = lawOf(w), P = econ(w).P;
  if (o.firm >= 0 && o.firm < st.firmHeat.length) st.firmHeat[o.firm] = w.day;
  const emp = P.employer[o.person];
  if (emp >= 0 && emp < st.firmHeat.length) st.firmHeat[emp] = w.day;
  if (o.person < st.heat.length) st.heat[o.person] = w.day;
  const soc = w.state.social as { contact?: Int32Array; cap?: number } | undefined;
  const contact = soc?.contact;
  if (!contact || o.person >= (soc?.cap ?? 0)) return;
  const b = o.person * 16;
  for (let k = 0; k < 16; k++) {
    const c = contact[b + k];
    if (c >= 0 && c < st.heat.length) st.heat[c] = w.day;
  }
}
function imprison(w: World, person: number, months: number, cause: number): void {
  if (months <= 0 || !alive(w, person)) return;
  const st = lawOf(w), P = econ(w).P;
  removeChief(w, person, cause, 'the sentence');
  setSimDay(w.day);
  leaveJob(econ(w), person);
  P.flags[person] |= PRISON;
  seekRefresh(P, person);
  const until = w.day + months * DAYS_PER_MONTH;
  if (st.freeAt[person] < until) st.freeAt[person] = until;
  if (!st.cells.includes(person)) st.cells.push(person);
}
function giveVerdict(w: World, c: Case, o: Offence): void {
  const st = lawOf(w), s = econ(w), P = s.P, name = P.name(o.person);
  if (!roll(w.day, o.id, 2, convictP(o, c.detect))) {
    const ev = w.events.emit('law.judgment', `${name} is acquitted of ${kindWord(o.kind)}`, [c.trialEvent], P.id(o.person));
    c.phase = 3;
    thought(w, s, o.person, -70, 'an acquittal', ev);
    P.lastEv[o.person] = ev;
    shame(w, o.person, ev, `${name} was acquitted`, -1);
    return;
  }
  const have = Math.floor(w.ledger.balance(P.id(o.person), DEP));
  const disgorge = Math.min(have, Math.max(0, o.gain));
  const fine = Math.min(Math.max(0, have - disgorge), Math.max(0, Math.round(o.gain * 0.5)));
  const months = monthsFor(o, s.wage);
  let money = 'Nothing left to pay';
  if (disgorge > 0 && fine > 0) money = `Disgorged ${usd(disgorge)} and fined ${usd(fine)}`;
  else if (disgorge > 0) money = `Disgorged ${usd(disgorge)}`;
  else if (fine > 0) money = `Fined ${usd(fine)}`;
  const jail = months > 0 ? `, imprisoned for ${months} months` : '';
  const insider = o.solid && o.kind === 'insider';
  const ev = w.events.emit(insider ? 'law.verdict' : 'law.judgment',
    `${name} convicted of ${kindWord(o.kind)} in ${firmName(w, o.firm)}. ${money}${jail}`,
    [c.trialEvent], P.id(o.person));
  if (disgorge > 0) pay(w, P.id(o.person), GOV, disgorge, 'law.disgorge', ev);
  if (fine > 0) pay(w, P.id(o.person), GOV, fine, 'law.fine', ev);
  st.yFines += disgorge + fine;
  st.yConv++;
  if (!o.solid) st.yWrong++;
  if (o.kind === 'fraud' && o.firm >= 0) {
    const f = s.firms[o.firm];
    const room = Math.max(0, Math.floor(w.ledger.balance(f.id, DEP)) - Math.round(f.eff * s.wage * 14));
    const ff = Math.min(room, Math.max(0, Math.round(o.gain * 0.15)));
    if (ff > 0 && pay(w, f.id, GOV, ff, 'law.fine', ev)) st.yFines += ff;
    shame(w, o.person, ev, ff > 0 ? `${f.name} convicted of fraud and fined ${usd(ff)}` : `${f.name} convicted of fraud`, o.firm);
    if (st.firmCut[o.firm] < 0 || w.day - st.firmCut[o.firm] > 180) {
      if (w.state.markets) discountForNews(w, f.id, ev);
      st.firmCut[o.firm] = w.day;
    }
  } else if (o.kind === 'fraud' && o.bank) {
    if (w.state.markets) discountForNews(w, o.bank, ev);
    const face = s.firms.find((f) => f.good === 'BANKING');
    shame(w, o.person, ev, `${o.bank} hid loan losses from its published books`, face ? face.idx : -1);
  } else shame(w, o.person, ev, `${name} sentenced for ${kindWord(o.kind)}`, -1);
  markHeat(w, o);
  imprison(w, o.person, months, ev);
  thought(w, s, o.person, 220, 'the sentence', ev);
  P.lastEv[o.person] = ev;
  c.phase = 3;
}

function advance(w: World): void {
  const st = lawOf(w), P = econ(w).P;
  for (const c of st.cases) {
    if (c.phase === 3) continue;
    const o = st.offences[c.off];
    if (!o || !alive(w, o.person)) { c.phase = 3; continue; }
    switch (c.phase) {
      case 0: {
        const months = Math.floor((w.day - c.opened) / DAYS_PER_MONTH);
        if (months < 1) break;
        if (roll(w.day, o.id, 1, c.detect)) bringCharge(w, c, o);
        else if (months >= 5) c.phase = 3;
        break;
      }
      case 1:
        if (w.day - c.mark >= 60) startTrial(w, c, o);
        break;
      case 2:
        if (w.day - c.mark >= 120) giveVerdict(w, c, o);
        break;
      case 3:
        break;
      default: {
        const n: never = c.phase;
        void P;
        throw new Error('phase ' + n);
      }
    }
  }
}

function waiting(w: World): Offence[] {
  const st = lawOf(w), out: Offence[] = [];
  for (const o of st.offences) {
    if (o.used) continue;
    const age = w.day - o.day;
    if (age > 420 || !alive(w, o.person)) { o.used = true; continue; }
    if (o.solid && age < 30) continue;
    out.push(o);
  }
  return out;
}
function byGain(a: Offence, b: Offence): number { return b.gain - a.gain || a.id - b.id; }
function choose(w: World): Offence | undefined {
  const list = waiting(w);
  const ins = list.filter((o) => o.solid && o.kind === 'insider').sort(byGain);
  const sec = list.filter((o) => o.solid && (o.kind === 'manipulation' || o.kind === 'fraud')).sort(byGain);
  const debt = list.filter((o) => o.solid && o.kind === 'debt').sort(byGain);
  const weak = list.filter((o) => !o.solid).sort(byGain);
  if (w.month % 12 === 5 && weak[0]) return weak[0];
  if (w.month % 2 === 0 && ins[0]) return ins[0];
  return sec[0] ?? ins[0] ?? debt[0] ?? weak[0];
}
function scapegoat(w: World): void {
  if (w.month % 12 !== 5) return;
  const st = lawOf(w), s = econ(w), P = s.P;
  if (st.offences.some((o) => !o.used && !o.solid)) return;
  let person = -1, score = -1, firm = -1;
  for (const h of s.investors) {
    if (!h.id.startsWith('p_')) continue;
    const i = +h.id.slice(2);
    if (!P.adult(w, i)) continue;
    const sc = P.greed[i] + mix(w.day, i, 11) % 30;
    if (sc <= score) continue;
    let held = -1;
    for (const f of s.firms) if (w.ledger.balance(h.id, 'eq:' + f.id) >= 8) { held = f.idx; break; }
    if (held < 0) continue;
    score = sc; person = i; firm = held;
  }
  if (person < 0) return;
  const root = mktRoot(w);
  file(w, {
    kind: 'insider', person, firm, bank: '', gain: Math.round(s.wage * 25), qty: 20, vol: 80, knowers: 2,
    factId: -1, factEvent: root, tradeEvent: root, solid: false,
    text: `${P.name(person)} is named in a file that treats a holding in ${firmName(w, firm)} as insider trading`,
  });
}
function openOne(w: World): void {
  const st = lawOf(w);
  if (st.paid <= 0) return;
  const o = choose(w);
  if (!o) return;
  const P = econ(w).P;
  let inv = -1, load = 99;
  for (let k = 0; k < st.staff.length && k < st.paid; k++) {
    const i = st.staff[k];
    if (i === o.person || !alive(w, i)) continue;
    let n = 0;
    for (const c of st.cases) if (c.phase < 3 && c.investigator === i) n++;
    if (n < CASELOAD && n < load) { load = n; inv = i; }
  }
  if (inv < 0) return;
  const ev = w.events.emit('law.investigation',
    `investigator ${P.name(inv)} opens a file on ${P.name(o.person)} for ${kindWord(o.kind)}, a gain of ${usd(o.gain)}`,
    [o.event], P.id(o.person));
  o.used = true;
  st.cases.push({
    off: st.offences.indexOf(o), investigator: inv, opened: w.day, phase: 0,
    detect: detectP(o, P.skill[inv], econ(w).wage), mark: w.day, invEvent: ev, chargeEvent: -1, trialEvent: -1,
  });
}

function blank(n: number, firms: number): Law {
  const heat = new Int32Array(n), freeAt = new Int32Array(n);
  const firmHeat = new Int32Array(firms), firmCut = new Int32Array(firms), fraudAt = new Int32Array(firms);
  heat.fill(-1); freeAt.fill(-1); firmHeat.fill(-1); firmCut.fill(-1); fraudAt.fill(-1);
  return {
    staff: [], offences: [], cases: [], pends: [], snaps: [], thins: [], crunch: [], seenKey: new Set(),
    heat, freeAt, cells: [], firmHeat, firmCut, fraudAt, nextId: 1, seen: 0, root: 0, paid: 0, snapDay: -1,
    debtMonth: -1, debtN: 0, yOff: 0, yCharge: 0, yConv: 0, yWrong: 0, yFines: 0, yInside: 0,
  };
}

export const law: Module = {
  id: 'law',
  init(w) {
    const s = econ(w);
    w.ledger.addActor(SEC, 'regulator');
    const st = blank(Math.max(16, s.P.capacity), s.firms.length);
    w.state.law = st;
    grow(st, s.P.n);
    freshenStaff(w);
    st.root = w.events.emit('law.open', `a securities regulator opens with ${st.staff.length} investigators`, [w.genesis], SEC);
  },
  dayClose(w) {
    const st = lawOf(w);
    grow(st, econ(w).P.n);
    growFirms(st, econ(w).firms.length);
    release(w);
    ingest(w);
    settle(w);
    if (w.day % DAYS_PER_MONTH === 29) incidental(w);
    if (w.day % DAYS_PER_MONTH === 22) { consider(w); snapshot(w); }
  },
  monthEnd(w) {
    const st = lawOf(w);
    grow(st, econ(w).P.n);
    growFirms(st, econ(w).firms.length);
    freshenStaff(w);
    dividendFraud(w);
    bankFraud(w);
    fund(w);
    advance(w);
    scapegoat(w);
    openOne(w);
  },
  stats(w) {
    const st = lawOf(w);
    let open = 0;
    for (const c of st.cases) if (c.phase < 3) open++;
    const out = {
      offences: st.yOff,
      investigations: open,
      charges: st.yCharge,
      convictions: st.yConv,
      wrongful: st.yWrong,
      fines: Math.round(st.yFines / 100),
      prison: st.cells.length,
      insider: st.yInside,
    };
    st.yOff = 0; st.yCharge = 0; st.yConv = 0; st.yWrong = 0; st.yFines = 0; st.yInside = 0;
    return out;
  },
};
