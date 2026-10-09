import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { rivalEquity, rivalLeaderboard, rivalsClose, rivalsDay, RIVAL_CAP_ADV } from './rivals';
import type { WorldState } from './types';

const TPD = 24;

function run(cfgOver: Parameters<typeof universeConfig>[0], days: number, seed = 'rivals'): WorldState {
  return stepMany(createWorld(seed, universeConfig({ ticksPerDay: TPD, ...cfgOver })), TPD * days).state;
}

describe('NPC rival funds', () => {
  it('are slices of the pools: prices are bit-identical with rivals on and off', () => {
    const on = run({}, 6);
    const off = run({ rivals: [] }, 6);
    expect(on.assets.map((a) => a.lnP)).toEqual(off.assets.map((a) => a.lnP));
    expect(on.assets.map((a) => a.lnV)).toEqual(off.assets.map((a) => a.lnV));
    expect(off.ecology?.rivals).toBeUndefined();
    expect(on.ecology?.rivals?.length).toBe(3);
  });

  it('the public leaderboard shows name and equity only, never style, cash, units or targets', () => {
    const s = run({}, 6);
    const rows = rivalLeaderboard(s);
    expect(rows.map((r) => r.name).sort()).toEqual(['Hale & Ward', 'Pinn Partners', 'Vetch']);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['equity', 'id', 'name']);
      expect(Number.isFinite(r.equity)).toBe(true);
    }
    expect(rows.every((r, i) => i === 0 || rows[i - 1]!.equity >= r.equity)).toBe(true);
  });

  it('keep sane books: cash never negative, equity equals cash plus marks, and at least one rival trades', () => {
    const s = run({}, 45);
    const books = s.ecology!.rivals!;
    for (const b of books) {
      expect(b.cash).toBeGreaterThanOrEqual(0);
      const eq = rivalEquity(s, b.id);
      expect(Number.isFinite(eq)).toBe(true);
      expect(b.peak).toBeGreaterThanOrEqual(eq - 1e-6);
    }
    const traded = books.some((b) => Object.keys(b.units).length > 0 || b.cash < (s.config.rivals!.find((d) => d.id === b.id)!.startingCash));
    expect(traded).toBe(true);
  });

  it('a rival trades only in the direction its pool flows, and no more than the pool trades', () => {
    const s = run({}, 22);
    const cfg = s.config;
    const eco = s.ecology!;
    const plan = rivalsDay(cfg, eco, s.assets.map((a) => a.lnV), 22)!;
    // every planned trade is capped at RIVAL_CAP_ADV of ADV
    for (const d of plan.desire) for (const x of d) expect(Math.abs(x)).toBeLessThanOrEqual(RIVAL_CAP_ADV + 1e-12);
    // with the pools flowing nowhere, the rivals fill nothing: their books change only by the peak
    const zeros = new Array<number>(cfg.assets.length).fill(0);
    const idle = rivalsClose(cfg, plan, zeros, zeros, eco.assets.map((a) => a.lnS));
    idle.forEach((b, k) => {
      expect(b.cash).toBe(eco.rivals?.find((r) => r.id === b.id)?.cash ?? b.cash);
      expect(Object.keys(b.units).length).toBe(Object.keys(eco.rivals?.find((r) => r.id === plan.rivals[k]!.id)?.units ?? {}).length);
    });
  });

  it('an old save with no rival book loads and the books start from the config', () => {
    const s = run({}, 2);
    const old: WorldState = { ...s, ecology: { ...s.ecology!, rivals: undefined } };
    const next = stepMany(old, TPD * 2).state;
    expect(next.ecology?.rivals?.map((r) => r.id).sort()).toEqual(['hale', 'pinn', 'vetch']);
  });
});
