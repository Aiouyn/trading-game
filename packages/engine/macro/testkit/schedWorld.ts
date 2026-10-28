// T04-17 test kit: a fast keyed-record world for the scheduler (seeded from releaseWorld rows), a seeded draw-counting ctx.rng,
// a UTC header with 5 s per tick, and a scheduler-only day loop (majors held until plannedEnd + recoveryDays, storms and ripples until plannedEnd).
import { makeRng, TICKS_PER_CHAPTER, TICKS_PER_GAME_DAY, type PhaseCtx, type Rng, type Store } from '@tycoon/engine-core';
import { createParamsView, MACRO_T04_17_PARAMS } from '@tycoon/params';
import { ALL_MACRO_TABLES, macroTables, type CrisisKind, type CrisisSchedulerState, type GlobalMacroState, type WorldEvent } from '../schema';
import { MAJORS } from '../rules/crisisCatalog';
import { chapterStart, schedOf, schedulerDay, type SchedState } from '../rules/scheduler';
import { releaseWorld } from './releaseWorld';

const D = TICKS_PER_GAME_DAY;
export const SCHED0: CrisisSchedulerState = { lastMajorEndTick: null, lastMajorStartTick: null, majorsThisChapter: 0, playerCausedSuppressUntil: null, timezoneBandNext: 0,
  crisisWeek: null, crisisWeekUsedThisChapter: false, activeMajorId: null, activeStormIds: [], activeRippleIds: [] };
/** Σw = 3 → V = 1, spread over the catalog. */
export const V1: { kind: CrisisKind; w: number }[] = MAJORS.map((m) => ({ kind: m.kind, w: 3 / MAJORS.length }));
export const SEAL0 = 1_700_000_000_000n;

function u32s(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  let a = h, b = 0x9e3779b9, c = 0x243f6a88 ^ h, d = 1;
  const u32 = (): number => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return t >>> 0; };
  for (let i = 0; i < 15; i++) u32();   // warm-up, as releaseWorld's words
  return u32;
}

export interface MapStore extends Store { get<T = unknown>(t: string, id: string): T | undefined; iter<T = unknown>(t: string): T[]; index<T = unknown>(t: string, name: string, key: string): T[] }
export interface SchedWorld { ctx: PhaseCtx; store: MapStore;
  draws: Record<string, number>; events: { kind: string; payload: unknown; vis: string }[]; setTick(t: number): void; nums(o: Record<string, number>): void }

export function schedWorld(seed = 's', tick0 = 0): SchedWorld {
  const rw = releaseWorld(tick0, seed), tables: Record<string, { rows: Record<string, unknown>; ids: string[]; sorted: boolean }> = {};
  const tab = (t: string) => (tables[t] ??= { rows: {}, ids: [], sorted: true });
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const put = <T>(t: string, e: T): void => { const x = tab(t), id = (e as { id: string }).id; if (x.rows[id] === undefined) { x.ids.push(id); x.sorted = false; } x.rows[id] = e; };
  const iter = <T>(t: string): T[] => { const x = tab(t); if (!x.sorted) { x.ids.sort(cmp); x.sorted = true; } return x.ids.map((id) => x.rows[id] as T); };
  const store: MapStore = { get: <T>(t: string, id: string) => tab(t).rows[id] as T | undefined, put, iter, count: (t) => tab(t).ids.length,
    del: (t, id) => { const x = tab(t); if (x.rows[id] !== undefined) { delete x.rows[id]; x.ids = x.ids.filter((i) => i !== id); } },
    range: <T>(t: string, from: string, to: string) => iter<T>(t).filter((e) => { const id = (e as { id: string }).id; return id >= from && id < to; }),
    index: <T>(t: string, name: string, key: string) => {
      const def = ALL_MACRO_TABLES.find((x) => x.name === t) as { indexes?: { name: string; key(e: unknown): string | null }[] } | undefined;
      const ix = def?.indexes?.find((x) => x.name === name);
      if (!ix) throw new Error(`schedWorld: no index ${t}.${name}`);   // was [] for every table but hookCall/event, so auctions never announced in macroWorld
      return iter<T>(t).filter((e) => ix.key(e) === key);
    } };
  for (const t of [macroTables.bloc.name, macroTables.publicView.name, macroTables.global.name]) for (const r of rw.rows(t)) put(t, r as object);
  for (const r of iter<object>(macroTables.bloc.name)) put(macroTables.bloc.name, { ...r, nominalGdp: 1_000_000_000_000_000n, imbalance: {}, housePriceGap: 0, shocks: [],
    sovereign: { hazard: 0.01, status: 'PERFORMING' } });   // the catalog fields releaseWorld leaves out (calm values)
  let tick = tick0, n = 0;
  const base = createParamsView(MACRO_T04_17_PARAMS), outer = rw.ctx.params;
  let over: Record<string, number> = {};
  const num = (k: string): number => (over[k] !== undefined ? over[k] : MACRO_T04_17_PARAMS.some((d) => d.key === k) ? base.num(k) : outer.num(k));
  const params = { ...outer, num, int: num };
  const draws: Record<string, number> = {}, rngs: Record<string, Rng> = {}, events: SchedWorld['events'] = [];
  const g = store.get(macroTables.global.name, 'GLOBAL') as GlobalMacroState & { id: 'GLOBAL' };
  store.put(macroTables.global.name, { ...g, tick, financialStressIndex: 0.1, chapterIndex: 0, scheduler: { ...SCHED0 } });
  const ctx = { get tick() { return tick; }, get header() { return { tick, sealUtcMs: SEAL0 + BigInt(tick) * 5000n }; }, phase: 'P8', params, content: rw.ctx.content,
    store, newId: (k: string) => `${k}_${n++}`,
    rng: (k: string): Rng => { const r = (rngs[k] ??= makeRng(u32s(`${seed}|${k}`))); return { ...r, uOpen: () => { draws[k] = (draws[k] ?? 0) + 1; return r.uOpen(); } }; },
    emit: (kind: string, _s: unknown, payload: unknown, vis: string) => { events.push({ kind, payload, vis }); } } as unknown as PhaseCtx;
  return { ctx, store, draws, events, nums: (o) => { over = { ...over, ...o }; },
    setTick: (t) => { tick = t; const gl = store.get(macroTables.global.name, 'GLOBAL') as GlobalMacroState & { id: 'GLOBAL' }; store.put(macroTables.global.name, { ...gl, tick: t }); } };
}

export interface StartRec { id: string; tier: WorldEvent['tier']; kind: string; chapter: number; precursorStartTick: number; triggerTick: number; endTick: number | null; origin: string }

/** Scheduler-only loop over `chapters`: chapterStart at each chapter's first tick, schedulerDay at each day close, then ends due events
 *  (majors at plannedEnd + recoveryDays: calm recovery; storms and ripples at plannedEnd). ENDED storm and ripple rows are deleted (speed). */
export function runChapters(w: SchedWorld, chapters: number, weights: { kind: CrisisKind; w: number }[], recoveryDays = 14,
  o: { subDefs?: boolean; onStart?: (ev: WorldEvent) => void } = {}): StartRec[] {
  const recs: StartRec[] = [], byId: Record<string, StartRec> = {};
  const days = chapters * (TICKS_PER_CHAPTER / D);
  for (let d = 0; d < days; d++) {
    if ((d * D) % TICKS_PER_CHAPTER === 0) { w.setTick(d * D); chapterStart(w.ctx); }
    const t = d * D + D - 1;
    w.setTick(t);
    for (const ev of schedulerDay(w.ctx, undefined, weights, { subDefs: o.subDefs ?? true })) {
      o.onStart?.(ev);
      const r: StartRec = { id: ev.id, tier: ev.tier, kind: ev.kind, chapter: Math.floor((t + 1) / TICKS_PER_CHAPTER), precursorStartTick: ev.precursorStartTick,
        triggerTick: ev.triggerTick, endTick: null, origin: ev.origin };
      recs.push(r); byId[r.id] = r;
    }
    const s = schedOf(w.store);
    const due = (id: string, extra: number): boolean => { const ev = w.store.get(macroTables.event.name, id) as WorldEvent; return t >= ev.plannedEndTick + extra; };
    const next: SchedState = { ...s };
    if (s.activeMajorId !== null && due(s.activeMajorId, recoveryDays * D)) { byId[s.activeMajorId]!.endTick = t; next.activeMajorId = null; next.lastMajorEndTick = t; }
    const st = s.activeStormIds.filter((id) => due(id, 0));
    if (st.length) { next.activeStormIds = s.activeStormIds.filter((id) => !st.includes(id)); next.lastStormEndTick = t; }
    const rp = s.activeRippleIds.filter((id) => due(id, 0));
    if (rp.length) next.activeRippleIds = s.activeRippleIds.filter((id) => !rp.includes(id));
    for (const id of [...st, ...rp]) { byId[id]!.endTick = t; w.store.del(macroTables.event.name, id); }
    w.store.put(macroTables.global.name, { ...(w.store.get(macroTables.global.name, 'GLOBAL') as GlobalMacroState & { id: 'GLOBAL' }), scheduler: next });
  }
  return recs;
}
