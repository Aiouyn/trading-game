import { describe, expect, it } from 'vitest';
import { canonEncode, isTradingDay, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { macroTables, type WorldEvent } from '../schema';
import { schedWorld, type SchedWorld } from '../testkit/schedWorld';
import { activeWorldEvents, attachEmergent, publicEventView, stepPhases } from './phases';
import { forceEvent, schedOf } from './scheduler';

const D = TICKS_PER_GAME_DAY;
const evOf = (w: SchedWorld, id: string): WorldEvent => w.store.get<WorldEvent>(macroTables.event.name, id)!;
const pub = (w: SchedWorld) => w.events.filter((e) => e.vis === 'PUBLIC');
function run(w: SchedWorld, from: number, to: number, each?: (t: number) => void): void { for (let t = from; t <= to; t++) { w.setTick(t); stepPhases(w.ctx); each?.(t); } }
const hist = (w: SchedWorld, d: number, fear: number, fsi: number): void => w.store.put(macroTables.history.name, { id: `GLOBAL:${d}`, fearIndex: fear, fsi } as never);

describe('T04-17 public view (04#37, PRECURSOR)', () => {
  function world(contagionDays: number) {
    const w = schedWorld('p37'); w.setTick(100 * D);
    const ev = forceEvent(w.ctx, 'EQUITY_BUBBLE_BURST', { contagionDays });
    const views: string[] = [];
    run(w, 100 * D + 1, ev.triggerTick + 3 * D, (t) => { if (t % D === D - 1) views.push(JSON.stringify(activeWorldEvents(w.store))); });
    const payloads = pub(w).map((e) => Buffer.from(canonEncode({ kind: e.kind, payload: e.payload })).toString('hex'));
    for (const e of pub(w)) expect(JSON.stringify(e.payload)).not.toMatch(/plannedEnd|precursorStart|severity|shocks/);
    const sealed = w.events.filter((e) => e.kind === 'macro.event.internal').map((e) => JSON.stringify(e.payload));
    return { ev, views, payloads, sealed };
  }
  it('04#37 PUBLIC events and activeWorldEvents byte-identical for 10 vs 30 contagion days up to trigger + 3 days; SEALED differs', () => {
    const a = world(10), b = world(30);
    expect(a.payloads.length).toBeGreaterThan(0);
    expect(a.payloads).toEqual(b.payloads); expect(a.views).toEqual(b.views);
    expect(a.sealed).not.toEqual(b.sealed);
    expect(a.ev.plannedEndTick).not.toBe(b.ev.plannedEndTick);
  });
  it('PRECURSOR: no PUBLIC macro.event.*, not listed, UNANNOUNCED view', () => {
    const w = schedWorld('pre'); w.setTick(100 * D);
    const ev = forceEvent(w.ctx, 'BANKING_PANIC', {});
    run(w, 100 * D + 1, ev.triggerTick - 1);
    expect(pub(w).filter((e) => e.kind.startsWith('macro.event.'))).toEqual([]);
    expect(activeWorldEvents(w.store)).toEqual([]);
    expect(publicEventView(evOf(w, ev.id))).toEqual({ id: ev.id, tier: 'MAJOR', kind: 'BANKING_PANIC', blocs: [], phase: 'UNANNOUNCED', publicTitleKey: null, sinceTick: 0 });
    run(w, ev.triggerTick, ev.triggerTick);
    expect(pub(w).map((e) => e.kind)).toContain('macro.event.trigger');
    expect(activeWorldEvents(w.store).map((v) => v.phase)).toEqual(['TRIGGER']);
    expect(Object.keys(pub(w).find((e) => e.kind === 'macro.event.trigger')!.payload as object).sort()).toEqual(['blocs', 'eventId', 'kind', 'publicTitleKey', 'tier']);
  });
});

describe('T04-17 phase chain', () => {
  it('TRIGGER lasts 720 ticks; POLICY from the first response; RECOVERY ends after 10 calm trading days; ENDED emits outcomes', () => {
    const w = schedWorld('ch'); w.setTick(100 * D);
    const ev = forceEvent(w.ctx, 'BANKING_PANIC', { contagionDays: 10 });
    const at: Record<string, number> = {};
    const mark = (t: number): void => { const p = evOf(w, ev.id).phase; if (!(p in at)) at[p] = t; };
    run(w, 100 * D + 1, ev.plannedEndTick, mark);
    expect(at['TRIGGER']).toBe(ev.triggerTick);
    expect(at['CONTAGION']).toBe(ev.triggerTick + D);
    expect(at['POLICY']).toBe(ev.triggerTick + D + 1);   // responses fired at trigger → POLICY at the next step
    expect(at['RECOVERY']).toBe(ev.plannedEndTick);
    const r0 = ev.plannedEndTick, d0 = Math.floor(r0 / D);
    let trading = 0, d = d0;
    while (trading < 10) { if (isTradingDay('FDL', d)) { hist(w, d, 20, 0.1); trading++; } d++; }
    run(w, r0 + 1, d * D + D - 1, mark);
    expect(at['ENDED']).toBe(d * D + D - 1);
    const ended = w.events.filter((e) => e.kind === 'macro.event.ended');
    expect(ended.length).toBe(1);
    expect((ended[0]!.payload as { outcomes: Record<string, number> }).outcomes).toHaveProperty('peakFsi');
    expect(schedOf(w.store).activeMajorId).toBeNull(); expect(schedOf(w.store).lastMajorEndTick).toBe(at['ENDED']);
  });
  it('RECOVERY ends at 180 days without calm; one stormy day breaks the run', () => {
    const w = schedWorld('ch2'); w.setTick(100 * D);
    const ev = forceEvent(w.ctx, 'BANKING_PANIC', { contagionDays: 5 });
    run(w, 100 * D + 1, ev.plannedEndTick);
    expect(evOf(w, ev.id).phase).toBe('RECOVERY');
    for (let d = Math.floor(ev.plannedEndTick / D); d < Math.floor(ev.plannedEndTick / D) + 200; d++) hist(w, d, d % 3 === 0 ? 60 : 20, 0.1);
    let endAt = -1;
    run(w, ev.plannedEndTick + 1, ev.plannedEndTick + 181 * D, (t) => { if (endAt < 0 && evOf(w, ev.id).phase === 'ENDED') endAt = t; });
    expect(endAt).toBeGreaterThanOrEqual(ev.plannedEndTick + 180 * D);
    expect(endAt).toBeLessThan(ev.plannedEndTick + 181 * D);
  });
  it('STORM: TRIGGER → CONTAGION → ENDED at plannedEndTick, no POLICY or RECOVERY', () => {
    const w = schedWorld('st'); w.setTick(100 * D);
    const ev = forceEvent(w.ctx, 'RATE_SCARE', {});
    const seen: string[] = [];
    run(w, 100 * D + 1, ev.plannedEndTick + D, () => { const p = evOf(w, ev.id).phase; if (seen[seen.length - 1] !== p) seen.push(p); });
    expect(seen).toEqual(['PRECURSOR', 'TRIGGER', 'CONTAGION', 'ENDED']);
    expect(schedOf(w.store).activeStormIds).toEqual([]);
  });
  it('edge 8: an emergent BANKING_PANIC during an active major attaches (no second major row)', () => {
    const w = schedWorld('e8'); w.setTick(100 * D);
    const ev = forceEvent(w.ctx, 'EQUITY_BUBBLE_BURST', {});
    run(w, 100 * D + 1, ev.triggerTick + 2 * D);
    const n0 = w.store.iter<WorldEvent>(macroTables.event.name).filter((e) => e.tier === 'MAJOR').length;
    attachEmergent(w.ctx, 'BANKING_PANIC', ['FDL'], 'EMERGENT', { key: 'label.fsi_72h', refs: [] });
    expect(w.store.iter<WorldEvent>(macroTables.event.name).filter((e) => e.tier === 'MAJOR').length).toBe(n0);
    expect(evOf(w, ev.id).causeChain.map((c) => c.key)).toContain('emergent.BANKING_PANIC');
    expect(w.events[w.events.length - 1]!.kind).toBe('macro.event.phase');
    expect(schedOf(w.store).activeMajorId).toBe(ev.id);
  });
});
