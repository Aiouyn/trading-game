/**
 * The company sector shock is the engine's sector factor return (O-12, V1-PHASE9 9C). The engine draws one standard normal per
 * sector per tick from its own sector stream (src/engine/sim.ts, `zSector`). A sector's company level moves each day by the sum
 * of those draws over the day, on the unit reading of G22: F_s = sum of z * sqrt(dt), dt = 1 / (ticksPerDay * daysPerYear).
 *
 * There is no second stream. Each company sector holds a cursor: the engine's sector state at the last company day, and the
 * tick it was read at. The factor since the cursor is the engine's own draws replayed with the same Rng calls as sim.ts, so the
 * replay must land on the engine's current sector state, and that is checked every day. A world without player companies never
 * runs companyDay, so its fingerprints do not move.
 */
import { seedStream, Rng, type RngState } from '@/engine';
import { SECTORS } from '@/content/company';
import type { CompanyWorld } from './types';

/** The part of the engine's state the factor reads: its tick and its per-sector streams (WorldState carries both). */
export interface EngineSectors {
  tick: number;
  sectorRng: Record<string, RngState>;
}

/** dt of one engine tick, in years (sim.ts: dt = 1 / (ticksPerDay * daysPerYear)). */
export function tickDt(ticksPerDay: number, daysPerYear: number): number {
  return 1 / (ticksPerDay * daysPerYear);
}

/** The engine's draws for `ticks` ticks from a sector state: the factor return (unit reading) and the state after them. */
export function replaySector(from: RngState, ticks: number, dt: number): { factor: number; rng: RngState } {
  let st = from;
  let sum = 0;
  for (let k = 0; k < ticks; k++) {
    // the same calls as sim.ts step(): a fresh Rng on the stored state, one normal, then the state (its spare is dropped)
    const r = new Rng(st);
    sum += r.normal();
    st = r.state();
  }
  return { factor: sum * Math.sqrt(dt), rng: st };
}

/**
 * Moves every company sector's cursor to the engine's tick and returns each sector's factor return since its last cursor. A
 * sector the engine does not carry, or one with no cursor yet, has no factor. Throws when the replay does not land on the
 * engine's own sector state: the factor must be the engine's draws, not a copy that has drifted.
 */
export function advanceSectorCursors(w: CompanyWorld, engine: EngineSectors, dt: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of Object.keys(w.sectors)) {
    const sec = w.sectors[s as keyof CompanyWorld['sectors']];
    const now = engine.sectorRng[s];
    if (!now || sec.tick === undefined) continue;
    const ticks = engine.tick - sec.tick;
    if (ticks < 0) throw new Error(`sector ${s}: cursor at tick ${sec.tick} is ahead of the engine at ${engine.tick}`);
    const r = replaySector(sec.rng, ticks, dt);
    if (JSON.stringify(r.rng) !== JSON.stringify(now)) throw new Error(`sector ${s}: a ${ticks}-tick replay is out of step with the engine's sector stream`);
    out[s] = r.factor;
    sec.rng = r.rng;
    sec.tick = engine.tick;
  }
  return out;
}

/**
 * A sector source without an engine (scripts and unit tests): the engine's sector streams for this seed (seedStream, as
 * createWorld draws them), replayed from tick 0. Each call returns one day's factor per company sector, `ticksPerDay` ticks a day.
 */
export function seedSectorSource(seed: string, ticksPerDay: number, daysPerYear: number): () => Record<string, number> {
  const dt = tickDt(ticksPerDay, daysPerYear);
  const cursor: Record<string, RngState> = {};
  for (const s of Object.keys(SECTORS)) cursor[s] = seedStream(seed, `sector:${s}`);
  return () => {
    const out: Record<string, number> = {};
    for (const s of Object.keys(cursor)) {
      const r = replaySector(cursor[s]!, ticksPerDay, dt);
      out[s] = r.factor;
      cursor[s] = r.rng;
    }
    return out;
  };
}

/**
 * Test fixtures: moves an engine state to `tick` as sim.ts would, drawing each sector stream once per skipped tick, so a fixture
 * that jumps the clock still carries the engine's sector state that the company factor reads. A clock moved back (a test that
 * revisits an earlier day; the server never does) draws nothing: the caller re-anchors the company cursors (reanchorSectors).
 */
export function jumpEngineTicks<T extends EngineSectors>(e: T, tick: number): T {
  if (tick < e.tick) return { ...e, tick };
  const sectorRng: Record<string, RngState> = {};
  for (const s of Object.keys(e.sectorRng)) sectorRng[s] = replaySector(e.sectorRng[s]!, tick - e.tick, 1).rng;
  return { ...e, tick, sectorRng };
}

/** Test fixtures: after the clock moved back, every company sector cursor is re-anchored at the engine's current state and tick. */
export function reanchorSectors(w: CompanyWorld, engine: EngineSectors): void {
  for (const s of Object.keys(w.sectors) as (keyof CompanyWorld['sectors'])[]) {
    const now = engine.sectorRng[s];
    if (now) { w.sectors[s].rng = now; w.sectors[s].tick = engine.tick; }
  }
}
