import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import { DEFAULT_CATALYSTS } from './catalysts';
import { forceWorldEvent, nextDayBoundary, telegraphBand, worldEventView, worldEventsDay, initWorldEvents, DEFAULT_WORLD_EVENTS } from './worldEvents';
import type { WorldEventKind } from './worldEvents';
import type { AssetDef, RegimeDef, RegimeId, WorldConfig, WorldState } from './types';

// The telegraph (velvet-world-events.md section 1, ROADMAP §2.8): a major is announced at least 8 real hours (game days,
// 720 ticks each) before its onset, and the app reads only an 8-hour band of how far away the onset is.
const TPD = 720;

function regimes(): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) out[id] = { ...r, equityDrift: 0, jumpUpShift: 0, meanDays: 1e12 };
  return out;
}

function stock(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 'tech', initialPrice: 50, sharesOutstanding: 1e8,
    vol: 0.3, drift: 0, cycleBeta: 1, wMarket: 0.55, wSector: 0.45, wCrypto: 0,
    halfLifeDays: 20, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 2e8, qtyStep: 1, ...extra,
  });
}

function cfg(odds: Record<WorldEventKind, number>): WorldConfig {
  const assets = Array.from({ length: 4 }, (_, i) => stock(`T${i}`));
  return defaultConfig({ ticksPerDay: TPD, regimes: regimes(), indices: [], assets, catalysts: DEFAULT_CATALYSTS, worldEvents: { odds } });
}

const NONE = { crash: 0, bubble: 0, crisis: 0, flash: 0 };

describe('telegraph bands', () => {
  it('rounds the hours left UP to the next 8-hour band, never less than 8', () => {
    expect(telegraphBand(0.5)).toBe(8);
    expect(telegraphBand(8)).toBe(8);
    expect(telegraphBand(8.01)).toBe(16);
    expect(telegraphBand(16)).toBe(16);
    expect(telegraphBand(17)).toBe(24);
    expect(telegraphBand(0)).toBe(8);
  });

  it('nextDayBoundary is the first tick that opens a day after `tick`', () => {
    expect(nextDayBoundary(1, TPD)).toBe(TPD + 1);
    expect(nextDayBoundary(TPD, TPD)).toBe(TPD + 1);
    expect(nextDayBoundary(TPD + 1, TPD)).toBe(2 * TPD + 1);
  });
});

describe('major events are telegraphed 8 real hours ahead', () => {
  it('a rolled crash or bubble starts 8 to 16 game days after its announcement (whole hours), and a crisis week 1 to 2', () => {
    for (const kind of ['crash', 'bubble', 'crisis'] as const) {
      const c = cfg({ ...NONE, [kind]: 1 });
      const s = createWorld('lead', c);
      const cfgWorld = c;
      // roll on a day boundary with the odds forced to this kind (the roll is the only randomness that matters here)
      const next = worldEventsDay(cfgWorld, initWorldEvents(s), 30, 30 * TPD + 1, 'expansion', 100);
      const a = next.state.active!;
      expect(a).toBeDefined();
      expect(a.kind).toBe(kind);
      const lead = (a.startTick - a.announcedTick) / TPD;
      expect(Number.isInteger(lead)).toBe(true); // whole hours: the onset stays on a day boundary
      if (kind === 'crisis') expect(lead >= DEFAULT_WORLD_EVENTS.crisisLeadMinDays && lead <= DEFAULT_WORLD_EVENTS.leadDays).toBe(true);
      else expect(lead >= DEFAULT_WORLD_EVENTS.majorLeadDays && lead <= DEFAULT_WORLD_EVENTS.majorLeadMaxDays).toBe(true);
    }
  });

  it('an announced major shows a band, not the onset: two onsets in the same band read the same window', () => {
    const c = cfg(NONE);
    const base = createWorld('band', c);
    const ev = (startTick: number) => ({ ...forceWorldEvent(base, 'crash')!.active! , startTick, endTick: startTick + 10 * TPD });
    const mk = (tick: number, startTick: number): WorldState => ({ ...base, tick, worldEvents: { ...initWorldEvents(base), active: ev(startTick) } });
    const v1 = worldEventView(mk(TPD + 1, TPD + 1 + 3 * TPD))!; // 3 real hours to go
    const v2 = worldEventView(mk(TPD + 1, TPD + 1 + 7 * TPD))!; // 7 real hours
    expect(v1.phase).toBe('announced');
    expect(v1.windowHours).toBe(8);
    expect(v2.windowHours).toBe(8);
    const v3 = worldEventView(mk(TPD + 1, TPD + 1 + 12 * TPD))!; // 12 real hours
    expect(v3.windowHours).toBe(16);
    // the view never carries the onset, the end or the planned moves
    expect(Object.keys(v3).sort()).toEqual(['elapsedDays', 'headline', 'headlineKey', 'id', 'kind', 'phase', 'todayShare', 'windowHours']);
  });

  it('a live event has no window at all', () => {
    const base = createWorld('live', cfg(NONE));
    const live = { ...base, tick: TPD + 5, worldEvents: { ...initWorldEvents(base), active: { ...forceWorldEvent(base, 'crash')!.active!, startTick: TPD + 1, endTick: 20 * TPD } } };
    const v = worldEventView(live)!;
    expect(v.phase).toBe('live');
    expect(v.windowHours).toBeUndefined();
  });
});

describe('the admin seam forces an event for tests, never for players', () => {
  it('a forced major starts at the next day boundary, with the announced phase in between', () => {
    const base = createWorld('force', cfg(NONE));
    const tick = 2 * TPD + 100;
    const s: WorldState = { ...base, tick };
    const we = forceWorldEvent(s, 'crash')!;
    expect(we.active!.startTick).toBe(3 * TPD + 1);
    expect(we.active!.kind).toBe('crash');
    const announced = worldEventView({ ...s, worldEvents: we })!;
    expect(announced.phase).toBe('announced');
    expect(announced.windowHours).toBe(8 * Math.ceil((3 * TPD + 1 - tick) / TPD / 8));
    const onset = worldEventView({ ...s, tick: 3 * TPD + 1, worldEvents: we })!;
    expect(onset.phase).toBe('live');
    expect(onset.elapsedDays).toBe(0);
  });

  it('the e2e seam can start a major now (one tick later), for a test that cannot wait for a day', () => {
    const base = createWorld('now', cfg(NONE));
    const s: WorldState = { ...base, tick: 2 * TPD + 100 };
    const we = forceWorldEvent(s, 'crash', 1, true)!;
    expect(we.active!.startTick).toBe(2 * TPD + 101);
    expect(we.active!.endTick).toBe(2 * TPD + 101 + TPD);
    expect(worldEventView({ ...s, tick: 2 * TPD + 101, worldEvents: we })!.phase).toBe('live');
  });

  it('refuses while an event is already active, and a flash starts one tick later', () => {
    const base = createWorld('force2', cfg(NONE));
    const s: WorldState = { ...base, tick: 10 };
    const first = forceWorldEvent(s, 'flash')!;
    expect(first.active!.startTick).toBe(11);
    expect(forceWorldEvent({ ...s, worldEvents: first }, 'crash')).toBeNull();
  });

  it('a forced event runs through the engine step (start and end publish), and a second roll stays dropped', () => {
    const c = cfg(NONE);
    let s = createWorld('force3', c);
    s = { ...s, tick: 5, worldEvents: forceWorldEvent({ ...s, tick: 5 }, 'bubble')! };
    const starts: number[] = [];
    for (let k = 0; k < 2 * TPD; k++) {
      const r = step(s);
      s = r.state;
      for (const e of r.events) if (e.type === 'world' && e.phase === 'start') starts.push(e.tick);
    }
    expect(starts.length).toBe(1);
    expect(starts[0]).toBe(TPD + 1);
  });
});

describe('no exact onset and no kind before a major starts (velvet-world-events.md, no-reveal)', () => {
  it('the lead varies with the seed across the 8-to-16-hour band, so the Wire time plus the window never gives the onset', () => {
    const c = cfg({ ...NONE, crash: 1 });
    const leads = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const s = { ...createWorld(`lead-${seed}`, c), seed: `lead-${seed}` } as WorldState;
      const next = worldEventsDay(c, initWorldEvents(s), 30, 30 * TPD + 1, 'expansion', 100);
      const a = next.state.active!;
      leads.add((a.startTick - a.announcedTick) / TPD);
    }
    expect([...leads].every((h) => h >= 8 && h <= 16)).toBe(true);
    expect(leads.size).toBeGreaterThan(3);
  });

  it('an announced major shows neither its kind nor its headline; the live event shows both', () => {
    const base = createWorld('hidden', cfg(NONE));
    const f = forceWorldEvent({ ...base, tick: 2 * TPD + 100 }, 'crash')!;
    const announced = worldEventView({ ...base, tick: 2 * TPD + 100, worldEvents: f })!;
    expect(announced.phase).toBe('announced');
    expect(announced.kind).toBeNull();
    expect(announced.headline).toBeNull();
    expect(announced.headlineKey).toBeNull();
    const live = worldEventView({ ...base, tick: 3 * TPD + 1, worldEvents: f })!;
    expect(live.kind).toBe('crash');
    expect(live.headlineKey).toMatch(/^event\.headline\.crash\.\d$/);
  });

  it('an announced crisis week keeps its kind and headline (the calendar card)', () => {
    const base = createWorld('crisis-card', cfg(NONE));
    const c = cfg({ ...NONE, crisis: 1 });
    const next = worldEventsDay(c, initWorldEvents({ ...base, config: c }), 30, 30 * TPD + 1, 'expansion', 100);
    const v = worldEventView({ ...base, config: c, tick: 30 * TPD + 1, worldEvents: next.state })!;
    expect(v.phase).toBe('announced');
    expect(v.kind).toBe('crisis');
    expect(v.headlineKey).toMatch(/^event\.headline\.crisis\.\d$/);
  });
});

describe('forced events start and end on their own ticks, boundary or not', () => {
  it('the e2e seam (now) starts a major one tick later, publishes the start, and ends it on its end tick', () => {
    const c = cfg(NONE);
    let s = createWorld('now-run', c);
    s = { ...s, tick: 2 * TPD + 100, worldEvents: forceWorldEvent({ ...s, tick: 2 * TPD + 100 }, 'crash', 1, true)! };
    const starts: number[] = [];
    const ends: number[] = [];
    for (let k = 0; k < 2 * TPD; k++) {
      const r = step(s);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'world' && e.phase === 'start') starts.push(e.tick);
        if (e.type === 'world' && e.phase === 'end') ends.push(e.tick);
      }
    }
    expect(starts).toEqual([2 * TPD + 101]);
    expect(ends).toEqual([2 * TPD + 101 + TPD]);
    expect(s.worldEvents?.active).toBeUndefined();
  });
});
