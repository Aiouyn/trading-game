import { Rng, seedStream } from './rng';
import { DEFAULT_VOLUME, defaultConfig, idioLoading } from './config';
import { clearOrders, publicValue, tallyToday } from './trading';
import { jumpCompensator } from './drift';
import { newsForTick } from './news';
import { addOwnFlow, ECO_POOLS, ecoDayInput, ecologyDay, ecologyOn, ecologyWeight, FULL_ECOLOGY, FULL_MODE_DEFAULTS, HYBRID_WEIGHTS, initEcology, reanchorEcology } from './ecology';
import type {
  AssetDef, AssetState, Fill, Quote, RegimeId, StepEvent, StepResult, WorldConfig, WorldState,
} from './types';

const LN2 = Math.log(2);

/**
 * THE new-world default (spec migration step 3). The ONE switch for which price path a NEW world starts on:
 *   'off'  = today's engine (no ecology field is written, byte for byte the legacy path)
 *   'full' = the ecology sets every close (writes FULL_ECOLOGY = { mode: 'full', weight: 1 } into the save)
 * FLIPPED to 'full' on 2026-10-09 (Tape's 100% bands + crowd gate passed, Ledger confirmed, 60-seed speed gate passed).
 * The 25% hybrid is a fallback only (opt in with createWorld(..., { ecology: 'hybrid25' })); the type keeps it from
 * ever being the default. Old saves (no ecology field, or off/shadow/hybrid) carry their own config and never pass
 * through createWorld again, so they stay on their original path. Use createWorld(..., { ecology: 'off' }) for the legacy engine.
 */
export const NEW_WORLD_ECOLOGY: 'off' | 'full' = 'full';

/** Which price path a new world starts on. */
export type NewWorldEcology = 'off' | 'full' | 'hybrid25';

export interface CreateWorldOptions {
  /**
   * Price path for this NEW world: 'off' (today's engine), 'full' (ecology sets the close, save field
   * { mode: 'full', weight: 1 }) or 'hybrid25' (fallback, { mode: 'hybrid', weight: 0.25 }).
   * Default: NEW_WORLD_ECOLOGY, applied only when the config carries no ecology field of its own.
   */
  ecology?: NewWorldEcology;
  /**
   * Older spelling: 0.25 = 'hybrid25', 1 = 'full'. Anything else throws. Ignored when `ecology` is given.
   */
  ecologyWeight?: number;
}

/** The save field a new world gets for a price-path choice (undefined = no field: the legacy path). Pure. */
export function newWorldEcologyField(choice: NewWorldEcology): EcologyConfigField | undefined {
  if (choice === 'full') return { ...FULL_ECOLOGY };
  if (choice === 'hybrid25') return { mode: 'hybrid', weight: 0.25 };
  if (choice === 'off') return undefined;
  throw new Error(`ecology must be 'off', 'full' or 'hybrid25', got ${String(choice)}`);
}
type EcologyConfigField = { mode: 'full' | 'hybrid'; weight: number };

/** Create a fresh world. Same seed + same config => identical world forever. */
export function createWorld(seed: string, config: WorldConfig = defaultConfig(), opts: CreateWorldOptions = {}): WorldState {
  let choice: NewWorldEcology | undefined = opts.ecology;
  if (choice === undefined && opts.ecologyWeight !== undefined) {
    if (!HYBRID_WEIGHTS.includes(opts.ecologyWeight)) throw new Error(`ecologyWeight must be one of ${HYBRID_WEIGHTS.join(', ')}, got ${opts.ecologyWeight}`);
    choice = opts.ecologyWeight === 1 ? 'full' : 'hybrid25';
  }
  // the default only fills a config with no ecology field; an explicit field (shadow, off, a test's knobs) is kept
  if (choice === undefined && config.ecology === undefined) choice = NEW_WORLD_ECOLOGY;
  if (choice !== undefined) {
    const field = newWorldEcologyField(choice);
    if (field) config = { ...config, ecology: { ...config.ecology, ...field } };
    else if (opts.ecology === 'off' && (config.ecology?.mode === 'full' || config.ecology?.mode === 'hybrid')) {
      config = { ...config, ecology: { ...config.ecology, mode: 'off', weight: undefined } };
    }
  }
  const ids = new Set<string>();
  for (const a of config.assets) {
    if (ids.has(a.id)) throw new Error(`duplicate asset id ${a.id}`);
    ids.add(a.id);
    if (!(a.initialPrice > 0)) throw new Error(`asset ${a.id}: initialPrice must be > 0`);
  }
  const sectors = sectorKeys(config);
  const sectorRng: WorldState['sectorRng'] = {};
  for (const s of sectors) sectorRng[s] = seedStream(seed, `sector:${s}`);
  const assets: AssetState[] = config.assets.map((a) => ({
    id: a.id,
    lnP: Math.log(a.initialPrice),
    lnV: Math.log(a.initialPrice),
    h: 1,
    lnOpen: Math.log(a.initialPrice),
    haltUntil: -1,
    haltedToday: false,
    dayJump: 0,
    pending: 0,
    rng: seedStream(seed, `asset:${a.id}`),
    vrng: seedStream(seed, `volume:${a.id}`),
    volume: 0,
    notional: 0,
    dayVolume: 0,
    dayNotional: 0,
    cumVolume: 0,
    heat: 0,
  }));
  return {
    version: 1,
    seed,
    tick: 0,
    regime: config.initialRegime,
    regimeLog: [],
    macroRng: seedStream(seed, 'macro:global'),
    sectorRng,
    assets,
    accounts: {},
    orders: [],
    orderSeq: 0,
    news: [],
    config,
  };
}

function sectorKeys(config: WorldConfig): string[] {
  return [...new Set(config.assets.map((a) => a.sector))].sort();
}

/**
 * Advance the world by one tick (5 real seconds). Pure: the input state is not mutated.
 * Queued orders (see trading.ts) clear at the end of the tick, after prices move.
 */
export function step(state: WorldState): StepResult {
  const cfg = state.config;
  const events: StepEvent[] = [];
  const tick = state.tick + 1;
  const dt = 1 / (cfg.ticksPerDay * cfg.daysPerYear);
  const sqrtDt = Math.sqrt(dt);
  const dayDt = 1 / cfg.daysPerYear;
  const macro = new Rng(state.macroRng);

  let regime: RegimeId = state.regime;
  let regimeLog = state.regimeLog;
  const newDay = state.tick > 0 && state.tick % cfg.ticksPerDay === 0;

  // ---- day boundary: regime transition (macro stream) ----
  if (newDay) {
    const def = cfg.regimes[regime];
    if (macro.chance(1 / def.meanDays)) {
      const to = pickNext(def.next, macro.uniform());
      if (to !== regime) {
        events.push({ type: 'regime', tick, from: regime, to });
        regimeLog = [...regimeLog, { tick, from: regime, to }];
        regime = to;
      }
    }
  }
  const rg = cfg.regimes[regime];
  // GARCH standardizes yesterday's return by yesterday's regime vol, so a regime switch
  // alone never inflates h (otherwise alpha * volMult^2 + beta > 1 in crises and h explodes)
  const prevVolMult = cfg.regimes[state.regime].volMult;

  // ---- common factor shocks (fixed draw order: market, crypto, then sectors sorted) ----
  const zMarket = macro.normal();
  const zCrypto = macro.normal();
  const zSector: Record<string, number> = {};
  const sectorRng: WorldState['sectorRng'] = {};
  for (const s of Object.keys(state.sectorRng).sort()) {
    const r = new Rng(state.sectorRng[s]!);
    zSector[s] = r.normal();
    sectorRng[s] = r.state();
  }

  const vc = cfg.volume ?? DEFAULT_VOLUME;
  const heatDecay = Math.pow(0.5, 1 / (vc.heatHalfLifeDays * cfg.ticksPerDay));
  const tickOfDay = (tick - 1) % cfg.ticksPerDay;
  const uSession = 1 + vc.uShape * Math.cos((2 * Math.PI * (tickOfDay + 0.5)) / cfg.ticksPerDay);

  // Full ecology only (enterSimMode or a save at weight 1; never 25%, shadow, off or legacy): scales the non-jump
  // diffusive shock of the world's own lnV, the value players see. Default FULL_MODE_DEFAULTS.lnVVolScale (1.15).
  const lnVScale = SIM_CONFIGS.has(cfg) || ecologyWeight(cfg) === 1 ? (cfg.ecology?.lnVVolScale ?? FULL_MODE_DEFAULTS.lnVVolScale) : 1;
  const assets: AssetState[] = new Array(state.assets.length);
  for (let i = 0; i < state.assets.length; i++) {
    const prev = state.assets[i]!;
    const def = cfg.assets[i]!;
    const rng = new Rng(prev.rng);
    const a: AssetState = { ...prev };

    // day boundary: GARCH(1,1) update on the day's standardized return, reset the open
    if (newDay) {
      const dayRet = prev.lnP - prev.lnOpen - prev.dayJump;
      const z = dayRet / (def.vol * prevVolMult * Math.sqrt(dayDt));
      const omega = 1 - cfg.garchAlpha - cfg.garchBeta;
      a.h = clamp(omega + cfg.garchAlpha * z * z + cfg.garchBeta * prev.h, cfg.garchMin, cfg.garchMax);
      a.lnOpen = prev.lnP;
      a.haltedToday = false;
      a.dayJump = 0;
    }

    // diffusive shock: factors + fat-tailed idiosyncratic noise
    const sigma = def.vol * rg.volMult * Math.sqrt(a.h);
    const eps = rng.studentT(cfg.studentNu);
    const shock =
      def.wMarket * rg.marketLoadMult * zMarket +
      def.wSector * (zSector[def.sector] ?? 0) +
      def.wCrypto * zCrypto +
      idioLoading(def) * rg.idioMult * eps;

    // compound Poisson jumps, Kou double exponential in log space
    let jump = 0;
    const lambda = def.jumpsPerYear * rg.jumpMult * dt;
    if (rng.chance(lambda)) {
      const up = rng.chance(clamp(def.jumpUpProb + rg.jumpUpShift, 0.05, 0.95));
      jump = up ? rng.exponential(def.jumpUpMean) : -rng.exponential(def.jumpDownMean);
      a.dayJump += jump;
      events.push({ type: 'jump', tick, assetId: def.id, logSize: jump });
    }

    // fundamental value: drift + the permanent share of news
    const perm = cfg.permanentShare;
    const jp = cfg.jumpPermanent ?? perm;
    const mu = def.drift + def.cycleBeta * rg.equityDrift - (cfg.jumpCompensation ? jumpCompensator(def, jp) : 0);
    const diff = sigma * sqrtDt * shock;
    a.lnV = lnVScale === 1
      ? prev.lnV + (mu - 0.5 * (perm * sigma) ** 2) * dt + perm * diff + jp * jump
      : prev.lnV + (mu - 0.5 * (perm * sigma) ** 2) * dt + lnVScale * perm * diff + jp * jump;

    // market price: same drift, pull toward V, full shock and jump
    const kappa = LN2 / (def.halfLifeDays / cfg.daysPerYear);
    const r = (mu - 0.5 * sigma * sigma) * dt + kappa * (a.lnV - prev.lnP) * dt + diff + (cfg.jumpImmediate ?? 1) * jump;

    a.rng = rng.state();
    const halted = prev.haltUntil !== -1;
    if (halted) {
      a.pending = prev.pending + r;
      if (tick >= prev.haltUntil) {
        // reopening auction: the whole halted move prints at once
        a.lnP = Math.max(prev.lnP + a.pending, Math.log(def.floor));
        events.push({ type: 'reopen', tick, assetId: def.id, gap: Math.exp(a.pending) - 1 });
        a.pending = 0;
        a.haltUntil = -1;
      }
    } else {
      a.lnP = Math.max(prev.lnP + r, Math.log(def.floor));
      if (def.circuitBreaker && !a.haltedToday) {
        const move = Math.exp(a.lnP - a.lnOpen) - 1;
        if (Math.abs(move) >= cfg.haltThreshold) {
          a.haltUntil = tick + cfg.haltTicks;
          a.haltedToday = true;
          events.push({ type: 'halt', tick, assetId: def.id, move });
        }
      }
    }
    // ---- volume (own stream, never feeds back into prices) ----
    const vrng = new Rng(prev.vrng ?? seedStream(state.seed, `volume:${def.id}`));
    const noise = Math.exp(vc.noise * vrng.normal() - 0.5 * vc.noise * vc.noise);
    a.vrng = vrng.state();
    let heat = (prev.heat ?? 0) * heatDecay;
    if (jump !== 0) heat += vc.jumpHeat * Math.abs(jump);
    for (let e = events.length - 1; e >= 0 && events[e]!.tick === tick; e--) {
      const ev = events[e]!;
      if (ev.type === 'halt' && ev.assetId === def.id) heat += vc.haltHeat;
      if (ev.type === 'reopen' && ev.assetId === def.id) heat += vc.reopenHeat;
    }
    a.heat = heat;
    const price = Math.exp(a.lnP);
    let notional = 0;
    let units = 0;
    // halted ticks print nothing; the tick that trips the halt and the reopening auction both trade
    if (prev.haltUntil === -1 || a.haltUntil === -1) {
      const z = Math.min(Math.abs(a.lnP - prev.lnP) / (sigma * sqrtDt), vc.zCap);
      const u = def.assetClass === 'crypto' ? 1 : uSession;
      notional = ((def.advNotional ?? 1e9) / cfg.ticksPerDay) * rg.volMult * Math.sqrt(a.h)
        * (vc.moveBase + vc.moveSlope * z) * u * (1 + heat) * noise;
      units = notional / price;
      if (def.assetClass === 'stock') { units = Math.round(units); notional = units * price; }
    }
    a.volume = units;
    a.notional = notional;
    a.dayVolume = (newDay ? 0 : prev.dayVolume ?? 0) + units;
    a.dayNotional = (newDay ? 0 : prev.dayNotional ?? 0) + notional;
    a.cumVolume = (prev.cumVolume ?? 0) + units;

    assets[i] = a;
  }

  const priced: WorldState = {
    ...state,
    tick,
    regime,
    regimeLog,
    macroRng: macro.state(),
    sectorRng,
    assets,
  };
  const day = Math.floor((tick - 1) / cfg.ticksPerDay);
  const jumps = events.filter((e): e is { type: 'jump'; tick: number; assetId: string; logSize: number } => e.type === 'jump' && e.tick === tick)
    .map((e) => ({ assetId: e.assetId, logSize: e.logSize }));
  const items = newsForTick(priced, tick, day, newDay, tick % cfg.ticksPerDay === 0, jumps);
  const kept = (priced.config.news?.kept ?? 120);
  const news = [...(state.news ?? []), ...items].slice(-kept);
  for (const item of items) events.push({ type: 'news', tick, item });
  const { state: cleared, fills } = clearOrders({ ...priced, news }, newDay);
  const sim = SIM_CONFIGS.has(cfg);
  if (!sim && !ecologyOn(cfg)) return { state: cleared, events, fills };
  // ---- ecology: runs after the live tick is final and only reads it ----
  let eco = cleared.ecology && cleared.ecology.assets.length === cfg.assets.length ? cleared.ecology : initEcology(state);
  eco = addOwnFlow(eco, cfg, fills);
  if (tick % cfg.ticksPerDay !== 0) return { state: { ...cleared, ecology: eco }, events, fills };
  eco = ecologyDay(cfg, eco, ecoDayInput(cleared, day), { setsClose: sim || ecologyWeight(cfg) > 0, full: sim || ecologyWeight(cfg) === 1 });
  // weight on the close: enterSimMode = 1 (harness only), else the save's weight (full = 1, hybrid 0.25 or 1), shadow = 0
  const w = sim ? 1 : ecologyWeight(cfg);
  if (w === 0) return { state: { ...cleared, ecology: eco }, events, fills };
  // ---- the ecology SETS the close (w = 1: enterSimMode, a save with mode 'full', or 'hybrid' weight 1) or a share of it
  // (w = 0.25). The ecology chain starts at the live price and is re-anchored on every printed close, so both legs
  // start from the same previous close C and the printed close is C + (1 − w)·(live move) + w·(ecology move)
  // = (1 − w)·live close + w·ecology close: the move is REPLACED, never added on top of the live day.
  // At w = 1 the close is exactly the ecology close (the live intraday path is dropped).
  // lnOpen moves with the close, so tomorrow's GARCH update (lnP - lnOpen - dayJump) still reads the LIVE
  // intraday move: h and the regime stay the live engine's. (Reading the overwritten close instead would feed
  // h the unprinted (1 - newsPrint) share of every jump as a fake shock: on tape-01..60 at 24 ticks/day that
  // halved mean h, 1.08 -> 0.58, and pushed kurtosis to 16.6.)
  // Impact: the ecology leg is ONE square-root clearing of net(pools + every account's fills today, summed in
  // addOwnFlow) against the maker; the live leg carries the accounts' intraday permanent moves. Each enters at
  // its weight, so a fill is never charged twice. The pools' orders join the asset's shared day tally, per side,
  // scaled by w (they move the price at weight w). They trade at the close, after the day's last fills, so the
  // tally write cannot change any price; it keeps one tally of everyone's flow.
  const poolDay = eco.log.length && eco.log[eco.log.length - 1]!.day === day ? eco.log[eco.log.length - 1]! : null;
  const lnFloor = (i: number) => Math.log(cfg.assets[i]!.floor);
  const closeOf = (a: AssetState, i: number) => {
    if (w === 1) return eco.assets[i]!.lnS;
    const live = a.lnP + a.pending; // a halted asset's unprinted live move counts in the live leg
    return Math.max((1 - w) * live + w * eco.assets[i]!.lnS, lnFloor(i));
  };
  const lnClose = cleared.assets.map(closeOf);
  const simAssets = cleared.assets.map((a, i) => {
    const c = lnClose[i]!;
    const next: AssetState = { ...a, lnP: c, lnOpen: a.lnOpen + (c - a.lnP), pending: 0 };
    if (poolDay) {
      const adv = cfg.assets[i]!.advNotional ?? 1e9;
      const d = poolDay.assets[i]!.desired;
      let buy = 0, sell = 0;
      for (const k of ECO_POOLS) { const x = d[k] * adv; if (x > 0) buy += x; else sell -= x; }
      if (w !== 1) { buy *= w; sell *= w; }
      const t = tallyToday(a.dayTraded, day);
      if (buy || sell) next.dayTraded = { day, buy: t.buy + buy, sell: t.sell + sell };
    }
    return next;
  });
  if (w !== 1) {
    // log the blend so the cause vector still explains the printed move, then re-anchor the pools on the close
    const prevClose = (i: number) => { const c = eco.assets[i]!.closes; return c.length >= 2 ? c[c.length - 2]! : eco.assets[i]!.lnS; };
    if (poolDay) {
      const assets = poolDay.assets.map((x, i) => ({ ...x, blend: { weight: w, live: cleared.assets[i]!.lnP + cleared.assets[i]!.pending - prevClose(i) } }));
      eco = { ...eco, log: [...eco.log.slice(0, -1), { ...poolDay, assets }] };
    }
    eco = reanchorEcology(cfg, eco, lnClose);
  }
  return { state: { ...cleared, assets: simAssets, ecology: eco }, events, fills };
}

/** Configs registered by enterSimMode(). Memory only: a WeakSet is never serialized, and a loaded or cloned
 * save carries a fresh config object, so it can never be in here. */
const SIM_CONFIGS = new WeakSet<WorldConfig>();

/**
 * HARNESS ONLY (learnability / crowd hunts). Returns a copy of `state` whose config is registered, in memory,
 * as 'sim': from then on step() lets the six-pool ecology SET each game day's close at 100% weight
 * (lnP at the close := the ecology's close, which starts at the live price). Pools, value gap and momentum
 * all see that price the next day. Intraday ticks still come from the live engine until the close
 * overwrite; GARCH h and the regime are still the live engine's (h reads the live intraday move, not the close).
 * Ecology knobs come from config.ecology (mode is ignored). Not a save field, not a flag value, never on
 * by default: JSON round-trips, structuredClone and fresh configs are not sim. Player fills still happen.
 */
export function enterSimMode(state: WorldState): WorldState {
  const config: WorldConfig = { ...state.config };
  SIM_CONFIGS.add(config);
  return { ...state, config };
}

/** True when this world was put into the harness-only sim mode by enterSimMode() in this process. */
export function isSimMode(state: WorldState): boolean {
  return SIM_CONFIGS.has(state.config);
}

/** Advance n ticks; collects events. Identical to calling step() n times. */
export function stepMany(state: WorldState, n: number): StepResult {
  let s = state;
  const events: StepEvent[] = [];
  const fills: Fill[] = [];
  for (let k = 0; k < n; k++) {
    const r = step(s);
    s = r.state;
    for (const e of r.events) events.push(e);
    for (const f of r.fills) fills.push(f);
  }
  return { state: s, events, fills };
}

export function quote(state: WorldState, assetId: string): Quote {
  const i = state.config.assets.findIndex((a) => a.id === assetId);
  if (i < 0) throw new Error(`unknown asset ${assetId}`);
  const a = state.assets[i]!;
  return {
    assetId,
    price: Math.exp(a.lnP),
    fundamental: publicValue(state, i),   // the same accessor the value-line mark cap reads
    halted: a.haltUntil !== -1 && a.haltUntil > state.tick,
    volume: a.volume ?? 0,
    notional: a.notional ?? 0,
    dayVolume: a.dayVolume ?? 0,
    dayNotional: a.dayNotional ?? 0,
    cumVolume: a.cumVolume ?? 0,
    adv: (state.config.assets[i]!.advNotional ?? 1e9) / Math.exp(a.lnP),
  };
}

/** Units traded this tick, per asset (for the chart's volume bars). */
export function volumes(state: WorldState): Record<string, number> {
  const out: Record<string, number> = {};
  state.config.assets.forEach((d, i) => { out[d.id] = state.assets[i]!.volume ?? 0; });
  return out;
}

export function prices(state: WorldState): Record<string, number> {
  const out: Record<string, number> = {};
  state.config.assets.forEach((d, i) => { out[d.id] = Math.exp(state.assets[i]!.lnP); });
  return out;
}

/** Cap-weighted index level (members' market cap relative to t = 0, times base). */
export function indexLevel(state: WorldState, indexId: string): number {
  const idx = state.config.indices.find((x) => x.id === indexId);
  if (!idx) throw new Error(`unknown index ${indexId}`);
  let cap = 0, cap0 = 0;
  for (const id of idx.members) {
    const i = state.config.assets.findIndex((a) => a.id === id);
    const def: AssetDef | undefined = state.config.assets[i];
    if (!def) throw new Error(`index ${indexId}: unknown member ${id}`);
    const sh = def.sharesOutstanding ?? 1;
    cap += sh * Math.exp(state.assets[i]!.lnP);
    cap0 += sh * def.initialPrice;
  }
  return (idx.base * cap) / cap0;
}

/** Game day number (0-based) for the current tick. */
export function gameDay(state: WorldState): number {
  return Math.floor(state.tick / state.config.ticksPerDay);
}

function pickNext(next: Partial<Record<RegimeId, number>>, u: number): RegimeId {
  const entries = Object.entries(next).sort(([a], [b]) => a.localeCompare(b)) as [RegimeId, number][];
  let acc = 0;
  for (const [id, p] of entries) {
    acc += p;
    if (u < acc) return id;
  }
  return entries[entries.length - 1]![0];
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export { jumpCompensator } from './drift';

/**
 * TEST-ONLY. Moves one asset's market price by `pct` (−0.015 = −1.5%) right now, leaving fundamental
 * value alone, so the normal pull slowly fades the move. Pure: returns a new state. Never call it from
 * gameplay; the app exposes it only behind `?e2e` for Playwright (stop-loss explainer, alerts).
 */
export function shockPrice(state: WorldState, assetId: string, pct: number): WorldState {
  const i = state.config.assets.findIndex((a) => a.id === assetId);
  if (i < 0) throw new Error(`shockPrice: unknown asset ${assetId}`);
  if (!Number.isFinite(pct) || pct <= -1) throw new Error(`shockPrice: pct must be a finite number above -1`);
  const def = state.config.assets[i]!;
  const assets = state.assets.slice();
  const a = assets[i]!;
  assets[i] = { ...a, lnP: Math.max(a.lnP + Math.log1p(pct), Math.log(def.floor)) };
  return { ...state, assets };
}

/**
 * TEST-ONLY. Moves one asset's fundamental value by `pct` (+0.1 = +10%) right now, leaving the market price
 * alone, so the normal pull walks the price toward the new value. Pure: returns a new state. Never called by
 * step() or gameplay; same throws as shockPrice.
 */
export function shockValue(state: WorldState, assetId: string, pct: number): WorldState {
  const i = state.config.assets.findIndex((a) => a.id === assetId);
  if (i < 0) throw new Error(`shockValue: unknown asset ${assetId}`);
  if (!Number.isFinite(pct) || pct <= -1) throw new Error(`shockValue: pct must be a finite number above -1`);
  const assets = state.assets.slice();
  const a = assets[i]!;
  assets[i] = { ...a, lnV: a.lnV + Math.log1p(pct) };
  return { ...state, assets };
}
