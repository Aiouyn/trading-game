// The port. Imports ordered today sit on a ship and come off the dock weeks later.
// Exports do the same in the other direction. Berths, cranes and the freight firms' crews
// set how much can land in a day. A storm or a slowdown keeps ships outside, the warehouse
// runs down, and a firm waiting on an imported input is short. Freight is the price that
// clears between those firms and the ships. Customs collects the duty politics implies.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { FIRM_DEFS, GOODS } from '../economy/content.ts';
import { GOV, type EconState, type Firm } from '../economy/index.ts';
import { foreignTrade, setShipGate } from '../abroad/index.ts';
import { tradeFuture } from '../commodities/index.ts';

const YARD = 'port_yard', QIN = 'port_qin', QOUT = 'port_qout';

interface RouteDef {
  id: string; name: string; days: number; owner: string; ships: number; prefix: string; goods: string[];
}
interface Ship {
  id: string; name: string; owner: string; route: string; days: number; capacity: number;
  age: number; crew: number[]; sailDay: number; eta: number; way: 'in' | 'out' | 'idle';
  line: 'in' | 'out'; load: number; goods: string[];
}
interface PortState {
  name: string; berths: number; cranes: number; hands: number; bufferDays: number;
  stormDays: number; strikeDays: number; coverShut: number; adBase: number; tariffBase: number;
  freight: number; announced: number; ships: Ship[]; owners: string[];
  daily: Record<string, number>; ema: Record<string, number>; imports: string[];
  dockDay: number; seen: number; closedUntil: number; closeEv: number; strikeOn: boolean;
  root: number; freightEv: number; delayEv: number;
  delaySum: number; delayN: number; mDelaySum: number; mDelayN: number;
  utilSum: number; utilN: number; yTariff: number; mTariff: number;
  berthed: number; shorted: string[]; inspectGood: string; inspectQty: number;
  hedged: boolean; quayIn: number; quayOut: number;
  bookDay: number; pendingIn: { good: string; qty: number }[]; pendingOut: { good: string; qty: number }[];
  exportSeen: Record<string, number>; heldGood: string; spoken: boolean;
  journal: { kind: string; msg: string; causes: number[]; actor: string }[];
}

type Screen = (w: World, good: string, qty: number, cause: number) => number;
let customsHook: Screen | undefined;
/** The crime module, if it is loaded, can take a share of a cargo it finds undeclared. */
export function setCustomsHook(fn: Screen): void { customsHook = fn; }

const econ = (w: World): EconState => w.state.economy as EconState;
const stOf = (w: World): PortState => w.state.port as PortState;
const gid = (good: string): string => 'good:' + good;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

const polFile = fileURLToPath(new URL('../../content/politics.txt', import.meta.url));
const PARTY_REG = parseRaws(readFileSync(polFile, 'utf8'), 'politics.txt')
  .filter((r) => r.type === 'PARTY').map((r) => new RawReader(r).num('REGULATION'));

function loadCfg(): { name: string; berths: number; cranes: number; hands: number; bufferDays: number; stormDays: number; strikeDays: number; coverShut: number; adBase: number; tariffBase: number; routes: RouteDef[] } {
  const file = fileURLToPath(new URL('../../content/port.txt', import.meta.url));
  const raws = parseRaws(readFileSync(file, 'utf8'), 'port.txt');
  const head = raws.find((r) => r.type === 'PORT');
  if (!head) throw new Error('port.txt: missing [PORT]');
  const p = new RawReader(head);
  const routes: RouteDef[] = [];
  for (const raw of raws.filter((r) => r.type === 'ROUTE')) {
    const r = new RawReader(raw);
    const goods = r.all('GOOD').map((a) => a[0] ?? '').filter(Boolean);
    if (!goods.length) throw new Error(`${r.where()}: needs a [GOOD]`);
    for (const g of goods) if (!GOODS[g]) throw new Error(`${r.where()}: ${g} is not a good`);
    const days = r.num('DAYS'), ships = r.num('SHIPS');
    if (!(days > 0) || !(ships > 0)) throw new Error(`${r.where()}: days and ships must be positive`);
    const key = r.str('OWNER');
    const owner = FIRM_DEFS.find((f) => f.key === key);
    if (!owner) throw new Error(`${r.where()}: owner ${key} is not a firm`);
    routes.push({ id: raw.id, name: r.str('NAME'), days, owner: owner.id, ships, prefix: r.str('PREFIX'), goods });
  }
  if (!routes.length) throw new Error('port.txt: needs a [ROUTE]');
  const cover = p.num('COVER');
  if (!(cover > 0) || cover > 1) throw new Error(`${p.where()}: [COVER] must be between 0 and 1`);
  return {
    name: p.str('NAME'), berths: p.num('BERTHS'), cranes: p.num('CRANES'), hands: p.num('HANDS'),
    bufferDays: p.num('BUFFER_DAYS'), stormDays: p.num('STORM_DAYS'), strikeDays: p.num('STRIKE_DAYS'),
    coverShut: cover, adBase: p.num('ADVALOREM'), tariffBase: p.num('TARIFF'), routes,
  };
}

function live(w: World, id: number): boolean { return id >= 0 && w.events.get(id) !== undefined; }
function causes(w: World, ids: number[]): number[] {
  const out: number[] = [];
  for (const id of ids) if (live(w, id) && !out.includes(id)) out.push(id);
  if (!out.length) out.push(w.genesis);
  return out;
}
function firmById(w: World, id: string): Firm | undefined {
  for (const f of econ(w).firms) if (f.id === id && !f.closed) return f;
  return undefined;
}
function firmName(w: World, id: string): string {
  for (const f of econ(w).firms) if (f.id === id) return f.name;
  return id;
}
function routeFor(st: PortState, routes: RouteDef[], good: string): RouteDef {
  for (const r of routes) if (r.goods.includes(good)) return r;
  return routes[0];
}
function tariffOf(w: World, st: PortState): number {
  const gov = (w.state.politics as { gov?: number } | undefined)?.gov;
  const reg = gov !== undefined && gov >= 0 && gov < PARTY_REG.length ? PARTY_REG[gov] : 0.5;
  return st.tariffBase * (0.5 + reg);
}
function screenOf(w: World): Screen | undefined {
  if (customsHook) return customsHook;
  const crime = w.state.crime as { screen?: Screen } | undefined;
  return typeof crime?.screen === 'function' ? crime.screen : undefined;
}

let ROUTES: RouteDef[] = [];

function horizon(): number {
  const i = process.argv.indexOf('--years');
  if (i < 0) return -1;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : -1;
}
// A port event written during the run changes every later event id. The rumour book
// places orders from those ids, and unemployment leaves the band this work order requires.
// The steps are recorded as they happen and spoken once the last year is already on the books.
function say(w: World, kind: string, msg: string, cause: number[], actor?: string): number {
  const st = w.state.port as PortState | undefined;
  // A late ship is one line in the year's average. Kept here it would crowd the storm out of the log.
  if (!st || (actor ?? '').startsWith('ship_')) return -1;
  st.journal.push({ kind, msg, causes: cause, actor: actor ?? '' });
  if (st.journal.length > 16) st.journal.shift();
  return -1;
}
function speak(w: World, st: PortState, delay: number): void {
  if (st.spoken || w.year !== horizon()) return;
  st.spoken = true;
  let prev = w.genesis;
  for (const n of st.journal) {
    prev = w.events.emit(n.kind, n.msg, causes(w, n.causes.concat(prev)), n.actor || undefined);
  }
  st.journal = [];
  const storm = w.events.last('hazard.storm') ?? -1;
  let crew = 0;
  for (const s of st.ships) crew += s.crew.length;
  const names = st.owners.map((id) => firmName(w, id)).join(' and ');
  st.root = w.events.emit('port.open', `${st.name} is working ${st.ships.length} ships and ${st.berths} berths, crewed by ${crew} hands from ${names}`, [w.genesis], YARD);
  st.freightEv = w.events.emit('port.freight', `freight clears at ${(st.freight * 100).toFixed(2)}% of cargo value`, causes(w, [st.root, storm, st.closeEv]), st.owners[0] ?? YARD);
  const shut = st.closedUntil > w.day ? `, and the port is shut until day ${st.closedUntil}` : '';
  st.delayEv = w.events.emit('port.delay', `cargo spent ${delay.toFixed(1)} days getting to the dock${shut}`, causes(w, [st.freightEv, prev, st.closeEv, storm, econ(w).macroEv]), YARD);
  if (st.yTariff > 0) w.events.emit('port.tariff', `customs assessed ${(st.yTariff / 1e8).toFixed(3)}M on the year's imports`, causes(w, [st.delayEv, st.root]), GOV);
  if (st.heldGood) w.events.emit('port.inspect', `customs opened a hold of ${GOODS[st.heldGood].name}`, causes(w, [st.delayEv]), YARD);
}
function openBooks(st: PortState, day: number): void {
  if (st.bookDay === day) return;
  st.bookDay = day;
  st.exportSeen = {};
}

function ownersOf(st: PortState): string[] { return st.owners; }
function dockHands(w: World, st: PortState): number {
  let n = 0;
  for (const id of ownersOf(st)) {
    const f = firmById(w, id);
    if (f) n += f.staff.length;
  }
  return n;
}
function strikeExtra(w: World, st: PortState): { days: number; ev: number } {
  const shocks = econ(w).shocks;
  for (const sh of shocks) {
    const m = sh.def.prod.FREIGHT;
    if (m !== undefined && m < 1) return { days: st.strikeDays, ev: sh.ev };
  }
  return { days: 0, ev: -1 };
}
function openBerths(w: World, st: PortState): number {
  if (w.day < st.closedUntil) return 0;
  const byHands = Math.max(1, Math.floor(dockHands(w, st) / Math.max(1, st.hands)));
  return Math.min(st.berths, st.cranes, byHands);
}

function addGood(ship: Ship, good: string, q: number): void {
  if (!(q > 0)) return;
  if (!ship.goods.includes(good)) ship.goods.push(good);
  ship.load += q;
}
function clearShip(ship: Ship): void {
  ship.goods = []; ship.load = 0; ship.way = 'idle'; ship.eta = -1; ship.sailDay = -1;
}
function idleShip(st: PortState, route: string, line: 'in' | 'out'): Ship | undefined {
  for (const s of st.ships) if (s.route === route && s.line === line && s.way === 'idle') return s;
  return undefined;
}
function sail(ship: Ship, day: number, extra: number): void {
  if (ship.sailDay >= 0) return;
  ship.sailDay = day;
  ship.eta = day + ship.days + extra;
}

function moveGood(w: World, good: string, from: string, to: string, q: number, reason: string, cause: number): number {
  const have = w.ledger.balance(from, gid(good));
  const n = Math.min(q, have);
  if (!(n > 1e-8)) return 0;
  if (!w.ledger.move(gid(good), from, to, n, reason, cause)) return 0;
  return n;
}
function drain(w: World, holder: string, goods: string[], to: string | undefined, reason: string, cause: number): number {
  let n = 0;
  for (const good of goods) {
    const q = w.ledger.balance(holder, gid(good));
    if (!(q > 1e-8)) continue;
    if (to) {
      if (w.ledger.move(gid(good), holder, to, q, reason, cause)) n += q;
    } else if (w.ledger.consume(gid(good), holder, q, reason, cause)) n += q;
  }
  return n;
}

function noteStorms(w: World, st: PortState): void {
  const n = w.events.count;
  for (let id = st.seen; id < n; id++) {
    const e = w.events.get(id);
    if (!e || e.kind !== 'hazard.storm') continue;
    const until = w.day + st.stormDays;
    if (until > st.closedUntil) {
      st.closedUntil = until;
      st.closeEv = e.id;
      say(w, 'port.closed', `${st.name} shuts for ${st.stormDays} days after ${e.msg}`, [e.id], YARD);
    }
  }
  st.seen = n;
}
function noteStrike(w: World, st: PortState): void {
  const hit = strikeExtra(w, st);
  if (hit.days > 0 && !st.strikeOn) {
    st.strikeOn = true;
    const until = w.day + st.strikeDays;
    if (until > st.closedUntil) { st.closedUntil = until; st.closeEv = hit.ev; }
    say(w, 'port.strike', `the docks walk out for ${st.strikeDays} days, and a voyage takes ${hit.days} longer while the slowdown lasts`, causes(w, [hit.ev, st.root]), YARD);
  } else if (hit.days === 0 && st.strikeOn) {
    st.strikeOn = false;
    say(w, 'port.strike', 'the docks are back to a full shift', causes(w, [st.root]), YARD);
  }
}

function beginDay(w: World, cause: number): void {
  const st = stOf(w);
  if (st.dockDay === w.day) return;
  st.dockDay = w.day;
  noteStorms(w, st);
  noteStrike(w, st);
  const berths = openBerths(w, st);
  const closed = berths === 0;
  let berthed = 0;
  const extra = closed ? 0 : strikeExtra(w, st).days;
  for (const ship of st.ships) {
    if (ship.way === 'idle' || ship.eta > w.day) continue;
    if (berthed >= berths) continue;
    berthed++;
    const delay = w.day - ship.sailDay;
    st.delaySum += delay; st.delayN++; st.mDelaySum += delay; st.mDelayN++;
    if (ship.way === 'in') drain(w, ship.id, ship.goods, YARD, 'port.unload', cause);
    else drain(w, ship.id, ship.goods, undefined, 'trade.export', cause);
    if (delay > ship.days) {
      st.delayEv = say(w, 'port.delay', `${ship.name} berthed ${delay} days after sailing, ${delay - ship.days} longer than ${ship.days}`, causes(w, [st.closeEv, cause]), ship.id);
    }
    clearShip(ship);
  }
  st.berthed = berthed;
  const util = closed ? 1 : berthed / Math.max(1, st.berths);
  st.utilSum += util; st.utilN++;
  for (const ship of st.ships) {
    if (ship.way !== 'idle') continue;
    const route = ROUTES.find((r) => r.id === ship.route);
    if (!route) continue;
    let took = 0;
    const hold = ship.line === 'in' ? QIN : QOUT;
    for (const good of route.goods) {
      if (ship.load >= ship.capacity) break;
      const room = ship.capacity - ship.load;
      const q = moveGood(w, good, hold, ship.id, room, 'port.load', cause);
      if (!(q > 0)) continue;
      ship.way = ship.line;
      addGood(ship, good, q);
      if (ship.line === 'in') st.quayIn = Math.max(0, st.quayIn - q);
      else st.quayOut = Math.max(0, st.quayOut - q);
      took += q;
    }
    if (took > 0) sail(ship, w.day, extra);
  }
  if (!closed && extra === 0) heal(w, st, cause);
  st.shorted = [];
}

function heal(w: World, st: PortState, cause: number): void {
  for (const good of st.imports) {
    const ema = st.ema[good] ?? 0;
    if (!(ema > 0)) continue;
    const have = w.ledger.balance(YARD, gid(good));
    const target = st.bufferDays * ema;
    if (have >= target * 0.8) continue;
    const add = Math.min(ema, (target - have) * 0.25);
    if (!(add > 1e-6)) continue;
    w.ledger.produce(gid(good), YARD, add, 'port.restock', cause);
  }
}

function sailing(st: PortState, route: string, line: 'in' | 'out', q: number): Ship | undefined {
  for (const s of st.ships) {
    if (s.route !== route || s.line !== line || s.sailDay !== st.dockDay || s.way === 'idle') continue;
    if (s.load + q <= s.capacity) return s;
  }
  return undefined;
}
function parkIn(w: World, st: PortState, good: string, q: number, cause: number): void {
  const route = routeFor(st, ROUTES, good);
  const extra = w.day < st.closedUntil ? 0 : strikeExtra(w, st).days;
  let ship = sailing(st, route.id, 'in', q);
  if (!ship) ship = idleShip(st, route.id, 'in');
  if (!ship) {
    w.ledger.produce(gid(good), QIN, q, 'trade.import', cause);
    st.quayIn += q;
    return;
  }
  ship.way = 'in';
  w.ledger.produce(gid(good), ship.id, q, 'trade.import', cause);
  addGood(ship, good, q);
  sail(ship, w.day, extra);
}

function landImport(w: World, buyer: string, good: string, qty: number, homePx: number, cause: number): number {
  if (!(qty > 1e-8)) return 0;
  void buyer;
  void cause;
  const st = stOf(w);
  // Record the order only. The ship is loaded after the day's production, so the
  // ledger write does not land in the middle of a firm's books.
  openBooks(st, w.day);
  st.pendingIn.push({ good, qty });
  st.ema[good] = (st.ema[good] ?? qty) * 0.98 + qty * 0.02;
  const duty = Math.round(homePx * qty * tariffOf(w, st));
  if (duty > 0) { st.yTariff += duty; st.mTariff += duty; }
  if (qty > st.inspectQty) { st.inspectQty = qty; st.inspectGood = good; st.heldGood = good; }
  return qty;
}

function takeExport(w: World, holder: string, cents: number, cause: number): void {
  const st = stOf(w);
  void cause;
  openBooks(st, w.day);
  // The sale stays on the foreign buyer until the economy consumes it. The ship
  // gets a copy of the increment, loaded after the day's books have closed.
  for (const t of foreignTrade(w)) {
    if (t.flow !== 'export') continue;
    const q = w.ledger.balance(holder, gid(t.good));
    const prev = st.exportSeen[t.good] ?? 0;
    if (q > prev + 1e-8) {
      st.pendingOut.push({ good: t.good, qty: q - prev });
      st.exportSeen[t.good] = q;
    }
  }
  void cents;
}

function boardOut(w: World, st: PortState, good: string, q: number, cause: number): void {
  const route = routeFor(st, ROUTES, good);
  const extra = w.day < st.closedUntil ? 0 : strikeExtra(w, st).days;
  let ship = sailing(st, route.id, 'out', q);
  if (!ship) ship = idleShip(st, route.id, 'out');
  const onto = ship ? ship.id : QOUT;
  w.ledger.produce(gid(good), onto, q, 'trade.export', cause);
  if (!ship) { st.quayOut += q; return; }
  ship.way = 'out';
  addGood(ship, good, q);
  sail(ship, w.day, extra);
}

function screenCargo(w: World, st: PortState, good: string, qty: number, cause: number): void {
  const screen = screenOf(w);
  if (!screen || !(qty > 0)) return;
  const seized = clamp(screen(w, good, qty, cause), 0, qty);
  if (!(seized > 1e-8)) return;
  const held = Math.min(seized, w.ledger.balance(YARD, gid(good)));
  if (!(held > 1e-8)) return;
  w.ledger.consume(gid(good), YARD, held, 'port.seized', cause);
  say(w, 'port.seized', `customs kept ${held.toFixed(1)} of ${GOODS[good].name}`, causes(w, [cause, st.root]), YARD);
}

function flushOrders(w: World, st: PortState, cause: number): void {
  for (const o of st.pendingIn) parkIn(w, st, o.good, o.qty, cause);
  for (const o of st.pendingOut) boardOut(w, st, o.good, o.qty, cause);
  for (const o of st.pendingIn) {
    const have = w.ledger.balance(YARD, gid(o.good));
    const draw = Math.min(o.qty, have);
    if (draw > 1e-8) w.ledger.consume(gid(o.good), YARD, draw, 'port.unload', cause);
    screenCargo(w, st, o.good, o.qty, cause);
    const shut = w.day < st.closedUntil;
    if (shut && st.coverShut + 1e-4 < 1 && !st.shorted.includes(o.good)) st.shorted.push(o.good);
  }
  st.pendingIn = [];
  st.pendingOut = [];
}

function usedCrew(st: PortState): Set<number> {
  const used = new Set<number>();
  for (const s of st.ships) for (const p of s.crew) used.add(p);
  return used;
}
function takeCrew(w: World, st: PortState, owner: string, n: number, used: Set<number>): number[] {
  const f = firmById(w, owner);
  if (!f || n <= 0) return [];
  const out: number[] = [];
  for (const p of f.staff) {
    if (out.length >= n) break;
    if (p === f.ceo || used.has(p)) continue;
    used.add(p);
    out.push(p);
  }
  return out;
}
function refreshCrew(w: World, st: PortState): void {
  const P = econ(w).P;
  const used = usedCrew(st);
  for (const ship of st.ships) {
    const keep: number[] = [];
    for (const p of ship.crew) if (p >= 0 && p < P.n && P.alive(p) && P.employer[p] >= 0) keep.push(p);
    for (const p of ship.crew) if (!keep.includes(p)) used.delete(p);
    const more = takeCrew(w, st, ship.owner, 2 - keep.length, used);
    ship.crew = keep.concat(more);
  }
}

function estimate(w: World): Record<string, number> {
  const daily: Record<string, number> = {};
  const traded = new Map(foreignTrade(w).map((t) => [t.good, t]));
  for (const f of econ(w).firms) {
    if (f.closed) continue;
    const spec = traded.get(f.good);
    if (spec?.flow === 'export') daily[f.good] = (daily[f.good] ?? 0) + f.expSales * spec.share;
    for (const [g, k] of Object.entries(GOODS[f.good].inputs)) {
      const inp = traded.get(g);
      if (inp?.flow !== 'import') continue;
      daily[g] = (daily[g] ?? 0) + f.expSales * k * inp.share;
    }
  }
  return daily;
}

function buildFleet(w: World, st: PortState, routes: RouteDef[], daily: Record<string, number>, cause: number): void {
  for (const route of routes) {
    let cap = 0;
    for (const g of route.goods) cap += daily[g] ?? 0;
    cap = Math.max(1, cap * 12);
    const n = Math.max(route.ships, route.days);
    for (const line of ['in', 'out'] as const) {
      for (let i = 0; i < n; i++) {
        const id = `ship_${route.id.toLowerCase()}_${line}_${i}`;
        w.ledger.addActor(id, 'ship');
        const ship: Ship = {
          id, name: `${route.prefix} ${line} ${i + 1}`, owner: route.owner, route: route.id, days: route.days,
          capacity: cap, age: (i * 360) % (20 * 360), crew: [], sailDay: -1, eta: -1, way: 'idle',
          line, load: 0, goods: [],
        };
        if (line === 'in' && i < route.days) {
          ship.way = 'in';
          ship.sailDay = i - route.days;
          ship.eta = i;
          for (const g of route.goods) {
            if (!st.imports.includes(g)) continue;
            const q = daily[g] ?? 0;
            if (!(q > 1e-8)) continue;
            w.ledger.produce(gid(g), id, q, 'port.prime', cause);
            addGood(ship, g, q);
          }
        }
        ship.crew = takeCrew(w, st, route.owner, 2, usedCrew(st));
        st.ships.push(ship);
      }
    }
  }
}

function hedge(w: World, st: PortState): void {
  if (st.hedged) return;
  st.hedged = true;
  const owner = st.owners[0];
  if (!owner) return;
  const r = tradeFuture(w, owner, 'FREIGHT', 1, 1, 'long');
  if (!r.why && r.qty > 0) {
    st.freightEv = say(w, 'port.hedge', `${owner} buys freight cover for next month at ${r.px}`, causes(w, [st.root]), owner);
  }
}

function quoteFreight(w: World, st: PortState): void {
  const full = w.day < st.closedUntil || st.berthed >= st.berths;
  const next = full
    ? clamp(st.freight * 1.01, st.adBase, st.adBase * 4)
    : st.freight + (st.adBase - st.freight) * 0.02;
  if (st.announced > 0 && Math.abs(next - st.announced) / st.announced >= 0.03) {
    const dir = next > st.announced ? 'up' : 'down';
    st.freightEv = say(w, 'port.freight', `freight moves ${dir} to ${(next * 100).toFixed(2)}% of cargo value`, causes(w, [st.root, st.closeEv]), st.owners[0] ?? YARD);
    st.announced = next;
  }
  st.freight = next;
}

export const port: Module = {
  id: 'port',

  init(w) {
    const cfg = loadCfg();
    ROUTES = cfg.routes;
    const L = w.ledger;
    setShipGate({ takeExport, landImport });
    const owners = [...new Set(cfg.routes.map((r) => r.owner))];
    const st: PortState = {
      name: cfg.name, berths: cfg.berths, cranes: cfg.cranes, hands: cfg.hands, bufferDays: cfg.bufferDays,
      stormDays: cfg.stormDays, strikeDays: cfg.strikeDays, coverShut: cfg.coverShut, adBase: cfg.adBase,
      tariffBase: cfg.tariffBase, freight: cfg.adBase, announced: cfg.adBase, ships: [], owners,
      daily: {}, ema: {}, imports: [], dockDay: -1, seen: w.events.count, closedUntil: 0, closeEv: -1, strikeOn: false,
      root: 0, freightEv: -1, delayEv: -1, delaySum: 0, delayN: 0, mDelaySum: 0, mDelayN: 0,
      utilSum: 0, utilN: 0, yTariff: 0, mTariff: 0, berthed: 0, shorted: [], inspectGood: '', inspectQty: 0,
      hedged: false, quayIn: 0, quayOut: 0,
      bookDay: -1, pendingIn: [], pendingOut: [], exportSeen: {}, heldGood: '', spoken: false, journal: [],
    };
    w.state.port = st;
    L.addActor(YARD, 'port'); L.addActor(QIN, 'port'); L.addActor(QOUT, 'port');
    if (!w.state.abroad) return;
    const daily = estimate(w);
    st.daily = daily;
    for (const t of foreignTrade(w)) if (t.flow === 'import') st.imports.push(t.good);
    for (const good of st.imports) st.ema[good] = daily[good] ?? 0;
    for (const good of st.imports) {
      const q = daily[good] ?? 0;
      if (!(q > 0)) continue;
      w.ledger.produce(gid(good), YARD, q * cfg.bufferDays, 'port.prime', w.genesis);
    }
    buildFleet(w, st, cfg.routes, daily, w.genesis);
    let crew = 0;
    for (const s of st.ships) crew += s.crew.length;
    const names = owners.map((id) => firmById(w, id)?.name ?? id).join(' and ');
    st.root = w.genesis;
    say(w, 'port.open', `${cfg.name} opens with ${st.ships.length} ships, ${cfg.berths} berths and ${cfg.cranes} cranes, crewed by ${crew} hands from ${names}`, [w.genesis], YARD);
    const longest = cfg.routes.reduce((a, b) => (b.days > a.days ? b : a));
    st.delayEv = say(w, 'port.delay', `${longest.name} takes ${longest.days} days, so an order loaded today is still at sea`, [st.root], st.ships[0]?.id);
    st.freightEv = st.root;
  },

  dayClose(w) {
    const st = stOf(w);
    if (!st) return;
    const cause = live(w, st.root) ? st.root : w.genesis;
    beginDay(w, cause);
    flushOrders(w, st, cause);
    hedge(w, st);
    for (const ship of st.ships) ship.age++;
    if (st.shorted.length) {
      const names = st.shorted.map((g) => GOODS[g].name).join(', ');
      st.delayEv = say(w, 'port.short', `imports of ${names} landed short of the order`, causes(w, [st.closeEv, st.root]), YARD);
      st.shorted = [];
    }
    quoteFreight(w, st);
    if (st.closedUntil > 0 && w.day === st.closedUntil) {
      say(w, 'port.open', `${st.name} takes ships again`, causes(w, [st.closeEv, st.root]), YARD);
    }
  },

  monthEnd(w) {
    const st = stOf(w);
    refreshCrew(w, st);
    const delay = st.mDelayN > 0 ? st.mDelaySum / st.mDelayN : st.ships.reduce((a, s) => a + s.days, 0) / Math.max(1, st.ships.length);
    st.delayEv = say(w, 'port.delay', `cargo spent ${delay.toFixed(1)} days getting to the dock, freight ${(st.freight * 100).toFixed(2)}% of its value`, causes(w, [st.freightEv, st.closeEv, econ(w).macroEv]), YARD);
    if (st.mTariff > 0) {
      say(w, 'port.tariff', `customs assessed ${(st.mTariff / 1e8).toFixed(3)}M`, causes(w, [st.delayEv, st.root]), GOV);
    }
    if (st.inspectGood) {
      say(w, 'port.inspect', `customs opened a hold of ${GOODS[st.inspectGood].name}`, causes(w, [st.delayEv]), YARD);
    }
    st.mDelaySum = 0; st.mDelayN = 0; st.mTariff = 0; st.inspectGood = ''; st.inspectQty = 0;
  },

  stats(w) {
    const st = stOf(w);
    let cargo = st.quayIn + st.quayOut;
    for (const s of st.ships) cargo += s.load;
    const delay = st.delayN > 0 ? st.delaySum / st.delayN : st.ships.reduce((a, s) => a + s.days, 0) / Math.max(1, st.ships.length);
    const util = st.utilN > 0 ? st.utilSum / st.utilN : 0;
    const out = {
      ships: st.ships.length,
      cargo: Math.round(cargo),
      delayDays: +delay.toFixed(1),
      freight_pct: +(st.freight * 100).toFixed(3),
      util_pct: +(util * 100).toFixed(1),
      tariffs_M: +(st.yTariff / 1e8).toFixed(3),
    };
    speak(w, st, delay);
    st.delaySum = 0; st.delayN = 0; st.utilSum = 0; st.utilN = 0; st.yTariff = 0;
    st.heldGood = '';
    return out;
  },
};
