// T04-17: crisis scheduler, step 11 of the macro day step (04 §3.16.1-§3.16.3, 16 §3.7.3 crisis weeks, edges 8-9).
// Draws (S.crisis(), uOpen, fixed count so the stream position never depends on world state): 24 per day close —
//   [0] ripple count, [1..15] 3 ripple slots × (kind, target, sign, size, length), [16..18] storm (start, kind, precursor),
//   [19..23] major (start, kind, severity, precursor, contagion); chapterStart draws 2 (crisis week yes/no, week).
// Sub-choices (storm severity and target, major blocs) come from the within-bin fraction of the kind draw (unit decision, no extra draws).
import { dmath, EngineFault, TICKS_PER_CHAPTER, TICKS_PER_GAME_DAY, type Id, type ParamsView, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, CRISIS_KINDS, macroTables, RIPPLE_KINDS, STORM_KINDS, type BlocId, type CrisisKind, type CrisisSchedulerState, type EventTier, type GlobalMacroState, type SubDefKey,
  type RippleKind, type StormKind, type WorldEvent } from '../schema';
import { S } from '../streams';
import { utcBandOf, utcHourOfTick } from './calendar';
import { chooseBlocs, majorWeights, STORM_EFFECT_DAYS, subDefOf } from './crisisCatalog';
import { applyEventShocks, rippleEffect, storyShocks } from './shocks';
import { crisisWeekSourceId, writeHook } from './hooks';

const D = TICKS_PER_GAME_DAY;
const WEEK = 168 * D;
export const RIPPLE_SLOTS = 3;
export const DRAWS_PER_DAY = 24;
const V_NORM = 3.0;               // Σw at the reference world (04 §3.16.2)
const CRISIS_WEEK_P = 0.6, CRISIS_WEEK_MAJOR_MULT = 1.5, CRISIS_WEEK_STORM_MULT = 2;
const MAX_RIPPLES = RIPPLE_SLOTS, STORM_COOLDOWN_DAYS = 7, NO_START_FIRST_DAYS = 24, NO_TRIGGER_FINAL_DAYS = 48;
const SECTOR_COUNT = 12;

/** Scheduler state with the two storm bookkeeping fields (unit decision: optional, absent = never). */
export type SchedState = CrisisSchedulerState & { lastStormStartTick?: Tick | null; lastStormEndTick?: Tick | null };
export type MajorBlock = 'ACTIVE' | 'GAP' | 'FINAL_48' | 'FIRST_24' | 'PLAYER_SUPPRESS';
export interface ForceOpts { blocs?: BlocId[]; severity?: number; precursorDays?: number; contagionDays?: number }

export function globalOf(store: StoreRead): GlobalMacroState {
  const g = store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  if (!g) throw new EngineFault('MAC_STATE_MISSING', 'mac.global GLOBAL');
  return g;
}
export function schedOf(store: StoreRead): SchedState { return globalOf(store).scheduler as SchedState; }
function putSched(ctx: PhaseCtx, s: SchedState): void { ctx.store.put(macroTables.global.name, { ...globalOf(ctx.store), scheduler: s }); }
const chapterStartOf = (t: Tick): Tick => Math.floor(t / TICKS_PER_CHAPTER) * TICKS_PER_CHAPTER;
const pFromRate = (r: number): number => 1 - dmath.exp(-r);

/** Smallest k with P(N ≤ k) ≥ u for N ~ Poisson(mean) (cap 60). */
export function poissonInverse(u: number, mean: number): number {
  let k = 0, p = dmath.exp(-mean), c = p;
  while (u > c && k < 60) { k++; p *= mean / k; c += p; }
  return k;
}

export function crisisWeekActive(s: CrisisSchedulerState, tick: Tick): boolean {
  return s.crisisWeek !== null && tick >= s.crisisWeek.startTick && tick < s.crisisWeek.endTick;
}

/** λ_major per day = base × V × (1.5 in a crisis week), V = Σ catalog weights / 3.0. `weights` is a test seam. */
export function majorRate(store: StoreRead, crisisWeekActive: boolean, p: ParamsView, weights?: { kind: CrisisKind; w: number }[]): { lambda: number; V: number } {
  const ws = weights ?? majorWeights(store, defaultMacroPorts());
  const V = ws.reduce((a, x) => a + x.w, 0) / V_NORM;
  return { lambda: p.num('macro_major_base_rate') * V * (crisisWeekActive ? CRISIS_WEEK_MAJOR_MULT : 1), V };
}

/** First tick ≥ from whose UTC hour falls in `band` (0 = 00-08, 1 = 08-16, 2 = 16-24). */
export function plannedTrigger(header: { tick: Tick; sealUtcMs: bigint }, from: Tick, band: 0 | 1 | 2): Tick {
  let k = from;
  while (utcBandOf(utcHourOfTick(header, k)) !== band) k++;
  return k;
}

/** Hard constraints on a new MAJOR starting at tick + 1 with trigger `plannedTriggerTick`; the first failing reason, in this order. */
export function constraintsAllowMajor(s: CrisisSchedulerState, tick: Tick, plannedTriggerTick: Tick, chapterStartTick: Tick, chapterEndTick: Tick, p: ParamsView):
  { ok: boolean; reason?: MajorBlock } {
  const c0 = chapterStartTick, cEnd = chapterEndTick;
  if (s.activeMajorId !== null) return { ok: false, reason: 'ACTIVE' };
  if (s.lastMajorStartTick !== null && plannedTriggerTick - s.lastMajorStartTick < p.num('macro_major_min_gap_days') * D) return { ok: false, reason: 'GAP' };
  if (plannedTriggerTick >= cEnd - NO_TRIGGER_FINAL_DAYS * D) return { ok: false, reason: 'FINAL_48' };
  if (tick + 1 < c0 + NO_START_FIRST_DAYS * D) return { ok: false, reason: 'FIRST_24' };
  if (s.playerCausedSuppressUntil !== null && tick < s.playerCausedSuppressUntil) return { ok: false, reason: 'PLAYER_SUPPRESS' };
  return { ok: true };
}

const plannedEnd = (tier: EventTier, trigger: Tick, contagionDays: number): Tick =>
  trigger + (tier === 'MAJOR' ? D : 0) + Math.floor(contagionDays * D);

/** Creates the record in PRECURSOR (trigger in the future) and the scheduler bookkeeping; MAJOR precursor shocks are applied when precursorDays > 0;
 *  emits SEALED macro.event.internal. contagionDays: MAJOR days from trigger + 1 day to RECOVERY; STORM/RIPPLE days from trigger to ENDED. */
export function startEvent(ctx: PhaseCtx, tier: EventTier, kind: WorldEvent['kind'], blocs: BlocId[], severity: number, precursorDays: number,
  contagionDays: number, origin: WorldEvent['origin'], triggerTick: Tick, cause: { key: string; refs: string[] } = { key: `scheduler.${tier}`, refs: [] },
  extra: { sectors?: number[]; assetsHint?: string[]; subDef?: WorldEvent['subDef'] } = {}): WorldEvent {
  const tick = ctx.tick;
  const ev: WorldEvent = { id: ctx.newId('wev'), tier, kind, blocs: [...blocs], sectors: extra.sectors ?? [], assetsHint: extra.assetsHint ?? [], phase: 'PRECURSOR', phaseSinceTick: tick,
    precursorStartTick: precursorDays > 0 ? tick + 1 : triggerTick, triggerTick, plannedEndTick: plannedEnd(tier, triggerTick, contagionDays), origin, severity,
    shocks: [], publicTitleKey: null, causeChain: [{ tick, key: cause.key, refs: [...cause.refs] }], ...(extra.subDef ? { subDef: extra.subDef } : {}) };
  ctx.store.put(macroTables.event.name, ev);
  const s = schedOf(ctx.store);
  if (tier === 'MAJOR') putSched(ctx, { ...s, activeMajorId: ev.id, lastMajorStartTick: triggerTick, majorsThisChapter: s.majorsThisChapter + 1,
    playerCausedSuppressUntil: origin === 'PLAYER_CAUSED' ? tick + ctx.params.num('major_suppression_game_days') * D : s.playerCausedSuppressUntil });
  else if (tier === 'STORM') putSched(ctx, { ...s, activeStormIds: [...s.activeStormIds, ev.id], lastStormStartTick: tick + 1 });
  else putSched(ctx, { ...s, activeRippleIds: [...s.activeRippleIds, ev.id] });
  if (tier === 'MAJOR' && precursorDays > 0) applyEventShocks(ctx, ev, storyShocks(ev, ctx.store, 'PRECURSOR'));
  const cur = ctx.store.get<WorldEvent>(macroTables.event.name, ev.id) ?? ev;
  ctx.emit('macro.event.internal', [] as Id[], { eventId: cur.id, tier, kind, blocs: cur.blocs, precursorStartTick: cur.precursorStartTick, triggerTick,
    plannedEndTick: cur.plannedEndTick, severity, shocks: cur.shocks }, 'SEALED');
  return cur;
}

/** Chapter start: counters reset (edge 9), crisis week with p 0.6 in week w = 2 + floor(6u) of the chapter, announced 48 game days before. */
export function chapterStart(ctx: PhaseCtx): void {
  const rng = ctx.rng(S.crisis()), u1 = rng.uOpen(), u2 = rng.uOpen();
  const c0 = chapterStartOf(ctx.tick), s = schedOf(ctx.store);
  let crisisWeek: CrisisSchedulerState['crisisWeek'] = null;
  if (u1 < CRISIS_WEEK_P) {
    const w = 2 + Math.floor(6 * u2), startTick = c0 + (w - 1) * WEEK;
    crisisWeek = { announcedTick: startTick - 48 * D, startTick, endTick: startTick + WEEK };
  }
  putSched(ctx, { ...s, majorsThisChapter: 0, crisisWeek, crisisWeekUsedThisChapter: crisisWeek !== null });
}

/** Storm target from the within-bin fraction f: RATE_SCARE one bloc by GDP share, FX_SQUALL SRL/PYN 50/50, SECTOR_ROTATION sector pair, LIQUIDITY_HICCUP all classes. */
function stormTarget(kind: StormKind, f: number): { blocs: BlocId[]; sectors: number[]; assetsHint: string[] } {
  if (kind === 'RATE_SCARE') {
    const tot = BLOC_ORDER.reduce((a, b) => a + BLOC_DEFAULTS[b].gdpShare0, 0);
    let c = 0;
    for (const b of BLOC_ORDER) { c += BLOC_DEFAULTS[b].gdpShare0 / tot; if (f < c) return { blocs: [b], sectors: [], assetsHint: [] }; }
    return { blocs: [BLOC_ORDER[BLOC_ORDER.length - 1]!], sectors: [], assetsHint: [] };
  }
  if (kind === 'FX_SQUALL') return { blocs: [f < 0.5 ? 'SRL' : 'PYN'], sectors: [], assetsHint: [] };
  if (kind === 'SECTOR_ROTATION') { const s1 = Math.floor(f * (SECTOR_COUNT - 1)); return { blocs: [], sectors: [s1, s1 + 1], assetsHint: [] }; }
  if (kind === 'LIQUIDITY_HICCUP') return { blocs: [], sectors: [], assetsHint: ['ALL'] };
  return { blocs: [], sectors: [], assetsHint: [] };
}

/** Sub-defs with a fixed sign (E-35 §5): +1 = supply cut on COMMODITY_SUPPLY (price up), −1 = negative SECTOR_SHOCK. */
const FIXED_SIGN: Readonly<Partial<Record<SubDefKey, number>>> = Object.freeze({ DROUGHT: 1, CROP_DISEASE: 1, CHIP_FAB: 1, RECALL: -1, SCANDAL: -1, CYBER: -1 });
const AGRI_FIRST = 3, AGRI_COUNT = 4;   // RIPPLE_COMMODITIES WHEAT, CORN, COFFEE, COCOA
function startRipple(ctx: PhaseCtx, d: readonly number[], at: number, subDefs: boolean): WorldEvent {
  const xk = d[at]! * RIPPLE_KINDS.length, ik = Math.floor(xk), kind: RippleKind = RIPPLE_KINDS[ik]!;
  const sub = subDefs ? subDefOf(kind, xk - ik) : null;
  const sign = (sub ? FIXED_SIGN[sub.key] : undefined) ?? (d[at + 2]! < 0.5 ? -1 : 1), size = 0.03 + 0.05 * d[at + 3]!, length = 1 + Math.floor(3 * d[at + 4]!);
  let target: number | string, extra: { sectors?: number[]; assetsHint?: string[] };
  if (kind === 'SECTOR_SHOCK' || kind === 'REGULATORY_NOTE') { target = Math.floor(d[at + 1]! * SECTOR_COUNT); extra = { sectors: [target] }; }      // MISSING EXPORT: T06 sector sizes (uniform)
  else if (kind === 'LOCAL_BOOM') {
    const cities = ctx.content.cities().map((c) => c.cityId).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));                                           // MISSING EXPORT: T22 city activity weights (uniform)
    target = cities[Math.floor(d[at + 1]! * cities.length)] ?? ''; extra = { assetsHint: [target] };
  } else if (sub?.key === 'DROUGHT' || sub?.key === 'CROP_DISEASE') { target = AGRI_FIRST + Math.floor(d[at + 1]! * AGRI_COUNT); extra = { assetsHint: [] }; }   // agricultural commodity
  else { target = Math.floor(d[at + 1]! * 8); extra = { assetsHint: [] }; }
  // MISSING EXPORT: T06 listed firms (RECALL/SCANDAL/CYBER scope COMPANY, revenue/capacity), T06 semis sector (CHIP_FAB), T09 delivery delay (SHIPPING_LANE C18),
  // T14 Rep/CEO hook (SCANDAL), C17 compute price (DATA_CENTER): the sub-def is recorded on the event and the kind's generic vector applies with its fixed sign.
  const ev = startEvent(ctx, 'RIPPLE', kind, [], size, 0, length, 'SCHEDULED', ctx.tick + 1, { key: 'scheduler.RIPPLE', refs: [String(target)] }, { ...extra, ...(sub ? { subDef: sub } : {}) });
  applyEventShocks(ctx, ev, rippleEffect(ctx.store, kind, { target, sign, size, length }));
  return ctx.store.get<WorldEvent>(macroTables.event.name, ev.id) ?? ev;
}

/** The sub-def uses uPre's fraction inside its precursor bucket (independent of the precursor length, f and the kind). */
function startStorm(ctx: PhaseCtx, uKind: number, uPre: number, subDefs: boolean): WorldEvent {
  const x = uKind * STORM_KINDS.length, i = Math.min(STORM_KINDS.length - 1, Math.floor(x)), f = x - i, kind = STORM_KINDS[i]!;
  const t = stormTarget(kind, f), xp = 2 * uPre, pre = 1 + Math.floor(xp), sub = subDefs ? subDefOf(kind, xp - Math.floor(xp)) : null;
  return startEvent(ctx, 'STORM', kind, t.blocs, 0.6 + 0.8 * f, pre, STORM_EFFECT_DAYS[kind], 'SCHEDULED', ctx.tick + 1 + pre * D, { key: 'scheduler.STORM', refs: [] },
    { sectors: t.sectors, assetsHint: t.assetsHint, ...(sub ? { subDef: sub } : {}) });
}

/** Called at each day close (step 11). Always draws exactly 24 uniforms. Returns the events started today. */
/** `opts.subDefs` false (AC-04-18-SUBDEF-RATE comparison) draws the same onsets with every ripple and storm generic. */
export function schedulerDay(ctx: PhaseCtx, ports: MacroPorts = defaultMacroPorts(), weights?: { kind: CrisisKind; w: number }[], opts: { subDefs?: boolean } = {}): WorldEvent[] {
  const rng = ctx.rng(S.crisis()), d: number[] = [];
  for (let i = 0; i < DRAWS_PER_DAY; i++) d.push(rng.uOpen());
  const tick = ctx.tick, p = ctx.params, out: WorldEvent[] = [];
  let s = schedOf(ctx.store);
  const cw = s.crisisWeek, inCw = crisisWeekActive(s, tick), c0 = chapterStartOf(tick + 1);
  // no WorldEvent exists for a crisis week: E-105 source id cwk_WORLD_<start day>
  if (cw && cw.announcedTick === tick + 1) writeHook(ctx, '16', 'WIRE_ITEM', { key: 'crisis_week_announced', startTick: cw.startTick, endTick: cw.endTick }, crisisWeekSourceId(cw.startTick));
  // ripples
  const n = poissonInverse(d[0]!, p.num('macro_ripple_rate'));
  for (let k = 0; k < MAX_RIPPLES && k < n; k++) {
    if (schedOf(ctx.store).activeRippleIds.length >= MAX_RIPPLES) break;
    out.push(startRipple(ctx, d, 1 + 5 * k, opts.subDefs ?? true));
  }
  // storms
  s = schedOf(ctx.store);
  const stormFree = s.activeStormIds.length === 0 && (s.lastStormEndTick == null || tick - s.lastStormEndTick >= STORM_COOLDOWN_DAYS * D) && tick + 1 >= c0 + NO_START_FIRST_DAYS * D;
  const forced = cw !== null && inCw && Math.floor(tick / D) === Math.floor(cw.startTick / D) + 2 && s.activeStormIds.length === 0
    && (s.lastStormStartTick == null || s.lastStormStartTick < cw.startTick);
  if (forced || (stormFree && d[16]! < pFromRate(p.num('macro_storm_rate') * (inCw ? CRISIS_WEEK_STORM_MULT : 1)))) out.push(startStorm(ctx, d[17]!, d[18]!, opts.subDefs ?? true));
  // majors
  s = schedOf(ctx.store);
  const ws = weights ?? majorWeights(ctx.store, ports), W = ws.reduce((a, x) => a + x.w, 0);
  const lambda = majorRate(ctx.store, inCw, p, ws).lambda;
  const pre = Math.max(p.num('major_precursor_min_game_days'), 8 + 8 * d[22]!);
  const planned = (): Tick => plannedTrigger(ctx.header, tick + 1 + Math.floor(pre * D), s.timezoneBandNext);   // only computed on a start draw
  const at = lambda > 0 && W > 0 && d[19]! < pFromRate(lambda) ? planned() : null;
  if (at !== null && constraintsAllowMajor(s, tick, at, c0, c0 + TICKS_PER_CHAPTER, p).ok) {
    let c = 0, kind = ws[ws.length - 1]!.kind, f = 0;
    const x = d[20]! * W;
    for (const e of ws) { if (e.w > 0 && x < c + e.w) { kind = e.kind; f = (x - c) / e.w; break; } c += e.w; }
    const top = [...ws].sort((a, b) => b.w - a.w || CRISIS_KINDS.indexOf(a.kind) - CRISIS_KINDS.indexOf(b.kind)).slice(0, 3).map((e) => `${e.kind}=${e.w}`);
    out.push(startEvent(ctx, 'MAJOR', kind, chooseBlocs(ctx.store, kind, f, ports), 0.6 + 0.8 * d[21]!, pre, 5 + 25 * d[23]!, 'SCHEDULED', at,
      { key: 'scheduler.MAJOR', refs: top }));
    const s2 = schedOf(ctx.store);
    putSched(ctx, { ...s2, timezoneBandNext: ((s.timezoneBandNext + 1) % 3) as 0 | 1 | 2 });
  }
  return out;
}

/** Tests and admin: start `kind` now, bypassing rate and constraints, no draws; origin SCHEDULED. Defaults: severity 1, MAJOR precursor 8 days
 *  and contagion 17.5 days (range midpoint), STORM precursor 1 day; trigger is not band-snapped (unit decision). */
export function forceEvent(ctx: PhaseCtx, kind: CrisisKind | StormKind, opts: ForceOpts = {}): WorldEvent {
  const sev = opts.severity ?? 1;
  if ((CRISIS_KINDS as readonly string[]).includes(kind)) {
    const pre = opts.precursorDays ?? ctx.params.num('major_precursor_min_game_days');
    return startEvent(ctx, 'MAJOR', kind, opts.blocs ?? chooseBlocs(ctx.store, kind as CrisisKind, 0.5), sev, pre, opts.contagionDays ?? 17.5, 'SCHEDULED',
      ctx.tick + 1 + Math.floor(pre * D), { key: 'force.MAJOR', refs: [] });
  }
  const pre = opts.precursorDays ?? 1, t = stormTarget(kind as StormKind, 0.5);
  return startEvent(ctx, 'STORM', kind, opts.blocs ?? t.blocs, sev, pre, opts.contagionDays ?? STORM_EFFECT_DAYS[kind as StormKind], 'SCHEDULED',
    ctx.tick + 1 + Math.floor(pre * D), { key: 'force.STORM', refs: [] }, { sectors: t.sectors, assetsHint: t.assetsHint });
}
