import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import { DEFAULT_CATALYSTS } from './catalysts';
import { universeConfig } from './universe';
import { initWorldEvents, tradingRegime, worldEventMove, worldEventView, worldEventsDay } from './worldEvents';
import type { WorldEvent, WorldEventsState } from './worldEvents';
import type { AssetDef, RegimeDef, RegimeId, StepEvent, WorldConfig, WorldState } from './types';

const TPD = 24;
const ZERO_ODDS = { crash: 0, bubble: 0, crisis: 0, flash: 0 };

function regimes(): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, jumpUpShift: 0, meanDays: 1e12 };
  }
  return out;
}

function stock(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 's', initialPrice: 50, sharesOutstanding: 1e8,
    vol: 0.3, drift: 0, cycleBeta: 1, wMarket: 0.55, wSector: 0.45, wCrypto: 0,
    halfLifeDays: 20, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 2e8, qtyStep: 1, ...extra,
  });
}

function cfg(over: Partial<WorldConfig> = {}): WorldConfig {
  const assets = Array.from({ length: 8 }, (_, i) => stock(`S${i}`));
  return defaultConfig({ ticksPerDay: TPD, regimes: regimes(), indices: [], assets, catalysts: DEFAULT_CATALYSTS, ...over });
}

function run(s: WorldState, ticks: number): { state: WorldState; events: StepEvent[] } {
  const events: StepEvent[] = [];
  for (let k = 0; k < ticks; k++) {
    const r = step(s);
    s = r.state;
    for (const e of r.events) events.push(e);
  }
  return { state: s, events };
}

function event(kind: WorldEvent['kind'], over: Partial<WorldEvent> = {}): WorldEvent {
  return { id: 'ev1', kind, headline: 'Test.', announcedTick: 0, startTick: TPD, endTick: TPD + 4 * TPD, shocks: {}, today: { day: 0, moves: {} }, ...over };
}

function withEvent(s: WorldState, ev: WorldEvent): WorldState {
  const we: WorldEventsState = { rng: s.macroRng, seq: 1, drifts: [], active: ev };
  return { ...s, worldEvents: we };
}

describe('shared world events', () => {
  it('is off unless the config asks for it', () => {
    const s = run(createWorld('off', cfg()), 3 * TPD).state;
    expect(s.worldEvents).toBeUndefined();
  });

  it('with every odd at zero, prices match a world without events to the bit', () => {
    const plain = run(createWorld('same', cfg()), 3 * TPD).state;
    const zero = run(createWorld('same', cfg({ worldEvents: { odds: ZERO_ODDS } })), 3 * TPD).state;
    expect(zero.assets.map((a) => a.lnP)).toEqual(plain.assets.map((a) => a.lnP));
    expect(zero.assets.map((a) => a.lnV)).toEqual(plain.assets.map((a) => a.lnV));
  });

  it('a crash is a slide: its planned move lands in price and value over its window', () => {
    const ev = event('crash', { startTick: 10, endTick: 10 + 4 * TPD, shocks: { S0: -0.3 } });
    const we: WorldEventsState = { rng: [0, 0, 0, 1], seq: 1, drifts: [], active: ev };
    let p = 0, v = 0;
    for (let t = 0; t < 10 + 4 * TPD + 5; t++) {
      const m = worldEventMove(we, 'S0', t);
      p += m.price;
      v += m.value;
    }
    expect(p).toBeCloseTo(-0.3, 12);
    expect(v).toBeCloseTo(-0.3, 12);
  });

  it('a crash moves the price by its planned total when nothing else moves', () => {
    const c = cfg({ assets: [stock('S0', { vol: 0, halfLifeDays: 1e9 })], worldEvents: { odds: ZERO_ODDS } });
    const s0 = createWorld('crash', c);
    const start = s0.assets[0]!.lnP;
    const s = run(withEvent(s0, event('crash', { shocks: { S0: -0.3 } })), 5 * TPD).state;
    expect(s.assets[0]!.lnP - start).toBeCloseTo(-0.3, 9);
    expect(s.assets[0]!.lnV - start).toBeCloseTo(-0.3, 9);
  });

  it('the app sees the event without its end, its length or its planned move', () => {
    const c = cfg({ worldEvents: { odds: ZERO_ODDS } });
    const live = { ...createWorld('view', c), tick: 2 * TPD };
    const v = worldEventView(withEvent(live, event('crash', { startTick: TPD, endTick: 40 * TPD, shocks: { S0: -0.4 } })));
    expect(v).not.toBeNull();
    expect(Object.keys(v!).sort()).toEqual(['elapsedDays', 'headline', 'headlineKey', 'id', 'kind', 'phase', 'sinceTick', 'todayShare']);
    expect(v!.phase).toBe('live');
    expect(v!.elapsedDays).toBe(1);

    const warned = worldEventView(withEvent({ ...live, tick: 0 }, event('crash', { startTick: 3 * TPD, endTick: 40 * TPD })));
    expect(warned!.phase).toBe('announced');
    expect(warned!.elapsedDays).toBe(0);
  });

  it('over 200 seeds and 5 game years, majors land near the spec rate and never overlap', () => {
    const c = universeConfig();
    let majors = 0;
    let overlaps = 0;
    for (let k = 0; k < 200; k++) {
      let we = initWorldEvents({ seed: `odds-${k}` } as WorldState);
      for (let day = 0; day < 5 * c.daysPerYear; day++) {
        const tick = day * c.ticksPerDay;
        const before = we.active;
        const r = worldEventsDay(c, we, day, tick, 'expansion', 1);
        // a new event may only be announced once the previous one has ended (end first, then roll)
        if (before && before.endTick > tick && r.events.some((e) => e.phase === 'announced')) overlaps++;
        majors += r.events.filter((e) => e.phase === 'announced' && (e.ev.kind === 'crash' || e.ev.kind === 'bubble')).length;
        we = r.state;
      }
    }
    expect(overlaps).toBe(0);
    expect(majors).toBeGreaterThanOrEqual(80);
    expect(majors).toBeLessThanOrEqual(180);
  });

  it('a flash crash starts and ends inside its day, with no warning before it starts', () => {
    const c = cfg({ worldEvents: { odds: { crash: 0, bubble: 0, crisis: 0, flash: 1 } } });
    let s = createWorld('flash', c);
    const world: StepEvent[] = [];
    let warnedEarly = false;
    for (let t = 0; t < 4 * TPD; t++) {
      const r = step(s);
      s = r.state;
      for (const e of r.events) if (e.type === 'world') world.push(e);
      const a = s.worldEvents?.active;
      if (a && a.kind === 'flash' && s.tick < a.startTick && worldEventView(s) !== null) warnedEarly = true;
    }
    expect(warnedEarly).toBe(false);
    const starts = world.filter((e) => e.type === 'world' && e.phase === 'start');
    const ends = world.filter((e) => e.type === 'world' && e.phase === 'end');
    expect(starts.length).toBeGreaterThanOrEqual(2);
    expect(ends.length).toBe(starts.length);
    expect(world.some((e) => e.type === 'world' && e.phase === 'announced')).toBe(false);
    for (const st of starts) {
      const dayStart = Math.floor((st.tick - 1) / TPD) * TPD + 1;
      const end = ends.find((e) => e.type === 'world' && e.tick >= st.tick)!;
      expect(st.tick).toBeGreaterThanOrEqual(dayStart);
      expect(end.tick).toBeLessThan(dayStart + TPD);
    }
  });

  it('a crisis week trades as contraction for its days, and the macro chain resumes after', () => {
    const c = cfg({ worldEvents: { odds: ZERO_ODDS } });
    const base = { ...createWorld('crisis', c), tick: TPD };
    const ev = event('crisis', { startTick: TPD + 1, endTick: TPD + 1 + 5 * TPD, headline: 'Crisis week.' });
    const during = run(withEvent(base, ev), 2);
    expect(tradingRegime(during.state.worldEvents, during.state.tick, during.state.regime)).toBe('contraction');
    expect(during.state.regime).toBe('expansion');
    expect(during.events.some((e) => e.type === 'regime')).toBe(false);

    const after = run(during.state, 5 * TPD);
    expect(after.state.tick).toBeGreaterThanOrEqual(TPD + 1 + 5 * TPD);
    expect(tradingRegime(after.state.worldEvents, after.state.tick, after.state.regime)).toBe('expansion');
    expect(after.state.regime).toBe('expansion');
  });

  it('replays byte-identical from the seed', () => {
    const c = cfg({ worldEvents: { odds: { crash: 0.2, bubble: 0.2, crisis: 0.2, flash: 0.2 } } });
    const a = run(createWorld('replay', c), 4 * TPD).state;
    const b = run(createWorld('replay', c), 4 * TPD).state;
    expect(a.worldEvents).toBeDefined();
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
