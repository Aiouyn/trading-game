// The order ticket's pure rules (spec 1.4): the refusal of each field, the cost summary (fee, spread, round trip, break-even)
// and the mapping of an engine refusal to the field that caused it. No React here, so the rules are unit-tested.
import type { OrderType, Side } from '@/engine';
import { priceSideRefusal, roundPrice, stopSideKey } from './chartLevels';

/** A decimal field's text as a number: a comma or a dot reads as the decimal point; anything else reads as 0. */
export function parseDecimal(s: string): number {
  const v = Number(s.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

/** The field a refusal sits under (spec 1.4: refusals sit under the field that caused them). */
export type RefusalField = 'qty' | 'limit' | 'stop' | 'trail' | 'tp' | 'sl' | 'general';

/**
 * A refusal: the field it sits under, the copy under that field (`key`, absent for a silent one), and the copy the disabled
 * CTA shows as its label (`cta`, the short reason). Vars feed both.
 */
export interface Refusal {
  field: RefusalField;
  key?: string;
  cta: string;
  vars?: Record<string, string | number>;
}

export interface OrderCheck {
  side: Side;
  type: OrderType;
  /** the quantity in shares or units (already converted from dollars) */
  qty: number;
  /** stocks trade whole shares only */
  whole: boolean;
  /** the mid price now */
  mid: number;
  /** the price the order would trade at now (the estimate) */
  ref: number;
  /** entry prices as typed; 0 when empty */
  limit: number;
  stop: number;
  /** trailing percent as typed (0 to 50) */
  trail: number;
  /** TP and SL as typed; null when the field is empty */
  tp: number | null;
  sl: number | null;
  cash: number;
  bp: number;
  margin: boolean;
  /** the cash an order costs (buy: notional plus fee) */
  total: number;
  notional: number;
  held: number;
  /** the simple-mode cap on a buy (below Hustler), in dollars */
  simpleCap: boolean;
  capCash: number;
  capPct: number;
  capRank: string;
  /** the license tier the asset needs, when the account lacks it (the ticket is locked) */
  locked: boolean;
  lockedTier: string;
  /** a sell past the holding opens a short (a sell to open) */
  shorting: boolean;
  /** the units this order opens: a buy's size, or a sell's size past the holding */
  opening: number;
  /** the notional the open orders already commit (simple mode's aggregate cap, orders.ts openingNotionalOf) */
  committed: number;
  /** the account may short at all (the R0 permission; a Pro account may too) */
  canShort: boolean;
  /** the account may short this asset (a covered insider on a cash account may not short its own company) */
  shortOk: boolean;
  /** the collateral a short holds: its full notional, on top of the proceeds */
  shortCollateral: number;
  /** the commission on this order */
  fee: number;
  /**
   * The largest size a buy affords at this price (cash or buying power after the minimum fee), in the units of qty. Optional:
   * when it is above zero, a refused buy says "Max = X" under the field (UX stage 6, weakness 2).
   */
  max?: number;
}

/** A refusal and a warning (a warning never disables the CTA). */
export interface CheckResult {
  refusal: Refusal | null;
  /** a translation key for a note that does not block the order (a limit at the mid fills at once) */
  warning: string | null;
}

/**
 * The first failing rule wins, as the ticket always did. An empty size is not a refusal (no message under the field), only
 * the CTA's reason. A short sale is not checked here: the engine decides it, and its refusal is shown when it comes back.
 */
export function checkOrder(c: OrderCheck): CheckResult {
  const none = (warning: string | null = null): CheckResult => ({ refusal: null, warning });
  if (c.locked) return { refusal: { field: 'general', key: 'broker.refuse.license', cta: 'broker.refuse.license', vars: { tier: c.lockedTier } }, warning: null };
  if (!(c.qty > 0)) return { refusal: { field: 'qty', cta: 'broker.cta.size' }, warning: null };
  if (c.whole && !Number.isInteger(c.qty)) return { refusal: { field: 'qty', key: 'broker.refuse.whole', cta: 'broker.cta.whole' }, warning: null };
  if ((c.side === 'buy' || c.shorting) && c.simpleCap && c.committed + c.opening * c.mid > c.capCash + 1e-6) {
    return { refusal: { field: 'qty', key: 'broker.firstCap', cta: 'broker.cta.firstCap', vars: { pct: c.capPct, rank: c.capRank } }, warning: null };
  }
  const hasMax = c.max !== undefined && c.max > 0;
  if (c.side === 'buy' && !c.margin && c.total > c.cash + 1e-6) {
    const vars: Record<string, number> = hasMax ? { total: c.total, cash: c.cash, max: c.max! } : { total: c.total, cash: c.cash };
    return { refusal: { field: 'qty', key: hasMax ? 'broker.refuse.cashMax' : 'broker.refuse.cash', cta: 'broker.cta.cash', vars }, warning: null };
  }
  if (c.side === 'buy' && c.margin && c.total > c.bp + Math.max(0, -c.held) * c.ref + 1e-6) {
    const vars: Record<string, number> = hasMax ? { need: c.total, bp: c.bp, max: c.max! } : { need: c.total, bp: c.bp };
    return { refusal: { field: 'qty', key: hasMax ? 'broker.refuse.bpMax' : 'broker.refuse.bp', cta: 'broker.cta.bp', vars }, warning: null };
  }
  if (c.shorting && !c.canShort) {
    return c.held > 0
      ? { refusal: { field: 'qty', key: 'broker.refuse.fewer', cta: 'broker.cta.fewer' }, warning: null }
      : { refusal: { field: 'qty', key: 'broker.refuse.short', cta: 'broker.cta.short' }, warning: null };
  }
  if (c.shorting && !c.shortOk) return { refusal: { field: 'qty', key: 'broker.refuse.covered', cta: 'broker.cta.covered' }, warning: null };
  if (c.shorting && c.shortCollateral + c.fee > c.bp + 1e-6) {
    return { refusal: { field: 'qty', key: 'broker.refuse.bp', cta: 'broker.cta.bp', vars: { need: c.shortCollateral + c.fee, bp: c.bp } }, warning: null };
  }
  const limitType = c.type === 'limit' || c.type === 'stop_limit';
  const stopType = c.type === 'stop' || c.type === 'stop_limit';
  if (limitType && !(c.limit > 0)) return { refusal: { field: 'limit', key: 'broker.refuse.limit', cta: 'broker.cta.limit' }, warning: null };
  if (stopType && !(c.stop > 0)) return { refusal: { field: 'stop', key: 'broker.refuse.stop', cta: 'broker.cta.stop' }, warning: null };
  // a stop waits for the price to cross it: a buy stop above the mid, a sell stop below it (else it would trigger at once)
  if (stopType) {
    const side = stopSideKey(c.side, c.stop, c.mid);
    if (side) return { refusal: { field: 'stop', key: `broker.refuse.${side}`, cta: 'broker.cta.stopSide', vars: { mid: roundPrice(c.mid) } }, warning: null };
  }
  if (c.type === 'trailing' && !(c.trail > 0 && c.trail < 50)) return { refusal: { field: 'trail', key: 'broker.refuse.trail', cta: 'broker.cta.trail' }, warning: null };
  if (c.tp !== null && !(c.tp > 0)) return { refusal: { field: 'tp', key: 'broker.refuse.bracket', cta: 'broker.cta.bracket' }, warning: null };
  if (c.sl !== null && !(c.sl > 0)) return { refusal: { field: 'sl', key: 'broker.refuse.bracket', cta: 'broker.cta.bracket' }, warning: null };
  if (c.tp !== null && c.sl !== null) {
    const ok = c.side === 'buy' ? c.tp > c.sl : c.tp < c.sl;
    if (!ok) return { refusal: { field: 'tp', key: 'broker.refuse.bracketSide', cta: 'broker.cta.bracketSide' }, warning: null };
  }
  // A take-profit or stop-loss on the wrong side of the entry's price would fire at once: the legs are placed at the fill, so
  // the entry's own reference price (the limit, the stop, or the estimated fill) is the one they are checked against.
  const exit: Side = c.side === 'buy' ? 'sell' : 'buy';
  if (c.tp !== null) {
    const r = priceSideRefusal({ side: exit, type: 'limit' }, 'tp', c.tp, c.ref);
    if (r) return { refusal: { field: 'tp', key: r.key, cta: 'broker.cta.tpSide', vars: { price: r.vars.price } }, warning: null };
  }
  if (c.sl !== null) {
    const r = priceSideRefusal({ side: exit, type: 'stop' }, 'sl', c.sl, c.ref);
    if (r) return { refusal: { field: 'sl', key: r.key, cta: 'broker.cta.slSide', vars: { price: r.vars.price } }, warning: null };
  }
  // a limit on the marketable side of the mid fills at once: allowed, but said
  const marketable = limitType && c.limit > 0 && (c.side === 'buy' ? c.limit >= c.mid : c.limit <= c.mid);
  return none(marketable ? 'broker.warn.marketable' : null);
}

/** The variables of a refusal that are money (shown with the ticket's money formatter), and the one that is a size. */
const MONEY_VARS: readonly string[] = ['total', 'cash', 'bp', 'need'];

/**
 * A refusal's variables as the reader sees them: money as $1,234.56 (never a raw float), the max size as a quantity. Other
 * variables pass through. The formatters are the ticket's own (src/game/format.ts), so the copy matches the summary.
 */
export function formatRefusalVars(
  vars: Record<string, string | number> | undefined,
  fmt: { money: (n: number) => string; qty: (n: number) => string },
): Record<string, string | number> | undefined {
  if (!vars) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v !== 'number') out[k] = v;
    else if (MONEY_VARS.includes(k)) out[k] = fmt.money(v);
    else if (k === 'max') out[k] = fmt.qty(v);
    else out[k] = v;
  }
  return out;
}

/** The engine's refusal (a plain code from placeOrder) mapped to the field it belongs to and its copy. */
export interface EngineRefusal { field: RefusalField; key: string; vars?: Record<string, string | number> }

/**
 * Which field an engine refusal belongs to, and the copy for it. A sell the account cannot short shows the Pro-license line
 * (the engine says "insufficient position" to a short sale). Anything not mapped keeps the engine's own words under the CTA.
 */
export function engineRefusal(reason: string, side: Side, canShort: boolean, vars: { total?: number; cash?: number; bp?: number } = {}): EngineRefusal {
  const r = reason.trim().toLowerCase();
  if (r.startsWith('insufficient cash')) return { field: 'qty', key: 'broker.refuse.cashNow', vars: { cash: vars.cash ?? 0 } };
  if (r.startsWith('insufficient buying power')) return { field: 'qty', key: 'broker.refuse.bpNow', vars: { bp: vars.bp ?? 0 } };
  if (r.startsWith('covered short')) return { field: 'qty', key: 'broker.refuse.covered' };
  if (r.startsWith('insufficient position')) {
    return side === 'sell' && !canShort ? { field: 'qty', key: 'broker.refuse.short' } : { field: 'qty', key: 'broker.refuse.fewer' };
  }
  if (r === 'stacking') return { field: 'qty', key: 'broker.refuse.stacking' };
  if (r.startsWith('whole units')) return { field: 'qty', key: 'broker.refuse.whole' };
  if (r.startsWith('limit price')) return { field: 'limit', key: 'broker.refuse.limit' };
  if (r.startsWith('stop price')) return { field: 'stop', key: 'broker.refuse.stop' };
  if (r.startsWith('trail between')) return { field: 'trail', key: 'broker.refuse.trail' };
  if (r.startsWith('take-profit') || r.startsWith('bad take-profit')) return { field: 'tp', key: 'broker.refuse.bracketSide' };
  if (r.startsWith('bad stop-loss')) return { field: 'sl', key: 'broker.refuse.bracket' };
  return { field: 'general', key: 'broker.refuse.engine', vars: { reason } };
}

/**
 * The copy of an order change the engine refused (a chart drag, a cancel, a +TP or +SL): the engine's reason is never shown
 * raw (it is English and capitalized). The known reasons get their own line; the rest say the change was not accepted.
 */
export function changeRefusal(reason: string, side: Side, canShort: boolean, vars: { total?: number; cash?: number; bp?: number } = {}): { key: string; vars?: Record<string, string | number> } {
  const r = reason.trim().toLowerCase();
  if (r === 'order is closed') return { key: 'broker.refuse.closed' };
  if (r === 'below the filled quantity') return { key: 'broker.refuse.belowFilled' };
  if (r === 'not your order' || r === 'unknown order') return { key: 'broker.refuse.gone' };
  const e = engineRefusal(reason, side, canShort, vars);
  return e.key === 'broker.refuse.engine' ? { key: 'broker.refuse.engineGeneric' } : { key: e.key, vars: e.vars };
}

/** The inputs of the cost summary: the fill estimate, the fee, the spread and the account after. */
export interface SummaryInput {
  side: Side;
  qty: number;
  /** the estimated fill price (mid plus half spread and impact) */
  price: number;
  mid: number;
  fee: number;
  /** half the quoted spread as a fraction of mid, from the engine */
  halfSpreadFrac: number;
  cash: number;
  bp: number;
  margin: boolean;
  shorting: boolean;
  total: number;
  notional: number;
}

export interface Summary {
  /** the full quoted spread in dollars per unit, and as a fraction of mid */
  spread: number;
  spreadPct: number;
  /** the cost of going in and out at once: two fees and two crossings of the gap to mid */
  roundTrip: number;
  /** the price the position must reach to close even (the exit fee and the gap to mid included) */
  breakEven: number;
  cashAfter: number;
  bpAfter: number;
}

/**
 * The cost summary of the ticket. A round trip pays the fee twice and crosses the gap between the fill and the mid twice;
 * the break-even is the fill moved by the round trip per unit, up for a long and down for a short.
 */
export function tradeSummary(i: SummaryInput): Summary {
  const q = Math.max(0, i.qty);
  const slip = Math.abs(i.price - i.mid);
  const roundTrip = q > 0 ? 2 * i.fee + 2 * q * slip : 0;
  const perUnit = q > 0 ? roundTrip / q : 0;
  const long = i.side === 'buy';
  const breakEven = i.price + (long ? perUnit : -perUnit);
  const cashAfter = i.side === 'buy' ? i.cash - i.total : i.cash + i.total;
  let bpAfter = i.bp;
  if (i.side === 'buy') bpAfter = i.margin ? i.bp - i.notional : i.bp - i.total;
  else if (i.shorting) bpAfter = i.bp - i.notional;
  return {
    spread: 2 * i.halfSpreadFrac * i.mid,
    spreadPct: 2 * i.halfSpreadFrac,
    roundTrip,
    breakEven,
    cashAfter,
    bpAfter: Math.max(0, bpAfter),
  };
}
