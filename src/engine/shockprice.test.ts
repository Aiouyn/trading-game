/**
 * Tape M02 unit (tape-acceptance.md section 2): the test-only shockPrice. Changes only the shocked asset's price, never
 * its value, h, regime or any random stream; leaves every other asset bit-identical; rejects bad input; never goes
 * under the asset floor; and never creates a world event (tape-ecology-hunts.md, shockprice_not_event).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config';
import { createWorld, shockPrice, stepMany } from './sim';
import type { WorldState } from './types';

const SEED = 'tape-m02-unit';
const TICKS = 1000;

function base(): WorldState {
  return createWorld(SEED, defaultConfig());
}

describe('M02 shockPrice (test-only, Tape unit)', () => {
  it('moves only assets[id].lnP: value, h, regime and every random stream are unchanged', () => {
    const s0 = base();
    const id = s0.config.assets[0]!.id;
    const i = s0.config.assets.findIndex((a) => a.id === id);
    const s1 = shockPrice(s0, id, -0.015);
    const a0 = s0.assets[i]!;
    const a1 = s1.assets[i]!;
    expect(a1.lnP).toBeCloseTo(a0.lnP + Math.log1p(-0.015), 12);
    expect(a1.lnV).toBe(a0.lnV);
    expect(a1.h).toBe(a0.h);
    expect(s1.regime).toBe(s0.regime);
    expect(s1.macroRng).toEqual(s0.macroRng);
    expect(s1.tick).toBe(s0.tick);
    s0.assets.forEach((a, j) => {
      if (j !== i) expect(s1.assets[j]).toBe(a);
    });
  });

  it('over the next 1,000 ticks every other asset is bit-identical to an unshocked copy', () => {
    const plain = base();
    const id = plain.config.assets[0]!.id;
    const i = plain.config.assets.findIndex((a) => a.id === id);
    const shocked = shockPrice(base(), id, -0.015);
    const a = stepMany(plain, TICKS).state;
    const b = stepMany(shocked, TICKS).state;
    expect(a.assets.length).toBe(b.assets.length);
    a.assets.forEach((asset, j) => {
      if (j === i) return;
      expect(b.assets[j], `asset ${a.config.assets[j]!.id}`).toEqual(asset);
    });
  });

  it('throws on an unknown id and on pct at or below -1, and on a non-finite pct', () => {
    const s = base();
    const id = s.config.assets[0]!.id;
    expect(() => shockPrice(s, 'NOPE', 0.1)).toThrow(/unknown asset/);
    expect(() => shockPrice(s, id, -1)).toThrow();
    expect(() => shockPrice(s, id, -2)).toThrow();
    expect(() => shockPrice(s, id, Number.NaN)).toThrow();
    expect(() => shockPrice(s, id, Number.POSITIVE_INFINITY)).toThrow();
  });

  it('never pushes a price below the asset floor, however large the drop', () => {
    const s = base();
    const def = s.config.assets[0]!;
    const shocked = shockPrice(s, def.id, -0.999999);
    const lnP = shocked.assets[0]!.lnP;
    expect(lnP).toBeGreaterThanOrEqual(Math.log(def.floor) - 1e-12);
    expect(Number.isFinite(lnP)).toBe(true);
  });

  it('never creates a WorldEvent: the event state is unchanged by a shock', () => {
    const s = base();
    const id = s.config.assets[0]!.id;
    const shocked = shockPrice(s, id, 0.2);
    expect(shocked.worldEvents).toEqual(s.worldEvents);
  });

  it('no world-event module calls shockPrice or shockValue', () => {
    const engine = resolve(__dirname);
    for (const file of ['worldEvents.ts']) {
      const src = readFileSync(resolve(engine, file), 'utf8');
      expect(src, file).not.toMatch(/shockPrice|shockValue/);
    }
  });
});
