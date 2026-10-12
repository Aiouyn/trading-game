/**
 * Tape ecology hunt event_invalid_values (tape-ecology-hunts.md section 3): with world events on, no NaN or Infinity
 * reaches a price, and no price goes under its asset floor, on any tick. Twenty seeds, one game year each, on the
 * default config at 24 ticks a day. The band is 0 violations.
 */
import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config';
import { createWorld, step } from './sim';
import type { WorldState } from './types';

const SEEDS = 20;
const DAYS = 365;
const TPD = 24;

describe('event_invalid_values (world events on, 20 seeds x 1 game year)', () => {
  it('no price is NaN, infinite or under its asset floor on any tick, and at least one event fires in the sample', () => {
    let violations = 0;
    let firstBad = '';
    let eventTicks = 0;
    for (let k = 0; k < SEEDS; k++) {
      const cfg = defaultConfig({ ticksPerDay: TPD, worldEvents: {} });
      let s: WorldState = createWorld(`event-invalid-${k}`, cfg);
      const floors = s.config.assets.map((a) => Math.log(a.floor));
      for (let t = 0; t < DAYS * TPD; t++) {
        const r = step(s);
        s = r.state;
        if (s.worldEvents?.active) eventTicks++;
        for (let i = 0; i < s.assets.length; i++) {
          const lnP = s.assets[i]!.lnP;
          const bad = !Number.isFinite(lnP) || !Number.isFinite(Math.exp(lnP)) || lnP < floors[i]! - 1e-9;
          if (bad) {
            violations++;
            if (!firstBad) firstBad = `seed ${k} tick ${t} asset ${s.config.assets[i]!.id} lnP ${lnP}`;
          }
        }
      }
    }
    expect(firstBad, 'first violation').toBe('');
    expect(violations).toBe(0);
    expect(eventTicks, 'events were on and active in the sample').toBeGreaterThan(0);
  }, 240_000);
});
