/**
 * Index reconstitution: the quarterly review (Phase 1, index-reshuffle days).
 *
 * Every `everyDays` game days (63 = quarterly) an index takes its review. The change is announced `announceDays` ahead
 * (a StepEvent 'announced' and a Wire story): listed assets that match the index rule and have been listed at least
 * `everyDays` days join, and members that were delisted leave. It takes effect at the open of the review day
 * ('effective'). The level is kept continuous by a divisor, so a reconstitution never moves the index by itself.
 *
 * The review is deterministic (no random stream). With no review configured, nothing here writes state and indexLevel
 * is the old cap-weighted formula, bit for bit. The effective day also writes WorldState.reshuffle, which the ecology's
 * pension pool reads on that day's close: it trades toward the new policy weights (the reshuffle day).
 */
import type { AssetDef, IndexDef, IndexReviewConfig, IndexRule, IndexState, StepEvent, WorldConfig, WorldState } from './types';

export const DEFAULT_INDEX_REVIEW: IndexReviewConfig = { everyDays: 63, announceDays: 3 };

/** Resolved review config, or null when reviews are off. The notice is at least one day and less than one review cycle. */
export function indexReviewConfig(cfg: WorldConfig): IndexReviewConfig | null {
  if (!cfg.indexReview) return null;
  const r = { ...DEFAULT_INDEX_REVIEW, ...cfg.indexReview };
  const everyDays = Math.max(2, Math.floor(r.everyDays));
  return { everyDays, announceDays: Math.min(everyDays - 1, Math.max(1, Math.floor(r.announceDays))) };
}

/** Members now: the reviewed list once a review has run, else the config's list. */
export function indexMembers(state: WorldState, idx: IndexDef): string[] {
  return state.indices?.[idx.id]?.members ?? idx.members;
}

/** Sum of shares × current price over the members (the live cap). Same arithmetic order as indexLevel. */
function capNow(state: WorldState, ids: readonly string[]): number {
  let cap = 0;
  for (const id of ids) {
    const i = state.config.assets.findIndex((a) => a.id === id);
    const def = state.config.assets[i];
    if (!def) throw new Error(`index: unknown member ${id}`);
    cap += (def.sharesOutstanding ?? 1) * Math.exp(state.assets[i]!.lnP);
  }
  return cap;
}

/** Sum of shares × initial price over the members: the level's reference cap at t = 0 (the config's, before any review). */
function capStart(state: WorldState, ids: readonly string[]): number {
  let cap0 = 0;
  for (const id of ids) {
    const def = state.config.assets.find((a) => a.id === id);
    if (!def) throw new Error(`index: unknown member ${id}`);
    cap0 += (def.sharesOutstanding ?? 1) * def.initialPrice;
  }
  return cap0;
}

/** Divisor now: the stored one once a review has run, else the config's t = 0 cap (so the level is the old formula). */
export function indexDivisor(state: WorldState, idx: IndexDef): number {
  const st = state.indices?.[idx.id];
  return st ? st.divisor : capStart(state, idx.members);
}

function isDelisted(state: WorldState, id: string): boolean {
  const def = state.config.assets.find((a) => a.id === id);
  return !def || !!def.delisted;
}

/** Whether an asset may join an index at a review effective on `day`: right class and region or sector, listed, and seasoned. */
export function eligibleFor(def: AssetDef, rule: IndexRule, day: number, everyDays: number): boolean {
  if (def.assetClass !== rule.assetClass) return false;
  if (def.listed === false || def.delisted) return false;
  if (rule.sectors && !rule.sectors.includes(def.sector)) return false;
  if (rule.regions && !(def.region !== undefined && rule.regions.includes(def.region))) return false;
  return def.listedDay === undefined || day - def.listedDay >= everyDays;
}

/**
 * Pension policy weights: each asset takes the weight it has in the first index (config order) whose members include it,
 * as its share of that index's cap at t = 0. `members` lists each index's members in config order.
 */
export function policyWeights(cfg: WorldConfig, members: readonly (readonly string[])[]): { index: number[]; w: number[] } {
  const index = cfg.assets.map(() => -1);
  const w = cfg.assets.map(() => 0);
  members.forEach((mem, k) => {
    let tot = 0;
    const caps = mem.map((id) => {
      const d = cfg.assets.find((a) => a.id === id);
      const c = d ? (d.sharesOutstanding ?? 1) * d.initialPrice : 0;
      tot += c;
      return c;
    });
    mem.forEach((id, j) => {
      const i = cfg.assets.findIndex((a) => a.id === id);
      if (i >= 0 && index[i] === -1 && tot > 0) { index[i] = k; w[i] = caps[j]! / tot; }
    });
  });
  return { index, w };
}

/**
 * The membership a review effective on `day` gives an index, in config order: the current members still listed, plus the
 * eligible listed assets that match the rule. Delisted members leave. Pure.
 */
function membersOn(state: WorldState, idx: IndexDef, day: number, everyDays: number): string[] {
  const cur = indexMembers(state, idx);
  const set = new Set(cur.filter((id) => !isDelisted(state, id)));
  if (idx.rule) {
    for (const def of state.config.assets) {
      if (eligibleFor(def, idx.rule, day, everyDays)) set.add(def.id);
    }
  }
  return state.config.assets.map((a) => a.id).filter((id) => set.has(id));
}

/** Adds and removes of a change from `cur` to `next`, in config order. */
function diff(cur: readonly string[], next: readonly string[]): { adds: string[]; removes: string[] } {
  return { adds: next.filter((id) => !cur.includes(id)), removes: cur.filter((id) => !next.includes(id)) };
}

/**
 * The index review for one game day, at its first tick `tick`. Pure: returns the next state and the events to publish.
 *   - announce (day = effective − announceDays): publish each index's planned adds and removes.
 *   - effective (day = k · everyDays, k ≥ 1): apply the membership, keep the level continuous with a new divisor, and set
 *     WorldState.reshuffle for the pension pool's close on that day.
 */
export function indicesDay(state: WorldState, tick: number): { state: WorldState; events: StepEvent[] } {
  const rc = indexReviewConfig(state.config);
  const events: StepEvent[] = [];
  if (!rc || state.config.indices.length === 0) return { state, events };
  const day = Math.floor((tick - 1) / state.config.ticksPerDay);
  const eff = day + rc.announceDays;
  if (eff % rc.everyDays === 0) {
    for (const idx of state.config.indices) {
      const { adds, removes } = diff(indexMembers(state, idx), membersOn(state, idx, eff, rc.everyDays));
      if (adds.length || removes.length) events.push({ type: 'index', tick, phase: 'announced', indexId: idx.id, day: eff, adds, removes });
    }
  }
  if (day > 0 && day % rc.everyDays === 0) return effectiveDay(state, day, tick, rc.everyDays, events);
  return { state, events };
}

function effectiveDay(state: WorldState, day: number, tick: number, everyDays: number, events: StepEvent[]): { state: WorldState; events: StepEvent[] } {
  const cfg = state.config;
  const oldAll = cfg.indices.map((idx) => indexMembers(state, idx));
  const newAll: string[][] = [];
  let indices: Record<string, IndexState> | undefined;
  cfg.indices.forEach((idx, k) => {
    const cur = oldAll[k]!;
    const next = membersOn(state, idx, day, everyDays);
    const { adds, removes } = diff(cur, next);
    const capOld = capNow(state, cur);
    const capNew = capNow(state, next);
    if ((adds.length === 0 && removes.length === 0) || !(capOld > 0 && capNew > 0)) { newAll.push(cur); return; }
    newAll.push(next);
    // level continuity: base · capNew / divNew = base · capOld / divOld
    const divNew = (capNew * indexDivisor(state, idx)) / capOld;
    indices = indices ?? { ...(state.indices ?? {}) };
    indices[idx.id] = { members: next, divisor: divNew };
    events.push({ type: 'index', tick, phase: 'effective', indexId: idx.id, day, adds, removes });
  });
  if (!indices) return { state, events };
  // the pension pool's reshuffle: each asset's change in policy weight, in equal-weight units (weight change × members)
  const before = policyWeights(cfg, oldAll);
  const after = policyWeights(cfg, newAll);
  const eq: Record<string, number> = {};
  cfg.assets.forEach((def, i) => {
    const k = after.index[i]!;
    if (k < 0) return;
    const units = (after.w[i]! - before.w[i]!) * newAll[k]!.length;
    if (Math.abs(units) > 1e-12) eq[def.id] = units;
  });
  return { state: { ...state, indices, reshuffle: { day, eq } }, events };
}
