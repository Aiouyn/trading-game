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
import { borrowMargin } from '../banking/index.ts';
import { addFirm, closeFirm, DEP, pay, type EconState, type Firm } from '../economy/index.ts';
import { joinFirm, leaveJob } from '../economy/people.ts';

interface Style { prefix: string[]; suffix: string[] }
interface Steer { idx: number; by: number; price: number | null; hires: number | null; dividend: number | null; capex: number }
interface Parked { idx: number; cents: number }
interface CorpState {
  foundedY: number; listedY: number; takenY: number; failedY: number;
  foundedN: number; listedN: number; takenN: number; failedN: number;
  seen: number;
  struck: Uint8Array;
  steer?: Steer[];
  chair?: number[];
  parked?: Parked[];
  wasOpen?: Uint8Array;
  absorbed?: string[];
  born?: Uint8Array;
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

function aliveCount(s: EconState): number {
  let n = 0;
  for (const f of s.firms) if (!f.closed) n++;
  return n;
}
function sectorCount(s: EconState, sector: string): number {
  let n = 0;
  for (const f of s.firms) if (!f.closed && f.sector === sector) n++;
  return n;
}
function sectorFloor(c: CorpState, sector: string): number {
  const i = SECTOR_NAMES.indexOf(sector);
  const born = c.born && i >= 0 && i < c.born.length ? c.born[i] : 2;
  return born <= 1 ? 1 : 2;
}
function marginOf(s: EconState, good: string): number {
  let price = 0, cost = 0, lost = 0, sold = 0, n = 0;
  for (const f of s.firms) if (!f.closed && f.good === good) {
    price += f.price; cost += f.unitCost; lost += f.lostEma; sold += f.soldEma; n++;
  }
  if (!n || !(cost > 1)) return 0;
  return price / n / (cost / n) - 1 + (lost > 0.02 * Math.max(1, sold) ? 0.08 : 0);
}
function youngGood(s: EconState, good: string, day: number): boolean {
  for (const f of s.firms) if (!f.closed && f.good === good && f.founder >= 0 && day - f.bornDay < 400) return true;
  return false;
}
function noteGone(w: World): void {
  const s = econ(w), c = ready(w), n = s.firms.length;
  if (!c.wasOpen || c.wasOpen.length < n) {
    const a = new Uint8Array(Math.max(n, (c.wasOpen?.length ?? 0) * 2, 16));
    if (c.wasOpen) a.set(c.wasOpen);
    c.wasOpen = a;
  }
  if (!c.absorbed) c.absorbed = [];
  for (let i = 0; i < n; i++) {
    const open = s.firms[i].closed ? 0 : 1;
    if (c.wasOpen[i] === 1 && open === 0 && c.absorbed.length < 12) c.absorbed.push(s.firms[i].good);
    c.wasOpen[i] = open;
  }
}
function chooseGood(w: World): string {
  const s = econ(w), c = ready(w);
  for (const sector of SECTOR_NAMES) {
    if (sectorCount(s, sector) >= sectorFloor(c, sector)) continue;
    let best = '', sc = -1;
    for (const g of Object.values(GOODS)) if (g.sector === sector) {
      const m = marginOf(s, g.good);
      if (m > sc) { sc = m; best = g.good; }
    }
    if (best) return best;
  }
  const absorbed = c.absorbed ?? [];
  while (absorbed.length && youngGood(s, absorbed[0], w.day)) absorbed.shift();
  if (absorbed.length) return absorbed[0];
  let best = '', sc = 0.16;
  const seen = new Set<string>();
  for (const f of s.firms) {
    if (f.closed || seen.has(f.good) || youngGood(s, f.good, w.day)) continue;
    seen.add(f.good);
    const m = marginOf(s, f.good);
    if (m > sc) { sc = m; best = f.good; }
  }
  return best;
}
function founder(w: World, s: EconState, eager: boolean): number {
  const P = s.P, L = w.ledger;
  const busy = new Set<number>();
  for (const f of s.firms) {
    if (f.closed) continue;
    if (f.ceo >= 0) busy.add(f.ceo);
    if (f.founder >= 0) busy.add(f.founder);
  }
  const skillMin = eager ? 1.35 : 1.6;
  const greedMin = eager ? 45 : 55;
  const keep = eager ? 12 : 20;
  const need = eager ? 18 : 30;
  let best = -1, score = 0;
  for (let i = 0; i < P.n; i++) {
    if (busy.has(i) || !P.adult(w, i) || (P.flags[i] & 4) !== 0) continue;
    if (P.skill[i] < skillMin || P.greed[i] < greedMin) continue;
    const spare = L.balS(P.slot[i], DEP) - s.wage * P.skill[i] * keep;
    if (spare < s.wage * need) continue;
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
    const who = founder(w, s, false);
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

// The ordinary opening above is one firm a year. A second opening is allowed only once the
// count is near the floor, or a sector has been reduced to a single firm. Tight credit
// (a high policy rate) skips that second opening unless a sector has to be refilled.
function replenish(w: World): void {
  const s = econ(w), c = ready(w);
  if (w.day < 80) return;
  const alive = aliveCount(s);
  const repair = SECTOR_NAMES.some((sec) => sectorCount(s, sec) < sectorFloor(c, sec));
  if (!repair && alive >= 58) return;
  const tight = s.policyRate > 0.09;
  let extra = 0;
  if (repair) extra = 1;
  else if (alive < 52) extra = tight ? 1 : 2;
  else extra = tight ? 0 : 1;
  if (!repair && alive >= 55 && (s.unemployment > 0.22 || s.unemployment < 0.02)) extra = 0;
  if (extra <= 0 || c.foundedY >= 1 + extra || alive >= 92) return;
  const good = chooseGood(w);
  if (!good) return;
  const eager = repair || alive < 54 || (c.absorbed ?? []).includes(good);
  const who = founder(w, s, eager);
  if (who < 0) return;
  const P = s.P;
  const spare = Math.floor(w.ledger.balS(P.slot[who], DEP) - s.wage * P.skill[who] * (eager ? 12 : 20));
  const cash = Math.max(0, Math.min(spare, Math.round(s.wage * P.skill[who] * (eager ? 140 : 160))));
  const d = GOODS[good];
  const rival = s.firms.find((f) => !f.closed && f.good === good) ?? s.firms.find((f) => !f.closed && f.sector === d.sector);
  const why = rival ? causesOf(s, rival) : [s.macroEv];
  if (P.lastEv[who] >= 0) why.push(P.lastEv[who]);
  const f = addFirm(w, { name: christen(s, d.sector), good, founder: who, cash, hires: 5, cause: why[0] });
  if (!f) return;
  const ev = w.events.emit('firm.founded', `${P.name(who)} founds ${f.name}, which makes ${d.name}`, why.slice(0, 4), f.id);
  P.lastEv[who] = ev;
  c.foundedY++; c.foundedN++;
  if (c.absorbed) {
    const at = c.absorbed.indexOf(good);
    if (at >= 0) c.absorbed.splice(at, 1);
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
    const born = new Uint8Array(SECTOR_NAMES.length);
    const wasOpen = new Uint8Array(Math.max(16, s.firms.length));
    for (const f of s.firms) {
      const i = SECTOR_NAMES.indexOf(f.sector);
      if (i >= 0 && !f.closed) born[i]++;
      if (!f.closed) wasOpen[f.idx] = 1;
    }
    const st: CorpState = {
      foundedY: 0, listedY: 0, takenY: 0, failedY: 0,
      foundedN: 0, listedN: 0, takenN: 0, failedN: 0,
      seen: w.events.count, struck: new Uint8Array(Math.max(16, s.firms.length)),
      steer: [], chair: [], parked: [], wasOpen, absorbed: [], born,
    };
    w.state.corporate = st;
  },
  tick(w) { openListings(w); },
  dayClose(w) { noteStruck(w); applySteer(w); parkDividends(w); briefBoard(w); },
  monthEnd(w) {
    const s = econ(w), c = corp(w);
    restoreParked(w);
    briefBoard(w);
    growStruck(c, s.firms.length);
    for (let i = 0; i < s.firms.length && i < c.struck.length; i++) {
      if (s.firms[i].lastProfit > 0 && c.struck[i] > 0) c.struck[i]--;
    }
    noteGone(w);
    if (w.month % 12 === 8 && w.day > 400) contest(w);
    listings(w);
    if (w.month % 6 === 2) found(w);
    failures(w);
    replenish(w);
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

const HOLD = 'corp_hold';

function dollars(cents: number): string {
  const v = Math.round(cents);
  return `${v < 0 ? '-' : ''}$${(Math.abs(v) / 100).toFixed(2)}`;
}

function ready(w: World): CorpState {
  const c = corp(w);
  if (!c.steer) c.steer = [];
  if (!c.chair) c.chair = [];
  if (!c.parked) c.parked = [];
  if (!c.absorbed) c.absorbed = [];
  if (!c.born) c.born = new Uint8Array(SECTOR_NAMES.length);
  return c;
}

function seat(c: CorpState, f: Firm): number {
  return c.chair && f.idx < c.chair.length ? c.chair[f.idx] : -1;
}

function setChair(c: CorpState, f: Firm, person: number): void {
  if (!c.chair) c.chair = [];
  while (c.chair.length <= f.idx) c.chair.push(-1);
  c.chair[f.idx] = person;
}

function rootOf(s: EconState, f: Firm): number[] {
  return causesOf(s, f).slice(0, 4);
}

function findFirm(w: World, key: string): Firm | undefined {
  const k = key.toLowerCase().replace(/-/g, ' ').replace(/^eq:/, '');
  return econ(w).firms.find((f) => !f.closed && (f.id === key || f.id === k || f.name.toLowerCase() === k));
}

function pickGood(s: EconState, sector: string): string | undefined {
  const goods = Object.values(GOODS).filter((g) => g.sector === sector);
  if (!goods.length) return;
  const hot = new Set(hotGoods(s));
  return (goods.find((g) => g.share > 0 && hot.has(g.good)) ?? goods.find((g) => g.share > 0) ?? goods.find((g) => hot.has(g.good)) ?? goods[0]).good;
}

function controls(w: World, person: number, f: Firm): boolean {
  return f.ceo === person || seat(ready(w), f) === person;
}

/** Shares the person holds, plus shares held by firms they run. */
function blockOf(w: World, person: number, f: Firm): number {
  const s = econ(w), c = ready(w);
  let n = stakeOf(w, s.P.id(person), f);
  for (const o of s.firms) {
    if (o.closed || o.idx === f.idx) continue;
    if (o.ceo !== person && seat(c, o) !== person) continue;
    n += stakeOf(w, o.id, f);
  }
  return n;
}

export interface CompanyPost {
  id: string; name: string; good: string; sector: string; role: string;
  listed: boolean; workers: number; price: number; cash: number;
  sales: number; cost: number; profit: number; stake: number; shares: number;
  dividend: string; hire: string; quote: string;
}

export function companyPosts(w: World, person: number): CompanyPost[] {
  const s = econ(w), c = ready(w), out: CompanyPost[] = [];
  for (const f of s.firms) {
    if (f.closed) continue;
    const shares = sharesOf(w, f);
    const mine = blockOf(w, person, f);
    const chair = seat(c, f) === person;
    const ceo = f.ceo === person;
    if (!ceo && !chair && (shares <= 0 || mine * 10 < shares)) continue;
    const st = c.steer?.find((x) => x.idx === f.idx);
    out.push({
      id: f.id, name: f.name, good: f.good, sector: f.sector,
      role: ceo ? 'chief executive' : chair ? 'chairman' : 'director',
      listed: f.listed, workers: f.workers, price: Math.round(f.price),
      cash: Math.floor(w.ledger.balance(f.id, DEP)), sales: Math.round(f.mRev),
      cost: Math.round(f.mCost), profit: Math.round(f.lastProfit), stake: mine, shares,
      dividend: st && st.dividend !== null ? `${Math.round(st.dividend * 100)}%` : 'the usual rule',
      hire: st && st.hires !== null ? String(st.hires) : 'the usual rule',
      quote: st && st.price !== null ? dollars(st.price) : 'the usual rule',
    });
  }
  return out;
}

export function foundCompany(w: World, person: number, name: string, sector: string, cents: number, useLoan: boolean): { why: string } | { id: string; name: string; good: string } {
  const s = econ(w), c = ready(w), P = s.P;
  const called = name.trim().replace(/\s+/g, ' ');
  if (called.length < 2 || called.length > 40) return { why: 'give it a name' };
  if (s.firms.some((f) => f.name.toLowerCase() === called.toLowerCase())) return { why: `${called} is already a firm` };
  if (!SECTOR_NAMES.includes(sector)) return { why: `unknown sector ${sector}` };
  const good = pickGood(s, sector);
  if (!good) return { why: `${sector} makes nothing yet` };
  const root = s.macroEv >= 0 ? s.macroEv : w.genesis;
  let put = Math.floor(cents);
  if (!(put > 0)) put = Math.min(Math.floor(w.ledger.balance(P.id(person), DEP)), s.wage * 500);
  if (!(put > 0)) return { why: 'that takes money' };
  if (Math.floor(w.ledger.balance(P.id(person), DEP)) < put && useLoan) borrowMargin(w, person, put - Math.floor(w.ledger.balance(P.id(person), DEP)), root);
  if (Math.floor(w.ledger.balance(P.id(person), DEP)) < put) return { why: useLoan ? 'no bank will lend the rest' : 'you do not have that much' };
  const f = addFirm(w, { name: called, good, founder: person, cash: put, hires: 2, cause: root });
  if (!f) return { why: 'the bank would not finance the machinery' };
  w.events.emit('firm.founded', `${P.name(person)} founds ${f.name}, a ${sector.toLowerCase()} company`, [root], f.id);
  c.foundedN++;
  setChair(c, f, person);
  return { id: f.id, name: f.name, good: f.good };
}

function steerOf(c: CorpState, f: Firm, person: number): Steer {
  let st = c.steer?.find((x) => x.idx === f.idx);
  if (!st) {
    st = { idx: f.idx, by: person, price: null, hires: null, dividend: null, capex: 0 };
    c.steer?.push(st);
  }
  st.by = person;
  return st;
}

export function steerCompany(w: World, person: number, key: string, op: 'report' | 'price' | 'hires' | 'dividend' | 'invest', value: number | undefined, auto: boolean): { why: string } | { lines: string[] } {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  if (f.ceo !== person) return { why: `you are not the chief executive of ${f.name}` };
  const st = steerOf(ready(w), f, person);
  if (op === 'price') st.price = auto ? null : Math.max(1, Math.round(value ?? 0));
  else if (op === 'hires') st.hires = auto ? null : Math.max(1, Math.round(value ?? 0));
  else if (op === 'dividend') st.dividend = auto ? null : Math.min(1, Math.max(0, value ?? 0));
  else if (op === 'invest') st.capex += Math.max(1, Math.round(value ?? 1));
  const lines = [
    `${f.name} (${f.id}) ${f.listed ? 'listed' : 'private'} — ${f.workers} workers, cash ${dollars(w.ledger.balance(f.id, DEP))}`,
    `this month: sales ${dollars(f.mRev)}, costs ${dollars(f.mCost)}, last profit ${dollars(f.lastProfit)}`,
    `price ${st.price === null ? 'follows the usual rule' : dollars(st.price)} · hiring ${st.hires === null ? 'follows the usual rule' : String(st.hires)} · dividend ${st.dividend === null ? 'follows the usual rule' : `${Math.round(st.dividend * 100)}% of the surplus`} · machinery still to buy: ${st.capex}`,
  ];
  return { lines };
}

function applySteer(w: World): void {
  const s = econ(w);
  for (const st of ready(w).steer ?? []) {
    const f = s.firms[st.idx];
    if (!f || f.closed || f.ceo !== st.by) continue;
    if (st.price !== null) f.price = st.price;
    if (st.hires !== null) {
      if (f.staff.length < st.hires) seekStaff(w, f, st.hires);
      else if (f.staff.length > st.hires) shedStaff(s, f, st.hires);
    }
    if (st.capex > 0) st.capex -= buyMachines(w, f, Math.min(st.capex, 2));
  }
}

function seekStaff(w: World, f: Firm, n: number): void {
  const s = econ(w), P = s.P;
  let taken = 0;
  for (let i = 0; i < P.n && f.staff.length < n && taken < 4; i++) {
    if (P.employer[i] >= 0 || !P.adult(w, i) || (P.flags[i] & 4) !== 0) continue;
    joinFirm(s, i, f);
    taken++;
  }
}

function shedStaff(s: EconState, f: Firm, n: number): void {
  let sent = 0;
  while (f.staff.length > n && sent < 4) {
    const who = f.staff.find((p) => p !== f.ceo);
    if (who === undefined) break;
    leaveJob(s, who);
    sent++;
  }
}

function buyMachines(w: World, f: Firm, units: number): number {
  if (!(units > 0)) return 0;
  const s = econ(w), L = w.ledger, def = GOODS[f.good];
  const makers = s.firms.filter((m) => !m.closed && m.good === 'MACHINERY' && m.idx !== f.idx && m.price > 0);
  if (!def || !makers.length || !L.instruments.has('capital')) return 0;
  const cpu = Math.max(1, 360 * s.wage / Math.max(0.01, def.prod));
  const cost = Math.round(Math.min(units, 2) * cpu);
  const cause = s.macroEv >= 0 ? s.macroEv : w.genesis;
  if (Math.floor(L.balance(f.id, DEP)) < cost) raiseCash(w, s, f, cost, cause);
  const have = Math.floor(L.balance(f.id, DEP));
  if (have < 1) return 0;
  const spent = Math.min(cost, have);
  const maker = makers.reduce((a, b) => (b.eff > a.eff ? b : a));
  const q = spent / maker.price;
  if (!(q > 1e-8)) return 0;
  L.produce('good:MACHINERY', maker.id, q, 'invest.build', cause);
  if (!pay(w, f.id, maker.id, spent, 'invest.buy', cause)) {
    L.consume('good:MACHINERY', maker.id, q, 'invest.build', cause);
    return 0;
  }
  if (!L.move('good:MACHINERY', maker.id, f.id, q, 'invest.buy', cause)) {
    pay(w, maker.id, f.id, spent, 'invest.refund', cause);
    L.consume('good:MACHINERY', maker.id, q, 'invest.build', cause);
    return 0;
  }
  L.consume('good:MACHINERY', f.id, q, 'invest.install', cause);
  L.produce('capital', f.id, spent / cpu, 'invest.install', cause);
  maker.mRev += spent; maker.sold += q; s.yGdp += spent; s.mSpend += spent;
  return spent / cpu;
}

/** On the last day of the month, set aside the cash a steered firm will not pay out. */
function parkDividends(w: World): void {
  if ((w.day + 1) % 30 !== 0) return;
  const s = econ(w), c = ready(w), L = w.ledger;
  if (!L.hasActor(HOLD)) L.addActor(HOLD, HOLD);
  const tax = s.profitTax ?? 0.21;
  const loanRate = s.policyRate + 0.03;
  for (const st of c.steer ?? []) {
    if (st.dividend === null || st.dividend >= 1) continue;
    const f = s.firms[st.idx];
    if (!f || f.closed || f.ceo !== st.by) continue;
    const cash = Math.floor(L.balance(f.id, DEP));
    const loan = Math.floor((L.issued.get('loan:' + f.id) ?? 0) + (L.issued.get('cf:' + f.id) ?? 0));
    const interest = Math.round(loan * loanRate / 12);
    const profit = f.mRev - f.mCost - interest;
    const duty = interest + (profit > 0 ? Math.round(Math.min(cash, profit * tax)) : 0);
    const excess = Math.floor(cash - duty - f.eff * s.wage * 30);
    const repay = excess > 0 ? Math.min(excess, loan) : 0;
    const dividend = excess - repay;
    const aside = Math.floor(dividend * (1 - st.dividend));
    if (aside < 1) continue;
    const cause = s.macroEv >= 0 ? s.macroEv : w.genesis;
    if (pay(w, f.id, HOLD, aside, 'dividend.retain', cause)) c.parked?.push({ idx: f.idx, cents: aside });
  }
}

function restoreParked(w: World): void {
  const c = ready(w), s = econ(w);
  const held = c.parked ?? [];
  c.parked = [];
  const cause = s.macroEv >= 0 ? s.macroEv : w.genesis;
  for (const p of held) {
    const f = s.firms[p.idx];
    if (!f || f.closed) pay(w, HOLD, 'bank_1', p.cents, 'dividend.retain', cause);
    else pay(w, HOLD, f.id, p.cents, 'dividend.retain', cause);
  }
}

export function takePublic(w: World, person: number, key: string, fraction: number): { why: string } | { text: string } {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  if (f.ceo !== person && f.founder !== person) return { why: `you do not own ${f.name}` };
  if (f.listed) return { text: `${f.name} is already listed` };
  if (f.listOn > 0) return { text: `${f.name} is already filing to list` };
  const s = econ(w), L = w.ledger, bank = underwriter(w);
  if (!bank) return { why: 'no bank will underwrite it' };
  const part = Math.min(0.9, Math.max(0, fraction));
  if (!(part > 0)) return { why: 'sell part of your stake' };
  const { price } = offerPrice(w, s, f);
  const held = stakeOf(w, s.P.id(person), f);
  if (held < 2) return { why: 'you hold no shares to sell' };
  const budget = Math.floor(L.balance(bank.id, DEP) * 0.35);
  const raiseCap = Math.round(f.eff * s.wage * 90);
  let primary = Math.max(0, Math.min(400, Math.floor(raiseCap / price)));
  let secondary = Math.min(held - 1, Math.floor(held * part));
  while (primary > 0 && (primary + secondary) * price > budget) primary--;
  while (secondary > 0 && (primary + secondary) * price > budget) secondary--;
  if (secondary < 1) return { why: 'the bank has no room for your shares' };
  const ev = w.events.emit('firm.ipo', `${bank.id} prices ${f.name} at ${price} cents`, rootOf(s, f), f.id);
  if (primary > 0) {
    if (!pay(w, bank.id, f.id, primary * price, 'ipo.primary', ev)) return { why: 'the bank could not pay for the new shares' };
    L.issue('eq:' + f.id, bank.id, primary, 'ipo.primary', ev);
  }
  if (!pay(w, bank.id, s.P.id(person), secondary * price, 'ipo.secondary', ev)) return { why: 'the bank could not pay you' };
  if (!L.move('eq:' + f.id, s.P.id(person), bank.id, secondary, 'ipo.secondary', ev)) {
    pay(w, s.P.id(person), bank.id, secondary * price, 'ipo.secondary', ev);
    return { why: 'your shares did not reach the bank' };
  }
  f.listOn = w.day;
  f.ipoPx = price;
  f.ipoEv = ev;
  return { text: `${f.name} lists when the market next opens, through ${bank.id} at ${dollars(price)}; you sell ${secondary} of ${held} shares` };
}

/** Cash from the person, the firm they run, a margin loan, or the firm borrowing the rest. */
function fundBid(w: World, person: number, run: Firm | undefined, cost: number, cause: number): string | undefined {
  const s = econ(w), L = w.ledger, pid = s.P.id(person);
  const cash = (): number => Math.floor(L.balance(pid, DEP));
  const till = (): number => run ? Math.floor(L.balance(run.id, DEP)) : 0;
  if (cash() >= cost) return pid;
  if (run && till() >= cost) return run.id;
  if (run && cash() + till() >= cost) {
    const top = cost - till();
    if (top > 0 && !pay(w, pid, run.id, top, 'equity.topup', cause)) return;
    return run.id;
  }
  if (cash() < cost) borrowMargin(w, person, cost - cash(), cause);
  if (cash() >= cost) return pid;
  if (!run) return;
  if (till() < cost) raiseCash(w, s, run, cost, cause);
  if (till() >= cost) return run.id;
  if (cash() + till() < cost) return;
  const top = cost - till();
  if (top > 0 && !pay(w, pid, run.id, top, 'equity.topup', cause)) return;
  return run.id;
}

export function tenderOffer(w: World, person: number, key: string, cents: number, multiple: number, paper: boolean): { why: string } | { text: string } {
  const target = findFirm(w, key);
  if (!target || !target.listed) return { why: 'that firm is not listed' };
  const s = econ(w), c = ready(w), L = w.ledger;
  const q = quote(w, target);
  const last = q?.last ?? 0;
  if (!(last > 0)) return { why: 'the shares have no price' };
  const price = multiple > 0 ? Math.max(1, Math.round(last * multiple)) : Math.round(cents);
  if (!(price > 0)) return { why: 'name a price' };
  const run = s.firms.find((f) => !f.closed && f.ceo === person && f.idx !== target.idx && (!paper || f.listed));
  const pid = s.P.id(person);
  const holders = holdersOf(w, target);
  const total = holders.reduce((a, [, n]) => a + n, 0);
  const board = boardSet(s, target, holders);
  const mine = new Set<string>([pid]);
  if (run) mine.add(run.id);
  const yes: [string, number][] = [];
  let owned = 0;
  for (const [id, n] of holders) {
    if (mine.has(id)) { owned += n; continue; }
    if (price < hurdle(s, id, last, board.has(id))) continue;
    if (paper && id.startsWith('p_')) {
      const i = Number(id.slice(2));
      if (!(i >= 0 && i < s.P.n && s.P.greed[i] >= 40)) continue;
    }
    yes.push([id, n]);
  }
  const gaining = yes.reduce((a, [, n]) => a + n, 0);
  if (!(total > 0) || (owned + gaining) * 2 <= total) return { why: `shareholders of ${target.name} decline ${dollars(price)}` };
  const cause = w.events.emit('firm.bid', `${s.P.name(person)} bids ${dollars(price)} a share for ${target.name}`, rootOf(s, target), pid);
  if (paper) {
    if (!run) return { why: 'a share bid has to come from a listed firm you run' };
    const bpx = quote(w, run)?.last ?? run.ipoPx;
    if (!(bpx > 0)) return { why: `${run.name} has no share price to pay with` };
    for (const [id, n] of yes) {
      const give = Math.max(1, Math.round(n * price / bpx));
      L.issue('eq:' + run.id, id, give, 'tender.paper', cause);
      if (!L.move('eq:' + target.id, id, run.id, n, 'tender.shares', cause)) return { why: 'the shares did not come across' };
    }
  } else {
    const from = fundBid(w, person, run, gaining * price, cause);
    if (!from) return { why: `${dollars(gaining * price)} is more than you can raise` };
    for (const [id, n] of yes) {
      if (!pay(w, from, id, n * price, 'tender.cash', cause)) return { why: 'the cash did not go out' };
      if (!L.move('eq:' + target.id, id, from, n, 'tender.shares', cause)) return { why: 'the shares did not come across' };
    }
  }
  setChair(c, target, person);
  c.takenN++;
  const now = blockOf(w, person, target);
  w.events.emit('firm.control', `${s.P.name(person)} takes the chair of ${target.name}`, [cause], target.id);
  return { text: `you take the chair of ${target.name} at ${dollars(price)} a share, holding ${now} of ${total}` };
}

export function appointChief(w: World, person: number, key: string, who: number): { why: string } | { text: string } {
  const f = findFirm(w, key);
  if (!f) return { why: 'no such firm' };
  const s = econ(w);
  if (!controls(w, person, f)) return { why: `you do not control ${f.name}` };
  if (!(who >= 0 && who < s.P.n) || !s.P.adult(w, who)) return { why: 'no such person' };
  for (const o of s.firms) if (o.ceo === who && o.idx !== f.idx) o.ceo = -1;
  joinFirm(s, who, f);
  f.ceo = who;
  w.events.emit('firm.succession', `${s.P.name(person)} names ${s.P.name(who)} chief executive of ${f.name}`, rootOf(s, f), f.id);
  return { text: `${s.P.name(who)} is chief executive of ${f.name}` };
}

export function foldFirm(w: World, person: number, key: string, intoKey: string): { why: string } | { text: string } {
  const target = findFirm(w, key), into = findFirm(w, intoKey);
  if (!target || !into) return { why: 'no such firm' };
  if (target.idx === into.idx) return { why: 'a firm cannot merge with itself' };
  if (!controls(w, person, target) || !controls(w, person, into)) return { why: 'you have to control both firms' };
  const s = econ(w);
  const cause = w.events.emit('firm.takeover', `${into.name} absorbs ${target.name}`, rootOf(s, target), into.id);
  merge(w, s, into, target, cause);
  return { text: `${target.name} is merged into ${into.name}` };
}

export function sellDivision(w: World, person: number, key: string, buyerKey: string): { why: string } | { text: string } {
  const target = findFirm(w, key), buyer = findFirm(w, buyerKey);
  if (!target || !buyer) return { why: 'no such firm' };
  const s = econ(w), L = w.ledger;
  if (!controls(w, person, target)) return { why: `you do not control ${target.name}` };
  if (buyer.idx === target.idx) return { why: 'it cannot buy itself' };
  let rivals = 0;
  for (const o of s.firms) if (!o.closed && o.idx !== target.idx && o.good === target.good) rivals++;
  if (!rivals) return { why: `${target.name} is the last maker of ${target.good}` };
  const def = GOODS[target.good];
  const cpu = def ? Math.max(1, 360 * s.wage / Math.max(0.01, def.prod)) : 1;
  const cap = L.instruments.has('capital') ? L.balance(target.id, 'capital') : 0;
  const price = Math.max(1, Math.round(cap * cpu));
  const cause = s.macroEv >= 0 ? s.macroEv : w.genesis;
  if (Math.floor(L.balance(buyer.id, DEP)) < price) raiseCash(w, s, buyer, price, cause);
  if (Math.floor(L.balance(buyer.id, DEP)) < price) return { why: `${buyer.name} cannot pay ${dollars(price)}` };
  const ev = w.events.emit('firm.sold', `${buyer.name} buys the business of ${target.name} for ${dollars(price)}`, rootOf(s, target), target.id);
  if (!pay(w, buyer.id, target.id, price, 'division.sale', ev)) return { why: 'the buyer did not pay' };
  if (cap > 1e-8) {
    L.consume('capital', target.id, cap, 'division.plant', ev);
    L.produce('capital', buyer.id, cap, 'division.plant', ev);
  }
  for (const g of Object.keys(GOODS)) {
    const qty = L.balance(target.id, 'good:' + g);
    if (qty > 1e-9) L.move('good:' + g, target.id, buyer.id, qty, 'division.stock', ev);
  }
  buyer.expSales += target.expSales;
  target.expSales = 0;
  for (const p of [...target.staff]) joinFirm(s, p, buyer);
  closeFirm(w, target, ev);
  return { text: `${buyer.name} buys ${target.name} for ${dollars(price)} and the shell is wound up` };
}

/** A board seat is an early look at the profit the street has not heard. */
function briefBoard(w: World): void {
  const social = w.state.social as {
    words?: number;
    insiderFact?: Int32Array;
    facts?: { id: number; tag: string; day: number; eventId: number; pub: boolean; drop: boolean; know: { tab: Int32Array | null; mask: number; n: number; bits: Uint32Array | null } | null }[];
  } | undefined;
  const player = w.state.player as { who?: number; heard?: { factId: number; eventId: number; from: number; day: number }[] } | undefined;
  if (!social?.insiderFact || !social.facts || player?.who === undefined || player.who < 0 || !player.heard) return;
  const who = player.who;
  const words = social.words ?? 1;
  for (const post of companyPosts(w, who)) {
    const f = findFirm(w, post.id);
    if (!f || f.idx >= social.insiderFact.length) continue;
    const id = social.insiderFact[f.idx];
    if (!(id >= 0)) continue;
    const fact = social.facts[id];
    if (!fact || fact.pub || fact.drop || fact.tag !== 'insider.profit' || !fact.know) continue;
    addKnower(fact.know, who, words);
    if (!player.heard.some((h) => h.factId === fact.id)) player.heard.push({ factId: fact.id, eventId: fact.eventId, from: f.ceo >= 0 ? f.ceo : who, day: fact.day });
  }
}

function hashPerson(person: number, mask: number): number {
  let x = Math.imul(person ^ (person >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) & mask;
}

function addKnower(know: { tab: Int32Array | null; mask: number; n: number; bits: Uint32Array | null }, person: number, words: number): void {
  if (person < 0) return;
  if (know.bits) {
    if (know.bits.length < words) {
      const grown = new Uint32Array(Math.max(words, (person >>> 5) + 1));
      grown.set(know.bits);
      know.bits = grown;
    }
    const word = person >>> 5;
    if (word < know.bits.length) know.bits[word] |= 1 << (person & 31);
    return;
  }
  if (!know.tab) return;
  if ((know.n + 1) * 2 > know.tab.length) {
    if ((know.tab.length << 1) > words) {
      const bits = new Uint32Array(Math.max(1, words));
      for (let i = 0; i < know.tab.length; i++) {
        const p = know.tab[i];
        if (p >= 0 && (p >>> 5) < bits.length) bits[p >>> 5] |= 1 << (p & 31);
      }
      know.bits = bits; know.tab = null; know.mask = 0;
      addKnower(know, person, words);
      return;
    }
    const old = know.tab;
    const tab = new Int32Array(old.length << 1);
    tab.fill(-1);
    const mask = tab.length - 1;
    for (let i = 0; i < old.length; i++) {
      const p = old[i];
      if (p < 0) continue;
      let h = hashPerson(p, mask);
      while (tab[h] !== -1) h = (h + 1) & mask;
      tab[h] = p;
    }
    know.tab = tab; know.mask = mask;
  }
  const tab = know.tab;
  if (!tab) return;
  const mask = know.mask;
  let h = hashPerson(person, mask);
  while (tab[h] !== -1) {
    if (tab[h] === person) return;
    h = (h + 1) & mask;
  }
  tab[h] = person;
  know.n++;
}
