import { describe, expect, it } from 'vitest';
import { createWorld, indexLevel, stepMany, step } from './sim';
import { universeConfig } from './universe';
import { appendAsset, delist } from './listings';
import { indicesDay, indexMembers } from './indices';
import { ecologyLog } from './ecology';
import type { StepEvent, WorldConfig, WorldState } from './types';

// The game day is 24 ticks here (the game's 720 is slow for a test). The quarterly review runs every 63 days and is
// announced 3 days ahead, so the announcement is on day 60 and the change takes effect on day 63 (tick 63 * 24 + 1).
const TPD = 24;
const REVIEW = 63;
const ANNOUNCE = 60;
const NO_LISTINGS = { odds: { ipo: 0, bankruptcy: 0, merger: 0, spinoff: 0 } };
const NEW_TECH = 'NEWT';
const NEW_ENERGY = 'NEWE';
const NEW_LATE = 'LATE';

function config(review: boolean): WorldConfig {
  const cfg = universeConfig({ ticksPerDay: TPD, listings: NO_LISTINGS });
  return review ? cfg : { ...cfg, indexReview: undefined };
}

/** a new listing, from a template stock: an unseasoned or seasoned listing on `listedDay`, in a given sector */
function listing(s: WorldState, id: string, listedDay: number, sector: string, region?: string): WorldState {
  const tmpl = s.config.assets.find((a) => a.id === 'OSTV')!;
  return appendAsset(s, {
    ...tmpl, id, name: id, initialPrice: 40, sharesOutstanding: 5e8, listedDay, sector,
    ...(region ? { region } : {}), listed: undefined, delisted: undefined,
  });
}

function world(review: boolean, withListings = true): WorldState {
  let s = createWorld('indices', config(review));
  if (!withListings) return s;
  s = listing(s, NEW_TECH, 0, 'tech');
  s = listing(s, NEW_ENERGY, 0, 'energy');
  return s;
}

/** Step `ticks` ticks, keeping the index events. */
function runEvents(s0: WorldState, ticks: number): { state: WorldState; events: StepEvent[] } {
  let s = s0;
  const events: StepEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    const r = step(s);
    s = r.state;
    for (const e of r.events) if (e.type === 'index') events.push(e);
  }
  return { state: s, events };
}

function relDiff(a: number, b: number): number {
  return Math.abs(a / b - 1);
}

describe('index divisor and level', () => {
  it('with no review ever run, indexLevel is the old cap-weighted formula, bit for bit', () => {
    const s = stepMany(createWorld('index-bits', config(false)), 5 * TPD).state;
    for (const idx of s.config.indices) {
      let cap = 0, cap0 = 0;
      for (const id of idx.members) {
        const i = s.config.assets.findIndex((a) => a.id === id);
        const def = s.config.assets[i]!;
        const sh = def.sharesOutstanding ?? 1;
        cap += sh * Math.exp(s.assets[i]!.lnP);
        cap0 += sh * def.initialPrice;
      }
      expect(indexLevel(s, idx.id)).toBe((idx.base * cap) / cap0);
    }
    expect(s.indices).toBeUndefined();
    expect(s.reshuffle).toBeUndefined();
  });

  it('a review with no change to membership leaves every price bit-identical and writes no index state', () => {
    // no listings and no delistings: every stock is already in GX, GXT and AV50 where its sector or region says so.
    // Two 70-day runs of 24 ticks take about 1.5 s alone but reach the 5 s default under the full suite's load (measured
    // 2026-10-10: timed out at 5 s on two runs), so the limit is explicit. The assertion is unchanged.
    const on = stepMany(world(true, false), 70 * TPD).state;
    const off = stepMany(world(false, false), 70 * TPD).state;
    expect(on.indices).toBeUndefined();
    expect(on.reshuffle).toBeUndefined();
    expect(on.assets.map((a) => a.lnP)).toEqual(off.assets.map((a) => a.lnP));
  }, 60_000);

  it('the level is continuous across a reconstitution (joins and a delisted name leaving)', () => {
    let s = world(true);
    // a name delisted before the review leaves the index at the review, at its frozen price
    const gone = s.config.assets.findIndex((a) => a.id === 'HLCN');
    s = delist(s, gone, Math.exp(s.assets[gone]!.lnP));
    s = stepMany(s, REVIEW * TPD).state;
    expect(s.tick).toBe(REVIEW * TPD);
    const before = { GX: indexLevel(s, 'GX'), GXT: indexLevel(s, 'GXT') };
    const r = indicesDay(s, s.tick + 1);
    expect(r.events.some((e) => e.type === 'index' && e.phase === 'effective' && e.indexId === 'GX')).toBe(true);
    expect(indexMembers(r.state, s.config.indices[0]!)).toContain(NEW_TECH);
    expect(indexMembers(r.state, s.config.indices[0]!)).not.toContain('HLCN');
    expect(relDiff(indexLevel(r.state, 'GX'), before.GX)).toBeLessThan(1e-12);
    expect(relDiff(indexLevel(r.state, 'GXT'), before.GXT)).toBeLessThan(1e-12);
  });

  it('a sector index takes only its sector: a tech listing joins GXT, an energy one does not', () => {
    const s = stepMany(world(true), REVIEW * TPD).state;
    const r = indicesDay(s, s.tick + 1).state;
    expect(indexMembers(r, s.config.indices[0]!)).toEqual(expect.arrayContaining([NEW_TECH, NEW_ENERGY]));
    expect(indexMembers(r, s.config.indices[1]!)).toContain(NEW_TECH);
    expect(indexMembers(r, s.config.indices[1]!)).not.toContain(NEW_ENERGY);
  });

  it('a listing younger than the review cycle waits for the next review', () => {
    // listed on day 10: at the day-63 review it has 53 days, at the day-126 review 116 (the cycle is 63)
    let s = listing(world(true, false), NEW_LATE, 10, 'tech');
    s = stepMany(s, (REVIEW + 1) * TPD).state;
    expect(indexMembers(s, s.config.indices[0]!)).not.toContain(NEW_LATE);
    s = stepMany(s, REVIEW * TPD).state;
    expect(indexMembers(s, s.config.indices[0]!)).toContain(NEW_LATE);
  }, 60_000);

  it('is announced on the Wire before it takes effect, and the membership changes only on the effective day', () => {
    let s = world(true);
    const seen: { tick: number; e: Extract<StepEvent, { type: 'index' }> }[] = [];
    while (s.tick <= REVIEW * TPD) {
      const r = step(s);
      s = r.state;
      for (const e of r.events) if (e.type === 'index') seen.push({ tick: e.tick, e });
    }
    const ann = seen.filter((x) => x.e.phase === 'announced');
    const eff = seen.filter((x) => x.e.phase === 'effective');
    expect(ann.length).toBeGreaterThan(0);
    expect(eff.length).toBeGreaterThan(0);
    expect(ann[0]!.e.day).toBe(REVIEW);
    expect(ann[0]!.tick).toBe(ANNOUNCE * TPD + 1);
    expect(eff[0]!.tick).toBe(REVIEW * TPD + 1);
    expect(ann[0]!.tick).toBeLessThan(eff[0]!.tick);
    expect(ann[0]!.e.adds).toEqual(eff[0]!.e.adds);
    // the membership on day 62 is still the old one
    const at62 = stepMany(world(true), (REVIEW - 1) * TPD).state;
    expect(at62.indices).toBeUndefined();
    expect(indexMembers(at62, at62.config.indices[0]!)).not.toContain(NEW_TECH);
  }, 60_000);

  it('the pension pool trades into the added name on the reshuffle day only', () => {
    let s = stepMany(world(true), REVIEW * TPD).state;
    s = stepMany(s, TPD).state; // the close of the reshuffle day (day 63) is logged
    expect(s.reshuffle?.day).toBe(REVIEW);
    const row = (day: number) => ecologyLog(s).find((d) => d.day === day)?.assets.find((a) => a.id === NEW_TECH);
    const onDay = row(REVIEW)!;
    expect(onDay.desired.pension).toBeGreaterThan(0);
    // on the effective day the quarter pull is off (day 63 mod 63 = 0) and the name held no pension weight before, so the
    // pension's whole order is the reshuffle: reshuffleK (1) ADV per equal-weight unit. Measured 2026-10-10 in this world
    // (NEWT and NEWE both listed, so both join GX): 0.2645 ADV. A world with NEWT alone gives 0.2629.
    expect(onDay.desired.pension).toBeCloseTo(s.reshuffle!.eq[NEW_TECH]!, 12);
    expect(onDay.desired.pension).toBeCloseTo(0.2645, 3);
    // the day before (not yet in the index) and the day after (no pull until the next quarter's last days) carry no pension order
    expect(row(REVIEW - 1)!.desired.pension).toBe(0);
    s = stepMany(s, 2 * TPD).state;
    expect(ecologyLog(s).find((d) => d.day === REVIEW + 2)?.assets.find((a) => a.id === NEW_TECH)!.desired.pension).toBe(0);
    // the reshuffle moves weight: the new name buys, the rest of the index sells a little, and the weights net to zero
    const eq = s.reshuffle!.eq;
    expect(eq[NEW_TECH]).toBeGreaterThan(0);
    expect(Object.values(eq).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
  });

  it('is deterministic: the same world replays the same index state and prices', () => {
    const a = stepMany(world(true), 66 * TPD).state;
    const b = stepMany(world(true), 66 * TPD).state;
    expect(JSON.stringify(a.indices)).toBe(JSON.stringify(b.indices));
    expect(JSON.stringify(a.reshuffle)).toBe(JSON.stringify(b.reshuffle));
    expect(a.assets.map((x) => x.lnP)).toEqual(b.assets.map((x) => x.lnP));
  }, 60_000); // two 66-day replays in one test: longer than vitest's 5 s default on a loaded machine

  it('the events carry asset ids only, and the effective event matches the announcement', () => {
    const { events } = runEvents(world(true), (REVIEW + 1) * TPD);
    const eff = events.find((e): e is Extract<StepEvent, { type: 'index' }> => e.type === 'index' && e.phase === 'effective' && e.indexId === 'GX')!;
    expect([...eff.adds].sort()).toEqual([NEW_ENERGY, NEW_TECH].sort());
    expect(eff.removes).toEqual([]);
  });
});
