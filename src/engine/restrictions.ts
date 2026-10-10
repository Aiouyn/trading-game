import { dayOfTick } from './catalysts';
import type { Side, StepEvent, WorldState } from './types';

/**
 * Trading restrictions for company stocks (quant-company-building v1.7, DECISIONS C2 hooks 3 and 4). Pure: every function
 * takes a state and returns the next one.
 *
 * - Windows: a covered account (insiders: the owner set, the company treasury, alliance members) trades an asset only on
 *   the game days in `open` (F+2..F+21 after each filing). Outside them its orders are refused with `closedWindow`, and
 *   open orders it still holds are cancelled at the first tick of a closed day. A scheduled plan is the one exception.
 * - Lockups: sells of an asset by one account are refused before `untilDay` (`lockup`). Buys are not restricted.
 * - Programs: sell-only plans with escrow (the locked shares), and company buybacks. A plan's shares stay locked from
 *   commit until they are sold, released, or price-held (until the plan's end day + 63). Plans never buy.
 * - Exception, forced trades: a margin liquidation and a short squeeze buy-in are the broker's trades, not the account's
 *   choice, and they are not refused by a window or a lockup (a covered margin account can be sold out in a closed
 *   window when its price moves against it). Plan escrow is the one thing a liquidation never sells. Margin collateral
 *   excludes the locked shares. Decision for the lead: whether lockup shares should also be untouchable in a margin call.
 *
 * The world supplies the rules (who is covered, which days are open, the plan terms, the buyback program); the engine
 * enforces them on every route into placeOrder and the fill loop.
 */

/**
 * The trading rules (content/company.ts, COMPANY.trading), read by the engine from WorldConfig.companyRules. The defaults
 * here are the same numbers; a test keeps them equal to the content. planLeadDays: a plan commits that many game days
 * before its first day (v1.7). priceHoldDays: skipped shares stay locked that long after the last day (v1.5, G12).
 * planFloorMaxRatio: a minimum price is at most this share of the commit-day close (G12). planLiveLimit: live plans per
 * account and asset (v1.3). windowClosingDays: the warning starts this many open days before a window shuts (F+17..F+21).
 * buybackFloatPerDay: a buyback buys at most this share of float a game day (§5.2). tenderFloorRatio: a tender clears
 * this share of VWAP30 (§9.2).
 */
export interface CompanyRules {
  planLeadDays: number;
  priceHoldDays: number;
  planFloorMaxRatio: number;
  planLiveLimit: number;
  windowClosingDays: number;
  buybackFloatPerDay: number;
  tenderFloorRatio: number;
}

export const DEFAULT_COMPANY_RULES: CompanyRules = Object.freeze({
  planLeadDays: 63,
  priceHoldDays: 63,
  planFloorMaxRatio: 0.8,
  planLiveLimit: 2,
  windowClosingDays: 5,
  buybackFloatPerDay: 0.01,
  tenderFloorRatio: 1.2,
});

/** The rules in force for a world: the defaults, overridden by the world's config. */
export function companyRulesOf(s: WorldState): CompanyRules {
  return { ...DEFAULT_COMPANY_RULES, ...s.config.companyRules };
}

export interface WindowRule {
  /** covered accounts: their orders in the asset are checked against `open` */
  covered: string[];
  /** inclusive game-day ranges in which covered accounts may trade the asset */
  open: [number, number][];
}

export type ProgramKind = 'plan' | 'buyback';
export type PlanSkipReason = 'volume' | 'price' | 'halt';
export type PlanEndReason = 'completed' | 'terminated' | 'tender';

export interface Program {
  id: string;
  kind: ProgramKind;
  playerId: string;
  assetId: string;
  /** shares per game day (a plan sells up to this; a buyback buys up to this, at most 1% of float) */
  qtyPerDay: number;
  /** the game days of the program, ascending */
  days: number[];
  /** plans: the minimum sell price (limit), fixed at commit */
  minPrice?: number;
  /** the game day the program was committed or filed */
  committedDay: number;
  /** plans: shares locked for the days not yet sold, released or price-held */
  escrow: number;
  /** plans: shares skipped on price, locked until holdUntil */
  priceHold: number;
  /** buybacks: the float the program was filed against; every buyback in one asset must carry the same float */
  floatShares?: number;
  /** plans: how many game days after the last day a price hold lasts (the rule in force at commit) */
  holdDays?: number;
  holdUntil?: number;
  /** the last session day an order was placed for (each day gets at most one) */
  placedDay?: number;
  /** a plan that has run its last day, or was ended by delisting or a tender */
  ended?: { day: number; reason: PlanEndReason };
}

export interface TradingRestrictions {
  /** window rules by asset id */
  windows: Record<string, WindowRule>;
  /** sells refused before the given game day, by asset id then account id */
  lockups: Record<string, Record<string, number>>;
  /** plans and buybacks by program id */
  programs: Record<string, Program>;
  /** planBanned fail-safe (v1.4 G11): account id to the last game day its new plans are refused (no v1 path) */
  bans?: Record<string, number>;
  /** CEO exit freezes (B2, spec 9.1): account id to the first game day it may trade again; plans are not frozen */
  freezes?: Record<string, number>;
}

export const NO_RESTRICTIONS: TradingRestrictions = Object.freeze({ windows: {}, lockups: {}, programs: {} }) as TradingRestrictions;

export function restrictionsOf(s: WorldState): TradingRestrictions {
  return s.restrictions ?? NO_RESTRICTIONS;
}

/**
 * The game day an order placed at `tick` belongs to: the session that opens with the next tick. An order placed at the
 * close tick of day d (a multiple of ticksPerDay) is for day d + 1. A fill at tick T trades in dayOfTick(T).
 */
export function sessionDayAt(tick: number, ticksPerDay: number): number {
  return dayOfTick(tick + 1, ticksPerDay);
}

export function sessionDay(s: WorldState): number {
  return sessionDayAt(s.tick, s.config.ticksPerDay);
}

export interface WindowState {
  open: boolean;
  /** the last open day of the current range (when open) */
  closesDay?: number;
  /** the first open day after a closed day, if the schedule has one */
  opensDay?: number;
}

/** Whether an account may trade an asset on a day under the window rule. Accounts that are not covered are always open. */
export function windowOn(r: TradingRestrictions, assetId: string, playerId: string, day: number): WindowState {
  const rule = r.windows[assetId];
  if (!rule || !rule.covered.includes(playerId)) return { open: true };
  for (const [a, b] of rule.open) if (day >= a && day <= b) return { open: true, closesDay: b };
  let next: number | undefined;
  for (const [a] of rule.open) if (a > day && (next === undefined || a < next)) next = a;
  return { open: false, ...(next !== undefined ? { opensDay: next } : {}) };
}

export interface Gate {
  code: 'closedWindow' | 'lockup' | 'ceoExitFreeze';
  untilDay?: number;
}

/**
 * The refusal, if any, for an order by this account in this asset on this day. A plan order skips the window (the one
 * exception, §6.1) but not the lockup. Refusals carry the reject code and the day the restriction lifts.
 */
export function gateOn(r: TradingRestrictions, day: number, playerId: string, assetId: string, side: Side, kind?: ProgramKind): Gate | null {
  if (kind !== 'plan') {
    const frozen = r.freezes?.[playerId];
    if (frozen !== undefined && day < frozen) return { code: 'ceoExitFreeze', untilDay: frozen };
    const w = windowOn(r, assetId, playerId, day);
    if (!w.open) return { code: 'closedWindow', ...(w.opensDay !== undefined ? { untilDay: w.opensDay } : {}) };
  }
  if (side === 'sell') {
    const until = r.lockups[assetId]?.[playerId];
    if (until !== undefined && day < until) return { code: 'lockup', untilDay: until };
  }
  return null;
}

/** Warning for an order that is accepted in the last open days of a covered window (F+17..F+21, v1.7). */
export function closingWarning(r: TradingRestrictions, day: number, playerId: string, assetId: string, closingDays: number): { code: 'windowClosing'; closesDay: number } | undefined {
  const w = windowOn(r, assetId, playerId, day);
  if (w.open && w.closesDay !== undefined && w.closesDay - day < closingDays) return { code: 'windowClosing', closesDay: w.closesDay };
  return undefined;
}

/** Shares an account has locked in one asset on a day: plan escrow, plus price holds still in force. */
export function lockedQty(r: TradingRestrictions, playerId: string, assetId: string, day: number): number {
  let q = 0;
  for (const p of Object.values(r.programs)) {
    if (p.kind !== 'plan' || p.playerId !== playerId || p.assetId !== assetId) continue;
    q += p.escrow;
    if (p.priceHold > 0 && p.holdUntil !== undefined && day <= p.holdUntil) q += p.priceHold;
  }
  return q;
}

/** Live (not ended) plans an account has in one asset. */
export function livePlans(r: TradingRestrictions, playerId: string, assetId: string): number {
  let n = 0;
  for (const p of Object.values(r.programs)) if (p.kind === 'plan' && !p.ended && p.playerId === playerId && p.assetId === assetId) n++;
  return n;
}

function setProgram(r: TradingRestrictions, p: Program): TradingRestrictions {
  return { ...r, programs: { ...r.programs, [p.id]: p } };
}

/** A plan order filled `qty` shares: its escrow falls by the same amount. Completes the plan when it is the last day. */
export function programFill(r: TradingRestrictions, id: string, qty: number, orderDay: number, tick: number, events: StepEvent[]): TradingRestrictions {
  const p = r.programs[id];
  if (!p || p.kind !== 'plan') return r;
  return maybeEnd(setProgram(r, { ...p, escrow: Math.max(0, p.escrow - qty) }), id, orderDay, tick, events);
}

/**
 * A plan day's remaining quantity is over: `price` (the floor was not met) moves it into the price hold until the
 * plan's end day + 63; `volume` and `halt` release it. Never a breach, never carried to a later day.
 */
export function programRelease(r: TradingRestrictions, id: string, qty: number, reason: PlanSkipReason, orderDay: number, tick: number, events: StepEvent[]): TradingRestrictions {
  const p = r.programs[id];
  if (!p || p.kind !== 'plan' || !(qty > 0)) return r;
  const escrow = Math.max(0, p.escrow - qty);
  const last = p.days[p.days.length - 1]!;
  const next: Program = reason === 'price'
    ? { ...p, escrow, priceHold: p.priceHold + qty, holdUntil: last + (p.holdDays ?? DEFAULT_COMPANY_RULES.priceHoldDays) }
    : { ...p, escrow };
  events.push({ type: 'planSkipped', tick, programId: id, playerId: p.playerId, assetId: p.assetId, reason, qty });
  return maybeEnd(setProgram(r, next), id, orderDay, tick, events);
}

function maybeEnd(r: TradingRestrictions, id: string, orderDay: number, tick: number, events: StepEvent[]): TradingRestrictions {
  const p = r.programs[id];
  if (!p || p.kind !== 'plan' || p.ended) return r;
  const last = p.days[p.days.length - 1]!;
  if (orderDay < last || p.escrow > 0) return r;
  events.push({ type: 'planEnded', tick, programId: id, playerId: p.playerId, assetId: p.assetId, reason: 'completed' });
  return setProgram(r, { ...p, ended: { day: orderDay, reason: 'completed' } });
}

/**
 * Ends every live plan in an asset for a reason that settles the locked shares elsewhere: `terminated` (delisting, take
 * private, default) or `tender`. The escrow and any price hold are released (the holders are settled at once).
 */
export function endProgramsOn(r: TradingRestrictions, assetId: string, reason: 'terminated' | 'tender', day: number, tick: number, events: StepEvent[]): TradingRestrictions {
  let out = r;
  for (const id of Object.keys(r.programs).sort()) {
    const p = out.programs[id]!;
    if (p.kind !== 'plan' || p.assetId !== assetId || p.ended) continue;
    events.push({ type: 'planEnded', tick, programId: id, playerId: p.playerId, assetId, reason });
    out = setProgram(out, { ...p, escrow: 0, priceHold: 0, holdUntil: undefined, ended: { day, reason } });
  }
  return out;
}

/** Sets the window rule of one asset (replaces the previous rule). */
export function setWindow(r: TradingRestrictions, assetId: string, rule: WindowRule): TradingRestrictions {
  return { ...r, windows: { ...r.windows, [assetId]: { covered: [...rule.covered], open: rule.open.map(([a, b]) => [a, b] as [number, number]) } } };
}

/** Sets a lockup: sells of the asset by the account are refused before untilDay (the later of the old and new day). */
export function setLockup(r: TradingRestrictions, assetId: string, playerId: string, untilDay: number): TradingRestrictions {
  const prev = r.lockups[assetId]?.[playerId] ?? -Infinity;
  return { ...r, lockups: { ...r.lockups, [assetId]: { ...(r.lockups[assetId] ?? {}), [playerId]: Math.max(prev, untilDay) } } };
}

/** Freezes an account's trading (not its plans) until the given game day, the later of the old and new day (B2, spec 9.1). */
export function setFreeze(r: TradingRestrictions, playerId: string, untilDay: number): TradingRestrictions {
  const prev = r.freezes?.[playerId] ?? -Infinity;
  return { ...r, freezes: { ...(r.freezes ?? {}), [playerId]: Math.max(prev, untilDay) } };
}

export function withProgram(r: TradingRestrictions, p: Program): TradingRestrictions {
  return setProgram(r, p);
}
