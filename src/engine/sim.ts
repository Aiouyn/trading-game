import { Rng, seedStream } from './rng';
import { DEFAULT_VOLUME, defaultConfig, idioLoading } from './config';
import { clearOrders, tallyToday } from './trading';
import { addOwnFlow, ECO_POOLS, ecoDayInput, ecologyDay, ecologyOn, ecologyWeight, FULL_MODE_DEFAULTS, initEcology, reanchorEcology } from './ecology';
import { catalystDay, peadDrift } from './catalysts';
import { carryOf, initRates, ratesDay } from './rates';
import { jumpCompensator } from './drift';
import type {
  AssetDef, AssetState, Fill, Quote, SeasonalDef, RegimeId, StepEvent, StepResult, WorldConfig, WorldState,
} from './types';

const LN2 = Math.log(2);

/** Create a fresh world. Same seed + same config => identical world forever. */
export function createWorld(seed: string, config: WorldConfig = defaultConfig()): WorldState {
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
  const world: WorldState = {
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
    config,
  };
  const regions = regionKeys(config);
  if (regions.length) {
    world.regionRng = {};
    for (const r of regions) world.regionRng[r] = seedStream(seed, `region:${r}`);
  }
  if (config.rates) world.rates = initRates(world, config.rates, 0);
  return world;
}

function regionKeys(config: WorldConfig): string[] {
  return [...new Set(config.assets.filter((a) => (a.wRegion ?? 0) !== 0 && a.region).map((a) => a.region!))].sort();
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

  // ---- day boundary: macro, central bank and yields (own stream) ----
  let rates = state.rates;
  let rateShocks: number[] | null = null;
  if (cfg.rates && newDay) {
    const out = ratesDay(state, cfg.rates, regime, Math.floor(state.tick / cfg.ticksPerDay), tick);
    rates = out.rates;
    rateShocks = out.shocks;
    for (const e of out.events) events.push(e);
  }
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
  const zRegion: Record<string, number> = {};
  let regionRng = state.regionRng;
  if (state.regionRng) {
    regionRng = {};
    for (const k of Object.keys(state.regionRng).sort()) {
      const r = new Rng(state.regionRng[k]!);
      zRegion[k] = r.normal();
      regionRng[k] = r.state();
    }
  }

  const vc = cfg.volume ?? DEFAULT_VOLUME;
  const heatDecay = Math.pow(0.5, 1 / (vc.heatHalfLifeDays * cfg.ticksPerDay));
  const tickOfDay = (tick - 1) % cfg.ticksPerDay;
  const uSession = 1 + vc.uShape * Math.cos((2 * Math.PI * (tickOfDay + 0.5)) / cfg.ticksPerDay);

  // full ecology only: the world's own lnV (the value the pools trade toward) takes lnVVolScale x its non-jump
  // diffusive shock, so the price that tracks it gets near live vol (Quant, FULL_MODE_DEFAULTS)
  const lnVScale = ecologyWeight(cfg) === 1 ? (cfg.ecology?.lnVVolScale ?? FULL_MODE_DEFAULTS.lnVVolScale) : 1;
  const eco = ecologyOn(cfg);

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
      (def.wRegion ? def.wRegion * (zRegion[def.region ?? ''] ?? 0) : 0) +
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

    // catalysts (own stream): earnings gap before the open, then post-earnings drift
    let catalyst = 0;
    let earn = 0;
    if (cfg.catalysts && def.assetClass === 'stock') {
      if (newDay || prev.nextEarnings === undefined) {
        const day = Math.floor(state.tick / cfg.ticksPerDay);
        const out = catalystDay(a, def, cfg.catalysts, state.seed, day, tick, cfg.ticksPerDay);
        if (out.jump !== 0) { catalyst += out.jump; earn = out.jump; a.dayJump += out.jump; }
        for (const e of out.events) events.push(e);
      }
      catalyst += peadDrift(a, tick);
    }
    // rates: yield repricing and policy/data surprises, once a day (all news, so value moves too)
    if (rateShocks && rateShocks[i]) {
      catalyst += rateShocks[i]!;
      if (eco) a.dayJump += rateShocks[i]!; // the pools read rate surprises as news, like earnings
    }

    // fundamental value: drift + the permanent share of news (catalysts are all news)
    const perm = cfg.permanentShare;
    // momentum fix: jumps can be fully permanent but print only partly at once (news underreaction);
    // the compensator keeps jumps from changing the expected return. Missing fields = the legacy model.
    const jp = cfg.jumpPermanent ?? perm;
    const mu = def.drift + def.cycleBeta * rg.equityDrift + carryOf(def, rates) - (cfg.jumpCompensation ? jumpCompensator(def, jp) : 0)
      + (def.seasonal ? seasonalDrift(def.seasonal, tick, cfg.ticksPerDay, cfg.daysPerYear) : 0);
    const diff = sigma * sqrtDt * shock;
    a.lnV = prev.lnV + (mu - 0.5 * (perm * sigma) ** 2) * dt + lnVScale * perm * diff + jp * jump + catalyst;

    // market price: same drift, pull toward V, full shock and jump
    const kappa = LN2 / (def.halfLifeDays / cfg.daysPerYear);
    const r = (mu - 0.5 * sigma * sigma) * dt + kappa * (a.lnV - prev.lnP) * dt + diff + (cfg.jumpImmediate ?? 1) * jump + catalyst;

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
    if (earn !== 0) heat += vc.jumpHeat * Math.abs(earn) + vc.reopenHeat;
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
    ...(regionRng ? { regionRng } : {}),
    ...(rates ? { rates } : {}),
  };
  const { state: cleared, fills, events: clearEvents } = clearOrders(priced, newDay);
  for (const e of clearEvents) events.push(e);
  if (!eco) return { state: cleared, events, fills };
  return ecologyStep(cleared, tick, events, fills);
}

/**
 * The market ecology (ported from engine-staging sim.ts). Runs after the live tick is final and only reads it.
 * Every tick it adds the accounts' fills to the day's own flow; on the day's last tick the six pools (value, trend,
 * retail, pension, maker, plus macro through value) clear one square-root auction and, at weight 1 (full), SET the
 * close: the closing auction. lnOpen moves with the close, so tomorrow's GARCH update still reads the live intraday
 * move (h and the regime stay the live engine's). The pools' orders join the asset's shared day tally, so one
 * tally holds everyone's flow; they trade after the day's last fills, so that write cannot change any price.
 */
function ecologyStep(cleared: WorldState, tick: number, events: StepEvent[], fills: Fill[]): StepResult {
  const cfg = cleared.config;
  const day = Math.floor((tick - 1) / cfg.ticksPerDay);
  let eco = cleared.ecology && cleared.ecology.assets.length === cfg.assets.length ? cleared.ecology : initEcology(cleared);
  eco = addOwnFlow(eco, cfg, fills);
  if (tick % cfg.ticksPerDay !== 0) return { state: { ...cleared, ecology: eco }, events, fills };
  const w = ecologyWeight(cfg);
  eco = ecologyDay(cfg, eco, ecoDayInput(cleared, day), { setsClose: w > 0, full: w === 1 });
  if (w === 0) return { state: { ...cleared, ecology: eco }, events, fills };
  const poolDay = eco.log.length && eco.log[eco.log.length - 1]!.day === day ? eco.log[eco.log.length - 1]! : null;
  const lnClose = cleared.assets.map((a, i) => {
    if (w === 1) return eco.assets[i]!.lnS;
    const live = a.lnP + a.pending; // a halted asset's unprinted live move counts in the live leg
    return Math.max((1 - w) * live + w * eco.assets[i]!.lnS, Math.log(cfg.assets[i]!.floor));
  });
  const assets = cleared.assets.map((a, i) => {
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
      const la = poolDay.assets.map((x, i) => ({ ...x, blend: { weight: w, live: cleared.assets[i]!.lnP + cleared.assets[i]!.pending - prevClose(i) } }));
      eco = { ...eco, log: [...eco.log.slice(0, -1), { ...poolDay, assets: la }] };
    }
    eco = reanchorEcology(cfg, eco, lnClose);
  }
  const moves: Record<string, number> = {};
  cleared.assets.forEach((a, i) => { const m = lnClose[i]! - a.lnP; if (Math.abs(m) > 1e-12) moves[cfg.assets[i]!.id] = Math.expm1(m); });
  events.push({ type: 'auction', tick, moves });
  return { state: { ...cleared, assets, ecology: eco }, events, fills };
}

/**
 * Annual drift of a seasonal asset: value carries amp · cos(2π (day − peakDay) / daysPerYear), so its drift per year
 * is the derivative, −amp · 2π · sin(…). Deterministic and public: a learnable cycle, not a free lunch (vol swamps it).
 */
export function seasonalDrift(s: SeasonalDef, tick: number, ticksPerDay: number, daysPerYear: number): number {
  const day = tick / ticksPerDay;
  return -s.amp * 2 * Math.PI * Math.sin((2 * Math.PI * (day - s.peakDay)) / daysPerYear);
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
    fundamental: Math.exp(a.lnV),
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
