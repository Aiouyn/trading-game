import {
  companyRulesOf, livePlans, lockedQty, programRelease, restrictionsOf,
  sessionDay, windowOn, withProgram, type Program, type TradingRestrictions,
} from './restrictions';
import { assetIndex, placeProgramOrder } from './trading';
import type { OrderRequest, Side, StepEvent, WorldState } from './types';

/**
 * Company programs (quant-company-building v1.7, DECISIONS C2 hooks 4 and 5): sell-only plans with escrow, and buyback
 * programs. The world files the terms; the engine checks the rules and places the day's orders at the session open.
 *
 * Plans: sell-only (any other side is refused), locked shares only (no cash escrow), a minimum price fixed at commit,
 * committed at least 63 game days before the first day, at most two live per account and asset. A plan can be neither
 * edited nor cancelled once committed. Buybacks: filed as a fixed daily schedule, executed only inside the covered
 * window, at most 1% of float a game day, from company cash (the treasury account's own cash).
 */

export interface PlanSpec {
  id: string;
  playerId: string;
  assetId: string;
  side: Side;
  qtyPerDay: number;
  /** ascending game days */
  days: number[];
  /** the minimum sell price, fixed at commit (split-adjusted by the world on a split) */
  minPrice: number;
}

export type PlanReject =
  | { code: 'planSellOnly' }
  | { code: 'planFloorTooHigh'; maxFloor: number }
  | { code: 'planLimit' }
  | { code: 'planInLockup' }
  | { code: 'planTooSoon'; earliestDay: number }
  | { code: 'planUnfunded'; shortfall: number }
  | { code: 'planBanned'; untilDay: number }
  | { code: 'planImmutable' }
  | { code: 'planBadSpec' }
  | { code: 'planExists' };

/** Commit a sell plan: locks its whole quantity (qtyPerDay x days) and records its terms. Refusals change nothing. */
export function commitPlan(s: WorldState, spec: PlanSpec): { state: WorldState; reject?: PlanReject } {
  if (spec.side !== 'sell') return { state: s, reject: { code: 'planSellOnly' } };
  const r = restrictionsOf(s);
  const rules = companyRulesOf(s);
  const i = assetIndex(s, spec.assetId);
  const acct = s.accounts[spec.playerId];
  const days = spec.days;
  const shaped = Number.isInteger(spec.qtyPerDay) && spec.qtyPerDay > 0 && days.length > 0
    && days.every((d) => Number.isInteger(d) && d >= 0) && days.every((d, k) => k === 0 || d > days[k - 1]!)
    && spec.minPrice > 0 && Number.isFinite(spec.minPrice);
  if (i < 0 || !acct || !shaped || s.config.assets[i]!.delisted) return { state: s, reject: { code: 'planBadSpec' } };
  if (r.programs[spec.id]) return { state: s, reject: { code: 'planExists' } };
  const today = sessionDay(s);
  const ban = r.bans?.[spec.playerId];
  if (ban !== undefined && today <= ban) return { state: s, reject: { code: 'planBanned', untilDay: ban } };
  // the commit-day close: the previous close when committed intraday, the current close at a close tick
  const a = s.assets[i]!;
  const close = Math.exp(s.tick % s.config.ticksPerDay === 0 ? a.lnP : a.lnOpen);
  if (spec.minPrice > rules.planFloorMaxRatio * close) return { state: s, reject: { code: 'planFloorTooHigh', maxFloor: rules.planFloorMaxRatio * close } };
  if (livePlans(r, spec.playerId, spec.assetId) >= rules.planLiveLimit) return { state: s, reject: { code: 'planLimit' } };
  if (days[0]! < today + rules.planLeadDays) return { state: s, reject: { code: 'planTooSoon', earliestDay: today + rules.planLeadDays } };
  const until = r.lockups[spec.assetId]?.[spec.playerId];
  if (until !== undefined && days.some((d) => d < until)) return { state: s, reject: { code: 'planInLockup' } };
  const need = spec.qtyPerDay * days.length;
  const held = acct.positions[spec.assetId]?.qty ?? 0;
  const unencumbered = held - lockedQty(r, spec.playerId, spec.assetId, today);
  if (need > unencumbered) return { state: s, reject: { code: 'planUnfunded', shortfall: need - unencumbered } };
  const program: Program = {
    id: spec.id, kind: 'plan', playerId: spec.playerId, assetId: spec.assetId, qtyPerDay: spec.qtyPerDay, days: days.slice(),
    minPrice: spec.minPrice, committedDay: today, escrow: need, priceHold: 0, holdDays: rules.priceHoldDays,
  };
  return { state: { ...s, restrictions: withProgram(r, program) } };
}

/** A committed plan cannot be edited (v1.4): this refuses every attempt and changes nothing. */
export function editPlan(s: WorldState): { state: WorldState; reject: { code: 'planImmutable' } } {
  return { state: s, reject: { code: 'planImmutable' } };
}

/** A committed plan cannot be cancelled (v1.4): this refuses every attempt and changes nothing. */
export function cancelPlan(s: WorldState): { state: WorldState; reject: { code: 'planImmutable' } } {
  return { state: s, reject: { code: 'planImmutable' } };
}

function markPlaced(r: TradingRestrictions, id: string, day: number): TradingRestrictions {
  const p = r.programs[id]!;
  return withProgram(r, { ...p, placedDay: day });
}

/**
 * The session open of each program day (the world calls it before the day's first tick). For a plan: below its minimum
 * price (or halted) the day sells nothing and its quantity is skipped (price is held, halt is released); otherwise one
 * limit sell at the minimum price for the day's quantity, out of escrow, good for that day. A buyback places one market
 * buy for the day's quantity, through placeProgramOrder, so the cash checks apply. One order per program per day.
 */
export function programsDay(s: WorldState): { state: WorldState; events: StepEvent[] } {
  const r0 = s.restrictions;
  if (!r0 || Object.keys(r0.programs).length === 0) return { state: s, events: [] };
  const day = sessionDay(s);
  const events: StepEvent[] = [];
  let state = s;
  for (const id of Object.keys(r0.programs).sort()) {
    const p = restrictionsOf(state).programs[id]!;
    if (p.ended || p.placedDay === day || !p.days.includes(day)) continue;
    const i = assetIndex(state, p.assetId);
    if (i < 0) continue;
    if (p.kind === 'plan') {
      const a = state.assets[i]!;
      const qty = Math.min(p.qtyPerDay, p.escrow);
      const halted = a.haltUntil !== -1;
      const floorMissed = Math.exp(a.lnP) < p.minPrice!;
      if (halted || floorMissed || qty <= 0) {
        const reason = halted ? 'halt' : 'price';
        const r1 = programRelease(restrictionsOf(state), id, qty, reason, day, state.tick, events);
        state = { ...state, restrictions: markPlaced(r1, id, day) };
        continue;
      }
      const req: OrderRequest = {
        playerId: p.playerId, assetId: p.assetId, side: 'sell', type: 'limit', limitPrice: p.minPrice, qty, tif: 'day', program: id,
      };
      const res = placeProgramOrder(state, req);
      state = { ...res.state, restrictions: markPlaced(restrictionsOf(res.state), id, day) };
      if (res.order.status === 'rejected') {
        if (res.order.rejectReason === 'closedWindow' || res.order.rejectReason === 'lockup') {
          events.push({ type: 'restricted', tick: state.tick, playerId: p.playerId, assetId: p.assetId, code: res.order.rejectReason });
        }
        // a refused plan day (a lockup set after commit) releases its escrow, or the plan could never end. No closed-list
        // skip reason fits a restriction; it is released as a volume skip (never a breach, never a price hold).
        state = { ...state, restrictions: programRelease(restrictionsOf(state), id, qty, 'volume', day, state.tick, events) };
      }
      continue;
    }
    // buyback: one market buy for the day's fixed quantity
    const req: OrderRequest = { playerId: p.playerId, assetId: p.assetId, side: 'buy', type: 'market', qty: p.qtyPerDay, tif: 'day', program: id };
    const res = placeProgramOrder(state, req);
    state = { ...res.state, restrictions: markPlaced(restrictionsOf(res.state), id, day) };
    if (res.order.status === 'rejected' && (res.order.rejectReason === 'closedWindow' || res.order.rejectReason === 'lockup')) {
      events.push({ type: 'restricted', tick: state.tick, playerId: p.playerId, assetId: p.assetId, code: res.order.rejectReason });
    }
  }
  return { state, events };
}

export interface BuybackSpec {
  id: string;
  /** the company treasury account */
  playerId: string;
  assetId: string;
  /** shares bought each scheduled day: at most 1% of float */
  qtyPerDay: number;
  /** the scheduled game days, all inside the covered window */
  days: number[];
  floatShares: number;
}

export type BuybackReject =
  | { code: 'buybackBadSpec' }
  | { code: 'buybackTooLarge'; maxPerDay: number }
  | { code: 'closedWindow'; untilDay?: number }
  | { code: 'planExists' };

/**
 * File a buyback program (§5.2). Refused when a day falls outside the treasury's open window (closedWindow, with the day
 * the window next opens), when the daily quantity is over 1% of float, or on a bad spec. Once filed it is immutable:
 * there is no edit path.
 */
export function addBuyback(s: WorldState, spec: BuybackSpec): { state: WorldState; reject?: BuybackReject } {
  const r = restrictionsOf(s);
  const rules = companyRulesOf(s);
  const i = assetIndex(s, spec.assetId);
  const acct = s.accounts[spec.playerId];
  const days = spec.days;
  const shaped = Number.isInteger(spec.qtyPerDay) && spec.qtyPerDay > 0 && days.length > 0
    && days.every((d) => Number.isInteger(d) && d >= 0) && days.every((d, k) => k === 0 || d > days[k - 1]!)
    && spec.floatShares > 0;
  if (i < 0 || !acct || !shaped) return { state: s, reject: { code: 'buybackBadSpec' } };
  if (r.programs[spec.id]) return { state: s, reject: { code: 'planExists' } };
  // the cap is one share of the asset's float a game day, summed over every buyback filed in that asset (v1.7 §5.2):
  // filing several programs on one day cannot exceed it. One float per asset, so a program cannot change the base.
  const filed = Object.values(r.programs).filter((p) => p.kind === 'buyback' && p.assetId === spec.assetId);
  if (filed.some((p) => p.floatShares !== spec.floatShares)) return { state: s, reject: { code: 'buybackBadSpec' } };
  const cap = rules.buybackFloatPerDay * spec.floatShares;
  let headroom = Infinity;
  for (const d of days) {
    const committed = filed.reduce((x, p) => (p.days.includes(d) ? x + p.qtyPerDay : x), 0);
    headroom = Math.min(headroom, cap - committed);
  }
  if (spec.qtyPerDay > headroom) return { state: s, reject: { code: 'buybackTooLarge', maxPerDay: Math.max(0, headroom) } };
  for (const d of days) {
    const w = windowOn(r, spec.assetId, spec.playerId, d);
    if (!w.open) return { state: s, reject: { code: 'closedWindow', ...(w.opensDay !== undefined ? { untilDay: w.opensDay } : {}) } };
  }
  const program: Program = {
    id: spec.id, kind: 'buyback', playerId: spec.playerId, assetId: spec.assetId, qtyPerDay: spec.qtyPerDay, days: days.slice(),
    committedDay: sessionDay(s), escrow: 0, priceHold: 0, floatShares: spec.floatShares,
  };
  return { state: { ...s, restrictions: withProgram(r, program) } };
}
