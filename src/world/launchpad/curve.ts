import { LP, LP_K } from './constants';

/**
 * The bonding curve (lead-launchpad.md L3). Constant product on virtual reserves: the token reserve is Y, the cash reserve is
 * X = k / Y with k = X0 * Y0. The curve's real cash is X - X0, so the cash in the curve account is always at least the formula's
 * cash (the rounding favours the curve), and a sell can always be paid from it.
 *
 * Money is whole cents. A buy of S cents pays a fee of 1% of S (round half up), the rest c goes to the curve, and the trader gets
 * floor(Y - k / (X + c)) tokens. A sell of q tokens pays the curve floor(100 * (k/Y - k/(Y+q))) cents, and the trader gets that
 * less a 1% fee. Half of each fee goes to the creator (booked income) and half is a sink. Pure functions; no state.
 */

export interface BuyQuote {
  ok: true;
  /** whole tokens the trader receives */
  tokens: number;
  /** cents the trader pays in total (the fee included) */
  spendCents: number;
  /** cents of the fee, and its two halves */
  feeCents: number;
  creatorFeeCents: number;
  sinkFeeCents: number;
  /** cents that reach the curve account */
  cashCents: number;
  /** the spot price before and after the fill (dollars per token), and the average paid per token before the fee */
  spotBefore: number;
  spotAfter: number;
  avgPrice: number;
  /** avg / spot - 1 (the slippage a buy pays); price impact is spotAfter / spotBefore - 1 */
  slippage: number;
  impact: number;
  /** the fill reaches the graduation reserve: the curve has sold its last token */
  graduates: boolean;
}

export interface SellQuote {
  ok: true;
  tokens: number;
  /** cents the curve pays out before the fee */
  grossCents: number;
  feeCents: number;
  creatorFeeCents: number;
  sinkFeeCents: number;
  /** cents the trader receives (gross less the fee) */
  netCents: number;
  spotBefore: number;
  spotAfter: number;
  avgPrice: number;
  /** 1 - avg / spot: the slippage a sell pays */
  slippage: number;
  impact: number;
}

export type CurveRefusal = { ok: false; code: 'tooSmall' | 'tooLarge' | 'sold' | 'zero' };

/** the spot price at a virtual reserve: X / Y = k / Y^2 */
export function spotAt(y: number): number {
  return LP_K / (y * y);
}

/** the virtual cash reserve at a token reserve: X = k / Y */
export function cashReserveAt(y: number): number {
  return LP_K / y;
}

/** the share of the curve's supply already sold, from 0 to 1 */
export function curveProgress(y: number): number {
  return Math.min(1, Math.max(0, (LP.Y0 - y) / LP.CURVE_SUPPLY));
}

/** the cents a fee takes from a notional, and its split between the creator and the sink */
export function feeSplit(notionalCents: number): { fee: number; creator: number; sink: number } {
  const fee = Math.round(notionalCents * LP.FEE_RATE);
  const creator = Math.floor(fee / 2);
  return { fee, creator, sink: fee - creator };
}

/**
 * Quote a buy of `spendCents` (the trader's whole outlay, fee included) against a token reserve y. The fill never sells past the
 * curve's last token: a buy that reaches the graduation reserve is clipped to it, and the trader pays only for what fills.
 */
export function quoteBuy(y: number, spendCents: number): BuyQuote | CurveRefusal {
  if (!(spendCents > 0)) return { ok: false, code: 'zero' };
  const remaining = y - LP.GRAD_Y;
  if (!(remaining > 0)) return { ok: false, code: 'sold' };
  const spot0 = spotAt(y);
  const fee0 = feeSplit(spendCents);
  let cashCents = spendCents - fee0.fee;
  let tokens = Math.floor(y - LP_K / (cashReserveAt(y) + cashCents / 100));
  let spend = spendCents;
  let fee = fee0;
  if (tokens >= remaining) {
    // clip to the last tokens: the cash the curve needs for exactly `remaining`, rounded up to a cent, and the outlay that pays it
    const needed = LP_K / LP.GRAD_Y - cashReserveAt(y);
    cashCents = Math.ceil(needed * 100);
    spend = Math.ceil(cashCents / (1 - LP.FEE_RATE));
    fee = feeSplit(spend);
    while (spend - fee.fee < cashCents) { spend++; fee = feeSplit(spend); }
    cashCents = spend - fee.fee;
    tokens = remaining;
  }
  if (tokens <= 0) return { ok: false, code: 'tooSmall' };
  const y1 = y - tokens;
  const spot1 = spotAt(y1);
  const avg = cashCents / 100 / tokens;
  return {
    ok: true, tokens, spendCents: spend, feeCents: fee.fee, creatorFeeCents: fee.creator, sinkFeeCents: fee.sink, cashCents,
    spotBefore: spot0, spotAfter: spot1, avgPrice: avg, slippage: avg / spot0 - 1, impact: spot1 / spot0 - 1,
    graduates: y1 <= LP.GRAD_Y,
  };
}

/** Quote a sell of `tokens` whole tokens back to the curve. */
export function quoteSell(y: number, tokens: number): SellQuote | CurveRefusal {
  if (!Number.isInteger(tokens) || tokens <= 0) return { ok: false, code: 'zero' };
  if (y + tokens > LP.Y0) return { ok: false, code: 'tooLarge' };
  const spot0 = spotAt(y);
  const gross = LP_K / y - LP_K / (y + tokens);
  const grossCents = Math.floor(gross * 100 + 1e-9);
  const fee = feeSplit(grossCents);
  // the average is taken before the cent rounding, so a small sale is not priced in whole cents
  const avg = gross / tokens;
  const y1 = y + tokens;
  const spot1 = spotAt(y1);
  return {
    ok: true, tokens, grossCents, feeCents: fee.fee, creatorFeeCents: fee.creator, sinkFeeCents: fee.sink,
    netCents: grossCents - fee.fee, spotBefore: spot0, spotAfter: spot1, avgPrice: avg,
    slippage: 1 - avg / spot0, impact: spot1 / spot0 - 1,
  };
}

/** The cash the curve should hold at a token reserve, from the formula (real cash = X - X0). Used by the tests and the report. */
export function formulaCashAt(y: number): number {
  return cashReserveAt(y) - LP.X0;
}
