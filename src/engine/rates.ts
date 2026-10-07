import { Rng, seedStream } from './rng';
import type { AssetDef, RatesConfig, RatesState, RegimeId, StepEvent, WorldState, YieldKey } from './types';

/**
 * Macro layer: inflation, growth, a Taylor-rule central bank and a yield curve (bible 01, Macro).
 *
 * Inflation and growth drift toward the current regime's targets once per game day. The central
 * bank meets every `meetingEvery` days and moves the policy rate toward the Taylor rule in 25 bp
 * steps; the market prices an expected move in advance, and the surprise (actual − expected) hits
 * equities. CPI and jobs releases alternate with a published consensus, so a reading player can
 * position for a "hot" or "cold" print. Bonds and property reprice on yield changes through
 * their duration and earn their yield as carry.
 *
 * Runs on its own stream ('rates:global'): turning rates on never changes the price streams.
 */
export const DEFAULT_RATES: RatesConfig = {
  neutralReal: 0.01,
  inflationTarget: 0.02,
  targets: {
    expansion: { inflation: 0.025, growth: 0.03, termPremium: 0.008 },
    overheating: { inflation: 0.045, growth: 0.02, termPremium: 0.004 },
    contraction: { inflation: 0.015, growth: -0.02, termPremium: 0.013 },
    recovery: { inflation: 0.02, growth: 0.04, termPremium: 0.01 },
  },
  reversion: 0.03,
  noise: 0.0012,
  meetingEvery: 8,
  maxMove: 0.005,
  stepSize: 0.0025,
  releaseEvery: 5,
  initial: { policy: 0.0325, inflation: 0.025, growth: 0.028 },
};

/** Equity move per unit of policy surprise (a +25 bp surprise hike moves stocks about −1%). */
const SURPRISE_EQUITY = -4;
/** Equity move per standard unit of data surprise. */
const CPI_EQUITY = -0.004;
const JOBS_EQUITY = 0.003;
/** Typical size of a data surprise. */
const RELEASE_SD = 0.0015;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function roundStep(x: number, stepSize: number): number {
  return Math.round(x / stepSize) * stepSize;
}

export function taylorRate(cfg: RatesConfig, inflation: number, growth: number): number {
  return Math.max(0, cfg.neutralReal + inflation + 0.5 * (inflation - cfg.inflationTarget) + 0.5 * (growth - 0.025));
}

function curve(cfg: RatesConfig, r: RatesState, regime: RegimeId): void {
  const taylor = taylorRate(cfg, r.inflation, r.growth);
  const tp = cfg.targets[regime].termPremium;
  r.y2 = Math.max(0, r.policy + 0.6 * (taylor - r.policy));
  r.y10 = Math.max(0, 0.4 * r.policy + 0.6 * (cfg.neutralReal + cfg.inflationTarget) + tp + 0.3 * (r.inflation - cfg.inflationTarget));
  r.y30 = r.y10 + 0.004 + 0.3 * tp;
  r.expectedMove = clamp(roundStep(0.7 * (taylor - r.policy), cfg.stepSize), -cfg.maxMove, cfg.maxMove);
}

export function initRates(state: WorldState, cfg: RatesConfig, day: number): RatesState {
  const r: RatesState = {
    policy: cfg.initial.policy,
    inflation: cfg.initial.inflation,
    growth: cfg.initial.growth,
    y2: 0, y10: 0, y30: 0, expectedMove: 0,
    nextMeeting: day + cfg.meetingEvery,
    nextRelease: day + 2,
    releaseKind: 'cpi',
    rng: seedStream(state.seed, 'rates:global'),
  };
  curve(cfg, r, state.regime);
  return r;
}

export interface RatesDay {
  rates: RatesState;
  /** log shock to add to every asset's price and value (index = config order) */
  shocks: number[];
  events: StepEvent[];
}

export function yieldOf(r: RatesState, key: YieldKey): number {
  return r[key];
}

/** Daily carry (annual) an asset earns from its keyed yield. */
export function carryOf(def: AssetDef, r: RatesState | undefined): number {
  if (!r || !def.yieldKey) return 0;
  return yieldOf(r, def.yieldKey) + (def.carrySpread ?? 0);
}

/**
 * Day-boundary macro update. `day` is the 0-based day that opens with this tick.
 * Returns the new rates and per-asset log shocks (yield repricing and surprise reactions).
 */
export function ratesDay(state: WorldState, cfg: RatesConfig, regime: RegimeId, day: number, tick: number): RatesDay {
  const prev = state.rates ?? initRates(state, cfg, day);
  const r: RatesState = { ...prev };
  const rng = new Rng(prev.rng);
  const events: StepEvent[] = [];
  const target = cfg.targets[regime];
  r.inflation = clamp(r.inflation + cfg.reversion * (target.inflation - r.inflation) + cfg.noise * rng.normal(), -0.02, 0.15);
  r.growth = clamp(r.growth + cfg.reversion * (target.growth - r.growth) + cfg.noise * rng.normal(), -0.08, 0.1);

  let equityShock = 0;
  let extraY10 = 0;

  if (day >= r.nextRelease) {
    const kind = r.releaseKind;
    const value = kind === 'cpi' ? r.inflation : r.growth;
    // the consensus is a noisy read of the true number; the release reveals the truth
    const consensus = value + RELEASE_SD * rng.normal();
    const s = clamp((value - consensus) / RELEASE_SD, -3, 3);
    events.push({ type: 'macro', tick, kind, actual: value, consensus });
    if (kind === 'cpi') { equityShock += CPI_EQUITY * s; extraY10 += 0.0004 * s; }
    else equityShock += JOBS_EQUITY * s;
    r.releaseKind = kind === 'cpi' ? 'jobs' : 'cpi';
    r.nextRelease = day + cfg.releaseEvery;
  }

  if (day >= r.nextMeeting) {
    const taylor = taylorRate(cfg, r.inflation, r.growth);
    const move = clamp(roundStep(taylor - r.policy, cfg.stepSize), -cfg.maxMove, cfg.maxMove);
    const expected = prev.expectedMove;
    r.policy = Math.max(0, r.policy + move);
    events.push({ type: 'rates', tick, policy: r.policy, change: move, expected });
    equityShock += SURPRISE_EQUITY * (move - expected);
    r.nextMeeting = day + cfg.meetingEvery;
  }

  curve(cfg, r, regime);
  r.y10 = Math.max(0, r.y10 + extraY10);
  r.rng = rng.state();

  const shocks = state.config.assets.map((def) => {
    let s = 0;
    if (def.duration && def.yieldKey) s -= def.duration * (yieldOf(r, def.yieldKey) - yieldOf(prev, def.yieldKey));
    else if (def.duration) s -= def.duration * (r.y10 - prev.y10);
    if (def.assetClass === 'stock' || def.assetClass === 'realestate') s += equityShock * Math.max(0.3, def.cycleBeta);
    return s;
  });
  return { rates: r, shocks, events };
}
