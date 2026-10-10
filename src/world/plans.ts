import { estimateFill, type Side, type StepEvent } from '@/engine';
import { licenseFor, rankIndex } from '@/content/lifestyle';
import { BLOCK, DRIP, RECURRING, SIMPLE_MODE } from '@/content/learning';
import { cashOf, findOrder, priceOf, spendableCash, today } from './core';
import { ensureLedger } from './ledger';
import { placeChecked } from './orders';
import { say } from './say';
import { usd } from './text/template';
import type { BlockPlan, PlayerLedger } from './ledger-types';
import type { CommandResult, GameState, Player, StepOutput } from './types';

/**
 * Plans the world places as normal orders (Phase 3, section 3): recurring buys, DRIP, and block trades. Each plan goes
 * through the same gate as a click (license, court hold, simple-mode cap) and each fill is reason-coded in the ledger.
 * No plan trades off the book: a block is a TWAP of market orders with the normal impact and fees.
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

/** The simple-mode cap in whole percent, for the plan lines that name it (the same constant the gate reads). */
const CAP_PCT = Math.round(SIMPLE_MODE.capFraction * 100);

/**
 * Why a plan's order was refused, as the suffix of its message key (en.json and fr.json hold one line per reason). The gate
 * and the engine refuse in English; this maps their text to a reason so the viewer's language renders the line. A buy is
 * never refused for position, and anything unknown is 'refused'.
 */
export type Refusal = 'cash' | 'cap' | 'court' | 'license' | 'delisted' | 'position' | 'refused';

export function refusal(error: string | undefined): Refusal {
  const e = error ?? '';
  if (e.startsWith('Simple mode caps')) return 'cap';
  if (e.includes('held by the court')) return 'court';
  if (e.includes('needs the Pro license')) return 'license';
  if (e === 'insufficient cash') return 'cash';
  if (e === 'insufficient position') return 'position';
  if (e === 'delisted') return 'delisted';
  return 'refused';
}

function tradable(g: GameState, assetId: string): boolean {
  const def = g.market.config.assets.find((a) => a.id === assetId);
  return !!def && def.listed !== false && !def.delisted;
}

/** Units rounded down to the asset's quantity step: whole units for stocks, six decimals for the rest (the engine's rule). */
function roundUnits(g: GameState, assetId: string, units: number): number {
  const def = g.market.config.assets.find((a) => a.id === assetId);
  if (!def || !(units > 0)) return 0;
  const step = def.qtyStep ?? (def.assetClass === 'stock' ? 1 : 0);
  return step === 1 ? Math.floor(units + 1e-9) : Math.floor(units * 1e6) / 1e6;
}

/** Units that a dollar amount buys at the current price, rounded to the quantity step. */
function unitsFor(g: GameState, assetId: string, value: number): number {
  const px = priceOf(g, assetId);
  if (!(px > 0) || !(value > 0)) return 0;
  return roundUnits(g, assetId, value / px);
}

/** Add a recurring buy: `dollars` of one asset every `everyDays` game days, from cash only. The first buy is the next day's open. */
export function addRecurring(g: GameState, p: Player, assetId: string, dollars: number, everyDays: number): CommandResult {
  const L = ensureLedger(g, p.id);
  if (!L) return fail('join the world first');
  if (!tradable(g, assetId)) return fail('unknown asset');
  if (!(dollars >= RECURRING.minDollars) || !Number.isFinite(dollars)) return fail(`at least $${RECURRING.minDollars} a buy`);
  if (!Number.isInteger(everyDays) || everyDays < RECURRING.minEveryDays || everyDays > RECURRING.maxEveryDays) {
    return fail(`every ${RECURRING.minEveryDays} to ${RECURRING.maxEveryDays} game days`);
  }
  if (L.plans.recurring.length >= RECURRING.maxPlans) return fail(`${RECURRING.maxPlans} recurring buys at most`);
  L.plans.seq++;
  const plan = { id: `r${L.plans.seq}`, assetId, dollars, everyDays, nextDay: today(g) + 1 };
  L.plans.recurring.push(plan);
  return ok(plan);
}

export function cancelRecurring(g: GameState, p: Player, planId: string): CommandResult {
  const L = ensureLedger(g, p.id);
  if (!L) return fail('join the world first');
  const before = L.plans.recurring.length;
  L.plans.recurring = L.plans.recurring.filter((x) => x.id !== planId);
  return before === L.plans.recurring.length ? fail('no such recurring buy') : ok();
}

/** DRIP on or off for one asset. Turning it on needs a long position in it (opt-in per position, default off). */
export function setDrip(g: GameState, p: Player, assetId: string, on: boolean): CommandResult {
  const L = ensureLedger(g, p.id);
  if (!L) return fail('join the world first');
  if (!on) {
    L.plans.drip = L.plans.drip.filter((x) => x !== assetId);
    return ok();
  }
  if (!tradable(g, assetId)) return fail('unknown asset');
  const q = g.market.accounts[p.id]?.positions[assetId]?.qty ?? 0;
  if (!(q > 0)) return fail('turn DRIP on for a position you hold');
  if (!L.plans.drip.includes(assetId)) {
    if (L.plans.drip.length >= DRIP.maxPositions) return fail(`${DRIP.maxPositions} DRIP positions at most`);
    L.plans.drip.push(assetId);
  }
  return ok();
}

/**
 * Start a block trade: `qty` units traded as `slices` market orders, one per tick, so the block spans `slices` ticks.
 * The preview prices one slice with estimateFill and multiplies it out. Institutional license (R4) only.
 */
export function startBlock(g: GameState, p: Player, assetId: string, side: Side, qty: number, slices: number): CommandResult {
  const L = ensureLedger(g, p.id);
  if (!L) return fail('join the world first');
  if (rankIndex(p.rankId) < rankIndex(BLOCK.minRank) || licenseFor(p.rankId).id !== 'institutional') return fail('block trades need the Institutional license');
  if (!tradable(g, assetId)) return fail('unknown asset');
  if (!Number.isInteger(slices) || slices < BLOCK.minSlices || slices > BLOCK.maxSlices) return fail(`${BLOCK.minSlices} to ${BLOCK.maxSlices} slices`);
  if (!(qty > 0) || !Number.isFinite(qty)) return fail('enter a quantity');
  const total = roundUnits(g, assetId, qty);
  if (!(total > 0) || total < slices) return fail('each slice needs at least one unit');
  if (side === 'sell') {
    const held = g.market.accounts[p.id]?.positions[assetId]?.qty ?? 0;
    if (held < total) return fail('you hold fewer units than the block');
  }
  const slice = roundUnits(g, assetId, total / slices);
  const est = estimateFill(g.market, { assetId, side, qty: slice });
  const expectedTotal = est.total * slices;
  L.plans.seq++;
  const plan: BlockPlan = {
    id: `b${L.plans.seq}`, assetId, side, remaining: total, slicesLeft: slices, slices, retries: 0, nextTick: g.market.tick + 1,
    lastOrderId: null, expectedTotal, startedTick: g.market.tick,
  };
  L.plans.blocks.push(plan);
  return ok({ plan, slice, expectedTotal });
}

export function cancelBlock(g: GameState, p: Player, planId: string): CommandResult {
  const L = ensureLedger(g, p.id);
  if (!L) return fail('join the world first');
  const plan = L.plans.blocks.find((b) => b.id === planId);
  if (!plan) return fail('no such block');
  L.plans.blocks = L.plans.blocks.filter((b) => b.id !== planId);
  return ok();
}

function orderOpen(g: GameState, orderId: string): boolean {
  return g.market.orders.some((o) => o.id === orderId && o.status === 'open');
}

/** Each tick: place the next slice of each block once the last one has closed. Done when every slice is placed and closed. */
export function planTick(g: GameState, out: StepOutput | null): void {
  for (const [pid, L] of Object.entries(g.ledgers ?? {})) {
    if (!L.plans.blocks.length) continue;
    const p = g.players[pid];
    if (!p || p.npc) continue;
    for (const b of [...L.plans.blocks]) blockStep(g, p, L, b, out);
  }
}

/**
 * One block's step. Accounting is by fill: when a slice closes, what it actually traded (its filled quantity, which the
 * engine may cut short or cancel) comes off the block, and the rest is traded by the next slice. A block whose slices run
 * out with units left gets up to BLOCK.maxRetries extra slices, then stops with one line saying how much is unfilled.
 */
function blockStep(g: GameState, p: Player, L: PlayerLedger, b: BlockPlan, out: StepOutput | null): void {
  const tick = g.market.tick;
  if (b.lastOrderId) {
    if (orderOpen(g, b.lastOrderId)) return; // the last slice is still working
    const o = findOrder(g, p.id, b.lastOrderId);
    b.remaining = Math.max(0, b.remaining - (o?.filledQty ?? 0));
    b.lastOrderId = null;
  }
  const finish = (key: string, vars: Record<string, string | number>) => {
    L.plans.blocks = L.plans.blocks.filter((x) => x.id !== b.id);
    say(g, out, p.id, 'plan', b.remaining > 0 ? 'warn' : 'info', { key, vars: { asset: b.assetId, ...vars } });
  };
  if (b.remaining <= 0) return finish('work.block.done', {});
  if (b.slicesLeft <= 0) {
    if (b.retries >= BLOCK.maxRetries) return finish('work.block.partial', { unfilled: b.remaining });
    b.retries++;
    b.slicesLeft = 1;
  }
  if (tick < b.nextTick) return;
  const share = b.slicesLeft === 1 ? b.remaining : roundUnits(g, b.assetId, b.remaining / b.slicesLeft);
  const qty = share > 0 ? Math.min(share, b.remaining) : b.remaining;
  const r = placeChecked(g, p, { assetId: b.assetId, side: b.side, type: 'market', qty }, 'block_slice');
  if (!r.ok) {
    L.plans.blocks = L.plans.blocks.filter((x) => x.id !== b.id);
    say(g, out, p.id, 'plan', 'warn', { key: `work.block.stopped.${refusal(r.error)}`, vars: { asset: b.assetId, cap: CAP_PCT } });
    return;
  }
  const o = r.data as { id: string };
  b.lastOrderId = o.id;
  b.slicesLeft--;
  b.nextTick = tick + 1;
}

/**
 * The day's plan work (stepGame's day boundary): recurring buys that are due (from cash, or skipped with one line), and DRIP
 * for the day's dividends on opted-in long positions, placed to fill at the next tick.
 */
export function planDay(g: GameState, out: StepOutput | null): void {
  const d = today(g);
  for (const [pid, L] of Object.entries(g.ledgers ?? {})) {
    const p = g.players[pid];
    if (!p || p.npc) continue;
    for (const r of L.plans.recurring) {
      if (d < r.nextDay) continue;
      r.nextDay = d + r.everyDays;
      const qty = unitsFor(g, r.assetId, r.dollars);
      if (!(qty > 0)) {
        say(g, out, pid, 'plan', 'warn', { key: 'work.recurring.skipped.unit', vars: { asset: r.assetId } });
        continue;
      }
      const est = estimateFill(g.market, { assetId: r.assetId, side: 'buy', qty });
      if (est.total > spendableCash(g, pid)) {
        say(g, out, pid, 'plan', 'warn', { key: 'work.recurring.skipped.cash', vars: { asset: r.assetId } });
        continue;
      }
      const placed = placeChecked(g, p, { assetId: r.assetId, side: 'buy', type: 'market', qty }, 'recurring_buy');
      if (!placed.ok) say(g, out, pid, 'plan', 'warn', { key: `work.recurring.skipped.${refusal(placed.error)}`, vars: { asset: r.assetId, cap: CAP_PCT } });
    }
  }
}

/**
 * DRIP: the dividend this day buys the same asset at the next tick. The amount is the engine's own credit: clearOrders
 * emits one `dividend` event per holder and asset on the day's boundary, and those events come in here. A dividend the
 * cash cannot yet buy a unit of is carried to the next day.
 */
export function dripDay(g: GameState, out: StepOutput | null, events: StepEvent[]): void {
  const paid = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'dividend' || e.amount <= 0) continue;
    const k = `${e.playerId}\u0000${e.assetId}`;
    paid.set(k, (paid.get(k) ?? 0) + e.amount);
  }
  for (const [pid, L] of Object.entries(g.ledgers ?? {})) {
    if (!L.plans.drip.length) continue;
    const p = g.players[pid];
    const acct = g.market.accounts[pid];
    if (!p || p.npc || !acct) continue;
    for (const assetId of [...L.plans.drip]) {
      const pos = acct.positions[assetId];
      if (!pos || !(pos.qty > 0)) continue;
      const carry = (L.plans.carry[assetId] ?? 0) + (paid.get(`${pid}\u0000${assetId}`) ?? 0);
      if (!(carry > 0)) continue;
      const qty = unitsFor(g, assetId, Math.min(carry, cashOf(g, pid)));
      if (!(qty > 0)) { L.plans.carry[assetId] = carry; continue; }
      const placed = placeChecked(g, p, { assetId, side: 'buy', type: 'market', qty }, 'dividend_reinvest');
      if (!placed.ok) { L.plans.carry[assetId] = carry; continue; }
      const cost = qty * priceOf(g, assetId); // the buy is priced at the next tick; this is the day's mark, for the line only
      L.plans.carry[assetId] = Math.max(0, carry - cost);
      say(g, out, pid, 'plan', 'info', { key: 'work.drip.bought', vars: { asset: assetId, qty, amount: usd(cost) } });
    }
  }
}
