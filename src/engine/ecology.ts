/**
 * Market ecology, SHADOW MODE (specs/quant-market-ecology.md, migration step 1).
 *
 * Six pools per asset (value, trend, retail, pension, market maker, and the macro that already exists)
 * are computed beside the live engine once per game day, at the close. They name desired orders as a
 * fraction of ADV from public information only, get cut by capacity, and the net flow clears against
 * the maker through the square-root impact law divided by a depth that shrinks when the maker's
 * inventory or h is high. The result is a SHADOW close series plus a cause vector, written to
 * state.ecology. Nothing here writes WorldState prices, volume, or any asset:/volume:/macro:/sector:
 * stream. The only randomness is the retail stream eco:retail:<assetId>.
 *
 * Inputs are the live engine's own numbers at the close: value lnV (drift, factor shocks, jumps,
 * GARCH h and the regime are all already in it), h, the regime, and the day's jumps (news). Macro
 * places no orders: it moves value and the pools react.
 */
import { DEFAULT_TRADING } from './config';
import { Rng, seedStream } from './rng';
import { jumpCompensator } from './drift';
import { tradingRegime } from './worldEvents';
import { initRivals, rivalsClose, rivalsDay } from './rivals';
import { indexMembers, policyWeights } from './indices';
import type {
  EcoAssetState, EcoCause, EcoLogAsset, EcoLogDay, EcologyConfig, EcologyState, EcoPool, RegimeId, WorldConfig, WorldState,
} from './types';

export const ECO_POOLS: readonly EcoPool[] = ['value', 'trend', 'retail', 'pension'] as const;

export const DEFAULT_ECOLOGY: EcologyConfig = {
  mode: 'off',
  logDays: 21,
  capacity: 3,
  permanentShare: 0.6,
  makerUnwind: 0.5,
  makerSize: 2,
  depthInv: 0.5,
  depthH: 0.25,
  depthMin: 0.4,
  valueClose: 0.9,
  valueMaxAdv: 4,
  valueGapCap: 0,
  newsPrint: 0.5,
  valuePrint: 0,
  valueVolScale: 1,
  trendK: 0.5,
  fadeK: 0.15,
  retailNoise: 0.25,
  retailHeadline: 0.1,
  headlineHalfLifeDays: 5,
  pensionK: 1,
  pensionMaxAdv: 1,
  pensionDays: 3,
  quarterDays: 63,
  reshuffleK: 1,
  sizes: { value: 15, trend: 1, retail: 4.5, pension: 7.5 },
  halfLives: { value: 20, trend: 21, retail: 10, pension: 63 },
};

/** The only hybrid weights a save may carry (spec migration: 25%, then full). */
export const HYBRID_WEIGHTS: readonly number[] = [0.25, 1] as const;

/**
 * Full-mode-only defaults (the ecology sets the WHOLE close: a 'full' save, hybrid weight 1, or enterSimMode). A value set
 * in config.ecology wins. Shadow, 25% hybrid, off and legacy never see these (they keep valuePrint 0 and an unscaled lnV).
 *   lnVVolScale 1.15: the world's own lnV takes 1.15x its non-jump diffusive shock (drift and jumps unscaled), so the
 *     public value line is jumpier and the price that tracks it gets near live vol (the value pool's 90%/day tracking
 *     alone gives ~0.86x).
 *   valuePrint 0.1: quotes reprice 10% of the day's non-jump value move at once, before any pool trades.
 * Chosen 2026-10-09 from /tmp/vol-lnv-scale.txt (60 x 720 gates, learnability, Tape's bands at 20/60 seeds all pass;
 * picked over 1.1/0.3 for IC room: IC63 2.9 SE above 0, IC1 0.044 inside its floor).
 */
export const FULL_MODE_DEFAULTS = { lnVVolScale: 1.15, valuePrint: 0.1 } as const;

/** The 100% save field (spec migration step 3): the ecology sets every close. Same path as hybrid weight 1. */
export const FULL_ECOLOGY = { mode: 'full', weight: 1 } as const;

/**
 * The weight the ecology has on the close: 1 for mode 'full' (weight absent or exactly 1), 0.25 or 1 for mode
 * 'hybrid' with an allowed weight, else 0. A made-up weight (0.3, '0.25', NaN, missing hybrid weight, full with
 * weight 0.25) is 0: that save stays on today's engine, byte for byte.
 */
export function ecologyWeight(cfg: WorldConfig): number {
  const e = cfg.ecology;
  if (!e) return 0;
  if (e.mode === 'full') return e.weight === undefined || e.weight === 1 ? 1 : 0;
  if (e.mode !== 'hybrid' || typeof e.weight !== 'number') return 0;
  return HYBRID_WEIGHTS.includes(e.weight) ? e.weight : 0;
}

/** Resolved ecology config. Only 'shadow', a valid 'hybrid' and a valid 'full' are on; anything else is off. */
export function ecologyConfig(cfg: WorldConfig): EcologyConfig {
  const e = cfg.ecology ?? {};
  const w = ecologyWeight(cfg);
  return {
    ...DEFAULT_ECOLOGY,
    ...e,
    mode: e.mode === 'shadow' ? 'shadow' : w > 0 ? (e.mode === 'full' ? 'full' : 'hybrid') : 'off',
    weight: e.mode === 'shadow' ? undefined : w > 0 ? w : undefined,
    sizes: { ...DEFAULT_ECOLOGY.sizes, ...e.sizes },
    halfLives: { ...DEFAULT_ECOLOGY.halfLives, ...e.halfLives },
  };
}

/** True when step() computes the ecology: mode 'shadow', a valid 'full', or 'hybrid' with an allowed weight. */
export function ecologyOn(cfg: WorldConfig): boolean {
  return cfg.ecology?.mode === 'shadow' || ecologyWeight(cfg) > 0;
}

/**
 * The share of a news jump that prints in the day's close, which is what a close-to-close vol band measures. The close
 * is the blend (1 - w) x live + w x auction (sim.ts ecologyStep), so the print share is the same blend: the live price
 * prints jumpImmediate at once, the closing auction prints newsPrint of the day's news (ecologyDay). w = 0 (off, shadow)
 * gives jumpImmediate, w = 1 (full) gives newsPrint. expectedVol(def, regime, closePrint(cfg)) is the daily target; 1 in
 * the bare engine (no print rule).
 */
export function closePrint(cfg: WorldConfig): number {
  const w = ecologyWeight(cfg);
  const live = cfg.jumpImmediate ?? 1;
  return w === 0 ? live : (1 - w) * live + w * (ecologyConfig(cfg).newsPrint ?? 1);
}

/**
 * Hybrid: move the ecology onto the day's actual (blended) closes, so tomorrow the pools, value gap and momentum
 * read the price that printed. Shifts each asset's core (the maker's skew is kept), replaces today's close in the
 * history, and moves a pension anchor set today. Pure.
 */
export function reanchorEcology(cfg: WorldConfig, eco: EcologyState, lnClose: readonly number[]): EcologyState {
  const ec = ecologyConfig(cfg);
  const quarterEnd = eco.day % ec.quarterDays === ec.quarterDays - 1;
  return {
    ...eco,
    assets: eco.assets.map((e, i) => {
      const c = lnClose[i]!;
      const closes = e.closes.slice();
      closes[closes.length - 1] = c;
      return { ...e, core: e.core + (c - e.lnS), lnS: c, closes, pensionAnchor: quarterEnd ? c : e.pensionAnchor };
    }),
  };
}

/** What the pools see at a close. All of it is the live engine's own state; none of it is the next shock. */
export interface EcoDayInput {
  day: number;
  tick: number;
  /** the world seed: rival streams (rivals.ts publicValueLine) are keyed on it */
  seed: string;
  regime: RegimeId;
  /** per asset, config order */
  lnV: number[];
  h: number[];
  /** sum of today's jumps (the news that printed today), log size */
  jump: number[];
  /** each index's members, in config order, once the index review has run (absent = the config's members) */
  members?: string[][];
  /** the pension pool's reshuffle on an index-review effective day: equal-weight units by asset id (indices.ts) */
  reshuffle?: Record<string, number>;
  /** 1 for an asset whose short squeeze fired today (squeeze on only), per asset, config order */
  squeeze?: number[];
}

export function ecoDayInput(state: WorldState, day: number): EcoDayInput {
  const cfg = state.config;
  const squeezes = cfg.squeeze !== undefined;
  return {
    day,
    tick: state.tick,
    seed: state.seed,
    regime: tradingRegime(state.worldEvents, state.tick, state.regime),
    lnV: state.assets.map((a) => a.lnV),
    h: state.assets.map((a) => a.h),
    jump: state.assets.map((a) => a.dayJump),
    ...(state.indices ? { members: cfg.indices.map((ix) => indexMembers(state, ix)) } : {}),
    ...(state.reshuffle && state.reshuffle.day === day ? { reshuffle: state.reshuffle.eq } : {}),
    ...(squeezes ? { squeeze: state.assets.map((a) => (a.coverTally && a.coverTally.day === day && a.coverTally.fired ? 1 : 0)) } : {}),
  };
}

function zeroPools(): Record<EcoPool, number> {
  return { value: 0, trend: 0, retail: 0, pension: 0 };
}

/** Fresh shadow book, anchored on the current live prices. */
export function initEcology(state: WorldState): EcologyState {
  return {
    day: -1,
    assets: state.config.assets.map((def, i) => {
      const lnP = state.assets[i]!.lnP;
      return {
        id: def.id, lnS: lnP, lnV: state.assets[i]!.lnV, core: lnP, skew: 0, inv: 0, pos: zeroPools(), closes: [lnP],
        headline: 0, pensionAnchor: lnP, own: 0, rng: seedStream(state.seed, `eco:retail:${def.id}`),
      };
    }),
    log: [],
    ...(state.config.rivals?.length ? { rivals: initRivals(state.config) } : {}),
  };
}

/**
 * Public rules for the player bucket (Tape's research-desk hunts): a day's player flow shows as a "Players" row only when
 * at least PUBLIC_MIN_TRADERS accounts traded the asset that day and none holds more than PUBLIC_MAX_TRADER_SHARE of
 * the day's gross player flow. Otherwise it folds into Retail, day by day, before any window is summed.
 */
export const PUBLIC_MIN_TRADERS = 5;
export const PUBLIC_MAX_TRADER_SHARE = 0.4;

/** Add the player's fills to today's own flow (signed, ADV), and to each account's gross flow for the Players rule. Pure. */
export function addOwnFlow(eco: EcologyState, cfg: WorldConfig, fills: { playerId: string; assetId: string; side: 'buy' | 'sell'; qty: number; price: number }[]): EcologyState {
  if (fills.length === 0) return eco;
  const assets = eco.assets.slice();
  for (const f of fills) {
    const i = cfg.assets.findIndex((a) => a.id === f.assetId);
    if (i < 0 || !assets[i]) continue;
    const adv = cfg.assets[i]!.advNotional ?? 1e9;
    const gross = (f.qty * f.price) / adv;
    const by = { ...(assets[i]!.ownBy ?? {}) };
    by[f.playerId] = (by[f.playerId] ?? 0) + gross;
    assets[i] = { ...assets[i]!, own: assets[i]!.own + (f.side === 'buy' ? 1 : -1) * gross, ownBy: by };
  }
  return { ...eco, assets };
}

/** The day's player bucket for the log: distinct accounts and the largest one's share of gross flow. */
function playerBucket(by: Record<string, number> | undefined): { accounts: number; maxShare: number } {
  let accounts = 0, total = 0, max = 0;
  for (const k in by ?? {}) {
    const v = by![k]!;
    if (v === 0) continue;
    accounts++;
    total += v;
    if (v > max) max = v;
  }
  return { accounts, maxShare: total > 0 ? max / total : 0 };
}

const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/**
 * One shadow close. Pure: returns the next ecology state (log included). Called by step() on the last
 * tick of each game day when config.ecology.mode is 'shadow'; also usable to replay recorded inputs.
 */
export interface EcologyDayOptions {
  /** the ecology sets (some of) the close: full, hybrid or enterSimMode. Only then does valueVolScale apply. */
  setsClose?: boolean;
  /** the ecology sets the WHOLE close (full save, hybrid weight 1, enterSimMode): FULL_MODE_DEFAULTS apply */
  full?: boolean;
}

export function ecologyDay(cfg: WorldConfig, eco: EcologyState, input: EcoDayInput, opts: EcologyDayOptions = {}): EcologyState {
  const ec = ecologyConfig(cfg);
  const Y = (cfg.trading ?? DEFAULT_TRADING).impactY;
  const rg = cfg.regimes[input.regime];
  const iota = ec.newsPrint ?? cfg.jumpImmediate ?? 1;
  const jp = cfg.jumpPermanent ?? cfg.permanentShare;
  const vpK = opts.full === true ? (cfg.ecology?.valuePrint ?? FULL_MODE_DEFAULTS.valuePrint) : ec.valuePrint;
  const scaleOn = opts.setsClose === true && ec.valueVolScale !== undefined && ec.valueVolScale !== 1;
  const sqrtYear = Math.sqrt(cfg.daysPerYear);
  // (written out per pool, no dynamic keys or object spreads: this runs on the close tick, which has a 1 ms budget)
  const dV = Math.pow(0.5, 1 / ec.halfLives.value), dT = Math.pow(0.5, 1 / ec.halfLives.trend);
  const dR = Math.pow(0.5, 1 / ec.halfLives.retail), dP = Math.pow(0.5, 1 / ec.halfLives.pension);
  const headDecay = Math.pow(0.5, 1 / ec.headlineHalfLifeDays);

  // pension: drift of each index member since the last quarter-end, relative to its index
  const qDay = input.day % ec.quarterDays;
  const pensionLive = qDay >= ec.quarterDays - ec.pensionDays;
  // policy weights follow the index membership in force today (indices.ts): the config's until a review has run
  const { index: pIdx, w: pW } = policyWeights(cfg, input.members ?? cfg.indices.map((ix) => ix.members));
  const idxDrift: number[] = cfg.indices.map(() => 0);
  if (pensionLive) {
    eco.assets.forEach((e, i) => {
      if (pIdx[i]! >= 0) idxDrift[pIdx[i]!]! += pW[i]! * (e.lnS - e.pensionAnchor);
    });
  }

  // rival funds plan their day from the closes already printed; their fills are slices of the pools' flow (rivals.ts)
  const rivalPlan = rivalsDay(cfg, eco, input.lnV, input.day, input.seed);
  const qValue = new Array<number>(eco.assets.length);
  const qTrend = new Array<number>(eco.assets.length);
  const assets: EcoAssetState[] = new Array(eco.assets.length);
  const logAssets: EcoLogAsset[] = new Array(eco.assets.length);
  for (let i = 0; i < eco.assets.length; i++) {
    const e = eco.assets[i]!;
    const def = cfg.assets[i]!;
    if (def.delisted) {
      // a delisted name has no pool flow: its book stays frozen and the log records zeros for it
      assets[i] = e;
      logAssets[i] = {
        id: e.id, lnS: e.lnS, lnV: input.lnV[i]!, desired: { value: 0, trend: 0, retail: 0, pension: 0, own: 0 }, net: 0, gross: 0,
        depth: 1, inv: e.inv, cause: { value: 0, trend: 0, retail: 0, pension: 0, own: 0, maker: 0, news: 0 },
      };
      continue;
    }
    const lnV = input.lnV[i]!;
    const h = input.h[i]!;
    const s = (def.vol * rg.volMult * Math.sqrt(h)) / sqrtYear; // the same σ_daily as trading.impact()
    // the value line the pools trade toward: live lnV, or (valueVolScale on, ecology setting the close) the ecology's
    // own line, whose non-jump diffusive innovation is scaled. drift = the day's deterministic lnV drift, exactly as
    // step() adds it (h and regime are fixed within a day), so ΔlnV − drift − jp·jump is the summed diffusive shock.
    let lnVe = lnV;
    if (scaleOn && e.lnV !== undefined) {
      const sig = def.vol * rg.volMult * Math.sqrt(h);
      const mu = def.drift + def.cycleBeta * rg.equityDrift - (cfg.jumpCompensation ? jumpCompensator(def, jp) : 0);
      const drift = (mu - 0.5 * (cfg.permanentShare * sig) ** 2) / cfg.daysPerYear;
      const jumpPart = jp * input.jump[i]!;
      lnVe = (e.lnVe ?? e.lnV) + drift + jumpPart + ec.valueVolScale! * (lnV - e.lnV - drift - jumpPart);
    }

    // news prints its immediate share; the rest of the move in value is a gap the pools trade
    const newsPrint = iota * input.jump[i]!;
    // quotes reprice a share of the day's non-jump value move at once (public information, no trade needed)
    const valuePrint = vpK && e.lnV !== undefined ? vpK * (lnV - e.lnV - jp * input.jump[i]!) : 0;
    // the maker works off part of yesterday's skew and inventory before today's flow
    const makerDecay = -ec.makerUnwind * e.skew;
    let core = e.core + newsPrint + valuePrint;
    let skew = e.skew + makerDecay;
    let inv = e.inv * (1 - ec.makerUnwind);
    // the book posted for today: thinner after a loaded day (yesterday's inventory) or when h is high
    const depth = clamp(1 / (1 + ec.depthInv * Math.abs(e.inv) / ec.makerSize + ec.depthH * Math.max(0, h - 1)), ec.depthMin, 1);
    const lnNow = core + skew;

    // ---- desired orders, ADV, public info only ----
    const q = zeroPools();
    // value: size the order to close valueClose of the gap through this book, capped
    const gapCap = ec.valueGapCap > 0 ? ec.valueGapCap * s : Infinity;
    const m = ec.valueClose * clamp(lnVe - lnNow, -gapCap, gapCap);
    q.value = sgn(m) * Math.min(ec.valueMaxAdv, ((Math.abs(m) * depth) / (Y * s)) ** 2);
    // trend: follow the last 63 shadow closes, fade the last 5 (closes through yesterday)
    const c = e.closes;
    const last = c[c.length - 1]!;
    const m63 = (last - c[Math.max(0, c.length - 64)]!) / (s * Math.sqrt(63));
    const r5 = (last - c[Math.max(0, c.length - 6)]!) / (s * Math.sqrt(5));
    q.trend = ec.trendK * Math.tanh(m63) - ec.fadeK * Math.tanh(r5);
    // retail: noise plus the sign of past headlines (it reads them a day late)
    const rng = new Rng(e.rng);
    q.retail = ec.retailNoise * rng.normal() + ec.retailHeadline * e.headline;
    // pension: in the last days of a quarter, pull back toward the policy (index) weight
    // capped at pensionMaxAdv a day (Phase 1 whale check, scripts/balance/huge-money.ts): the drift term has no bound of its own, so a single account's pump
    // (or crash) since the quarter's anchor drove the pool to 7 ADV a day, which cleared at +0.45 log on an account-idle
    // day. A passive pool trades a bounded rebalance a day, and the sign stays policy-relative (sell above the anchor).
    if (pensionLive && pIdx[i]! >= 0) {
      const want = -ec.pensionK * ((last - e.pensionAnchor) - idxDrift[pIdx[i]!]!);
      q.pension = clamp(want, -ec.pensionMaxAdv, ec.pensionMaxAdv);
    }
    // index review, effective day: the pension pool trades toward the new policy weight (ADV per equal-weight unit)
    const rsUnits = input.reshuffle?.[def.id] ?? 0;
    if (rsUnits !== 0) q.pension += ec.reshuffleK * rsUnits;
    // capacity: a pool already loaded on that side gets 1 / (1 + capacity · |position|)
    const p0 = e.pos;
    if (q.value !== 0 && sgn(q.value) === sgn(p0.value)) q.value /= 1 + (ec.capacity * Math.abs(p0.value)) / ec.sizes.value;
    if (q.trend !== 0 && sgn(q.trend) === sgn(p0.trend)) q.trend /= 1 + (ec.capacity * Math.abs(p0.trend)) / ec.sizes.trend;
    if (q.retail !== 0 && sgn(q.retail) === sgn(p0.retail)) q.retail /= 1 + (ec.capacity * Math.abs(p0.retail)) / ec.sizes.retail;
    if (q.pension !== 0 && sgn(q.pension) === sgn(p0.pension)) q.pension /= 1 + (ec.capacity * Math.abs(p0.pension)) / ec.sizes.pension;

    qValue[i] = q.value;
    qTrend[i] = q.trend;

    // ---- clear against the maker ----
    // F8 (Phase 1 huge money): the player's own flow enters the close capped at the trading layer's shared cap,
    // maxAdvPerTick (3 x ADV), in either direction, as ONE day's total. The trading layer applies that number per TICK
    // (trading.ts clearOrders, shared tally tickTraded); this close clears once a day, so the cap here is per day. The
    // per-tick reading times ticksPerDay (72 ADV a day at 24 ticks) would not bind on FROG's 5.83 ADV day, so it cannot
    // bound F8; the per-day reading is the lead's F8 decision, and the per-tick reading is still open for the lead to confirm. Uncapped, own flow reached 5.83 ADV
    // on FROG (+5.88 log in one day). e.own itself is left alone: the Players rule reads ownBy.
    const ownCap = (cfg.trading ?? DEFAULT_TRADING).maxAdvPerTick;
    const own = clamp(e.own, -ownCap, ownCap);
    const net = q.value + q.trend + q.retail + q.pension + own;
    const I = (sgn(net) * Y * s * Math.sqrt(Math.abs(net))) / depth;
    core += ec.permanentShare * I;
    skew += (1 - ec.permanentShare) * I;
    inv -= net;
    let lnS = core + skew;
    let floorAdj = 0;
    const lnFloor = Math.log(def.floor);
    if (lnS < lnFloor) { floorAdj = lnFloor - lnS; core += floorAdj; lnS = lnFloor; }

    const cause = {} as Record<EcoCause, number>;
    const share = (x: number) => (net !== 0 ? (I * x) / net : 0);
    cause.value = share(q.value) + valuePrint;
    cause.trend = share(q.trend);
    cause.retail = share(q.retail);
    cause.pension = share(q.pension);
    cause.own = share(own);
    cause.maker = makerDecay + 0; // + 0: no -0 in the save (JSON writes it as 0, so a reloaded save would differ under Object.is)
    cause.news = newsPrint + floorAdj;

    const pos = { value: p0.value * dV + q.value, trend: p0.trend * dT + q.trend, retail: p0.retail * dR + q.retail, pension: p0.pension * dP + q.pension };
    const closes = c.slice(c.length >= 64 ? c.length - 63 : 0);
    closes.push(lnS);
    // a squeeze reads as a headline too: +1 on the day it fires, like a jump up (retail reads it the next day)
    const sq = input.squeeze?.[i] ?? 0;
    const headline = clamp(e.headline * headDecay + sgn(input.jump[i]!) + (sq !== 0 ? sq : 0), -1, 1);
    const pensionAnchor = qDay === ec.quarterDays - 1 ? lnS : e.pensionAnchor;

    assets[i] = scaleOn
      ? { id: e.id, lnS, lnV, lnVe, core, skew, inv, pos, closes, headline, pensionAnchor, own: 0, ownBy: {}, rng: rng.state() }
      : { id: e.id, lnS, lnV, core, skew, inv, pos, closes, headline, pensionAnchor, own: 0, ownBy: {}, rng: rng.state() };
    logAssets[i] = {
      id: e.id, lnS, lnV,
      desired: { value: q.value, trend: q.trend, retail: q.retail, pension: q.pension, own },
      players: playerBucket(e.ownBy),
      net,
      gross: Math.abs(q.value) + Math.abs(q.trend) + Math.abs(q.retail) + Math.abs(q.pension) + Math.abs(own),
      depth, inv, cause,
    };
  }
  const entry: EcoLogDay = { day: input.day, tick: input.tick, regime: input.regime, assets: logAssets };
  const keep = Math.max(0, Math.floor(ec.logDays));
  const log = keep > 0 ? [...eco.log, entry].slice(-keep) : [];
  const rivals = rivalPlan ? rivalsClose(cfg, rivalPlan, qValue, qTrend, assets.map((a) => a.lnS)) : undefined;
  return { day: input.day, assets, log, ...(rivals ? { rivals } : {}) };
}

/** Shadow close per asset (price, not log). Empty when the ecology never ran. */
export function shadowPrices(state: WorldState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of state.ecology?.assets ?? []) out[a.id] = Math.exp(a.lnS);
  return out;
}

/** The kept per-day log (desired flow, depth, inventory, shadow close, cause vector), oldest first. */
export function ecologyLog(state: WorldState): EcoLogDay[] {
  return state.ecology?.log ?? [];
}

/** The rows of a move's explanation: pool types, the news print, and the player rows (never a name). */
export type ExplainRow = 'value' | 'trend' | 'retail' | 'pension' | 'maker' | 'news' | 'you' | 'players';

export interface MoveExplain {
  assetId: string;
  /** the closed window actually explained, clamped to the listing and the last closed day */
  from: number;
  to: number;
  /** the move as a log change: the sum of the parts exactly */
  totalLog: number;
  /** the same move as a fraction */
  total: number;
  /** log move per row, rows with no flow omitted */
  parts: Partial<Record<ExplainRow, number>>;
  /** days whose player flow failed the Players rule and went to Retail */
  foldedDays: number[];
}

/** A closed day's book for one asset: the depth factor and each trader pool's desired flow, in ADV. Pool types only. */
export interface DepthByPool {
  assetId: string;
  day: number;
  depth: number;
  desired: Record<'value' | 'trend' | 'retail' | 'pension', number>;
}

/**
 * Order depth on a closed day, by pool type. Closed days only: a day the log does not hold (the open session, or
 * before the listing) throws. The player's own flow is not in this view; it appears only through explainMove.
 */
export function depthByPool(state: WorldState, assetId: string, day: number): DepthByPool {
  const idx = state.config.assets.findIndex((a) => a.id === assetId);
  if (idx < 0) throw new Error(`depthByPool: unknown asset ${assetId}`);
  const entry = ecologyLog(state).find((d) => d.day === day);
  if (!entry) throw new Error(`depthByPool: day ${day} is not a closed day`);
  const a = entry.assets[idx]!;
  return {
    assetId, day, depth: a.depth,
    desired: { value: a.desired.value, trend: a.desired.trend, retail: a.desired.retail, pension: a.desired.pension },
  };
}

/**
 * Why an asset moved between two closed days, from the cause vector the pools wrote each close. Closed days only:
 * a window that reaches the open session, or any day after the last close, throws. The window is clamped to the first
 * logged day. Each day's player flow is decided on that day alone (Players or Retail) before the window is summed, so
 * subtracting two overlapping windows cannot isolate one account's flow.
 *
 * Not yet in: the market and sector split (the engine does not log its factor shocks); they arrive with the research
 * desk. The parts here are the pools, the news print and the player rows, and they sum to the total.
 */
export function explainMove(state: WorldState, assetId: string, fromDay: number, toDay: number): MoveExplain {
  const cfg = state.config;
  const log = ecologyLog(state);
  if (log.length === 0) throw new Error('explainMove: no closed days yet');
  const lastClosed = log[log.length - 1]!.day;
  if (fromDay > toDay) throw new Error(`explainMove: fromDay ${fromDay} is after toDay ${toDay}`);
  if (toDay > lastClosed) throw new Error(`explainMove: day ${toDay} is open or not closed (last closed day ${lastClosed})`);
  if (fromDay > lastClosed) throw new Error(`explainMove: fromDay ${fromDay} is after the last closed day ${lastClosed}`);
  const idx = cfg.assets.findIndex((a) => a.id === assetId);
  if (idx < 0) throw new Error(`explainMove: unknown asset ${assetId}`);

  const from = Math.max(fromDay, log[0]!.day);
  const soloYou = Object.keys(state.accounts).length === 1;
  const parts: Partial<Record<ExplainRow, number>> = {};
  const foldedDays: number[] = [];
  const add = (k: ExplainRow, v: number) => { if (v !== 0) parts[k] = (parts[k] ?? 0) + v; };
  let totalLog = 0;
  let days = 0;
  for (const day of log) {
    if (day.day < from || day.day > toDay) continue;
    const a = day.assets[idx];
    if (!a) continue;
    days++;
    const c = a.cause;
    add('value', c.value);
    add('trend', c.trend);
    add('retail', c.retail);
    add('pension', c.pension);
    add('maker', c.maker);
    add('news', c.news);
    // the player bucket, decided per day: solo is always "You"; online it is "Players" only past the public rule
    if (soloYou) add('you', c.own);
    else {
      const p = a.players;
      const shown = p !== undefined && p.accounts >= PUBLIC_MIN_TRADERS && p.maxShare <= PUBLIC_MAX_TRADER_SHARE;
      if (shown) add('players', c.own);
      else {
        add('retail', c.own);
        if (c.own !== 0) foldedDays.push(day.day);
      }
    }
    totalLog += c.value + c.trend + c.retail + c.pension + c.maker + c.news + c.own;
  }
  if (days === 0) throw new Error(`explainMove: no closed days for ${assetId} between ${fromDay} and ${toDay}`);
  return { assetId, from, to: toDay, totalLog, total: Math.expm1(totalLog), parts, foldedDays };
}
