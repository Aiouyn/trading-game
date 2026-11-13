// Firms are born, list, change hands and die.
// A skilled, risk-tolerant person founds a private firm where prices sit above cost, hiring the unemployed
// and buying machinery. Past a size threshold an investment bank prices an IPO off listed comparables.
// A fund or a rival can bid; shareholders accept from their own valuation and the board can resist,
// so a raid, a white knight or greenmail falls out of the same tender. A firm that cannot pay is wound up:
// assets are sold, creditors are paid in order, shareholders take the rest, and the accounts go to zero.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { GOODS, SECTOR_NAMES } from '../economy/content.ts';
import { addFirm, closeFirm, DEP, pay, type EconState, type Firm } from '../economy/index.ts';
import { joinFirm } from '../economy/people.ts';

interface Style { prefix: string[]; suffix: string[] }
interface CorpState {
  foundedY: number; listedY: number; takenY: number; failedY: number;
  foundedN: number; listedN: number; takenN: number; failedN: number;
  seen: number;
  struck: Uint8Array;
}
interface Listing {
  instr: string; issuer: string; last: number; prev: number; open: number; high: number; low: number;
  vol: number; traded: boolean; wide: boolean; hist: { o: number; h: number; l: number; c: number; v: number }[];
  rets: number[]; divEma: number; profitEma: number; seenProfit: number; seenDiv: number; targetInv: number;
}
interface Book { stocks?: Listing[]; orders?: { open: boolean; instr: string }[] }
interface Bank { id: string; failed: boolean }

const econ = (w: World): EconState => w.state.economy as EconState;
const corp = (w: World): CorpState => w.state.corporate as CorpState;

function loadNames(): Record<string, Style> {
  const file = fileURLToPath(new URL('../../content/names.txt', import.meta.url));
  const raws = parseRaws(readFileSync(file, 'utf8'), 'names.txt');
  const out: Record<string, Style> = {};
  for (const raw of raws) {
    if (raw.type !== 'STYLE') continue;
    const r = new RawReader(raw);
    const prefix = r.all('PREFIX').map((a) => a[0] ?? '').filter(Boolean);
    const suffix = r.all('SUFFIX').map((a) => a[0] ?? '').filter(Boolean);
    if (!prefix.length || !suffix.length) throw new Error(`${r.where()}: needs [PREFIX] and [SUFFIX]`);
    out[raw.id] = { prefix, suffix };
  }
  for (const sector of SECTOR_NAMES) if (!out[sector]) throw new Error(`names.txt: sector ${sector} has no [STYLE]`);
  return out;
}
const NAMES = loadNames();

function christen(s: EconState, sector: string): string {
  const style = NAMES[sector] ?? NAMES.MANUFACTURING;
  const n = s.firms.filter((f) => f.sector === sector).length;
  const pre = style.prefix[n % style.prefix.length];
  const suf = style.suffix[Math.floor(n / style.prefix.length) % style.suffix.length];
  let name = `${pre} ${suf}`;
  if (s.firms.some((f) => f.name === name)) name = `${name} ${n + 1}`;
  return name;
}

function growStruck(c: CorpState, n: number): void {
  if (c.struck.length >= n) return;
  const m = Math.max(n, c.struck.length * 2, 16);
  const a = new Uint8Array(m);
  a.set(c.struck);
  c.struck = a;
}

function quote(w: World, f: Firm): Listing | undefined {
  const stocks = (w.state.markets as Book | undefined)?.stocks;
  if (!stocks) return;
  for (const st of stocks) if (st.issuer === f.id) return st;
  return;
}

function sharesOf(w: World, f: Firm): number {
  return Math.floor(w.ledger.issued.get('eq:' + f.id) ?? 0);
}

function seedEma(last: number, policy: number, sh: number): number {
  const r = Math.max(0.04, policy + 0.04);
  return last * r * sh / (12 * (0.7 + 0.3 * 0.5));
}

function causesOf(s: EconState, f: Firm): number[] {
  const out: number[] = [];
  for (const id of [f.priceEv, f.stockoutEv, f.inputShortEv, f.layoffEv, s.macroEv]) {
    if (id !== undefined && id >= 0 && !out.includes(id)) out.push(id);
  }
  if (!out.length) out.push(s.macroEv);
  return out;
}

function hotGoods(s: EconState): string[] {
  const rows: { good: string; sc: number }[] = [];
  const seen = new Set<string>();
  for (const f of s.firms) if (!f.closed) seen.add(f.good);
  for (const good of seen) {
    let price = 0, cost = 0, lost = 0, sold = 0, n = 0;
    for (const f of s.firms) if (!f.closed && f.good === good) { price += f.price; cost += f.unitCost; lost += f.lostEma; sold += f.soldEma; n++; }
    if (!n || !(cost > 1)) continue;
    const margin = price / n / (cost / n);
    const short = lost > 0.02 * Math.max(1, sold);
    if (margin < 1.18 && !short) continue;
    rows.push({ good, sc: margin - 1 + (short ? 0.08 : 0) });
  }
  rows.sort((a, b) => b.sc - a.sc);
  return rows.map((r) => r.good);
}

function founder(w: World, s: EconState): number {
  const P = s.P, L = w.ledger;
  const busy = new Set<number>();
  for (const f of s.firms) {
    if (f.closed) continue;
    if (f.ceo >= 0) busy.add(f.ceo);
    if (f.founder >= 0) busy.add(f.founder);
  }
  let best = -1, score = 0;
  for (let i = 0; i < P.n; i++) {
    if (busy.has(i) || !P.adult(w, i) || (P.flags[i] & 4) !== 0) continue;
    if (P.skill[i] < 1.6 || P.greed[i] < 55) continue;
    const spare = L.balS(P.slot[i], DEP) - s.wage * P.skill[i] * 20;
    if (spare < s.wage * 30) continue;
    const sc = P.skill[i] * 100 + P.greed[i];
    if (sc > score) { score = sc; best = i; }
  }
  return best;
}

function found(w: World): void {
  const s = econ(w), c = corp(w);
  if (w.day < 80 || s.unemployment < 0.02 || s.unemployment > 0.22 || c.foundedY >= 1) return;
  const P = s.P;
  for (const good of hotGoods(s)) {
    let young = false;
    for (const f of s.firms) if (!f.closed && f.good === good && f.founder >= 0 && w.day - f.bornDay < 420) young = true;
    if (young) continue;
    const who = founder(w, s);
    if (who < 0) return;
    const spare = Math.floor(w.ledger.balS(P.slot[who], DEP) - s.wage * P.skill[who] * 20);
    const cash = Math.max(0, Math.min(spare, Math.round(s.wage * P.skill[who] * 160)));
    const rival = s.firms.find((f) => !f.closed && f.good === good) ?? s.firms[0];
    const why = causesOf(s, rival);
    if (P.lastEv[who] >= 0) why.push(P.lastEv[who]);
    const d = GOODS[good];
    const f = addFirm(w, { name: christen(s, d.sector), good, founder: who, cash, hires: 5, cause: why[0] });
    if (!f) continue;
    const ev = w.events.emit('firm.founded', `${P.name(who)} founds ${f.name}, which makes ${d.name}`, why.slice(0, 4), f.id);
    P.lastEv[who] = ev;
    c.foundedY++; c.foundedN++;
    return;
  }
}

function banks(w: World): Bank[] {
  return (w.state.banking as { banks?: Bank[] } | undefined)?.banks ?? [];
}

function underwriter(w: World): Bank | undefined {
  let best: Bank | undefined, cash = 0;
  for (const b of banks(w)) {
    if (b.failed || b.id === 'bank_1') continue;
    const c = w.ledger.balance(b.id, DEP);
    if (c > cash) { cash = c; best = b; }
  }
  return best;
}

function offerPrice(w: World, s: EconState, f: Firm): { price: number; n: number } {
  let cap = 0, workers = 0, n = 0;
  const take = (o: Firm): void => {
    if (o.closed || o.idx === f.idx || !o.listed || o.workers <= 0) return;
    const q = quote(w, o);
    if (!q || !(q.last > 0)) return;
    const sh = Math.floor(w.ledger.issued.get(q.instr) ?? 0);
    if (sh <= 0) return;
    cap += q.last * sh; workers += o.workers; n++;
  };
  for (const o of s.firms) if (o.good === f.good) take(o);
  if (!n) for (const o of s.firms) if (o.sector === f.sector) take(o);
  const sh = Math.max(1, sharesOf(w, f));
  if (!n || !workers) {
    const book = Math.max(1, Math.round(w.ledger.netWorth(f.id, () => 0)));
    return { price: Math.max(1, Math.round(book / sh)), n: 0 };
  }
  return { price: Math.max(1, Math.round((cap / workers) * Math.max(1, f.workers) / (sh * 1.4))), n };
}

function listings(w: World): void {
  const s = econ(w), st = corp(w);
  for (const f of s.firms) {
    if (f.closed || f.listed || f.listOn > 0 || f.founder < 0) continue;
    // Past a real size threshold, not the first good year: older than two years and well above the crew it started with.
    if (w.day - f.bornDay < 720 || f.workers < Math.max(14, f.bornWorkers + 8) || f.lastProfit <= 0 || f.badMonths > 0) continue;
    let pending = 0;
    for (const o of s.firms) if (!o.closed && o.listOn > 0) pending++;
    if (st.listedY + pending >= 1) continue;
    const bank = underwriter(w);
    if (!bank) continue;
    const { price, n } = offerPrice(w, s, f);
    const budget = Math.floor(w.ledger.balance(bank.id, DEP) * 0.35);
    const raiseCap = Math.round(f.eff * s.wage * 90);
    const held = Math.floor(w.ledger.balance(s.P.id(f.founder), 'eq:' + f.id));
    if (held < 2 || budget < price) continue;
    let primary = Math.min(400, Math.max(1, Math.floor(raiseCap / price)));
    let secondary = Math.min(Math.floor(held * 0.6), held - 1);
    while ((primary + secondary) * price > budget && primary > 1) primary--;
    while ((primary + secondary) * price > budget && secondary > 0) secondary--;
    if ((primary + secondary) * price > budget || primary + secondary < 1) continue;
    const why = causesOf(s, f);
    const ev = w.events.emit('firm.ipo', `${bank.id} prices ${f.name} at ${price} cents from ${n} listed comparables`, why.slice(0, 4), f.id);
    if (primary > 0) {
      const c = primary * price;
      if (!pay(w, bank.id, f.id, c, 'ipo.primary', ev)) continue;
      w.ledger.issue('eq:' + f.id, bank.id, primary, 'ipo.primary', ev);
    }
    if (secondary > 0) {
      const c = secondary * price;
      if (!pay(w, bank.id, s.P.id(f.founder), c, 'ipo.secondary', ev)) continue;
      if (!w.ledger.move('eq:' + f.id, s.P.id(f.founder), bank.id, secondary, 'ipo.secondary', ev)) {
        pay(w, s.P.id(f.founder), bank.id, c, 'ipo.secondary', ev);
        continue;
      }
    }
    f.ipoEv = ev; f.ipoPx = price; f.listOn = w.day + 1;
  }
}

function openListings(w: World): void {
  const s = econ(w), c = corp(w);
  const m = w.state.markets as Book | undefined;
  for (const f of s.firms) {
    if (f.closed || f.listed || f.listOn <= 0 || w.day < f.listOn) continue;
    const last = Math.max(1, f.ipoPx);
    const sh = Math.max(1, sharesOf(w, f));
    if (m?.stocks && !m.stocks.some((st) => st.issuer === f.id)) {
      const ema = seedEma(last, s.policyRate, sh);
      m.stocks.push({
        instr: 'eq:' + f.id, issuer: f.id, last, prev: last, open: last, high: last, low: last,
        vol: 0, traded: false, wide: false, hist: [], rets: [],
        divEma: ema, profitEma: ema, seenProfit: f.lastProfit, seenDiv: f.lastDividend, targetInv: 1,
      });
    }
    f.listed = true; f.listOn = 0;
    const cause = f.ipoEv >= 0 ? f.ipoEv : s.macroEv;
    w.events.emit('firm.listed', `${f.name} lists at ${last} cents and trades from today`, [cause], f.id);
    c.listedY++; c.listedN++;
  }
}

function creditRoom(w: World, s: EconState, f: Firm): number {
  const floor = Math.round(f.eff * s.wage * 14);
  const have = Math.max(0, Math.floor(w.ledger.balance(f.id, DEP) - floor));
  const owed = Math.floor(w.ledger.issued.get('cf:' + f.id) ?? 0);
  const limit = Math.floor(f.eff * s.wage * 360);
  return have + Math.max(0, limit - owed);
}

function raiseCash(w: World, s: EconState, f: Firm, cost: number, cause: number): boolean {
  const floor = Math.round(f.eff * s.wage * 14);
  if (Math.floor(w.ledger.balance(f.id, DEP)) - floor >= cost) return true;
  const need = cost + floor - Math.floor(w.ledger.balance(f.id, DEP));
  const lend = (w.state.banking as { lendFirm?: (w: World, s: EconState, f: Firm, cents: number, cause: number) => boolean } | undefined)?.lendFirm;
  if (need > 0 && lend) lend(w, s, f, need, cause);
  return Math.floor(w.ledger.balance(f.id, DEP)) - floor >= cost;
}

function hurdle(s: EconState, id: string, last: number, board: boolean): number {
  if (id.startsWith('p_')) {
    const i = +id.slice(2);
    const g = i >= 0 && i < s.P.n ? s.P.greed[i] : 0;
    const prem = board ? Math.max(0.08, 0.5 - g / 250) : Math.max(0.02, 0.2 - g / 500);
    return Math.ceil(last * (1 + prem));
  }
  if (id.startsWith('fund_mom')) return Math.ceil(last * (board ? 1.3 : 1.18));
  if (id.startsWith('fund_value')) return Math.ceil(last * (board ? 1.22 : 1.06));
  if (id.startsWith('fund_mm')) return Math.ceil(last * (board ? 1.15 : 1.03));
  return Math.ceil(last * (board ? 1.35 : 1.12));
}

function holdersOf(w: World, f: Firm): [string, number][] {
  return [...w.ledger.holders('eq:' + f.id).entries()].filter(([, n]) => n > 0);
}

function boardSet(s: EconState, f: Firm, holders: [string, number][]): Set<string> {
  const b = new Set<string>();
  if (f.ceo >= 0) b.add(s.P.id(f.ceo));
  let best = '', n = 0;
  for (const [id, sh] of holders) if (sh > n) { best = id; n = sh; }
  if (best) b.add(best);
  return b;
}

function wouldPass(s: EconState, f: Firm, holders: [string, number][], offer: number, last: number, board: Set<string>, paper: boolean): boolean {
  const total = holders.reduce((t, [, n]) => t + n, 0);
  let yes = 0;
  for (const [id, n] of holders) {
    if (offer < hurdle(s, id, last, board.has(id))) continue;
    if (paper && id.startsWith('p_')) {
      const i = +id.slice(2);
      if (!(i >= 0 && i < s.P.n && s.P.greed[i] >= 40)) continue;
    }
    yes += n;
  }
  return total > 0 && yes * 2 > total;
}

function payFor(w: World, s: EconState, buyer: Firm, target: Firm, offer: number, paper: boolean, cause: number): boolean {
  const holders = holdersOf(w, target).filter(([id]) => id !== buyer.id);
  if (!holders.length) return true;
  const bpx = quote(w, buyer)?.last ?? 0;
  if (paper) {
    if (!(bpx > 0)) return false;
    const eq = 'eq:' + buyer.id;
    for (const [id, n] of holders) {
      const sh = Math.max(1, Math.round(n * offer / bpx));
      w.ledger.issue(eq, id, sh, 'takeover.paper', cause);
      if (!w.ledger.move('eq:' + target.id, id, buyer.id, n, 'takeover.shares', cause)) return false;
    }
    return true;
  }
  const cost = holders.reduce((t, [, n]) => t + n * offer, 0);
  if (!raiseCash(w, s, buyer, cost, cause)) return false;
  for (const [id, n] of holders) {
    const c = n * offer;
    if (c > 0 && !pay(w, buyer.id, id, c, 'takeover.cash', cause)) return false;
    if (!w.ledger.move('eq:' + target.id, id, buyer.id, n, 'takeover.shares', cause)) return false;
  }
  return true;
}

function noteStruck(w: World): void {
  const c = corp(w), s = econ(w);
  growStruck(c, s.firms.length);
  const n = w.events.count;
  for (let id = c.seen; id < n; id++) {
    const e = w.events.get(id);
    if (!e || (e.kind !== 'firm.default' && e.kind !== 'firm.cashCrunch') || !e.actor) continue;
    const f = s.firms.find((x) => x.id === e.actor);
    if (!f || f.closed || f.idx >= c.struck.length) continue;
    c.struck[f.idx] = Math.min(250, c.struck[f.idx] + 1);
  }
  c.seen = n;
}

function failures(w: World): void {
  const s = econ(w), c = corp(w);
  if (c.failedY >= 1) return;
  growStruck(c, s.firms.length);
  let pick: Firm | undefined, rank = -1;
  for (const f of s.firms) {
    if (f.closed || f.idx >= c.struck.length) continue;
    let others = 0, biggest = 0;
    for (const o of s.firms) if (!o.closed && o.good === f.good) { if (o.idx !== f.idx) others++; if (o.workers > biggest) biggest = o.workers; }
    if (!others) continue;
    const cash = w.ledger.balance(f.id, DEP);
    const thin = cash < f.eff * s.wage * 14;
    const young = f.founder >= 0 && w.day - f.bornDay >= 540 && f.workers < Math.max(18, f.bornWorkers + 6) && f.badMonths >= 4 && thin && s.unemployment < 0.12;
    const repeat = c.struck[f.idx] >= 4 && f.workers < biggest && f.workers < Math.max(24, s.laborForce * 0.004) && thin && s.unemployment < 0.09;
    const score = (young ? 10 : 0) + (repeat ? c.struck[f.idx] : 0) + f.badMonths / 100;
    if ((young || repeat) && score > rank) { rank = score; pick = f; }
  }
  if (!pick) return;
  const P = s.P;
  const who = pick.ceo >= 0 ? P.name(pick.ceo) : 'its owners';
  const why = causesOf(s, pick);
  const ev = w.events.emit('firm.failed', `${who} winds up ${pick.name}: it cannot pay what it owes`, why.slice(0, 4), pick.id);
  if (closeFirm(w, pick, ev)) { c.failedY++; c.failedN++; }
}

export const corporate: Module = {
  id: 'corporate',
  init(w) {
    const s = econ(w);
    const st: CorpState = {
      foundedY: 0, listedY: 0, takenY: 0, failedY: 0,
      foundedN: 0, listedN: 0, takenN: 0, failedN: 0,
      seen: w.events.count, struck: new Uint8Array(Math.max(16, s.firms.length)),
    };
    w.state.corporate = st;
  },
  tick(w) { openListings(w); },
  dayClose(w) { noteStruck(w); },
  monthEnd(w) {
    const s = econ(w), c = corp(w);
    growStruck(c, s.firms.length);
    for (let i = 0; i < s.firms.length && i < c.struck.length; i++) {
      if (s.firms[i].lastProfit > 0 && c.struck[i] > 0) c.struck[i]--;
    }
    if (w.month % 12 === 8 && w.day > 400) contest(w);
    listings(w);
    if (w.month % 6 === 2) found(w);
    failures(w);
  },
  stats(w) {
    const s = econ(w), c = corp(w);
    let alive = 0;
    for (const f of s.firms) if (!f.closed) alive++;
    const out = {
      firms: alive, founded: c.foundedY, listed: c.listedY, takeovers: c.takenY, failed: c.failedY,
      foundedTot: c.foundedN, listedTot: c.listedN, takenTot: c.takenN, failedTot: c.failedN,
    };
    c.foundedY = 0; c.listedY = 0; c.takenY = 0; c.failedY = 0;
    return out;
  },
};

function walkAway(last: number, bad: number): number {
  return Math.ceil(last * (bad >= 4 ? 1.2 : 1.42));
}

function contest(w: World): void {
  const s = econ(w), c = corp(w);
  if (c.takenY >= 1) return;
  const targets: Firm[] = [];
  for (const f of s.firms) {
    if (f.closed || !f.listed || f.workers < 8) continue;
    if (f.workers > 100 && f.badMonths < 8) continue;
    let rivals = 0;
    for (const o of s.firms) if (!o.closed && o.idx !== f.idx && o.good === f.good) rivals++;
    if (rivals) targets.push(f);
  }
  targets.sort((a, b) => (b.founder >= 0 ? 1 : 0) - (a.founder >= 0 ? 1 : 0) || b.badMonths - a.badMonths || a.workers - b.workers);
  for (const target of targets.slice(0, 4)) if (raid(w, target)) return;
}

function stakeOf(w: World, id: string, f: Firm): number {
  return Math.floor(w.ledger.balance(id, 'eq:' + f.id));
}

function raid(w: World, target: Firm): boolean {
  const s = econ(w), c = corp(w);
  const q = quote(w, target);
  if (!q || !(q.last > 0)) return false;
  const last = q.last;
  const holders = holdersOf(w, target);
  if (!holders.length) return false;
  const board = boardSet(s, target, holders);
  const buyers = s.firms.filter((f) => !f.closed && f.idx !== target.idx && f.good === target.good && f.workers >= target.workers * 0.5);
  buyers.sort((a, b) => b.workers - a.workers);
  const knight = buyers[0];
  let raider = '';
  for (const id of ['fund_value', 'fund_value_2', 'fund_mom']) {
    if (stakeOf(w, id, target) > 0) { raider = id; break; }
  }
  const open = Math.min(walkAway(last, target.badMonths), Math.ceil(last * (target.badMonths >= 4 ? 1.12 : 1.18)));
  const why = causesOf(s, target);
  let bidEv = 0, resistEv = 0;
  if (raider) {
    bidEv = w.events.emit('firm.bid', `${raider} bids ${open} cents a share for ${target.name}`, why.slice(0, 4), raider);
    const resisted = [...board].some((id) => open < hurdle(s, id, last, true));
    if (resisted) resistEv = w.events.emit('firm.resist', `the board of ${target.name} rejects ${open} cents a share`, [bidEv], target.id);
  }
  if (!knight) {
    if (raider && resistEv) greenmail(w, s, target, raider, open, bidEv, resistEv);
    return false;
  }
  let offer = open;
  const cap = walkAway(last, target.badMonths);
  if (!wouldPass(s, target, holders, offer, last, board, false) && cap > offer) offer = cap;
  const cashCost = holders.reduce((t, [id, n]) => t + (id === knight.id ? 0 : n * offer), 0);
  const paper = creditRoom(w, s, knight) < cashCost;
  if (!wouldPass(s, target, holders, offer, last, board, paper)) {
    if (raider && resistEv) greenmail(w, s, target, raider, open, bidEv, resistEv);
    return false;
  }
  const firmBid = w.events.emit('firm.bid', `${knight.name} bids ${offer} cents a share for ${target.name}`, bidEv ? [bidEv, ...why.slice(0, 2)] : why.slice(0, 4), knight.id);
  let top = firmBid;
  if (raider && resistEv) {
    top = w.events.emit('firm.whiteKnight', `${knight.name} outbids ${raider} for ${target.name} at ${offer} cents`, [resistEv, firmBid], knight.id);
  } else if ([...board].some((id) => offer < hurdle(s, id, last, true))) {
    resistEv = w.events.emit('firm.resist', `the board of ${target.name} rejects ${offer} cents a share`, [firmBid], target.id);
  }
  if (!payFor(w, s, knight, target, offer, paper, top)) return false;
  const bCeo = knight.ceo >= 0 ? s.P.name(knight.ceo) : knight.name;
  const tCeo = target.ceo >= 0 ? s.P.name(target.ceo) : 'its owners';
  const chain = resistEv ? [top, resistEv] : [top];
  const ev = w.events.emit('firm.takeover', `${bCeo} of ${knight.name} takes over ${target.name} from ${tCeo}`, chain, knight.id);
  merge(w, s, knight, target, ev);
  c.takenY++; c.takenN++;
  return true;
}

function greenmail(w: World, s: EconState, target: Firm, raider: string, offer: number, bidEv: number, resistEv: number): boolean {
  const n = stakeOf(w, raider, target);
  const total = sharesOf(w, target);
  if (n <= 0 || n * 2 >= total) return false;
  const cost = n * offer;
  if (creditRoom(w, s, target) < cost) return false;
  if (!raiseCash(w, s, target, cost, resistEv)) return false;
  if (!pay(w, target.id, raider, cost, 'greenmail', resistEv)) return false;
  if (!w.ledger.move('eq:' + target.id, raider, target.id, n, 'greenmail', resistEv)) return false;
  w.ledger.redeem('eq:' + target.id, target.id, n, 'greenmail', resistEv);
  w.events.emit('firm.greenmail', `${target.name} buys back ${n} shares from ${raider} at ${offer} cents and the bid is withdrawn`, [bidEv, resistEv], target.id);
  return true;
}

function merge(w: World, s: EconState, buyer: Firm, target: Firm, cause: number): void {
  const L = w.ledger;
  const good = 'good:' + target.good;
  const qty = L.balance(target.id, good);
  if (qty > 1e-9) L.move(good, target.id, buyer.id, qty, 'merger.stock', cause);
  if (L.instruments.has('capital')) {
    const cap = L.balance(target.id, 'capital');
    if (cap > 1e-8) {
      L.consume('capital', target.id, cap, 'merger.plant', cause);
      L.produce('capital', buyer.id, cap, 'merger.plant', cause);
    }
  }
  buyer.expSales += target.expSales;
  target.expSales = 0;
  const prod = Math.max(0.01, GOODS[buyer.good].prod);
  const machines = L.instruments.has('capital') ? L.balance(buyer.id, 'capital') : Infinity;
  let spare = machines === Infinity ? 1e6 : machines / prod - buyer.eff;
  for (const p of [...target.staff]) {
    if (spare <= s.P.skill[p]) continue;
    joinFirm(s, p, buyer);
    spare -= s.P.skill[p];
  }
  closeFirm(w, target, cause);
}
