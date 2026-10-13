import { Rng, seedStream } from './rng';
import type { AssetDef, AssetState, CatalystConfig, StepEvent, WorldState } from './types';

/**
 * Catalysts: scheduled earnings with analyst previews, rumors and post-earnings drift.
 *
 * Every stock reports about once a quarter, before the open. Five days ahead, analysts publish a
 * consensus in [-1, 1] that is correlated (rho) with the real surprise; two days ahead a rumor may
 * leak, right `rumorAccuracy` of the time. On publication the rumor is partly priced in: `rumorPriceIn` of its expected move
 * prints at once (R-6C-1), and the report's gap takes the rest. The report gaps the price by `moveScale · surprise`
 * (scaled by the stock's vol), and a share of that move keeps drifting in over the next days
 * (post-earnings announcement drift). That gives a reading player a real but noisy edge.
 *
 * Everything runs on its own stream per stock ('earnings:<id>'), so the diffusion, jump and
 * volume streams are untouched and a world with `config.catalysts` unset prices exactly as before.
 */
export const DEFAULT_CATALYSTS: CatalystConfig = {
  everyDays: 63,
  jitterDays: 4,
  previewDays: 5,
  rumorDays: 2,
  rumorProb: 0.45,
  rumorAccuracy: 0.7,
  consensusSd: 0.55,
  rho: 0.5,
  moveScale: 0.055,
  peadShare: 0.3,
  peadDays: 8,
  rumorPriceIn: 0.5,
};

/** The typical size of a report move for a stock: E|surprise| (sqrt(2/pi) for a normal) times the per-unit move scale. */
export function typicalMove(def: AssetDef, cfg: CatalystConfig): number {
  return cfg.moveScale * (def.vol / 0.3) * Math.sqrt(2 / Math.PI);
}

/**
 * R-6C-1: the log move a rumor prints when it is published, in its direction. E[move | rumor] = (2p - 1) × the typical move, with p
 * the rumor's accuracy; the market takes `rumorPriceIn` of it at once. Zero when the price-in is off.
 */
export function rumorPrint(def: AssetDef, cfg: CatalystConfig, dir: 1 | -1): number {
  const share = cfg.rumorPriceIn ?? 0;
  if (!(share > 0)) return 0;
  return dir * share * (2 * cfg.rumorAccuracy - 1) * typicalMove(def, cfg);
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** 0-based game day a tick belongs to (the step after a multiple of ticksPerDay opens a new day). */
export function dayOfTick(tick: number, ticksPerDay: number): number {
  return tick <= 0 ? 0 : Math.floor((tick - 1) / ticksPerDay);
}

export interface EarningsOutcome {
  /** log jump to apply to price and value this tick */
  jump: number;
  events: StepEvent[];
}

/**
 * Day-boundary catalyst update for one stock. Mutates `a` (the step's working copy).
 * `day` is the day that is opening with this tick.
 */
export function catalystDay(
  a: AssetState, def: AssetDef, cfg: CatalystConfig, seed: string, day: number, tick: number, ticksPerDay: number,
): EarningsOutcome {
  const events: StepEvent[] = [];
  const rng = new Rng(a.erng ?? seedStream(seed, `earnings:${def.id}`));
  if (a.nextEarnings === undefined || a.nextEarnings < day) {
    // first sight of this stock (new world or an old save): spread reports over the first quarter
    a.nextEarnings = day + 2 + Math.floor(rng.uniform() * cfg.everyDays);
    a.consensus = null;
    a.surprise = null;
    a.rumor = null;
    delete a.rumorPrinted;
  }
  const away = a.nextEarnings - day;
  let jump = 0;

  if (away <= cfg.previewDays && away > 0 && (a.consensus === null || a.consensus === undefined)) {
    const c = clamp(cfg.consensusSd * rng.normal(), -1, 1);
    a.consensus = c;
    a.surprise = cfg.rho * (c / cfg.consensusSd) + Math.sqrt(1 - cfg.rho * cfg.rho) * rng.normal();
    a.rumor = null;
    events.push({ type: 'preview', tick, assetId: def.id, consensus: c, daysAway: away });
  }

  if (away === cfg.rumorDays && a.surprise != null && !a.rumor) {
    if (rng.chance(cfg.rumorProb)) {
      const truth: 1 | -1 = a.surprise >= 0 ? 1 : -1;
      const dir: 1 | -1 = rng.chance(cfg.rumorAccuracy) ? truth : (-truth as 1 | -1);
      a.rumor = dir;
      // R-6C-1: the rumor is partly priced in at publication (the same print as a news jump); the report gap below takes the rest
      const printed = rumorPrint(def, cfg, dir);
      if (printed !== 0) a.rumorPrinted = printed;
      jump += printed;
      events.push({ type: 'rumor', tick, assetId: def.id, direction: dir });
    }
  }

  if (away === 0) {
    const consensus = a.consensus ?? 0;
    const surprise = a.surprise ?? rng.normal();
    // the report's full move; the part a rumor already printed is not printed again (R-6C-1)
    const full = cfg.moveScale * (def.vol / 0.3) * surprise;
    jump = full - (a.rumorPrinted ?? 0);
    events.push({ type: 'earnings', tick, assetId: def.id, surprise, consensus, move: Math.exp(full) - 1 });
    a.lastEarnings = { day, surprise, move: Math.exp(full) - 1 };
    a.peadPerTick = (cfg.peadShare * full) / (cfg.peadDays * ticksPerDay);
    a.peadUntil = tick + cfg.peadDays * ticksPerDay;
    const jitter = Math.round((rng.uniform() * 2 - 1) * cfg.jitterDays);
    a.nextEarnings = day + cfg.everyDays + jitter;
    a.consensus = null;
    a.surprise = null;
    a.rumor = null;
    delete a.rumorPrinted;
  }

  a.erng = rng.state();
  return { jump, events };
}

/** Extra drift this tick from a recent report (0 when none). */
export function peadDrift(a: AssetState, tick: number): number {
  return a.peadUntil !== undefined && tick <= a.peadUntil ? (a.peadPerTick ?? 0) : 0;
}

export interface EarningsInfo {
  assetId: string;
  /** game day index of the next report */
  day: number;
  /** 0 = before today's open has passed (reported today), 1 = tomorrow before the open */
  daysAway: number;
  /** published analyst lean in [-1, 1], null before the preview */
  consensus: number | null;
  rumor: 1 | -1 | null;
  last: { day: number; surprise: number; move: number } | null;
}

/** The report of the asset at index `i` (the body of earningsInfo, with the index known). */
function earningsAt(state: WorldState, i: number, assetId: string): EarningsInfo | null {
  if (!state.config.catalysts) return null;
  if (state.config.assets[i]!.assetClass !== 'stock') return null;
  const a = state.assets[i]!;
  if (a.nextEarnings === undefined) return null;
  const today = dayOfTick(state.tick, state.config.ticksPerDay);
  // at the close (tick is a multiple of ticksPerDay) the next session is tomorrow
  return {
    assetId,
    day: a.nextEarnings,
    daysAway: a.nextEarnings - today,
    consensus: a.consensus ?? null,
    rumor: a.rumor ?? null,
    last: a.lastEarnings ?? null,
  };
}

/** What the public knows about a stock's next report, or null (not a stock, catalysts off, or not scheduled yet). */
export function earningsInfo(state: WorldState, assetId: string): EarningsInfo | null {
  if (!state.config.catalysts) return null;
  const i = state.config.assets.findIndex((d) => d.id === assetId);
  if (i < 0) return null;
  return earningsAt(state, i, assetId);
}

/**
 * Upcoming reports within `withinDays`, soonest first. Every view reads it (calendarFor), so the id-to-index search is one pass
 * over the assets rather than one search per asset (V1-PHASE9 9C.1). The answer is the same as earningsInfo per asset, duplicate
 * ids included (each asset takes the first index of its id, as findIndex does).
 */
export function earningsCalendar(state: WorldState, withinDays = 10): EarningsInfo[] {
  const out: EarningsInfo[] = [];
  const first = new Map<string, number>();
  state.config.assets.forEach((d, i) => { if (!first.has(d.id)) first.set(d.id, i); });
  for (const d of state.config.assets) {
    const e = earningsAt(state, first.get(d.id)!, d.id);
    if (e && e.daysAway >= 0 && e.daysAway <= withinDays) out.push(e);
  }
  return out.sort((x, y) => x.daysAway - y.daysAway || x.assetId.localeCompare(y.assetId));
}
