// The rest of the world, and the exchange rate.
// One aggregate economy (not people): its own currency, central bank rate, price level and demand.
// Home and foreign currency meet on a dealer desk. The mid is whatever clears the day's orders
// (exports selling foreign earnings, imports buying foreign currency, carry, funds' foreign bonds).
// It is not a purchasing-power or interest-parity formula. A flow moves the quote; the quote moves the next day's flow.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { GOODS } from '../economy/content.ts';
import { BANK, DEP, type EconState, pay, registerPortHooks } from '../economy/index.ts';

const FXCB = 'fxcb', FXGOV = 'fxgov', DEALER = 'fxdealer', WORLD = 'fxworld';
const FXBOND = 'bond:fx', LOAN = 'loan:fxdealer';

// How far one day's net order (as a fraction of book depth) walks the mid, and the daily cap.
// The cap is a circuit breaker, the way the stock book refuses a print outside its band.
const RATE_SENS = 0.09, RATE_CAP = 0.0008, RATE_CAP_CRISIS = 0.002, CARRY_STEP = 0.04;
const CARRY_BOOK = 0.3; // carry positions, in books of dealer depth, so they can move the rate but not pin it

interface Cfg {
  name: string; currency: string; size: number; startRate: number; startFx: number; inflation: number;
  spread: number; elasticity: number; importShare: number; exportShare: number; carry: number; bondShare: number;
  rateCycle: number; rateAmp: number; activityCycle: number; activityAmp: number; depthDays: number;
  discount: number; hike: number; hikeChance: number; hikeDays: number; recessAt: number;
}
interface Traded { flow: 'import' | 'export'; share: number }
interface Book {
  cfg: Cfg; fx: string; traded: Record<string, Traded>; anchor: Record<string, number>;
  mid: number; mMid0: number; plevel: number; policy: number; announced: number; activity: number; depth: number;
  crisis: boolean; hikeUntil: number; pressure: number;
  mImp: number; mExp: number; mCarry: number; yImp: number; yExp: number; yCarry: number;
  cycleEv: number; policyEv: number; priceEv: number; tradeEv: number; carryEv: number; rateEv: number;
  recessionEv?: number; hikeEv?: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const book = (w: World): Book => w.state.abroad as Book;
const econ = (w: World): EconState => w.state.economy as EconState;

function loadCfg(): { cfg: Cfg; traded: Record<string, Traded> } {
  const dir = process.env.SIM_CONTENT ?? fileURLToPath(new URL('../../content/', import.meta.url));
  const raws = parseRaws(readFileSync(join(dir, 'abroad.txt'), 'utf8'), 'abroad.txt');
  const world = raws.find((r) => r.type === 'WORLD');
  if (!world) throw new Error('abroad.txt: missing [WORLD]');
  const r = new RawReader(world);
  const cfg: Cfg = {
    name: r.str('NAME'), currency: r.str('CURRENCY'), size: r.num('SIZE'), startRate: r.num('START_RATE'),
    startFx: r.num('START_FX'), inflation: r.num('INFLATION'), spread: r.num('SPREAD'), elasticity: r.num('ELASTICITY'),
    importShare: r.num('IMPORT_SHARE'), exportShare: r.num('EXPORT_SHARE'), carry: r.num('CARRY'), bondShare: r.num('BOND_SHARE'),
    rateCycle: r.num('RATE_CYCLE'), rateAmp: r.num('RATE_AMP'), activityCycle: r.num('ACTIVITY_CYCLE'), activityAmp: r.num('ACTIVITY_AMP'),
    depthDays: r.num('DEPTH_DAYS'), discount: r.num('DISCOUNT'), hike: r.num('HIKE'), hikeChance: r.num('HIKE_CHANCE'),
    hikeDays: r.num('HIKE_DAYS'), recessAt: r.num('RECESS_AT'),
  };
  if (!(cfg.startFx > 0) || !(cfg.rateCycle > 0) || !(cfg.activityCycle > 0)) throw new Error(`${r.where()}: rate, cycles and the opening exchange rate must be positive`);
  const traded: Record<string, Traded> = {};
  for (const raw of raws.filter((x) => x.type === 'TRADED')) {
    const t = new RawReader(raw);
    const flow = t.str('FLOW');
    if (flow !== 'import' && flow !== 'export') throw new Error(`${t.where()}: [FLOW] must be import or export`);
    if (!GOODS[raw.id]) throw new Error(`${t.where()}: ${raw.id} is not a good`);
    const share = t.num('SHARE', flow === 'import' ? cfg.importShare : cfg.exportShare);
    if (!(share >= 0) || share > 1) throw new Error(`${t.where()}: [SHARE] must be between 0 and 1`);
    traded[raw.id] = { flow, share };
  }
  return { cfg, traded };
}

function policyNow(st: Book, day: number): number {
  const year = day / DAYS_PER_YEAR;
  const cyc = st.cfg.startRate + st.cfg.rateAmp * Math.sin((2 * Math.PI * year) / st.cfg.rateCycle);
  return Math.max(0, cyc + (day < st.hikeUntil ? st.cfg.hike : 0));
}
function activityAt(st: Book, day: number): number {
  const year = day / DAYS_PER_YEAR;
  return 1 + st.cfg.activityAmp * Math.sin((2 * Math.PI * year) / st.cfg.activityCycle);
}
function foreignPx(st: Book, good: string): number { return (st.anchor[good] ?? 0) * st.plevel; }
function bidAsk(st: Book): { bid: number; ask: number } {
  const h = st.cfg.spread / 2;
  return { bid: st.mid * (1 - h), ask: st.mid * (1 + h) };
}

function dealerPayDep(w: World, to: string, cents: number, reason: string, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  const have = Math.floor(w.ledger.balance(DEALER, DEP));
  if (have < a) {
    const gap = a - have;
    w.ledger.issue(DEP, DEALER, gap, 'fx.credit', cause);
    w.ledger.issue(LOAN, BANK, gap, 'fx.credit', cause);
  }
  return pay(w, DEALER, to, a, reason, cause);
}
function repayDealer(w: World, cause: number): void {
  const loan = Math.floor(w.ledger.issued.get(LOAN) ?? 0);
  if (loan <= 0) return;
  const r = Math.min(loan, Math.floor(w.ledger.balance(DEALER, DEP)));
  if (r <= 0) return;
  if (pay(w, DEALER, BANK, r, 'fx.repay', cause)) w.ledger.redeem(LOAN, BANK, r, 'fx.repay', cause);
}
function ensureUsd(w: World, st: Book, usd: number, cause: number): void {
  const have = Math.floor(w.ledger.balance(DEALER, st.fx));
  if (have < usd) w.ledger.issue(st.fx, DEALER, usd - have, 'fx.restock', cause);
}
/** Actor sells foreign currency to the dealer and is paid in home deposits. Returns home cents paid. */
function sellUsd(w: World, actor: string, usd: number, cause: number, reason: string): number {
  const st = book(w);
  usd = Math.min(Math.floor(usd), Math.floor(w.ledger.balance(actor, st.fx)));
  if (usd <= 0) return 0;
  const home = Math.round(usd * bidAsk(st).bid);
  if (home <= 0) return 0;
  if (!w.ledger.move(st.fx, actor, DEALER, usd, reason, cause)) return 0;
  if (!dealerPayDep(w, actor, home, reason, cause)) {
    w.ledger.move(st.fx, DEALER, actor, usd, reason, cause);
    return 0;
  }
  st.pressure -= usd;
  return home;
}
/** Payer buys foreign currency from the dealer; the foreign cents are delivered to `payee`. */
function buyUsd(w: World, payer: string, payee: string, usd: number, cause: number, reason: string): { usd: number; home: number } {
  const st = book(w);
  const ask = bidAsk(st).ask;
  usd = Math.floor(usd);
  if (usd <= 0 || !(ask > 0)) return { usd: 0, home: 0 };
  let home = Math.round(usd * ask);
  const cash = Math.floor(w.ledger.balance(payer, DEP));
  if (cash < home) { usd = Math.floor(cash / ask); home = Math.round(usd * ask); }
  if (usd <= 0 || home <= 0) return { usd: 0, home: 0 };
  ensureUsd(w, st, usd, cause);
  if (!pay(w, payer, DEALER, home, reason, cause)) return { usd: 0, home: 0 };
  if (!w.ledger.move(st.fx, DEALER, payee, usd, reason, cause)) {
    pay(w, DEALER, payer, home, reason, cause);
    return { usd: 0, home: 0 };
  }
  st.pressure += usd;
  return { usd, home };
}
function bondBuy(w: World, st: Book, actor: string, usd: number, cause: number): boolean {
  usd = Math.min(Math.floor(usd), Math.floor(w.ledger.balance(actor, st.fx)));
  if (usd <= 0) return false;
  if (!w.ledger.move(st.fx, actor, FXGOV, usd, 'fx.bond', cause)) return false;
  w.ledger.issue(FXBOND, actor, usd, 'fx.bond', cause);
  return true;
}
function bondSell(w: World, st: Book, actor: string, usd: number, cause: number): boolean {
  usd = Math.min(Math.floor(usd), Math.floor(w.ledger.balance(actor, FXBOND)));
  if (usd <= 0) return false;
  const have = Math.floor(w.ledger.balance(FXGOV, st.fx));
  if (have < usd) w.ledger.issue(st.fx, FXGOV, usd - have, 'fx.monetise', cause);
  if (!w.ledger.move(st.fx, FXGOV, actor, usd, 'fx.bond', cause)) return false;
  if (!w.ledger.redeem(FXBOND, actor, usd, 'fx.bond', cause)) {
    w.ledger.move(st.fx, actor, FXGOV, usd, 'fx.bond', cause);
    return false;
  }
  return true;
}
function noteCarry(st: Book, home: number, outflow: boolean): void {
  const s = outflow ? -home : home;
  st.mCarry += s; st.yCarry += s;
}

function exportQty(w: World, good: string, homePx: number): number {
  const st = book(w), spec = st.traded[good];
  if (!spec || spec.flow !== 'export' || !(homePx > 0) || !(st.mid > 0)) return 0;
  const fxPx = foreignPx(st, good);
  if (!(fxPx > 0)) return 0;
  // Home price in foreign cents. A weaker home currency (higher mid) makes this smaller, so orders rise.
  const rel = fxPx / (homePx / st.mid);
  let base = 0;
  for (const f of econ(w).firms) if (f.good === good && !f.closed) base += f.expSales;
  const q = base * spec.share * st.activity * rel ** st.cfg.elasticity;
  return q > 1e-6 ? q : 0;
}
function fundBuyer(w: World, cents: number, cause: number): void {
  const st = book(w);
  const need = Math.round(cents);
  if (need <= 0) return;
  const have = Math.floor(w.ledger.balance(WORLD, DEP));
  if (have >= need) return;
  const bid = bidAsk(st).bid;
  if (!(bid > 0)) return;
  sellUsd(w, WORLD, Math.ceil((need - have) / bid), cause, 'fx.export');
}
function noteExport(w: World, cents: number): void {
  const a = Math.round(cents);
  if (a <= 0) return;
  const st = book(w);
  st.mExp += a; st.yExp += a;
}
function landed(w: World, good: string, dom: number): number {
  const st = book(w), spec = st.traded[good];
  if (!spec || spec.flow !== 'import' || !(dom > 0)) return dom;
  const home = foreignPx(st, good) * bidAsk(st).ask;
  if (!(home > 0) || !(home < dom)) return dom;
  return spec.share * home + (1 - spec.share) * dom;
}
function importFill(w: World, buyer: string, good: string, qty: number, dom: number, cause: number): { got: number; spent: number } {
  const st = book(w), spec = st.traded[good];
  if (!spec || spec.flow !== 'import' || !(qty > 0) || !(dom > 0)) return { got: 0, spent: 0 };
  const fxPx = foreignPx(st, good), ask = bidAsk(st).ask, homePx = fxPx * ask;
  if (!(fxPx > 0) || !(homePx < dom)) return { got: 0, spent: 0 };
  let usd = Math.round(qty * spec.share * fxPx);
  if (usd < 1) return { got: 0, spent: 0 };
  const got = buyUsd(w, buyer, WORLD, usd, cause, 'fx.import');
  if (got.usd < 1) return { got: 0, spent: 0 };
  const q = got.usd / fxPx;
  const gid = 'good:' + good;
  w.ledger.produce(gid, WORLD, q, 'trade.import', cause);
  w.ledger.move(gid, WORLD, buyer, q, 'trade.import', cause);
  w.ledger.consume(gid, buyer, q, 'production.input', cause);
  st.mImp += got.home; st.yImp += got.home;
  return { got: q, spent: got.home };
}

function portValue(w: World, st: Book, id: string): number {
  const m = w.state.markets as { stocks?: { instr: string; last: number }[] } | undefined;
  let v = w.ledger.balance(id, DEP) + (w.ledger.balance(id, st.fx) + w.ledger.balance(id, FXBOND)) * st.mid;
  for (const s of m?.stocks ?? []) v += w.ledger.balance(id, s.instr) * s.last;
  return v;
}
function stockValue(w: World, id: string): number {
  const m = w.state.markets as { stocks?: { instr: string; last: number }[] } | undefined;
  let v = 0;
  for (const s of m?.stocks ?? []) v += w.ledger.balance(id, s.instr) * s.last;
  return v;
}
function carry(w: World, st: Book): void {
  const gap = st.policy - econ(w).policyRate;
  const cause = st.policyEv;
  const share = gap > 0 ? Math.min(0.1, st.cfg.bondShare * (gap / 0.01)) : 0;
  const funds = (w.state.markets as { funds?: { id: string }[] } | undefined)?.funds ?? [];
  const capEach = funds.length && st.mid > 0 ? (st.depth * CARRY_BOOK) / st.mid / funds.length : 0;
  for (const f of funds) {
    const id = f.id;
    const port = portValue(w, st, id);
    const bonds = w.ledger.balance(id, FXBOND);
    const target = st.mid > 0 ? Math.min(port * share / st.mid, capEach) : 0;
    const loose = Math.floor(w.ledger.balance(id, st.fx));
    if (target > bonds + 1) {
      let want = Math.floor((target - bonds) * CARRY_STEP);
      if (loose > 0) {
        const use = Math.min(loose, want);
        if (use > 0 && bondBuy(w, st, id, use, cause)) want -= use;
      }
      if (want > 0) {
        const room = Math.max(0, Math.floor(w.ledger.balance(id, DEP)) - Math.floor(stockValue(w, id) * 0.05));
        const usd = Math.min(want, Math.floor(room / bidAsk(st).ask));
        if (usd >= 1) {
          const got = buyUsd(w, id, id, usd, cause, 'fx.carry');
          if (got.usd > 0) { noteCarry(st, got.home, true); bondBuy(w, st, id, got.usd, cause); }
        }
      }
    } else if (bonds > target + 1) {
      const qty = Math.floor((bonds - target) * Math.max(CARRY_STEP, 0.08));
      if (qty >= 1 && bondSell(w, st, id, qty, cause)) {
        const home = sellUsd(w, id, qty, cause, 'fx.carry');
        if (home > 0) noteCarry(st, home, false);
      }
    } else if (loose > 0) {
      const home = sellUsd(w, id, loose, cause, 'fx.carry');
      if (home > 0) noteCarry(st, home, false);
    }
  }
  const held = w.ledger.balance(WORLD, DEP);
  if (gap < 0) {
    const targetDep = st.depth * Math.min(CARRY_BOOK, st.cfg.carry * (-gap / 0.01));
    if (held + 1 < targetDep) {
      const usd = Math.min(Math.floor(((targetDep - held) * CARRY_STEP) / bidAsk(st).bid), Math.floor(w.ledger.balance(WORLD, st.fx)));
      if (usd >= 1) { const home = sellUsd(w, WORLD, usd, cause, 'fx.carry'); if (home > 0) noteCarry(st, home, false); }
    } else if (held > targetDep * 1.05 + 100) {
      const usd = Math.floor((held - targetDep) * 0.08 / bidAsk(st).ask);
      if (usd >= 1) { const got = buyUsd(w, WORLD, WORLD, usd, cause, 'fx.carry'); if (got.home > 0) noteCarry(st, got.home, true); }
    }
  } else if (held > 1000) {
    const usd = Math.floor(held * 0.08 / bidAsk(st).ask);
    if (usd >= 1) { const got = buyUsd(w, WORLD, WORLD, usd, cause, 'fx.carry'); if (got.home > 0) noteCarry(st, got.home, true); }
  }
}

function rollShocks(w: World, st: Book): void {
  const prev = st.activity;
  const next = activityAt(st, w.day);
  if (next < st.cfg.recessAt && prev >= st.cfg.recessAt) {
    st.recessionEv = w.events.exo('fx.recession', `a foreign recession: demand is ${(next * 100).toFixed(0)}% of trend, so orders for home goods are cut`);
  } else if (next >= st.cfg.recessAt && prev < st.cfg.recessAt) {
    w.events.emit('fx.recovery', `foreign demand is back to ${(next * 100).toFixed(0)}% of trend`, [st.recessionEv ?? st.cycleEv]);
  }
  st.activity = next;
  if (w.day > 0 && w.day % DAYS_PER_YEAR === 0 && w.day >= st.hikeUntil && w.rng('fx:hike').chance(st.cfg.hikeChance)) {
    st.hikeEv = w.events.exo('fx.hike', `the foreign central bank hikes ${(st.cfg.hike * 100).toFixed(2)} percentage points after a funding squeeze`);
    st.hikeUntil = w.day + st.cfg.hikeDays;
    const r = policyNow(st, w.day);
    st.policy = r; st.announced = r;
    st.policyEv = w.events.emit('fx.policy', `foreign central bank rate jumps to ${(r * 100).toFixed(2)}%`, [st.hikeEv, st.cycleEv], FXCB);
  }
  st.policy = policyNow(st, w.day);
  st.crisis = w.day < st.hikeUntil || st.activity < st.cfg.recessAt;
}
function clearRate(st: Book): void {
  const cap = st.crisis ? RATE_CAP_CRISIS : RATE_CAP;
  const impact = st.depth > 0 ? (st.pressure / st.depth) * RATE_SENS : 0;
  const step = clamp(impact, -cap, cap);
  if (step !== 0) st.mid = clamp(st.mid * (1 + step), 0.25, 4);
  st.pressure = 0;
}
function coupons(w: World, st: Book): void {
  if (!(st.policy > 0)) return;
  for (const [id, face] of w.ledger.holders(FXBOND)) {
    const c = Math.round(face * st.policy / 12);
    if (c <= 0) continue;
    const have = Math.floor(w.ledger.balance(FXGOV, st.fx));
    if (have < c) w.ledger.issue(st.fx, FXGOV, c - have, 'fx.monetise', st.policyEv);
    w.ledger.move(st.fx, FXGOV, id, c, 'fx.coupon', st.policyEv);
  }
}
function millions(cents: number): string { return (cents / 1e8).toFixed(3); }

function monthStory(w: World, st: Book): void {
  const r = st.policy;
  if (Math.abs(r - st.announced) >= 0.0002) {
    const causes = [st.cycleEv];
    if (w.day < st.hikeUntil && st.hikeEv !== undefined) causes.unshift(st.hikeEv);
    st.policyEv = w.events.emit('fx.policy', `foreign central bank rate ${(st.announced * 100).toFixed(2)}% -> ${(r * 100).toFixed(2)}%`, causes, FXCB);
    st.announced = r;
  }
  const priceCauses = [st.cycleEv];
  if (st.activity < st.cfg.recessAt && st.recessionEv !== undefined) priceCauses.push(st.recessionEv);
  st.priceEv = w.events.emit('fx.prices', `foreign prices stand at ${st.plevel.toFixed(3)} times the open; demand is ${(st.activity * 100).toFixed(1)}% of trend`, priceCauses);
  const exp = st.mExp / 30, imp = st.mImp / 30, bal = exp - imp;
  const side = bal >= 0 ? 'surplus' : 'deficit';
  st.tradeEv = w.events.emit('fx.trade', `exports ${millions(exp)}M a day, imports ${millions(imp)}M, trade ${side} ${millions(Math.abs(bal))}M`, [st.priceEv]);
  const flow = st.mCarry / 30;
  const home = econ(w).policyRate;
  const way = flow > 1000 ? 'into the home currency' : flow < -1000 ? 'out toward the higher foreign rate' : 'neither way';
  const carryCauses = [st.policyEv, econ(w).rateEv];
  st.carryEv = w.events.emit('fx.carry', `carry moved ${millions(Math.abs(flow))}M a day ${way} (foreign ${(st.policy * 100).toFixed(2)}%, home ${(home * 100).toFixed(2)}%)`, carryCauses);
  const ch = st.mid / st.mMid0 - 1;
  const dir = ch > 0.00005 ? 'weakened' : ch < -0.00005 ? 'strengthened' : 'held';
  const msg = dir === 'held'
    ? `the exchange rate held at ${st.mid.toFixed(4)} home per ${st.cfg.currency}, the price that cleared this month's orders`
    : `the home currency ${dir} ${(Math.abs(ch) * 100).toFixed(2)}% to ${st.mid.toFixed(4)} per ${st.cfg.currency}, the price that cleared this month's orders`;
  st.rateEv = w.events.emit('fx.rate', msg, [st.tradeEv, st.carryEv]);
  st.mMid0 = st.mid; st.mImp = 0; st.mExp = 0; st.mCarry = 0;
}

function assetsHome(w: World, st: Book): number {
  const skip = new Set([FXCB, FXGOV, WORLD, DEALER]);
  let usd = 0;
  for (const [id, v] of w.ledger.holders(st.fx)) if (!skip.has(id)) usd += v;
  for (const [id, v] of w.ledger.holders(FXBOND)) if (!skip.has(id)) usd += v;
  return usd * st.mid;
}

export const abroad: Module = {
  id: 'abroad',

  init(w) {
    const { cfg, traded } = loadCfg();
    const L = w.ledger, g = w.genesis;
    const fx = 'FX:' + cfg.currency;
    L.addActor(FXCB, 'centralbank'); L.addActor(FXGOV, 'government'); L.addActor(DEALER, 'bank'); L.addActor(WORLD, 'foreign');
    L.define({ id: fx, kind: 'money', issuer: FXCB });
    L.define({ id: FXBOND, kind: 'claim', issuer: FXGOV });
    L.define({ id: LOAN, kind: 'claim', issuer: DEALER });

    const anchor: Record<string, number> = {};
    const s = econ(w);
    const sum: Record<string, { p: number; n: number }> = {};
    for (const f of s.firms) {
      const a = sum[f.good] ?? { p: 0, n: 0 };
      a.p += f.price; a.n++; sum[f.good] = a;
    }
    for (const [good, a] of Object.entries(sum)) anchor[good] = (a.p / a.n) / cfg.startFx * (1 - cfg.discount);

    let expV = 0, impV = 0;
    for (const f of s.firms) {
      const t = traded[f.good];
      if (t?.flow === 'export') expV += f.expSales * f.price * t.share;
      const inputs = GOODS[f.good].inputs;
      for (const [gds, k] of Object.entries(inputs)) {
        const ti = traded[gds];
        if (ti?.flow !== 'import') continue;
        const home = sum[gds] ? sum[gds].p / sum[gds].n : 0;
        impV += f.expSales * k * ti.share * home * (1 - cfg.discount);
      }
    }
    const depth = Math.max(1, Math.max(expV, impV) * cfg.depthDays);
    const st: Book = {
      cfg, fx, traded, anchor, mid: cfg.startFx, mMid0: cfg.startFx, plevel: 1, policy: cfg.startRate, announced: cfg.startRate,
      activity: 1 + cfg.activityAmp * Math.sin(0), depth, crisis: false, hikeUntil: 0, pressure: 0,
      mImp: 0, mExp: 0, mCarry: 0, yImp: 0, yExp: 0, yCarry: 0,
      cycleEv: 0, policyEv: 0, priceEv: 0, tradeEv: 0, carryEv: 0, rateEv: 0,
    };
    st.activity = activityAt(st, 0);
    w.state.abroad = st;

    const usdDepth = Math.max(1, Math.round(depth / cfg.startFx));
    L.issue(fx, DEALER, usdDepth * 2, 'genesis', g);
    L.issue(fx, WORLD, Math.round(usdDepth * cfg.size), 'genesis', g);
    L.issue(fx, FXGOV, Math.round(usdDepth * 0.25), 'genesis', g);

    st.cycleEv = w.events.exo('fx.cycle', `${cfg.name}: its prices, policy rate and demand follow their own cycle`);
    st.policyEv = st.cycleEv; st.priceEv = st.cycleEv; st.tradeEv = st.cycleEv; st.carryEv = st.cycleEv;
    st.rateEv = w.events.emit('fx.rate', `the exchange rate opens at ${st.mid.toFixed(4)} home per ${cfg.currency}`, [st.cycleEv]);
  },

  tick(w, t) {
    if (t !== 0) return;
    rollShocks(w, book(w));
  },

  dayClose(w) {
    const st = book(w);
    carry(w, st);
    clearRate(st);
    repayDealer(w, st.policyEv);
    const hot = st.activity < 1 ? st.cfg.inflation * Math.max(0.25, st.activity) : st.cfg.inflation;
    st.plevel *= 1 + hot / DAYS_PER_YEAR;
  },

  monthEnd(w) {
    const st = book(w);
    coupons(w, st);
    monthStory(w, st);
  },

  stats(w) {
    const st = book(w);
    const out = {
      fx: +st.mid.toFixed(4),
      exports_M: +(st.yExp / DAYS_PER_YEAR / 1e8).toFixed(3),
      imports_M: +(st.yImp / DAYS_PER_YEAR / 1e8).toFixed(3),
      tradeBal_M: +((st.yExp - st.yImp) / DAYS_PER_YEAR / 1e8).toFixed(3),
      fxAssets_M: +(assetsHome(w, st) / 1e8).toFixed(3),
      carry_M: +(st.yCarry / DAYS_PER_YEAR / 1e8).toFixed(3),
    };
    st.yExp = 0; st.yImp = 0; st.yCarry = 0;
    return out;
  },
};

registerPortHooks({ buyer: WORLD, exportQty, fundBuyer, noteExport, importFill, landed });
