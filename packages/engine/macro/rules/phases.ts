// T04-17: world-event phases and their public view (04 §3.16.3, §9 #3 exploit 3, edge 8).
// PRECURSOR (hidden) → TRIGGER (1 game day) → CONTAGION (planned days; POLICY overlaps from the first response) → RECOVERY → ENDED.
// STORM and RIPPLE: TRIGGER → CONTAGION → ENDED at plannedEndTick (no POLICY or RECOVERY; unit decision).
import { isTradingDay, TICKS_PER_GAME_DAY, type Id, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type CrisisKind, type CrisisPhase, type DailyHistoryRow, type EventTier, type GlobalMacroState, type WorldEvent } from '../schema';
import { MAJORS, RECOVERY_MAX_DAYS } from './crisisCatalog';
import { measureOutcomes } from './emergent';
import { crisisResponseFired, fireResponse } from './hooks';
import { globalOf, schedOf, startEvent, type SchedState } from './scheduler';
import { applyEventShocks, storyShocks } from './shocks';

const D = TICKS_PER_GAME_DAY;
const CALM_DAYS = 10, CALM_F = 40, CALM_FSI = 0.3;
const EMERGENT_CONTAGION_DAYS = 17.5;   // midpoint of 5 + 25u (unit decision; emergent events draw nothing)

export type PublicEventView = { id: string; tier: EventTier; kind: string; blocs: BlocId[]; phase: CrisisPhase | 'UNANNOUNCED'; publicTitleKey: string | null; sinceTick: Tick };

/** The only event fields that reach clients. PRECURSOR → UNANNOUNCED with no blocs and sinceTick 0 (nothing about the plan). */
export function publicEventView(ev: WorldEvent): PublicEventView {
  const hidden = ev.phase === 'PRECURSOR';
  return { id: ev.id, tier: ev.tier, kind: ev.kind, blocs: hidden ? [] : [...ev.blocs], phase: hidden ? 'UNANNOUNCED' : ev.phase, publicTitleKey: hidden ? null : ev.publicTitleKey,
    sinceTick: hidden ? 0 : ev.phaseSinceTick };
}

const activeIds = (s: SchedState): string[] => [...(s.activeMajorId !== null ? [s.activeMajorId] : []), ...s.activeStormIds, ...s.activeRippleIds];

/** Announced, not ended events: the active major, storms, ripples, in that order. */
export function activeWorldEvents(store: StoreRead): PublicEventView[] {
  const out: PublicEventView[] = [];
  for (const id of activeIds(schedOf(store))) {
    const ev = store.get<WorldEvent>(macroTables.event.name, id);
    if (ev && ev.phase !== 'PRECURSOR' && ev.phase !== 'ENDED') out.push(publicEventView(ev));
  }
  return out;
}

function setPhase(ctx: PhaseCtx, ev: WorldEvent, phase: CrisisPhase, patch: Partial<WorldEvent> = {}): WorldEvent {
  const cur = ctx.store.get<WorldEvent>(macroTables.event.name, ev.id) ?? ev;
  const next: WorldEvent = { ...cur, ...patch, phase, phaseSinceTick: ctx.tick };
  ctx.store.put(macroTables.event.name, next);
  ctx.emit('macro.event.phase', [] as Id[], { eventId: ev.id, phase }, 'PUBLIC');
  return next;
}

function fireAll(ctx: PhaseCtx, ev: WorldEvent): void {
  const def = ev.tier === 'MAJOR' ? MAJORS.find((m) => m.kind === ev.kind) : undefined;
  for (const r of def?.response ?? []) fireResponse(ctx, ctx.store.get<WorldEvent>(macroTables.event.name, ev.id) ?? ev, r);
}

/** GLOBAL history shows F < 40 and FSI < 0.3 on each of the last 10 trading days before today, all on or after `fromTick`'s day. */
function calm(store: StoreRead, tick: Tick, fromTick: Tick): boolean {
  let n = 0;
  for (let d = Math.floor(tick / D) - 1; d >= Math.floor(fromTick / D) && n < CALM_DAYS; d--) {
    if (!isTradingDay('FDL', d)) continue;
    const h = store.get<DailyHistoryRow>(macroTables.history.name, `GLOBAL:${d}`);
    if (!h || !(h.fearIndex < CALM_F && h.fsi < CALM_FSI)) return false;
    n++;
  }
  return n >= CALM_DAYS;
}

/** E-108 (3) (Designer): no hidden hazard tail after ENDED; the event's `lambda_raw_mult` shocks end at the ENDED tick. */
function closeLambdaMult(ctx: PhaseCtx, ev: WorldEvent): void {
  const live = (x: BlocMacroState['shocks'][number]): boolean => x.sourceCrisisId === ev.id && x.target === 'lambda_raw_mult' && x.endTick > ctx.tick;
  for (const b of BLOC_ORDER) {
    const st = ctx.store.get<BlocMacroState>(macroTables.bloc.name, b);
    if (st && st.shocks.some(live)) ctx.store.put<BlocMacroState>(macroTables.bloc.name, { ...st, shocks: st.shocks.map((x) => (live(x) ? { ...x, endTick: ctx.tick } : x)) });
  }
}

function end(ctx: PhaseCtx, ev: WorldEvent): void {
  const done = setPhase(ctx, ev, 'ENDED');
  closeLambdaMult(ctx, ev);
  ctx.emit('macro.event.ended', [] as Id[], { eventId: ev.id, outcomes: measureOutcomes(ctx.store, done) }, 'PUBLIC');
  const s = schedOf(ctx.store), g = globalOf(ctx.store);
  const next: SchedState = ev.tier === 'MAJOR' ? { ...s, activeMajorId: s.activeMajorId === ev.id ? null : s.activeMajorId, lastMajorEndTick: ctx.tick }
    : ev.tier === 'STORM' ? { ...s, activeStormIds: s.activeStormIds.filter((x) => x !== ev.id), lastStormEndTick: ctx.tick }
      : { ...s, activeRippleIds: s.activeRippleIds.filter((x) => x !== ev.id) };
  ctx.store.put<GlobalMacroState>(macroTables.global.name, { ...g, scheduler: next });
}

/** Every tick: timed transitions at their exact tick; responses re-fired and calm checked at day close. One transition per event per call. */
export function stepPhases(ctx: PhaseCtx, ports: MacroPorts = defaultMacroPorts()): void {
  const tick = ctx.tick, dayClose = tick % D === D - 1;
  for (const id of activeIds(schedOf(ctx.store))) {
    const ev = ctx.store.get<WorldEvent>(macroTables.event.name, id);
    if (!ev) continue;
    const major = ev.tier === 'MAJOR';
    switch (ev.phase) {
      case 'PRECURSOR':
        if (tick >= ev.triggerTick) {
          const trig = setPhase(ctx, ev, 'TRIGGER', { publicTitleKey: `macro.event.${ev.kind}` });
          if (ev.tier !== 'RIPPLE' && ev.origin === 'SCHEDULED') applyEventShocks(ctx, trig, storyShocks(trig, ctx.store, 'TRIGGER', ports));   // emergent: no trigger shocks
          ctx.emit('macro.event.trigger', [] as Id[], { eventId: ev.id, tier: ev.tier, kind: ev.kind, blocs: ev.blocs, publicTitleKey: trig.publicTitleKey }, 'PUBLIC');
          if (major) fireAll(ctx, trig);
        }
        break;
      case 'TRIGGER':   // exactly 720 ticks
        if (tick >= ev.triggerTick + D) { if (!major && tick >= ev.plannedEndTick) end(ctx, ev); else setPhase(ctx, ev, 'CONTAGION'); }
        break;
      case 'CONTAGION':
        if (tick >= ev.plannedEndTick) { if (major) setPhase(ctx, ev, 'RECOVERY'); else end(ctx, ev); break; }
        if (major && dayClose && !crisisResponseFired(ctx.store, ev)) fireAll(ctx, ev);
        if (major && crisisResponseFired(ctx.store, ev)) setPhase(ctx, ev, 'POLICY');
        break;
      case 'POLICY':
        if (tick >= ev.plannedEndTick) setPhase(ctx, ev, 'RECOVERY');
        break;
      case 'RECOVERY':
        if (dayClose && (calm(ctx.store, tick, ev.phaseSinceTick) || tick - ev.phaseSinceTick >= RECOVERY_MAX_DAYS * D)) end(ctx, ev);
        break;
      default: break;
    }
  }
}

/** Edge 8: during an active major the label becomes a causeChain entry plus a `macro.event.phase` (current phase; the schema has no sub-label
 *  field, unit decision). Otherwise a new MAJOR (never blocked, no shocks) triggering at the next tick. PLAYER_CAUSED sets the 336-day suppression. */
export function attachEmergent(ctx: PhaseCtx, kind: CrisisKind, blocs: BlocId[], origin: 'EMERGENT' | 'PLAYER_CAUSED', cause: { key: string; refs: string[] }): WorldEvent {
  const s = schedOf(ctx.store);
  const active = s.activeMajorId !== null ? ctx.store.get<WorldEvent>(macroTables.event.name, s.activeMajorId) : undefined;
  if (active) {
    const next: WorldEvent = { ...active, causeChain: [...active.causeChain, { tick: ctx.tick, key: `emergent.${kind}`, refs: [cause.key, ...cause.refs] }] };
    ctx.store.put(macroTables.event.name, next);
    ctx.emit('macro.event.phase', [] as Id[], { eventId: next.id, phase: next.phase }, 'PUBLIC');
    if (origin === 'PLAYER_CAUSED') {
      const s2 = schedOf(ctx.store);
      ctx.store.put<GlobalMacroState>(macroTables.global.name, { ...globalOf(ctx.store), scheduler: { ...s2, playerCausedSuppressUntil: ctx.tick + ctx.params.num('major_suppression_game_days') * D } });
    }
    return next;
  }
  return startEvent(ctx, 'MAJOR', kind, blocs, 1, 0, EMERGENT_CONTAGION_DAYS, origin, ctx.tick + 1, { key: `emergent.${kind}`, refs: [cause.key, ...cause.refs] });
}
