// Commodity futures. Crude, gas, coal, iron ore, copper, lithium, grain and livestock
// already trade as physical goods between firms. This lists the next six delivery
// months of each, so a drought or an embargo shows up in the price before it
// shows up in the shops.
//
// Money and metal move only through the ledger. A position is a pair of shares
// issued by the clearing house (long and short). Holders post margin as deposits
// at the clearing house and receive a claim for the same amount. The day's gain
// is that claim, moved from losers to winners. Nothing is priced from a random
// draw: w.rng('cmdty:...') jitters only the timing and the size of an order.
import { GOODS } from '../economy/content.ts';
import { DEP, pay, setFirmCloseHook, type EconState, type Firm } from '../economy/index.ts';
import { type Module, type World } from '../../kernel/index.ts';

const LISTED = ['CRUDE_OIL', 'NATURAL_GAS', 'COAL', 'IRON_ORE', 'COPPER', 'LITHIUM', 'GRAIN', 'LIVESTOCK'] as const;
const MONTHS = 6;
const EX = 'cmdty_exch';
const MARGIN = 'cmdty:margin';
const TREND = 'cmdty_trend';
const CARRY = 'cmdty_carry';
const MM = 'cmdty_mm';
const IM = 0.12;
const MAINT = 0.08;
const SHARES = 1_000_000;

interface Tenor {
  month: number;
  longId: string;
  shortId: string;
  px: number;
  prev: number;
  lastPrem: number;
  rets: number[];
}

interface Book {
  good: string;
  name: string;
  lot: number;
  usual: number;
  anchor: number;
  driver: number[];
  prod: string[];
  buyers: { id: string; k: number }[];
  tenors: Tenor[];
}

interface CmdState {
  books: Book[];
  roster: string[];
  root: number;
  calls: number;
  pending: { good: string; from: string; to: string; qty: number }[];
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const econ = (w: World): EconState => w.state.economy as EconState;
const bookOf = (w: World): CmdState => w.state.commodities as CmdState;

function cashOf(w: World, actor: string): number { return Math.floor(w.ledger.balance(actor, DEP)); }
function marginOf(w: World, actor: string): number { return Math.round(w.ledger.balance(actor, MARGIN)); }
function issued(w: World, id: string): number { return Math.round(w.ledger.issued.get(id) ?? 0); }

// While traders plan the day's orders nothing settles, so positions and resources are read once and cached.
let netCache: Map<string, number> | null = null, resCache: Map<string, number> | null = null, expoCache: Map<string, number> | null = null;
function netOf(w: World, actor: string, t: Tenor): number {
  const k = netCache ? actor + '|' + t.longId : '';
  if (netCache) { const v = netCache.get(k); if (v !== undefined) return v; }
  const v = Math.round(w.ledger.balance(actor, t.longId) - w.ledger.balance(actor, t.shortId));
  if (netCache) netCache.set(k, v);
  return v;
}

function spotOf(w: World, s: EconState, good: string): number {
  let p = 0, n = 0;
  for (const f of s.firms) if (f.good === good && !f.closed) {
    const wgt = Math.max(1, f.expSales);
    p += f.price * wgt; n += wgt;
  }
  return n ? p / n : 0;
}

function stockDays(w: World, s: EconState, b: Book): number {
  let stock = 0, flow = 0;
  for (const id of b.prod) {
    const f = bBy(s, id);
    stock += w.ledger.balance(id, 'good:' + b.good);
    flow += f ? Math.max(0, f.expSales) : 0;
  }
  return stock / Math.max(1, flow);
}

function bBy(s: EconState, id: string): Firm | undefined {
  for (const f of s.firms) if (f.id === id) return f;
  return undefined;
}

function affects(prod: Record<string, number>, demand: Record<string, number>, good: string): boolean {
  if (prod[good] !== undefined) return true;
  if (demand[good] !== undefined) return true;
  if (prod.ALL !== undefined && prod.ALL !== 1) return true;
  return false;
}

function shockPiece(prod: Record<string, number>, demand: Record<string, number>, good: string, m: number, day: number, until: number): number {
  const p = (prod[good] ?? 1) * (prod.ALL ?? 1);
  const d = demand[good] ?? 1;
  const horizon = 30 * (m + 1);
  const left = Math.max(0, until - day);
  const overlap = Math.min(1, left / horizon);
  const scarcity = p > 0 ? 1 / p - 1 : 0;
  return overlap * (scarcity + (d - 1));
}

function shockRaw(w: World, good: string, m: number): { raw: number; active: number[] } {
  const s = econ(w);
  let raw = 0;
  const active: number[] = [];
  for (const sh of s.shocks) {
    if (!affects(sh.def.prod, sh.def.demand, good)) continue;
    raw += shockPiece(sh.def.prod, sh.def.demand, good, m, w.day, sh.until);
    active.push(sh.ev);
  }
  return { raw, active };
}

/** Premium of a future over today's firm price. The shock is priced in full on the day it
 *  starts, then given back as the firms' own prices catch up, so the contract does not
 *  sit forever above the new spot. */
function shockPrem(raw: number, spot: number, anchor: number): number {
  let prem = clamp(raw * 0.4, -0.1, 0.2);
  if (prem > 0 && anchor > 0 && spot > 0) prem = Math.max(0, prem - Math.max(0, spot / anchor - 1));
  return prem;
}

function freeCash(w: World, s: EconState, actor: string): number {
  const f = bBy(s, actor);
  const buf = f ? f.eff * s.wage * 25 : 0;
  return Math.max(0, cashOf(w, actor) - buf);
}

function resources(w: World, s: EconState, actor: string): number {
  if (resCache) { const v = resCache.get(actor); if (v !== undefined) return v; }
  const v = freeCash(w, s, actor) + marginOf(w, actor);
  if (resCache) resCache.set(actor, v);
  return v;
}

function notional(w: World, st: CmdState, actor: string): number {
  let n = 0;
  for (const b of st.books) for (const t of b.tenors) n += Math.abs(netOf(w, actor, t)) * t.px * b.lot;
  return n;
}

function postMargin(w: World, actor: string, cents: number, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  if (cashOf(w, actor) < a) return false;
  if (!pay(w, actor, EX, a, 'futures.margin', cause)) return false;
  w.ledger.issue(MARGIN, actor, a, 'futures.margin', cause);
  return true;
}

function releaseMargin(w: World, actor: string, cents: number, cause: number): boolean {
  const a = Math.min(Math.round(cents), marginOf(w, actor), cashOf(w, EX));
  if (a <= 0) return true;
  if (!w.ledger.redeem(MARGIN, actor, a, 'futures.margin', cause)) return false;
  if (!pay(w, EX, actor, a, 'futures.margin', cause)) {
    w.ledger.issue(MARGIN, actor, a, 'futures.margin', cause);
    return false;
  }
  return true;
}

function applyDelta(w: World, actor: string, t: Tenor, delta: number, cause: number): void {
  if (delta === 0) return;
  netCache?.delete(actor + '|' + t.longId); // the planning pass updates its exposure cache itself
  const L = w.ledger;
  if (delta > 0) {
    const cover = Math.min(delta, Math.round(L.balance(actor, t.shortId)));
    if (cover > 0 && !L.redeem(t.shortId, actor, cover, 'futures.trade', cause)) throw new Error(`cover short ${t.shortId}`);
    const open = delta - cover;
    if (open > 0) L.issue(t.longId, actor, open, 'futures.trade', cause);
    return;
  }
  const qty = -delta;
  const cover = Math.min(qty, Math.round(L.balance(actor, t.longId)));
  if (cover > 0 && !L.redeem(t.longId, actor, cover, 'futures.trade', cause)) throw new Error(`cover long ${t.longId}`);
  const open = qty - cover;
  if (open > 0) L.issue(t.shortId, actor, open, 'futures.trade', cause);
}

function assertBook(w: World, t: Tenor): void {
  const l = issued(w, t.longId), s = issued(w, t.shortId);
  if (l !== s) throw new Error(`${t.longId} open interest ${l} != ${s}`);
}

function assertMargin(w: World): void {
  const dep = cashOf(w, EX), claim = issued(w, MARGIN);
  if (dep !== claim) throw new Error(`clearing margin cash ${dep} != claims ${claim}`);
}

/** A sight-deposit bail-in redeems dep at the clearing house and leaves margin claims behind. Write the claims down to the cash that is still there. */
function absorbHaircut(w: World, cause: number): void {
  const dep = cashOf(w, EX);
  const claim = issued(w, MARGIN);
  if (claim <= dep) return;
  const rows: { id: string; v: number }[] = [];
  let total = 0;
  for (const [id, v0] of w.ledger.holders(MARGIN)) {
    const v = Math.floor(v0);
    if (v > 0) { rows.push({ id, v }); total += v; }
  }
  let hole = Math.min(claim - dep, total);
  if (hole <= 0 || total <= 0) return;
  let left = hole;
  for (let i = 0; i < rows.length && left > 0; i++) {
    const cut = i === rows.length - 1 ? left : Math.min(rows[i].v, Math.floor(hole * rows[i].v / total));
    const a = Math.min(left, rows[i].v, cut);
    if (a > 0 && w.ledger.redeem(MARGIN, rows[i].id, a, 'futures.margin', cause)) left -= a;
  }
  if (left > 0) {
    rows.sort((a, b) => b.v - a.v);
    for (const r of rows) {
      if (left <= 0) break;
      const have = Math.floor(w.ledger.balance(r.id, MARGIN));
      const a = Math.min(left, have);
      if (a > 0 && w.ledger.redeem(MARGIN, r.id, a, 'futures.margin', cause)) left -= a;
    }
  }
}

/** Front-month is monthsAhead 0. Returns the settlement price in cents, or 0 if that month is not listed. */
export function futuresPrice(w: World, good: string, monthsAhead: number): number {
  const st = w.state.commodities as CmdState | undefined;
  if (!st || monthsAhead < 0 || monthsAhead >= MONTHS) return 0;
  const month = w.month + monthsAhead;
  for (const b of st.books) if (b.good === good) {
    for (const t of b.tenors) if (t.month === month) return t.px;
  }
  return 0;
}

function fairOf(w: World, s: EconState, b: Book, m: number, spot: number, days: number): { fair: number; prem: number; nonShock: number } {
  const { raw } = shockRaw(w, b.good, m);
  const prem = shockPrem(raw, spot, b.anchor);
  const stockPrem = clamp((b.usual - days) / b.usual, -1, 1) * 0.08;
  const carry = s.policyRate * m / 12;
  const nonShock = Math.max(1, spot * (1 + stockPrem + carry));
  const fair = Math.max(1, spot * (1 + prem + stockPrem + carry));
  return { fair, prem, nonShock };
}

function markBook(w: World, s: EconState, b: Book): number[] {
  const spot = spotOf(w, s, b.good);
  const days = stockDays(w, s, b);
  b.usual += (days - b.usual) * 0.003;
  if (b.usual < 1) b.usual = 1;
  const front = shockRaw(w, b.good, 0);
  if (front.raw > 0.05 && b.anchor <= 0 && spot > 0) b.anchor = spot;
  const active = front.active;
  const inherited = b.driver.filter((id) => !active.includes(id));
  const causeIds = [...new Set([...active, ...inherited])];
  const emitted: number[] = [];
  let frontPx = 0, frontNon = 1;
  for (const t of b.tenors) {
    const m = t.month - w.month;
    const view = m === 0 ? { raw: front.raw } : shockRaw(w, b.good, m);
    const prem = shockPrem(view.raw, spot, b.anchor);
    const stockPrem = clamp((b.usual - days) / b.usual, -1, 1) * 0.08;
    const carry = s.policyRate * Math.max(0, m) / 12;
    const fair = Math.max(1, spot * (1 + prem + stockPrem + carry));
    const nonShock = Math.max(1, spot * (1 + stockPrem + carry));
    const mm = netOf(w, MM, t);
    const skew = clamp(mm / (Math.abs(mm) + 40), -1, 1) * 0.012;
    const mid = fair * (1 - skew);
    const premJump = Math.abs(prem - t.lastPrem);
    const gap = t.prev > 0 ? Math.abs(mid / t.prev - 1) : 0;
    const shockDriven = causeIds.length > 0 && (premJump > 0.02 || (Math.abs(prem) > 0.04 && gap > 0.04) || (inherited.length > 0 && gap > 0.04));
    const band = shockDriven ? 0.12 : 0.03;
    const lo = t.prev * (1 - band), hi = t.prev * (1 + band);
    const unrounded = Math.min(hi, Math.max(lo, mid));
    const px = Math.max(1, Math.round(unrounded));
    if (m === 0 && t.prev > 0 && Math.abs(unrounded / t.prev - 1) > 0.04 && causeIds.length > 0) {
      const extra: number[] = [];
      if (days < b.usual * 0.7) {
        for (const id of b.prod) {
          const f = bBy(s, id);
          if (f?.stockoutEv !== undefined) extra.push(f.stockoutEv);
          if (f?.inputShortEv !== undefined) extra.push(f.inputShortEv);
          if (extra.length) break;
        }
      }
      const pct = (px / t.prev - 1) * 100;
      const id = w.events.emit('futures.move', `${b.name} front month ${t.prev} -> ${px} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`, [...new Set([...causeIds, ...extra])], b.good);
      emitted.push(id);
    }
    t.px = px;
    t.lastPrem = prem;
    if (m === 0) { frontPx = px; frontNon = nonShock; }
  }
  if (active.length) b.driver = active.slice();
  else if (frontPx > 0 && Math.abs(frontPx / frontNon - 1) < 0.03) b.driver = [];
  if (front.raw < 0.02) b.anchor = 0;
  return emitted;
}

function settleVariation(w: World, st: CmdState, cause: number): string[] {
  const rows: { actor: string; pnl: number }[] = [];
  let sum = 0;
  for (const actor of st.roster) {
    let pnl = 0;
    for (const b of st.books) for (const t of b.tenors) pnl += netOf(w, actor, t) * (t.px - t.prev) * b.lot;
    pnl = Math.round(pnl);
    sum += pnl;
    if (pnl !== 0) rows.push({ actor, pnl });
  }
  if (rows.length && sum !== 0) {
    let k = 0;
    for (let i = 1; i < rows.length; i++) if (Math.abs(rows[i].pnl) > Math.abs(rows[k].pnl)) k = i;
    rows[k].pnl -= sum;
  }
  const s = econ(w);
  const losers = rows.filter((r) => r.pnl < 0);
  const winners = rows.filter((r) => r.pnl > 0);
  let pool = 0;
  const failed: string[] = [];
  for (const r of losers) {
    const need = -r.pnl;
    let have = marginOf(w, r.actor);
    if (have < need) {
      const pull = Math.min(need - have, freeCash(w, s, r.actor));
      if (pull > 0 && postMargin(w, r.actor, pull, cause)) have += pull;
    }
    const take = Math.min(have, need);
    if (take > 0 && w.ledger.redeem(MARGIN, r.actor, take, 'futures.mtm', cause)) pool += take;
    const short = need - take;
    if (short > Math.max(200, Math.round(need * 0.05))) failed.push(r.actor);
  }
  const gain = winners.reduce((a, r) => a + r.pnl, 0);
  let left = pool;
  for (let i = 0; i < winners.length; i++) {
    const share = i === winners.length - 1 ? left : (gain > 0 ? Math.floor(winners[i].pnl / gain * pool) : 0);
    const a = Math.max(0, Math.min(share, left));
    if (a > 0) w.ledger.issue(MARGIN, winners[i].actor, a, 'futures.mtm', cause);
    left -= a;
  }
  return failed;
}

function flattenActor(w: World, st: CmdState, actor: string, cause: number): void {
  for (const b of st.books) for (const t of b.tenors) {
    let left = netOf(w, actor, t);
    if (left === 0) continue;
    const sign = left > 0 ? 1 : -1;
    for (const other of st.roster) {
      if (other === actor || left === 0) continue;
      const o = netOf(w, other, t);
      if (o * sign >= 0) continue;
      const q = Math.min(Math.abs(left), Math.abs(o));
      applyDelta(w, actor, t, -sign * q, cause);
      applyDelta(w, other, t, sign * q, cause);
      left += -sign * q;
    }
    if (netOf(w, actor, t) !== 0) throw new Error(`could not close ${actor} on ${t.longId}`);
  }
}

function closeOut(w: World, st: CmdState, actor: string, causes: number[], halted: Set<string>): void {
  if (halted.has(actor)) return;
  const ev = w.events.emit('futures.marginCall', `${actor} could not meet a futures margin call and was closed out`, causes, actor);
  flattenActor(w, st, actor, ev);
  releaseMargin(w, actor, marginOf(w, actor), ev);
  st.calls++;
  halted.add(actor);
}

function producerWant(f: Firm, px: number, lot: number, m: number): number {
  if (m < 0 || m > 4 || f.unitCost < 1 || !(px > f.unitCost * 1.01)) return 0;
  const monthQty = Math.max(0, f.expSales) * 30 / lot;
  const prem = px / f.unitCost - 1;
  const frac = Math.min(0.16, 0.04 + prem * 0.35);
  return -Math.round(monthQty * frac * (1 - m * 0.12));
}

function buyerWant(f: Firm, k: number, px: number, fair: number, lot: number, m: number, days: number, usual: number): number {
  if (m < 0 || m > 3) return 0;
  const thin = days < usual * 0.75;
  if (!thin && px > fair * 1.015) return 0;
  const monthQty = Math.max(0, f.expSales) * k * 30 / lot;
  const frac = thin ? 0.14 : 0.05;
  return Math.round(monthQty * frac * (1 - m * 0.15));
}

function trendWant(t: Tenor, lot: number, wealth: number): number {
  if (t.rets.length < 4) return 0;
  let s = 0;
  for (let i = t.rets.length - 4; i < t.rets.length; i++) s += t.rets[i];
  if (Math.abs(s) < 0.015) return 0;
  const per = Math.max(1, t.px * lot);
  const mag = Math.min(Math.floor(wealth * 0.2 / per), Math.round(8 * Math.abs(s) / 0.015));
  return s > 0 ? mag : -mag;
}

function carryWant(near: Tenor, far: Tenor, rate: number, which: 'near' | 'far', wealth: number, lot: number): number {
  if (near.px < 1 || far.px < 1) return 0;
  const theo = near.px * (1 + rate * 5 / 12);
  const gap = far.px / theo - 1;
  if (Math.abs(gap) < 0.008) return 0;
  const per = Math.max(1, near.px * lot);
  const mag = Math.min(Math.floor(wealth * 0.15 / per), Math.round(Math.abs(gap) / 0.008 * 6));
  const sign = gap > 0 ? 1 : -1;
  return which === 'near' ? sign * mag : -sign * mag;
}

function clampTarget(w: World, s: EconState, st: CmdState, actor: string, b: Book, t: Tenor, target: number, plan: Map<string, number>): number {
  const cap = resources(w, s, actor) * (actor === MM ? 0.55 : 0.3);
  const per = Math.max(1, t.px * b.lot * IM);
  // Margin already committed elsewhere: the actor's total exposure, cached for the planning pass, minus this contract.
  const k0 = actor + '|' + t.longId;
  const own = Math.abs(plan.has(k0) ? plan.get(k0)! : netOf(w, actor, t)) * per;
  let total = expoCache?.get(actor);
  if (total === undefined) {
    total = 0;
    for (const bb of st.books) for (const tt of bb.tenors) {
      const k = actor + '|' + tt.longId;
      const n = plan.has(k) ? plan.get(k)! : netOf(w, actor, tt);
      total += Math.abs(n) * Math.max(1, tt.px * bb.lot * IM);
    }
    expoCache?.set(actor, total);
  }
  const other = total - own;
  const maxC = Math.max(0, Math.floor((cap - other) / per));
  return clamp(Math.round(target), -maxC, maxC);
}

function jitter(w: World, actor: string, qty: number): number {
  if (qty < 1) return 0;
  const n = 0.75 + 0.5 * w.rng('cmdty:' + actor).next();
  return Math.max(1, Math.round(qty * n));
}

function reduceSide(intents: { qty: number }[], sign: number, over: number): void {
  const idx: number[] = [];
  let total = 0;
  for (let i = 0; i < intents.length; i++) {
    const q = sign > 0 ? intents[i].qty : -intents[i].qty;
    if (q > 0) { idx.push(i); total += q; }
  }
  if (total <= 0 || over <= 0) return;
  if (over >= total) { for (const i of idx) intents[i].qty = 0; return; }
  let left = over;
  for (const i of idx) {
    const q = Math.abs(intents[i].qty);
    const cut = Math.min(q, Math.floor(over * q / total));
    intents[i].qty -= sign * cut;
    left -= cut;
  }
  for (const i of idx) {
    if (left <= 0) break;
    if ((sign > 0 ? intents[i].qty : -intents[i].qty) > 0) { intents[i].qty -= sign; left--; }
  }
}

function tradeBook(w: World, st: CmdState, b: Book, active: Set<string>, halted: Set<string>, plan: Map<string, number>, cause: number): void {
  const s = econ(w);
  const spot = spotOf(w, s, b.good);
  const days = stockDays(w, s, b);
  const wealthT = resources(w, s, TREND);
  const wealthC = resources(w, s, CARRY);
  const near = b.tenors.find((t) => t.month === w.month);
  const far = b.tenors.find((t) => t.month === w.month + 5);
  const tenors = [...b.tenors].sort((a, c) => a.month - c.month);
  for (const t of tenors) {
    const m = t.month - w.month;
    const fair = Math.max(1, spot * (1 + t.lastPrem + clamp((b.usual - days) / b.usual, -1, 1) * 0.08 + s.policyRate * Math.max(0, m) / 12));
    const intents: { actor: string; qty: number }[] = [];
    for (const actor of st.roster) {
      if (actor === MM || halted.has(actor)) continue;
      let want = 0;
      if (actor === TREND) want = m === 0 ? trendWant(t, b.lot, wealthT) : 0;
      else if (actor === CARRY) {
        if (near && t === near) want = carryWant(near, far ?? near, s.policyRate, 'near', wealthC, b.lot);
        else if (far && t === far) want = carryWant(near ?? far, far, s.policyRate, 'far', wealthC, b.lot);
      }
      if (actor !== TREND && actor !== CARRY) {
        const f = bBy(s, actor);
        if (f && b.prod.includes(actor)) want = producerWant(f, t.px, b.lot, m);
        else {
          const buy = b.buyers.find((x) => x.id === actor);
          if (f && buy) want = buyerWant(f, buy.k, t.px, fair, b.lot, m, days, b.usual);
        }
      }
      if (actor === CARRY && t !== near && t !== far) want = 0;
      const cur = netOf(w, actor, t);
      if (want === 0 && cur === 0) continue;
      want = clampTarget(w, s, st, actor, b, t, want, plan);
      let delta = want - cur;
      if (delta !== 0 && active.has(actor)) {
        const step = Math.max(1, Math.round(Math.abs(delta) * 0.45));
        const mag = jitter(w, actor, Math.min(Math.abs(delta), step));
        delta = Math.sign(delta) * mag;
      } else delta = 0;
      const pk = actor + '|' + t.longId;
      const was = plan.has(pk) ? plan.get(pk)! : cur;
      plan.set(pk, cur + delta);
      // Keep the cached exposure in step instead of recounting every contract for the next one.
      const ex = expoCache?.get(actor);
      if (ex !== undefined) expoCache!.set(actor, ex + (Math.abs(cur + delta) - Math.abs(was)) * Math.max(1, t.px * b.lot * IM));
      if (delta !== 0) intents.push({ actor, qty: delta });
    }
    const mmNet = netOf(w, MM, t);
    const per = Math.max(1, t.px * b.lot * IM);
    const capCents = resources(w, s, MM) * 0.55;
    let other = 0;
    for (const bb of st.books) for (const tt of bb.tenors) {
      if (bb === b && tt === t) continue;
      const k = MM + '|' + tt.longId;
      const n = plan.has(k) ? plan.get(k)! : netOf(w, MM, tt);
      other += Math.abs(n) * Math.max(1, tt.px * bb.lot * IM);
    }
    const maxC = Math.max(0, Math.floor((capCents - other) / per));
    const buyRoom = Math.max(0, maxC - mmNet);
    const sellRoom = Math.max(0, maxC + mmNet);
    let guard = 0;
    while (guard++ < 8) {
      let buy = 0, sell = 0;
      for (const i of intents) { if (i.qty > 0) buy += i.qty; else sell -= i.qty; }
      const imb = buy - sell;
      // Commercials buying (imb > 0) means the market maker sells, and the reverse.
      if (imb > sellRoom) reduceSide(intents, 1, imb - sellRoom);
      else if (-imb > buyRoom) reduceSide(intents, -1, -imb - buyRoom);
      else break;
    }
    let mmDelta = 0;
    for (const i of intents) {
      if (i.qty === 0) continue;
      applyDelta(w, i.actor, t, i.qty, cause);
      mmDelta -= i.qty;
    }
    if (mmDelta !== 0) applyDelta(w, MM, t, mmDelta, cause);
    // Fills can be smaller than planned: move each plan to the actual position and adjust the cached exposure by the difference.
    for (const id of st.roster) {
      const k = id + '|' + t.longId;
      const now = netOf(w, id, t);
      const was = plan.has(k) ? plan.get(k)! : id === MM ? mmNet : now;
      plan.set(k, now);
      const ex = expoCache?.get(id);
      if (ex !== undefined && now !== was) expoCache!.set(id, ex + (Math.abs(now) - Math.abs(was)) * per);
    }
    assertBook(w, t);
  }
}

function deliverPair(w: World, s: EconState, b: Book, from: string, to: string, qty: number, futPx: number, cause: number): void {
  const good = 'good:' + b.good;
  const bill = Math.round(qty * futPx);
  if (qty <= 0 || bill <= 0) return;
  if (w.ledger.balance(from, good) < qty - 1e-9 || cashOf(w, to) < bill) return;
  if (!pay(w, to, from, bill, 'futures.delivery', cause)) return;
  if (!w.ledger.move(good, from, to, qty, 'futures.delivery', cause)) {
    pay(w, from, to, bill, 'futures.delivery', cause);
    return;
  }
  const spot = Math.max(1, Math.round(spotOf(w, s, b.good)));
  const back = Math.round(qty * spot);
  if (back > 0 && cashOf(w, from) >= back && pay(w, from, to, back, 'futures.resale', cause)
    && w.ledger.move(good, to, from, qty, 'futures.resale', cause)) return;
  bookOf(w).pending.push({ good: b.good, from, to, qty });
}

function physical(w: World, st: CmdState, b: Book, t: Tenor, cause: number): void {
  const s = econ(w);
  const shorts = b.prod.filter((id) => netOf(w, id, t) < 0);
  const longs = b.buyers.map((x) => x.id).filter((id) => netOf(w, id, t) > 0);
  const px = Math.max(1, t.px);
  const spot = Math.max(1, Math.round(spotOf(w, s, b.good)));
  let si = 0, li = 0, guard = 0;
  while (si < shorts.length && li < longs.length && guard++ < 1000) {
    const a = shorts[si], h = longs[li];
    const sc = -netOf(w, a, t), lc = netOf(w, h, t);
    if (sc < 1) { si++; continue; }
    if (lc < 1) { li++; continue; }
    const stock = w.ledger.balance(a, 'good:' + b.good);
    let n = Math.min(sc, lc, Math.floor(stock * 0.85 / b.lot), Math.floor(freeCash(w, s, h) / (px * b.lot)));
    if (spot > px) n = Math.min(n, Math.floor(freeCash(w, s, a) / Math.max(1, (spot - px) * b.lot)));
    if (n < 1) { if (freeCash(w, s, h) < px * b.lot) li++; else si++; continue; }
    applyDelta(w, a, t, n, cause);
    applyDelta(w, h, t, -n, cause);
    deliverPair(w, s, b, a, h, n * b.lot, px, cause);
  }
}

function flattenTenor(w: World, st: CmdState, t: Tenor, cause: number): void {
  const longs: string[] = [];
  const shorts: string[] = [];
  for (const id of st.roster) {
    const n = netOf(w, id, t);
    if (n > 0) longs.push(id); else if (n < 0) shorts.push(id);
  }
  let i = 0, j = 0, guard = 0;
  while (i < longs.length && j < shorts.length && guard++ < 10000) {
    const a = longs[i], b = shorts[j];
    const q = Math.min(netOf(w, a, t), -netOf(w, b, t));
    if (q < 1) { if (netOf(w, a, t) < 1) i++; else j++; continue; }
    applyDelta(w, a, t, -q, cause);
    applyDelta(w, b, t, q, cause);
    if (netOf(w, a, t) < 1) i++;
    if (netOf(w, b, t) > -1) j++;
  }
  for (const id of st.roster) if (netOf(w, id, t) !== 0) throw new Error(`open position left on ${t.longId}`);
  assertBook(w, t);
}

function expire(w: World, st: CmdState, b: Book, cause: number): void {
  const s = econ(w);
  const t = b.tenors.find((x) => x.month === w.month);
  if (!t) return;
  physical(w, st, b, t, cause);
  flattenTenor(w, st, t, cause);
  for (const id of st.roster) if (Math.round(w.ledger.balance(id, t.longId)) !== 0 || Math.round(w.ledger.balance(id, t.shortId)) !== 0)
    throw new Error(`shares remain on ${t.longId}`);
  const spot = spotOf(w, s, b.good);
  const m = 5;
  const { fair, prem } = fairOf(w, s, b, m, spot, stockDays(w, s, b));
  t.month = w.month + MONTHS;
  t.px = Math.max(1, Math.round(fair));
  t.prev = t.px;
  t.lastPrem = prem;
  t.rets = [];
}

function rebalance(w: World, st: CmdState, actor: string, cause: number, halted: Set<string>): void {
  const s = econ(w);
  const note = notional(w, st, actor);
  const need = Math.round(note * IM);
  let have = marginOf(w, actor);
  if (have > need) {
    releaseMargin(w, actor, have - need, cause);
    have = marginOf(w, actor);
  } else if (have < need && !halted.has(actor)) {
    const pull = Math.min(need - have, freeCash(w, s, actor));
    if (pull > 0 && postMargin(w, actor, pull, cause)) have += pull;
  }
  const maint = Math.round(note * MAINT);
  if (note > 0 && have < maint && !halted.has(actor)) closeOut(w, st, actor, [cause], halted);
}

function finishPrices(b: Book): void {
  for (const t of b.tenors) {
    if (t.prev > 0) {
      t.rets.push(t.px / t.prev - 1);
      if (t.rets.length > 8) t.rets.shift();
    }
    t.prev = t.px;
  }
}

function releasePending(w: World, cause: number): void {
  const st = bookOf(w), s = econ(w);
  const left: CmdState['pending'] = [];
  for (const p of st.pending) {
    const holders = st.books.find((b) => b.good === p.good)?.prod ?? [];
    const spot = Math.max(1, Math.round(spotOf(w, s, p.good)));
    const back = Math.round(p.qty * spot);
    const good = 'good:' + p.good;
    const from = holders.includes(p.from) && cashOf(w, p.from) >= back ? p.from : holders.find((id) => cashOf(w, id) >= back);
    if (!from || w.ledger.balance(p.to, good) < p.qty - 1e-9) { left.push(p); continue; }
    if (pay(w, from, p.to, back, 'futures.resale', cause) && w.ledger.move(good, p.to, from, p.qty, 'futures.resale', cause)) continue;
    left.push(p);
  }
  st.pending = left;
}

function capitalise(w: World, s: EconState, id: string, slice: number): void {
  const L = w.ledger;
  L.addActor(id, 'fund');
  L.define({ id: 'eq:' + id, kind: 'share', issuer: id });
  const base = s.investors.map((h) => cashOf(w, h.id));
  const paid: { id: string; cents: number }[] = [];
  for (let i = 0; i < s.investors.length; i++) {
    const cents = Math.floor(base[i] * slice);
    if (cents > 0 && pay(w, s.investors[i].id, id, cents, 'genesis.equity', w.genesis)) paid.push({ id: s.investors[i].id, cents });
  }
  const total = paid.reduce((a, p) => a + p.cents, 0);
  let left = SHARES;
  for (let i = 0; i < paid.length; i++) {
    const sh = i === paid.length - 1 ? left : (total > 0 ? Math.round(SHARES * paid[i].cents / total) : 0);
    left -= sh;
    if (sh > 0) L.issue('eq:' + id, paid[i].id, sh, 'genesis.equity', w.genesis);
  }
}

/** Open, add to, or flatten a futures position. The market maker takes the other side. Margin is posted in cash. */
export function tradeFuture(w: World, actor: string, good: string, monthsAhead: number, qty: number, side: 'long' | 'short' | 'flat'): { qty: number; px: number; net: number; why?: string } {
  const st = bookOf(w);
  const b = st.books.find((x) => x.good === good);
  if (!b) return { qty: 0, px: 0, net: 0, why: `no futures listed for ${good}` };
  if (!w.ledger.actors.has(actor)) return { qty: 0, px: 0, net: 0, why: 'unknown actor' };
  if (monthsAhead < 0 || monthsAhead >= MONTHS) return { qty: 0, px: 0, net: 0, why: 'that delivery month is not listed' };
  const t = b.tenors.find((x) => x.month === w.month + monthsAhead);
  if (!t) return { qty: 0, px: 0, net: 0, why: 'that delivery month is not listed' };
  const cur = Math.round(w.ledger.balance(actor, t.longId) - w.ledger.balance(actor, t.shortId));
  let delta = side === 'flat' ? -cur : side === 'long' ? qty : -qty;
  if (!Number.isSafeInteger(qty) || (side !== 'flat' && qty < 1)) return { qty: 0, px: t.px, net: cur, why: 'qty must be a positive number of contracts' };
  if (delta === 0) return { qty: 0, px: t.px, net: cur, why: side === 'flat' ? 'no position in that month' : 'nothing to trade' };
  if (!st.roster.includes(actor)) st.roster.push(actor);
  const cause = st.root;
  applyDelta(w, actor, t, delta, cause);
  applyDelta(w, MM, t, -delta, cause);
  const net = Math.round(w.ledger.balance(actor, t.longId) - w.ledger.balance(actor, t.shortId));
  const need = Math.round(Math.abs(net) * t.px * b.lot * IM);
  const have = marginOf(w, actor);
  if (need > have) {
    if (!postMargin(w, actor, need - have, cause)) {
      applyDelta(w, actor, t, -delta, cause);
      applyDelta(w, MM, t, delta, cause);
      return { qty: 0, px: t.px, net: cur, why: 'not enough cash to post margin' };
    }
  } else if (have > need) releaseMargin(w, actor, have - need, cause);
  assertBook(w, t);
  return { qty: Math.abs(delta), px: t.px, net };
}

export const commodities: Module = {
  id: 'commodities',

  init(w) {
    setFirmCloseHook((world, actor, cause) => {
      const st = world.state.commodities as CmdState | undefined;
      if (!st) return;
      flattenActor(world, st, actor, cause);
      releaseMargin(world, actor, marginOf(world, actor), cause);
      const at = st.roster.indexOf(actor);
      if (at >= 0) st.roster.splice(at, 1);
      for (const b of st.books) {
        b.prod = b.prod.filter((id) => id !== actor);
        b.buyers = b.buyers.filter((x) => x.id !== actor);
      }
    });
    const s = econ(w), L = w.ledger;
    L.addActor(EX, 'exchange');
    L.define({ id: MARGIN, kind: 'claim', issuer: EX });
    capitalise(w, s, TREND, 0.05);
    capitalise(w, s, CARRY, 0.05);
    capitalise(w, s, MM, 0.07);
    const books: Book[] = [];
    const rosterSet = new Set<string>([TREND, CARRY, MM]);
    for (const good of LISTED) {
      const prod = s.firms.filter((f) => f.good === good).map((f) => f.id);
      const buyers: { id: string; k: number }[] = [];
      for (const f of s.firms) {
        const k = GOODS[f.good].inputs[good];
        if (k) buyers.push({ id: f.id, k });
      }
      for (const id of prod) rosterSet.add(id);
      for (const b of buyers) rosterSet.add(b.id);
      let flow = 0;
      for (const id of prod) flow += bBy(s, id)?.expSales ?? 0;
      const lot = Math.max(1, Math.round(flow / 40));
      const b: Book = { good, name: GOODS[good].name, lot, usual: 5, anchor: 0, driver: [], prod, buyers, tenors: [] };
      const spot = spotOf(w, s, good);
      const days = stockDays(w, s, b);
      b.usual = Math.max(1, days);
      for (let slot = 0; slot < MONTHS; slot++) {
        const { fair, prem } = fairOf(w, s, b, slot, spot, days);
        const px = Math.max(1, Math.round(fair));
        const longId = `futL:${good}:${slot}`, shortId = `futS:${good}:${slot}`;
        L.define({ id: longId, kind: 'share', issuer: EX });
        L.define({ id: shortId, kind: 'share', issuer: EX });
        b.tenors.push({ month: slot, longId, shortId, px, prev: px, lastPrem: prem, rets: [] });
      }
      books.push(b);
    }
    const st: CmdState = {
      books, roster: [...rosterSet], root: 0, calls: 0, pending: [],
    };
    w.state.commodities = st;
    st.root = w.events.emit('futures.open', 'commodity futures listed for energy, metals and crops', [w.genesis], EX);
    const bad = L.check();
    if (bad.length) throw new Error(`books failed at the futures open: ${bad.slice(0, 5).join('; ')}`);
  },

  tick(w, t) {
    if (t !== 0 || !bookOf(w).pending.length) return;
    releasePending(w, bookOf(w).root);
  },

  dayClose(w) {
    const st = bookOf(w), s = econ(w);
    absorbHaircut(w, st.root);
    const moves: number[] = [];
    for (const b of st.books) moves.push(...markBook(w, s, b));
    const cause = moves[0] ?? st.root;
    const failed = settleVariation(w, st, cause);
    const halted = new Set<string>();
    const callCauses = moves.length ? moves.slice(0, 4) : [st.root];
    for (const actor of failed) closeOut(w, st, actor, callCauses, halted);
    const active = new Set<string>();
    for (const id of st.roster) {
      if (id === MM || halted.has(id)) continue;
      if (id === TREND || id === CARRY || w.rng('cmdty:' + id).chance(0.85)) active.add(id);
    }
    active.add(MM);
    const plan = new Map<string, number>();
    netCache = new Map(); resCache = new Map(); expoCache = new Map();
    try { for (const b of st.books) tradeBook(w, st, b, active, halted, plan, cause); }
    finally { netCache = null; resCache = null; expoCache = null; }
    for (const id of st.roster) rebalance(w, st, id, cause, halted);
    for (const b of st.books) finishPrices(b);
    assertMargin(w);
  },

  monthEnd(w) {
    const st = bookOf(w);
    absorbHaircut(w, st.root);
    for (const b of st.books) expire(w, st, b, st.root);
    const halted = new Set<string>();
    for (const id of st.roster) rebalance(w, st, id, st.root, halted);
    assertMargin(w);
  },

  stats(w) {
    const st = bookOf(w);
    let oi = 0;
    for (const b of st.books) for (const t of b.tenors) oi += issued(w, t.longId);
    return {
      oil: futuresPrice(w, 'CRUDE_OIL', 0),
      copper: futuresPrice(w, 'COPPER', 0),
      grain: futuresPrice(w, 'GRAIN', 0),
      futOI: oi,
      marginCalls: st.calls,
    };
  },
};
