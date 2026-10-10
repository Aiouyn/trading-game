// Huge-money measurements (X3, Tape's hunts; owner: Tape). Reproduces the tables in the hunts commit body for one seed.
// Usage: npx tsx scripts/balance/huge-money.ts [--seed tape-01] [--cash 1e12,1e15] [--flatDays 200]
// Per starting cash, on universeConfig at 24 ticks a game day for one game year (the trading of src/engine/huge.test.ts):
//   year      mid equity, liquidation equity, peak, cash, fees, price multiples, ADV-days held, orders and fills
//   push      the permanent-impact bound (one account buying 72 ADV of FROG a day) against the realized daily push
//   paired    the account-induced log move: the same seed run without the account, subtracted day by day
//   realize   every unit sold at market (3 ADV per tick cap binds), from the year-end state and from the tick where
//             liquidation equity peaked; cash after realizing is the gain you can keep. Mid marks are not realizable.
//   rank      rankFor(peak) from src/content/lifestyle.ts (the top rank starts at 5e10 of net worth)
import { createWorld, step } from '../../src/engine/sim';
import { universeConfig } from '../../src/engine/universe';
import { estimateFill, liquidationEquity, openAccount, permanentMove, placeOrder, portfolio } from '../../src/engine/trading';
import { freeCash, freeQty, mean, median, realizeToFlat } from '../../src/engine/hunt-helpers';
import { depthByPool, ecologyConfig, explainMove, PENSION_KNEE_ADV } from '../../src/engine/ecology';
import { rankFor } from '../../src/content/lifestyle';
import type { WorldConfig, WorldState } from '../../src/engine/types';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const seed = arg('seed', 'tape-01');
const cashes = arg('cash', '1e12,1e15').split(',').map(Number);
const FLAT_DAYS = Number(arg('flatDays', '200'));
const TPD = Number(arg('tpd', '24'));
const DAYS = 252;
const PID = 'huge';
const ROTATION = ['FROG', 'HLCN', 'SYN']; // the same rotation as huge.test.ts
// --pensionMax X sets the pension pool's per-day cap (ecology.pensionMaxAdv; default: the shipped cap, derived in ecology.ts). The log keeps the
// whole year so the pension cause can be scanned on every day (see pensionScan).
const cfg0 = universeConfig({ ticksPerDay: TPD });
const pensionMax = arg('pensionMax', '');
const cfg: WorldConfig = { ...cfg0, ecology: { ...cfg0.ecology, logDays: DAYS + 5, ...(pensionMax ? { pensionMaxAdv: Number(pensionMax) } : {}) } };

const idx = (s: WorldState, id: string) => s.config.assets.findIndex((a) => a.id === id);
const lnMove = (s: WorldState, id: string) => s.assets[idx(s, id)]!.lnP - Math.log(s.config.assets[idx(s, id)]!.initialPrice);
const advOf = (s: WorldState, id: string) => s.config.assets[idx(s, id)]!.advNotional ?? 1e9;
const fx = (x: number) => (Number.isFinite(x) ? x.toExponential(4) : String(x));

/** the largest quantity whose estimated total fits in `budget` (bisection), at most 2^53 units; whole units if asked */
function largestBuy(s: WorldState, assetId: string, budget: number, whole: boolean): number {
  const px = Math.exp(s.assets[idx(s, assetId)]!.lnP);
  const fits = (q: number) => estimateFill(s, { assetId, side: 'buy', qty: q }).total <= budget;
  let lo = 0;
  let hi = Math.min(Number.MAX_SAFE_INTEGER, (2 * budget) / px);
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return whole ? Math.floor(lo) : lo;
}

interface DayRec {
  liq: number; // liquidation equity at the end of the day
  mid: number; // mid equity at the end of the day
  ln: Record<string, number>; // lnP minus ln(initial price) per rotation asset
  push: number; // FROG log move during the day (account run)
  bound: number; // permanentMove bound for one account buying 72 ADV of FROG at the day's start state
}

interface YearRun {
  s: WorldState;
  orders: number;
  fills: number;
  rejects: Record<string, number>;
  days: DayRec[];
  peakLiq: number;
  peakTick: number;
  peakState: WorldState;
  minLiq: number;
  maxAbs: number;
  maxAt: string;
  /** the world at the close of each day listed in `capture` */
  captured: Map<number, WorldState>;
}

/** the game year of huge.test.ts, plus per-tick liquidation tracking and per-day records */
function runYear(cash: number, capture: number[] = []): YearRun {
  let s: WorldState = openAccount(createWorld(seed, cfg), PID, cash);
  const captured = new Map<number, WorldState>();
  let orders = 0;
  let fills = 0;
  const rejects: Record<string, number> = {};
  const days: DayRec[] = [];
  let peakLiq = -Infinity;
  let peakTick = 0;
  let peakState = s;
  let minLiq = Infinity;
  let maxAbs = 0;
  let maxAt = '';
  let bought = '';
  const place = (assetId: string, side: 'buy' | 'sell', qty: number) => {
    const r = placeOrder(s, { playerId: PID, assetId, side, type: 'market', qty });
    orders++;
    if (r.order.status === 'rejected') rejects[r.order.rejectReason ?? 'unknown'] = (rejects[r.order.rejectReason ?? 'unknown'] ?? 0) + 1;
    s = r.state;
  };
  for (let d = 0; d < DAYS; d++) {
    const buyDay = d % 2 === 0;
    if (buyDay) bought = ROTATION[(d / 2) % ROTATION.length]!;
    const dayStart = s;
    const whole = s.config.assets[idx(s, bought)]!.qtyStep === 1;
    const lnFrog0 = lnMove(s, 'FROG');
    for (let t = 0; t < TPD; t++) {
      const ticksLeft = TPD - t;
      if (buyDay) {
        const affordable = largestBuy(s, bought, 0.97 * freeCash(s, PID), whole);
        const want = whole ? Math.floor(affordable / ticksLeft) : affordable / ticksLeft;
        if (want > 0) place(bought, 'buy', want);
      } else {
        const held = freeQty(s, PID, bought);
        const want = whole ? Math.floor(held / ticksLeft) : held / ticksLeft;
        if (want > 0) place(bought, 'sell', want);
      }
      const res = step(s);
      s = res.state;
      fills += res.fills.filter((f) => f.playerId === PID).length;
      const liq = liquidationEquity(s, PID);
      if (liq > peakLiq) { peakLiq = liq; peakTick = s.tick; peakState = s; }
      minLiq = Math.min(minLiq, liq);
      for (const id of ROTATION) {
        const m = Math.abs(lnMove(s, id));
        if (m > maxAbs) { maxAbs = m; maxAt = `${id} tick ${s.tick}`; }
      }
    }
    const ln: Record<string, number> = {};
    for (const id of ROTATION) ln[id] = lnMove(s, id);
    days.push({
      liq: liquidationEquity(s, PID),
      mid: portfolio(s, PID).equity,
      ln,
      push: ln.FROG! - lnFrog0,
      bound: permanentMove(dayStart, idx(dayStart, 'FROG'), 'buy', 0, 72 * advOf(dayStart, 'FROG')),
    });
    if (capture.includes(d)) captured.set(d, s);
  }
  return { s, orders, fills, rejects, days, peakLiq, peakTick, peakState, minLiq, maxAbs, maxAt, captured };
}

/** index of the day with the largest and the smallest FROG log move */
function extremes(days: DayRec[]): { up: number; dn: number } {
  const up = days.reduce((b, x, d) => (x.push > days[b]!.push ? d : b), 0);
  const dn = days.reduce((b, x, d) => (x.push < days[b]!.push ? d : b), 0);
  return { up, dn };
}

/** the same seed with no account: end-of-day rotation log prices, for the paired diagnostic */
function runCounterfactual(): Record<string, number>[] {
  let s: WorldState = createWorld(seed, cfg);
  const out: Record<string, number>[] = [];
  for (let d = 0; d < DAYS; d++) {
    for (let t = 0; t < TPD; t++) s = step(s).state;
    const ln: Record<string, number> = {};
    for (const id of ROTATION) ln[id] = lnMove(s, id);
    out.push(ln);
  }
  return out;
}


/**
 * The pension pool's close on FROG over the year, from the ecology log (every closed day, as logDays keeps the year):
 * the largest pension buy and sell in ADV, the day of each, and the FROG log move that day. Also the largest desired
 * pension flow before the cap, so the cap's effect is visible (desire = pool's own order, cap applied after).
 */
/**
 * The pension pool's FROG position over the year, rebuilt from its own orders with the engine's update (ecologyDay: pos = pos x d
 * + order, the order after the cap and the damping, which is what the log's desired.pension holds). Reports the peak against the
 * capacity knee (size / capacity = 2.5 ADV) and the position at each quarter end (V1-PHASE1 F16: the cap must keep the peak at or
 * below the knee over consecutive quarters).
 */
function pensionPosition(s: WorldState, fi: number): void {
  const ec = ecologyConfig(cfg);
  const d = Math.pow(0.5, 1 / ec.halfLives.pension);
  let pos = 0, peak = 0, peakDay = -1;
  const quarterEnds: string[] = [];
  for (const day of s.ecology?.log ?? []) {
    const a = day.assets[fi];
    if (!a) continue;
    pos = pos * d + a.desired.pension;
    if (Math.abs(pos) > Math.abs(peak)) { peak = pos; peakDay = day.day; }
    if (day.day % ec.quarterDays === ec.quarterDays - 1) quarterEnds.push(fx(pos));
  }
  console.log(`pension position, FROG, rebuilt from the orders: peak ${fx(peak)} ADV on day ${peakDay + 1} (knee ${fx(PENSION_KNEE_ADV)} ADV, cap ${fx(ec.pensionMaxAdv)} ADV a day); at quarter ends ${quarterEnds.join(', ')}`);
}

function pensionScan(s: WorldState): void {
  const fi = idx(s, 'FROG');
  let up = { v: 0, day: -1, pc: 0 }, dn = { v: 0, day: -1, pc: 0 }, nz = 0, sumAbs = 0, pcSum = 0;
  for (const day of s.ecology?.log ?? []) {
    const a = day.assets[fi];
    if (!a) continue;
    const p = a.desired.pension;
    if (p !== 0) { nz++; sumAbs += Math.abs(p); }
    pcSum += a.cause.pension;
    if (p > up.v) up = { v: p, day: day.day, pc: a.cause.pension };
    if (p < dn.v) dn = { v: p, day: day.day, pc: a.cause.pension };
  }
  console.log(`pension (FROG, whole year): days with a pension order ${nz}, sum of |order| ${fx(sumAbs)} ADV, sum of pension log moves ${fx(pcSum)}; largest buy ${fx(up.v)} ADV on day ${up.day + 1} (pension log move ${fx(up.pc)}); largest sell ${fx(dn.v)} ADV on day ${dn.day + 1} (pension log move ${fx(dn.pc)})`);
  // idle days: the rotation (runYear) trades FROG on days 0-1, 6-7, 12-13, ... (the pair floor(d/2) % 3 == 0), so the other days
  // the account placed no FROG order. The round 3 whale check's +0.445 log pension push was on an idle day (day 250).
  const idle = (day: number) => ROTATION[Math.floor(day / 2) % ROTATION.length] !== 'FROG';
  let iUp = { v: 0, day: -1, pc: 0 }, iDn = { v: 0, day: -1, pc: 0 }, iMax = { pc: 0, day: -1 }, iNz = 0, iSum = 0;
  for (const day of s.ecology?.log ?? []) {
    if (!idle(day.day)) continue;
    const a = day.assets[fi];
    if (!a) continue;
    const p = a.desired.pension;
    if (p !== 0) iNz++;
    iSum += a.cause.pension;
    if (p > iUp.v) iUp = { v: p, day: day.day, pc: a.cause.pension };
    if (p < iDn.v) iDn = { v: p, day: day.day, pc: a.cause.pension };
    if (Math.abs(a.cause.pension) > Math.abs(iMax.pc)) iMax = { pc: a.cause.pension, day: day.day };
  }
  pensionPosition(s, fi);
  console.log(`pension, account-idle FROG days (no FROG order that day): pension orders on ${iNz} days, sum of pension log moves ${fx(iSum)}; largest buy ${fx(iUp.v)} ADV on day ${iUp.day + 1} (log ${fx(iUp.pc)}); largest sell ${fx(iDn.v)} ADV on day ${iDn.day + 1} (log ${fx(iDn.pc)}); largest |pension log move| ${fx(iMax.pc)} on day ${iMax.day + 1}`);
}

function report(cash: number): void {
  console.log(`\n== $${cash.toExponential(0)} cash, ${seed}, universe, ${TPD} ticks a game day, ${DAYS} game days ==`);
  const t0 = performance.now();
  const { up, dn } = extremes(runYear(cash).days);
  const r = runYear(cash, [up, dn]); // second pass keeps the two worlds the largest daily moves close on
  const s = r.s;
  const p = portfolio(s, PID);
  const a = s.accounts[PID]!;
  console.log(`year: orders ${r.orders}, fills ${r.fills}, rejects ${JSON.stringify(r.rejects)} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(`mid equity at year end        ${fx(p.equity)}`);
  console.log(`liquidation equity at year end ${fx(liquidationEquity(s, PID))}  (liquidation / mid ${fx(liquidationEquity(s, PID) / p.equity)})`);
  console.log(`liquidation equity, lowest    ${fx(r.minLiq)}`);
  console.log(`engine peak equity (year end) ${fx(p.peakEquity)}; liquidation peak ${fx(r.peakLiq)} at tick ${r.peakTick} (day ${Math.floor((r.peakTick - 1) / TPD) + 1}); rank ${rankFor(r.peakLiq).id} ${rankFor(r.peakLiq).name} (start cash rank ${rankFor(cash).id})`);
  console.log(`cash at year end ${fx(a.cash)}, fees ${fx(p.feesPaid)}, realized ${fx(p.realizedPnl)}, unrealized ${fx(p.unrealizedPnl)}`);
  for (const id of ROTATION) {
    const i = idx(s, id);
    const q = a.positions[id]?.qty ?? 0;
    const px = Math.exp(s.assets[i]!.lnP);
    console.log(`asset ${id}: multiple of start ${fx(Math.exp(lnMove(s, id)))}, held ${fx(q)} units = ${fx((q * px) / advOf(s, id))} ADV-days`);
  }
  console.log(`largest |lnP - ln P0| over the year: ${r.maxAbs.toFixed(2)} at ${r.maxAt}`);

  pensionScan(s);
  // permanent-impact bound against the realized push (FROG, the most-pushed asset)
  const s0 = createWorld(seed, cfg);
  console.log(`push: bound at the start state for 72 ADV a day: ${ROTATION.map((id) => `${id} ${fx(permanentMove(s0, idx(s0, id), 'buy', 0, 72 * advOf(s0, id)))}`).join(', ')} (log)`);
  const bounds = r.days.map((x) => x.bound);
  const buyDays = r.days.filter((_, d) => d % 2 === 0).map((x) => x.bound);
  console.log(`push: permanentMove bound per day for 72 ADV of FROG: median ${bounds.length ? fx(median(bounds)) : 'n/a'}, max ${fx(Math.max(...bounds))} (log); summed over 126 buy days ${fx(buyDays.reduce((x, y) => x + y, 0))}`);
  console.log(`push: realized FROG log move per day: mean ${fx(mean(r.days.map((x) => x.push)))}; largest up ${fx(r.days[up]!.push)} on day ${up + 1} (bound that day ${fx(r.days[up]!.bound)}); largest down ${fx(r.days[dn]!.push)} on day ${dn + 1} (bound ${fx(r.days[dn]!.bound)})`);
  // the close is the ecology's: explain the two largest days by cause (pools, own flow, maker, news), closed days only
  for (const [label, d] of [['largest up', up], ['largest down', dn]] as const) {
    const st = r.captured.get(d);
    if (!st) continue;
    try {
      const ex = explainMove(st, 'FROG', d, d);
      const parts = Object.entries(ex.parts).map(([k, v]) => `${k} ${fx(v as number)}`).join(', ');
      const dp = depthByPool(st, 'FROG', d);
      console.log(`cause ${label} (day ${d + 1}): explainMove total ${fx(ex.totalLog)} = ${parts}; vol state h ${fx(st.assets[idx(st, 'FROG')]!.h)}, ecology depth ${fx(dp.depth)}`);
    } catch (e) {
      console.log(`cause ${label} (day ${d + 1}): explainMove failed: ${(e as Error).message}`);
    }
  }

  const cf = runCounterfactual();
  const pair = r.days.map((x, d) => x.ln.FROG! - cf[d]!.FROG!);
  const daily = pair.map((x, d) => (d === 0 ? x : x - pair[d - 1]!));
  console.log(`paired: account-induced FROG log move per day, days 0-40: mean ${fx(mean(daily.slice(0, 41)))}, range ${fx(Math.min(...daily.slice(0, 41)))} to ${fx(Math.max(...daily.slice(0, 41)))}`);
  console.log(`paired: cumulative FROG log at day 126 ${fx(pair[125]!)}, at year end ${fx(pair[DAYS - 1]!)}; other assets at year end: ${ROTATION.filter((id) => id !== 'FROG').map((id) => `${id} ${fx(r.days[DAYS - 1]!.ln[id]! - cf[DAYS - 1]![id]!)}`).join(', ')}`);

  const mid0 = p.equity;
  const liq0 = liquidationEquity(s, PID);
  const rz = realizeToFlat(s, PID, FLAT_DAYS);
  console.log(`realize from year end: flat after ${rz.flatDay > 0 ? `${rz.flatDay} game days` : `not flat in ${FLAT_DAYS} days`}; cash after ${fx(rz.cash)}; realized vs start cash ${fx(rz.cash - cash)} (${fx((rz.cash - cash) / cash)}); value still held ${fx(rz.heldValue)}; mid mark replaced ${fx(mid0)}, liquidation ${fx(liq0)}`);
  const rp = realizeToFlat(r.peakState, PID, FLAT_DAYS);
  console.log(`realize from the liquidation peak (tick ${r.peakTick}): cash after ${fx(rp.cash)} vs peak mark ${fx(r.peakLiq)}; ratio ${fx(rp.cash / r.peakLiq)}; flat ${rp.flatDay > 0 ? `after ${rp.flatDay} days` : 'not within window'}`);
}

for (const c of cashes) report(c);
