// Power plants owned by the utilities. The cheapest online plant runs first and the
// marginal plant sets the wholesale price. Households pay a tariff the regulator can
// hold below that. Fuel is priced off the same coal, gas and oil the commodity
// markets mark. A short day is shed by neighbourhood, not by scanning every person.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { GOODS } from '../economy/content.ts';
import { BANK, DEP, pay, setPowerHook, type EconState, type Firm } from '../economy/index.ts';
import { thought } from '../economy/people.ts';

type Fuel = 'HYDRO' | 'COAL' | 'GAS' | 'OIL';

interface PlantType { id: string; name: string; fuel: Fuel; heat: number; build: number; life: number; outage: number; share: number }
interface District { id: string; name: string; load: number }
interface Plant {
  id: string; name: string; utility: number; fuel: Fuel; cap: number; heat: number;
  age: number; life: number; out: number; ready: number; built: number; outage: number;
}
interface Bond { id: string; utility: number; rate: number }
interface Grid {
  root: number;
  plants: Plant[];
  bonds: Bond[];
  scale: number;
  perPerson: number;
  baseVc: number;
  wholesale: number;
  tariff: number;
  /** Added to a firm's electricity input cost. Zero except during an oil shock, so a quiet year does not reprice the whole economy. */
  pass: number;
  announced: number;
  priceEv: number;
  marginal: string;
  coldUntil: number;
  dryUntil: number;
  coldEv: number;
  dryEv: number;
  shed: number[];
  capacity: number;
  todayDemand: number;
  todayAvail: number;
  todayGen: number[];
  todayBlack: number;
  dark: number;
  yPeak: number;
  yBlack: number;
  yGen: number[];
  yPx: number;
  yDays: number;
  starvedDay: number;
  genEv: number;
}

const FUELS: Fuel[] = ['HYDRO', 'COAL', 'GAS', 'OIL'];
const file = fileURLToPath(new URL('../../content/energy.txt', import.meta.url));
const raws = parseRaws(readFileSync(file, 'utf8'), 'energy.txt');
const of = (type: string): RawReader[] => raws.filter((r) => r.type === type).map((r) => new RawReader(r));

function asFuel(s: string, where: string): Fuel {
  switch (s) {
    case 'HYDRO':
    case 'COAL':
    case 'GAS':
    case 'OIL':
      return s;
    default:
      throw new Error(`${where}: fuel must be HYDRO, COAL, GAS or OIL, got ${s}`);
  }
}
function fuelGood(f: Fuel): string {
  switch (f) {
    case 'COAL': return 'COAL';
    case 'GAS': return 'NATURAL_GAS';
    case 'OIL': return 'FUEL';
    case 'HYDRO': return '';
    default: { const x: never = f; return x; }
  }
}
function fuelAt(f: Fuel): number {
  switch (f) {
    case 'HYDRO': return 0;
    case 'COAL': return 1;
    case 'GAS': return 2;
    case 'OIL': return 3;
    default: { const x: never = f; return x; }
  }
}

const TYPES: PlantType[] = of('PLANT').map((r) => ({
  id: r.raw.id, name: r.str('NAME'), fuel: asFuel(r.str('FUEL'), r.where()), heat: r.num('HEAT'),
  build: r.num('BUILD'), life: r.num('LIFE'), outage: r.num('OUTAGE'), share: r.num('SHARE'),
}));
if (TYPES.length !== 4) throw new Error('energy.txt: need hydro, coal, gas and oil');
const SHARE = TYPES.reduce((t, p) => t + p.share, 0);
if (Math.abs(SHARE - 1) > 0.02) throw new Error(`energy.txt: plant shares sum to ${SHARE.toFixed(3)}`);

const DISTRICTS: District[] = of('DISTRICT').map((r) => ({ id: r.raw.id, name: r.str('NAME'), load: r.num('LOAD') }));
if (DISTRICTS.length < 2) throw new Error('energy.txt: need at least two districts');
const LOAD = DISTRICTS.reduce((t, d) => t + d.load, 0);

const INTENSITY: Record<string, number> = {};
for (const r of of('LOAD')) INTENSITY[r.raw.id] = r.num('INTENSITY');

const polFile = fileURLToPath(new URL('../../content/politics.txt', import.meta.url));
const REG: number[] = parseRaws(readFileSync(polFile, 'utf8'), 'politics.txt').filter((r) => r.type === 'PARTY').map((r) => new RawReader(r).num('REGULATION'));

const econ = (w: World): EconState => w.state.economy as EconState;
const grid = (w: World): Grid => w.state.energy as Grid;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

function spot(s: EconState, good: string): number {
  let p = 0, n = 0;
  for (const f of s.firms) if (f.good === good && !f.closed && f.price > 0) { p += f.price; n++; }
  return n ? p / n : 0;
}
function oilShock(s: EconState): number {
  for (let i = s.shocks.length - 1; i >= 0; i--) if (s.shocks[i].def.id === 'OIL_EMBARGO') return s.shocks[i].ev;
  return -1;
}
function regulation(w: World): number {
  const gov = (w.state.politics as { gov?: number } | undefined)?.gov;
  if (gov === undefined || gov < 0 || gov >= REG.length) return 0.5;
  return REG[gov];
}
function season(day: number): number {
  const m = Math.floor((day % DAYS_PER_YEAR) / 30);
  if (m <= 1 || m >= 10) return 1.14;
  if (m >= 5 && m <= 7) return 0.9;
  return 1;
}
function firmDraw(s: EconState, scale: number): number {
  let d = 0;
  for (const f of s.firms) {
    if (f.closed || f.good === 'ELECTRICITY') continue;
    const k = GOODS[f.good].inputs.ELECTRICITY ?? 0;
    if (!(k > 0) || !(f.expSales > 0)) continue;
    d += f.expSales * k * (INTENSITY[f.sector] ?? 1);
  }
  return d * scale;
}
function demand(w: World, st: Grid): number {
  const s = econ(w);
  const cold = w.day < st.coldUntil ? 1.1 : 1;
  const firms = firmDraw(s, st.scale);
  const homes = s.P.n * st.perPerson * (season(w.day + 1) / 1.14) * cold;
  return firms + homes;
}
function hydroFactor(st: Grid, fuel: Fuel, day: number): number {
  return fuel === 'HYDRO' && day < st.dryUntil ? 0.62 : 1;
}
function ageFactor(p: Plant): number {
  return 1 - 0.12 * Math.min(1, p.age / Math.max(1, p.life));
}
function online(p: Plant, day: number): boolean {
  return p.ready <= day && p.out <= 0;
}
function plantCap(st: Grid, p: Plant, day: number): number {
  if (!online(p, day)) return 0;
  return p.cap * hydroFactor(st, p.fuel, day) * ageFactor(p);
}
function capFor(st: Grid, utility: number, day: number): number {
  let c = 0;
  for (const p of st.plants) if (p.utility === utility) c += plantCap(st, p, day);
  return c;
}
function nameplate(st: Grid, day: number): number {
  let c = 0;
  for (const p of st.plants) if (p.ready <= day) c += p.cap * ageFactor(p);
  return c;
}

/** Called from the economy while a firm decides today's output. Electricity stops at the plants that are actually up; a dark neighbourhood loses part of the day. */
export function rationPower(w: World, f: Firm, planned: number): number {
  const st = w.state.energy as Grid | undefined;
  if (!st || !(planned > 0)) return planned;
  // The utility's own production stays on the economy's books. A short grid is shed onto the firms that buy power.
  if (f.good === 'ELECTRICITY') return planned;
  const n = st.shed.length;
  if (!n) return planned;
  const cut = st.shed[f.idx % n] ?? 0;
  return cut > 0 ? planned * (1 - cut) : planned;
}

function variable(s: EconState, fuel: Fuel, heat: number, oil: boolean): number {
  if (fuel === 'HYDRO' || !(heat > 0)) return 0;
  const good = fuelGood(fuel);
  const px = spot(s, good);
  return heat * (px > 0 ? px : 1) * (oil && fuel === 'OIL' ? 1.35 : 1);
}

interface Stack { fuel: Fuel; vc: number; ran: number }
function dispatch(w: World, st: Grid, need: number): { ran: number[]; marginal: Fuel; vc: number; avail: number } {
  const day = w.day + 1;
  const s = econ(w);
  const oil = oilShock(s) >= 0;
  const row: Stack[] = [];
  let avail = 0;
  for (const p of st.plants) {
    const cap = plantCap(st, p, day);
    if (!(cap > 0)) continue;
    avail += cap;
    row.push({ fuel: p.fuel, vc: variable(s, p.fuel, p.heat, oil), ran: cap });
  }
  row.sort((a, b) => a.vc - b.vc || fuelAt(a.fuel) - fuelAt(b.fuel));
  const ran = [0, 0, 0, 0];
  let left = need, marginal: Fuel = 'HYDRO', vc = 0, seen = false;
  for (const r of row) {
    if (!(r.ran > 0)) continue;
    const take = Math.min(r.ran, Math.max(0, left));
    ran[fuelAt(r.fuel)] += take;
    if (take > 0 || !seen) { marginal = r.fuel; vc = r.vc; seen = true; }
    left -= take;
    if (left <= 1e-9 && r.vc > 0) break;
  }
  if (!(vc > 0)) {
    for (const r of row) if (r.vc > 0) { vc = r.vc; break; }
  }
  return { ran, marginal, vc, avail };
}

function shedFor(need: number, avail: number): { shed: number[]; dark: number } {
  const shed = DISTRICTS.map(() => 0);
  if (!(need > avail) || !(need > 0)) return { shed, dark: -1 };
  let left = need - avail;
  const order = DISTRICTS.map((d, i) => ({ i, load: d.load })).sort((a, b) => b.load - a.load || a.i - b.i);
  let dark = -1;
  for (const o of order) {
    if (!(left > 0)) break;
    const slice = need * (o.load / LOAD);
    const take = Math.min(slice, left);
    shed[o.i] = clamp(take / Math.max(1e-9, slice), 0, 0.08);
    left -= shed[o.i] * slice;
    if (dark < 0) dark = o.i;
  }
  return { shed, dark };
}

function anchorOf(s: EconState): number {
  let p = 0, n = 0;
  for (const f of s.firms) if (f.good === 'ELECTRICITY' && !f.closed && f.price > 0) { p += f.price; n++; }
  return n ? p / n : 1;
}

function publish(w: World, st: Grid, marginal: Fuel, vc: number): void {
  const s = econ(w);
  const anchor = anchorOf(s);
  if (!(st.baseVc > 0) && vc > 0) st.baseVc = vc;
  const index = st.baseVc > 0 ? vc / st.baseVc : 1;
  const oil = oilShock(s);
  const embargo = oil >= 0 ? 1.08 : 1;
  st.wholesale = anchor * Math.max(0.4, index) * embargo;
  const squeeze = Math.max(0, regulation(w) - 0.5);
  st.tariff = st.wholesale * (1 - 0.1 * squeeze);
  // The posted power price can run away when a peaker sets it. Firms feel only the oil shock, and only a little.
  st.pass = oil >= 0 ? anchor * 0.012 : 0;
  const moved = st.root > 0 && (st.announced <= 0 || st.marginal !== marginal || Math.abs(st.wholesale / st.announced - 1) > 0.05);
  if (!moved) return;
  const causes = [st.priceEv >= 0 ? st.priceEv : st.root];
  if (oil >= 0) causes.push(oil);
  if (w.day < st.coldUntil && st.coldEv >= 0) causes.push(st.coldEv);
  if (w.day < st.dryUntil && st.dryEv >= 0) causes.push(st.dryEv);
  const good = fuelGood(marginal);
  if (good) {
    for (const f of s.firms) if (f.good === good && f.priceEv !== undefined) { causes.push(f.priceEv); break; }
  }
  const why = oil >= 0 && marginal === 'OIL' ? 'oil is scarce, so the peaking plant' : `the ${marginal === 'HYDRO' ? 'hydro' : marginal.toLowerCase()} plant`;
  st.priceEv = w.events.emit('energy.price', `wholesale power is ${st.wholesale.toFixed(2)} a unit, set by ${why}`, causes.slice(0, 4));
  st.announced = st.wholesale;
  st.marginal = marginal;
}

function weather(w: World, st: Grid): void {
  if (w.day <= 0 || w.day % DAYS_PER_YEAR !== 0) return;
  const r = w.rng('energy:weather');
  if (r.chance(0.28)) {
    st.coldUntil = w.day + 90;
    st.coldEv = w.events.exo('energy.winter', 'a cold winter sets in and households draw more power');
  }
  if (r.chance(0.22)) {
    st.dryUntil = w.day + DAYS_PER_YEAR;
    st.dryEv = w.events.exo('energy.drought', 'a dry year cuts the rivers and the hydro plants run shallow');
  }
}

function agePlants(w: World, st: Grid): void {
  const r = w.rng('energy:outage');
  for (const p of st.plants) {
    if (p.ready > w.day) continue;
    if (p.ready > 0 && p.ready <= w.day) {
      const ev = w.events.emit('energy.online', `${p.name} comes online`, [p.built >= 0 ? p.built : st.root], econ(w).firms[p.utility]?.id);
      p.built = ev;
      p.ready = 0;
    }
    p.age++;
    if (p.out > 0) { p.out--; continue; }
    const pChance = p.outage * (1 + p.age / Math.max(1, p.life));
    if (!r.chance(pChance)) continue;
    p.out = 2 + r.int(6);
    const util = econ(w).firms[p.utility];
    st.genEv = w.events.exo('energy.outage', `${p.name} at ${util?.name ?? 'a utility'} is down for ${p.out} days`);
  }
}

function anger(w: World, st: Grid, dark: number, cause: number): void {
  const s = econ(w), P = s.P, n = DISTRICTS.length;
  if (dark < 0 || !n || !P.n) return;
  const start = (w.day * 17) % P.n;
  let hit = 0;
  for (let k = 0; k < 320 && hit < 4; k++) {
    const i = (start + k) % P.n;
    if (i % n !== dark || !P.alive(i)) continue;
    thought(w, s, i, 12, 'a blackout', cause);
    hit++;
  }
  const pol = w.state.politics as { platformEv?: number; govEv?: number } | undefined;
  const causes = [cause];
  if (pol && pol.platformEv !== undefined && pol.platformEv >= 0) causes.push(pol.platformEv);
  else if (pol && pol.govEv !== undefined && pol.govEv >= 0) causes.push(pol.govEv);
  w.events.emit('energy.blame', `the government is blamed for the blackout in ${DISTRICTS[dark].name}`, causes, 'gov');
}

function plan(w: World, st: Grid): void {
  const need = demand(w, st);
  const run = dispatch(w, st, need);
  const shed = shedFor(need, run.avail);
  st.shed = shed.shed;
  st.capacity = nameplate(st, w.day + 1);
  st.todayDemand = need;
  st.todayGen = run.ran;
  st.todayBlack = shed.dark >= 0 ? 1 : 0;
  st.todayAvail = run.avail;
  st.dark = shed.dark;
  publish(w, st, run.marginal, run.vc);
}

function tally(st: Grid): void {
  if (!(st.todayDemand > 0) && st.yDays === 0 && st.announced <= 0) return;
  if (st.todayDemand > st.yPeak) st.yPeak = st.todayDemand;
  st.yBlack += st.todayBlack;
  st.yPx += st.wholesale;
  for (let i = 0; i < st.todayGen.length; i++) st.yGen[i] += st.todayGen[i];
  st.yDays++;
}

function maker(s: EconState): Firm | undefined {
  let best: Firm | undefined;
  for (const f of s.firms) if (f.good === 'MACHINERY' && !f.closed && (!best || f.eff > best.eff)) best = f;
  return best;
}
function bond(w: World, st: Grid, f: Firm, cents: number, cause: number): boolean {
  const L = w.ledger;
  const id = `ebond:${f.id}:${st.bonds.length}`;
  const a = Math.round(cents);
  if (a <= 0) return true;
  L.define({ id, kind: 'claim', issuer: f.id });
  L.issue(id, BANK, a, 'energy.bond', cause);
  L.issue(DEP, f.id, a, 'energy.bond', cause);
  st.bonds.push({ id, utility: f.idx, rate: econ(w).policyRate + 0.012 });
  w.events.emit('energy.bond', `${f.name} issues ${(a / 100).toFixed(0)} of bonds to build plant`, [cause], f.id);
  return true;
}
function fundPlant(w: World, st: Grid, f: Firm, cents: number, cause: number): boolean {
  const s = econ(w), L = w.ledger;
  if (!maker(s) || !(cents > 0)) return false;
  let have = Math.floor(L.balance(f.id, DEP));
  if (have < cents) {
    const lend = (w.state.banking as { lendFirm?: (w: World, s: EconState, f: Firm, cents: number, cause: number) => boolean } | undefined)?.lendFirm;
    if (lend) lend(w, s, f, cents - have, cause);
    have = Math.floor(L.balance(f.id, DEP));
  }
  if (have < cents && !bond(w, st, f, cents - have, cause)) return false;
  const m = maker(s);
  if (!m) return false;
  return pay(w, f.id, m.id, cents, 'energy.build', cause);
}
function building(st: Grid, utility: number, day: number): boolean {
  for (const p of st.plants) if (p.utility === utility && p.ready > day) return true;
  return false;
}
function invest(w: World, st: Grid): void {
  if (w.day < DAYS_PER_YEAR || w.day % 30 !== 29) return;
  const s = econ(w);
  const need = Math.max(st.todayDemand, 1);
  const cap = Math.max(st.capacity, nameplate(st, w.day));
  const reserve = cap / need - 1;
  const squeeze = regulation(w) > 0.6 && st.tariff < st.wholesale * 0.98;
  if (reserve >= 0.2) return;
  // A tight household cap can delay a plant while the margin is still comfortable.
  if (squeeze && reserve >= 0.08) {
    if (w.day - st.starvedDay < DAYS_PER_YEAR) return;
    const pol = w.state.politics as { platformEv?: number } | undefined;
    const causes = [st.priceEv >= 0 ? st.priceEv : st.root];
    if (pol?.platformEv !== undefined && pol.platformEv >= 0) causes.push(pol.platformEv);
    w.events.emit('energy.starved', `the household tariff is held under the wholesale price, so no new plant is financed (reserve ${(reserve * 100).toFixed(0)}%)`, causes, 'gov');
    st.starvedDay = w.day;
    return;
  }
  const utils: Firm[] = [];
  for (const f of s.firms) if (f.good === 'ELECTRICITY' && !f.closed && !building(st, f.idx, w.day)) utils.push(f);
  if (!utils.length) return;
  utils.sort((a, b) => capFor(st, a.idx, w.day) - capFor(st, b.idx, w.day) || a.idx - b.idx);
  const owner = utils[0];
  const oil = oilShock(s) >= 0;
  let best = TYPES[0];
  let bestScore = Infinity;
  // Hydro's fuel cost is zero, so a pure merit score always picks a six-year dam.
  // Once spare capacity is under a fifth the utility takes the plant that finishes first.
  const urgent = reserve < 0.16;
  for (const t of TYPES) {
    if (t.fuel === 'OIL' && oil) continue;
    const vc = variable(s, t.fuel, t.heat, oil);
    const score = urgent ? t.build * 1e6 + vc : vc * 1e6 + t.build;
    if (score < bestScore) { best = t; bestScore = score; }
  }
  const add = Math.max(1, need * 0.1);
  const cost = Math.round(add * Math.max(st.wholesale, anchorOf(s)) * 90);
  const cause = st.priceEv >= 0 ? st.priceEv : st.root;
  if (!(cost > 0) || !fundPlant(w, st, owner, cost, cause)) return;
  const ready = w.day + best.build * DAYS_PER_YEAR;
  const id = `plt_${best.id.toLowerCase()}_${st.plants.length}`;
  const ev = w.events.emit('energy.build', `${owner.name} starts a ${best.name} of ${add.toFixed(0)} units, online in ${best.build} years`, [cause], owner.id);
  st.plants.push({
    id, name: `${owner.name} ${best.name}`, utility: owner.idx, fuel: best.fuel, cap: add, heat: best.heat,
    age: 0, life: best.life * DAYS_PER_YEAR, out: 0, ready, built: ev, outage: best.outage,
  });
}

function coupons(w: World, st: Grid): void {
  if (w.day % 30 !== 29) return;
  const s = econ(w);
  for (const b of st.bonds) {
    const owed = Math.floor(w.ledger.issued.get(b.id) ?? 0);
    if (owed <= 0) continue;
    const due = Math.round(owed * b.rate / 12);
    const f = s.firms[b.utility];
    if (!f || f.closed || due <= 0) continue;
    pay(w, f.id, BANK, due, 'energy.coupon', st.priceEv >= 0 ? st.priceEv : st.root);
  }
}

function utilities(s: EconState): Firm[] {
  const out: Firm[] = [];
  for (const f of s.firms) if (f.good === 'ELECTRICITY' && !f.closed) out.push(f);
  return out;
}

export const energy: Module = {
  id: 'energy',
  init(w) {
    const s = econ(w);
    const utils = utilities(s);
    if (!utils.length) throw new Error('energy: no electricity utility');
    let recipe = 0, weighted = 0, sales = 0;
    for (const f of s.firms) {
      if (f.closed) continue;
      if (f.good === 'ELECTRICITY') { sales += Math.max(0, f.expSales); continue; }
      const k = GOODS[f.good].inputs.ELECTRICITY ?? 0;
      if (!(k > 0) || !(f.expSales > 0)) continue;
      recipe += f.expSales * k;
      weighted += f.expSales * k * (INTENSITY[f.sector] ?? 1);
    }
    const scale = weighted > 0 ? recipe / weighted : 1;
    const household = Math.max(sales * 0.12, sales - recipe);
    const perPerson = household / Math.max(1, s.P.n);
    const opening = Math.max(sales, recipe + household, 1);
    const total = opening / 0.58;
    const plants: Plant[] = [];
    const ages = [18, 22, 7, 14];
    for (const u of utils) {
      const share = sales > 0 ? Math.max(0.05, u.expSales) / Math.max(sales, 1) : 1 / utils.length;
      for (let t = 0; t < TYPES.length; t++) {
        const type = TYPES[t];
        const copies = type.share >= 0.25 ? 2 : 1;
        for (let c = 0; c < copies; c++) {
          plants.push({
            id: `plt_${u.id}_${type.id.toLowerCase()}_${c}`,
            name: `${u.name} ${type.name}`,
            utility: u.idx,
            fuel: type.fuel,
            cap: total * type.share * share / copies,
            heat: type.heat,
            age: (ages[t] - c * 4) * DAYS_PER_YEAR,
            life: type.life * DAYS_PER_YEAR,
            out: 0,
            ready: 0,
            built: -1,
            outage: type.outage,
          });
        }
      }
    }
    const st: Grid = {
      root: 0, plants, bonds: [], scale, perPerson, baseVc: 1, wholesale: 1, tariff: 1, pass: 0, announced: 0, priceEv: -1,
      marginal: '', coldUntil: -1, dryUntil: -1, coldEv: -1, dryEv: -1, shed: DISTRICTS.map(() => 0),
      capacity: total, todayDemand: 0, todayAvail: total, todayGen: [0, 0, 0, 0], todayBlack: 0, dark: -1,
      yPeak: 0, yBlack: 0, yGen: [0, 0, 0, 0], yPx: 0, yDays: 0, starvedDay: -400, genEv: -1,
    };
    st.baseVc = 0;
    st.wholesale = anchorOf(s);
    st.tariff = st.wholesale;
    st.capacity = nameplate(st, 0);
    w.state.energy = st;
    setPowerHook(rationPower);
    plan(w, st);
  },

  dayClose(w) {
    const st = grid(w);
    if (st.root <= 0) {
      const names = utilities(econ(w)).map((f) => f.name).join(' and ');
      st.root = w.events.emit('energy.open', `${names} run ${st.plants.length} plants across ${DISTRICTS.length} neighbourhoods`, [w.genesis]);
      st.priceEv = st.root;
    }
    if (st.todayBlack && st.dark >= 0) {
      const lost = Math.max(0, st.todayDemand - st.todayAvail);
      const causes = [st.priceEv >= 0 ? st.priceEv : st.root];
      if (w.day < st.coldUntil && st.coldEv >= 0) causes.push(st.coldEv);
      if (w.day < st.dryUntil && st.dryEv >= 0) causes.push(st.dryEv);
      if (st.genEv >= 0) causes.push(st.genEv);
      const ev = w.events.emit(
        'energy.blackout',
        `${DISTRICTS[st.dark].name} goes dark: demand ${st.todayDemand.toFixed(0)} against ${st.todayAvail.toFixed(0)} of plant, ${lost.toFixed(0)} unserved`,
        causes.slice(0, 4),
      );
      anger(w, st, st.dark, ev);
    }
    tally(st);
    weather(w, st);
    agePlants(w, st);
    plan(w, st);
    invest(w, st);
    coupons(w, st);
  },

  stats(w) {
    const st = grid(w);
    const days = Math.max(1, st.yDays);
    const gen = st.yGen.reduce((a, b) => a + b, 0) || 1;
    const pct = (i: number): number => +((st.yGen[i] / gen) * 100).toFixed(1);
    const out = {
      capacity: Math.round(st.capacity),
      peak: Math.round(st.yPeak),
      reserve_pct: +((st.capacity / Math.max(1, st.yPeak) - 1) * 100).toFixed(1),
      power: +(st.yPx / days).toFixed(2),
      blackout: st.yBlack,
      hydro_pct: pct(0), coal_pct: pct(1), gas_pct: pct(2), oil_pct: pct(3),
    };
    st.yPeak = 0; st.yBlack = 0; st.yPx = 0; st.yDays = 0;
    st.yGen = [0, 0, 0, 0];
    return out;
  },
};
