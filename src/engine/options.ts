import { expectedVolOf } from "./config";
import type { OptionsConfig, WorldState } from './types';

/**
 * Listed options (bible 01, Derivatives): calls and puts on the biggest names and indices-like
 * assets, weekly expiries, strikes around the money, Black-Scholes on the asset's current vol
 * (regime × GARCH), cash-settled at the close of the expiry day. Long only: players buy to open
 * and sell to close, so the most they can lose is the premium.
 */
export const DEFAULT_OPTIONS: OptionsConfig = {
  underlyings: [],
  expiryEvery: 5,
  expiries: 4,
  strikeSteps: [0.8, 0.85, 0.9, 0.95, 0.975, 1, 1.025, 1.05, 1.1, 1.15, 1.2],
  multiplier: 100,
  halfSpread: 0.03,
  minHalfSpread: 0.01,
  feePerContract: 0.65,
};

export type OptionKind = 'call' | 'put';

export interface OptionContract {
  id: string;
  underlying: string;
  kind: OptionKind;
  strike: number;
  /** 0-based game day whose close is the expiry */
  expiryDay: number;
}

export interface OptionQuote extends OptionContract {
  mid: number;
  bid: number;
  ask: number;
  delta: number;
  /** annualized vol used for the price */
  vol: number;
  intrinsic: number;
  /** trading days to expiry, fractional */
  daysLeft: number;
  expired: boolean;
}

export function contractId(c: Omit<OptionContract, 'id'>): string {
  return `${c.underlying}|${c.expiryDay}|${c.kind === 'call' ? 'C' : 'P'}|${c.strike}`;
}

export function parseContract(id: string): OptionContract | null {
  const p = id.split('|');
  if (p.length !== 4) return null;
  const expiryDay = Number(p[1]);
  const strike = Number(p[3]);
  if (!Number.isInteger(expiryDay) || !(strike > 0) || (p[2] !== 'C' && p[2] !== 'P')) return null;
  return { id, underlying: p[0]!, kind: p[2] === 'C' ? 'call' : 'put', strike, expiryDay };
}

/** Abramowitz-Stegun normal CDF (error < 7.5e-8). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function blackScholes(kind: OptionKind, S: number, K: number, T: number, r: number, sigma: number): { price: number; delta: number } {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = kind === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    return { price: intrinsic, delta: kind === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0) };
  }
  const sq = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / sq;
  const d2 = d1 - sq;
  if (kind === 'call') return { price: S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2), delta: normCdf(d1) };
  return { price: K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1), delta: normCdf(d1) - 1 };
}

export function optionsConfig(state: WorldState): OptionsConfig | null {
  return state.config.options ?? null;
}

function niceStrike(x: number): number {
  const step = x < 5 ? 0.25 : x < 25 ? 0.5 : x < 100 ? 1 : x < 250 ? 2.5 : x < 1000 ? 5 : x < 5000 ? 25 : x < 20000 ? 100 : 500;
  return Math.round(Math.round(x / step) * step * 100) / 100;
}

function riskFree(state: WorldState): number {
  return state.rates?.policy ?? state.config.margin?.fallbackRate ?? 0.03;
}

/** Live quote for a contract (also works for contracts no longer listed). */
export function optionQuote(state: WorldState, c: OptionContract): OptionQuote {
  const cfg = state.config.options;
  const tpd = state.config.ticksPerDay;
  const i = state.config.assets.findIndex((a) => a.id === c.underlying);
  if (i < 0) throw new Error(`unknown underlying ${c.underlying}`);
  const def = state.config.assets[i]!;
  const a = state.assets[i]!;
  const S = Math.exp(a.lnP);
  const expiryTick = (c.expiryDay + 1) * tpd;
  const ticksLeft = Math.max(0, expiryTick - state.tick);
  const T = ticksLeft / (tpd * state.config.daysPerYear);
  const vol = expectedVolOf(def, state.config, state.config.regimes[state.regime], 1, 1, Math.max(1, ticksLeft / tpd)) * Math.sqrt(a.h);
  const { price, delta } = blackScholes(c.kind, S, c.strike, T, riskFree(state), vol);
  const hs = Math.max(cfg?.minHalfSpread ?? 0.01, price * (cfg?.halfSpread ?? 0.03));
  const intrinsic = c.kind === 'call' ? Math.max(0, S - c.strike) : Math.max(0, c.strike - S);
  return {
    ...c, mid: price, bid: Math.max(0, price - hs), ask: price + hs, delta, vol, intrinsic,
    daysLeft: ticksLeft / tpd, expired: ticksLeft <= 0,
  };
}

/** True when the underlying was delisted (bankruptcy, merger): its options no longer trade and no chain is listed. */
export function underlyingDelisted(state: WorldState, underlying: string): boolean {
  const def = state.config.assets.find((a) => a.id === underlying);
  return def !== undefined && (def.listed === false || def.delisted === true);
}

/**
 * Listed expiry days (0-based game days) from today. Given an underlying, none when that name is delisted. Without one,
 * none when every configured underlying is delisted.
 */
export function listedExpiries(state: WorldState, underlying?: string): number[] {
  const cfg = state.config.options;
  if (!cfg) return [];
  const none = underlying !== undefined
    ? underlyingDelisted(state, underlying)
    : cfg.underlyings.length > 0 && cfg.underlyings.every((u) => underlyingDelisted(state, u));
  if (none) return [];
  const tpd = state.config.ticksPerDay;
  const today = state.tick <= 0 ? 0 : Math.floor((state.tick - 1) / tpd);
  const out: number[] = [];
  let e = Math.floor(today / cfg.expiryEvery) * cfg.expiryEvery + cfg.expiryEvery - 1;
  if (e < today || (e === today && state.tick >= (e + 1) * tpd)) e += cfg.expiryEvery;
  for (let k = 0; k < cfg.expiries; k++) out.push(e + k * cfg.expiryEvery);
  return out;
}

/** The option chain for one underlying and expiry: strikes around today's spot. */
export function optionChain(state: WorldState, underlying: string, expiryDay: number): { strike: number; call: OptionQuote; put: OptionQuote }[] {
  const cfg = state.config.options;
  if (!cfg || !cfg.underlyings.includes(underlying) || underlyingDelisted(state, underlying)) return [];
  const i = state.config.assets.findIndex((a) => a.id === underlying);
  const S = Math.exp(state.assets[i]!.lnP);
  const strikes = [...new Set(cfg.strikeSteps.map((k) => niceStrike(S * k)))].sort((x, y) => x - y);
  return strikes.map((strike) => {
    const base = { underlying, strike, expiryDay };
    const call = optionQuote(state, { ...base, kind: 'call', id: contractId({ ...base, kind: 'call' }) });
    const put = optionQuote(state, { ...base, kind: 'put', id: contractId({ ...base, kind: 'put' }) });
    return { strike, call, put };
  });
}

/** Mark-to-market value of an account's options (mid × multiplier × qty). */
export function optionsValue(state: WorldState, options: Record<string, { qty: number }> | undefined): number {
  if (!options) return 0;
  const mult = state.config.options?.multiplier ?? 100;
  let v = 0;
  for (const [id, pos] of Object.entries(options)) {
    const c = parseContract(id);
    if (!c) continue;
    v += optionQuote(state, c).mid * mult * pos.qty;
  }
  return v;
}
