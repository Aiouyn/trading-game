/**
 * The position tool's arithmetic (R-10-5): the risk panel's quantity, risk in dollars and in percent (synced both ways), the
 * reward to risk, and the net P&L at the take-profit and the stop after the spread and the fees. Pure, so the panel and the
 * tests share one answer.
 *
 * Units: a position of `qty` units of an asset worth `pointValue` quote currency per price point. Every asset in the game is
 * quoted per unit (a share, a coin, a base unit of FX), so the point value is 1 unless an asset says otherwise.
 */

/** Stock and crypto quantities trade in steps of this size (R-10-4 fractional shares). */
export const QTY_STEP = 0.0001;

export type Direction = 'long' | 'short';

export interface RiskInput {
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  /** the account's equity: the base of the risk percent */
  equity: number;
  /** the risk the player accepts, in dollars (one of the two synced fields) */
  riskUsd: number;
  /** the asset's full spread in basis points (AssetDef.spreadBps); each leg crosses half of it */
  spreadBps: number;
  /** the fees of one leg, in dollars (the engine's estimate at the entry size; both legs pay about this) */
  feePerLeg: number;
  /** quote currency per price point per unit (1 for every asset in the game) */
  pointValue?: number;
  /** the asset's quantity step (AssetDef.qtyStep: 1 for whole units); the quantity rounds down to it */
  qtyStep?: number;
  /** the most the player can buy (buying power over the entry): the quantity is sized down to it, never refused by it */
  maxQty?: number;
}

export interface RiskResult {
  /** units the risk pays for, rounded down to the quantity step (0 when the stop is on the wrong side) */
  qty: number;
  /** the stop distance in price points, always positive */
  distance: number;
  /** the risk in dollars the quantity actually carries (qty times the distance times the point value) */
  riskUsd: number;
  /** the same risk as a share of equity, 0 to 100 */
  riskPct: number;
  /** reward to risk: the target distance over the stop distance */
  rr: number;
  /** net P&L at the target and at the stop, after spread and fees */
  netAtTarget: number;
  netAtStop: number;
  /** the spread cost of the round trip (both legs) and the fees (both legs), in dollars */
  spreadCost: number;
  fees: number;
  /** the stop is on the wrong side of the entry, or the entry is not a price: the panel says why */
  valid: boolean;
}

/** Rounds a quantity down to the step (never up: a quantity that rounds up would carry more risk than the player accepted). */
export function floorQty(q: number, step = QTY_STEP): number {
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Number((Math.floor(q / step + 1e-9) * step).toFixed(8));
}

/** The stop sits on the losing side of the entry and the target on the winning side (a long: stop below, target above). */
export function sidesValid(direction: Direction, entry: number, stop: number, target: number): boolean {
  if (!(entry > 0) || !(stop > 0) || !(target > 0)) return false;
  return direction === 'long' ? stop < entry && target > entry : stop > entry && target < entry;
}

/** The position tool's numbers for one set of prices and a risk. */
export function riskOf(input: RiskInput): RiskResult {
  const pv = input.pointValue ?? 1;
  const valid = sidesValid(input.direction, input.entry, input.stop, input.target);
  const distance = Math.abs(input.entry - input.stop);
  const targetDistance = Math.abs(input.target - input.entry);
  const sign = input.direction === 'long' ? 1 : -1;
  // the quantity that carries exactly the risk the player accepts, rounded down to the step
  const step = input.qtyStep ?? QTY_STEP;
  const sized = valid && distance > 0 && pv > 0 ? floorQty(input.riskUsd / (distance * pv), step) : 0;
  const qty = input.maxQty === undefined ? sized : Math.min(sized, floorQty(input.maxQty, step));
  // each leg crosses half the spread: a round trip pays the full spread on the entry and the exit price
  const halfSpreadAt = (price: number) => (price * input.spreadBps) / 2 / 10_000;
  const spreadAtTarget = qty * (halfSpreadAt(input.entry) + halfSpreadAt(input.target));
  const spreadAtStop = qty * (halfSpreadAt(input.entry) + halfSpreadAt(input.stop));
  const fees = 2 * input.feePerLeg;
  const gross = (price: number) => sign * qty * pv * (price - input.entry);
  const riskUsd = qty * distance * pv;
  return {
    qty,
    distance,
    riskUsd,
    riskPct: input.equity > 0 ? (riskUsd / input.equity) * 100 : 0,
    rr: distance > 0 ? targetDistance / distance : 0,
    netAtTarget: gross(input.target) - spreadAtTarget - (qty > 0 ? fees : 0),
    netAtStop: gross(input.stop) - spreadAtStop - (qty > 0 ? fees : 0),
    spreadCost: spreadAtTarget,
    fees: qty > 0 ? fees : 0,
    valid,
  };
}

/** The risk in dollars for a risk percent of equity (the percent field's sync). */
export function riskUsdOf(pct: number, equity: number): number {
  return Math.max(0, (pct / 100) * equity);
}

/** The risk percent for a risk in dollars (the dollar field's sync). */
export function riskPctOf(usd: number, equity: number): number {
  return equity > 0 ? Math.max(0, (usd / equity) * 100) : 0;
}
