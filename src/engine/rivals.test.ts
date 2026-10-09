import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { PUBLIC_VALUE_SIGMA, publicValueLine, rivalEquity, rivalLeaderboard, rivalsClose, rivalsDay, RIVAL_CAP_ADV } from './rivals';
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
    const plan = rivalsDay(cfg, eco, s.assets.map((a) => a.lnV), 22, s.seed)!;
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

  it('Hale ranks on the public value read, not the true lnV: its targets are the 3 stocks furthest below that read', () => {
    const s = run({}, 22);
    const cfg = s.config;
    const eco = s.ecology!;
    const lnV = s.assets.map((a) => a.lnV);
    const plan = rivalsDay(cfg, eco, lnV, 21, s.seed)!;
    const read = publicValueLine(s.seed, cfg, lnV, 21);
    const expected = cfg.assets
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.listed !== false && a.assetClass === 'stock')
      .map(({ a, i }) => ({ id: a.id, i, s: eco.assets[i]!.lnS - read[i]! }))
      .sort((x, y) => x.s - y.s || x.i - y.i)
      .slice(0, 3)
      .map((x) => x.id);
    expect(plan.rivals.find((r) => r.id === 'hale')!.target).toEqual(expected);
  });

  it('Vetch holds the 3 best 21-day cryptos, equal weight, and rebalances every 5 days', () => {
    const s = run({}, 22);
    const cfg = s.config;
    const plan = rivalsDay(cfg, s.ecology!, s.assets.map((a) => a.lnV), 25, s.seed)!;
    const vetch = plan.rivals.find((r) => r.id === 'vetch')!;
    expect(vetch.target.length).toBe(3);
    expect(new Set(vetch.target).size).toBe(3);
    for (const id of vetch.target) expect(cfg.assets.find((a) => a.id === id)!.assetClass).toBe('crypto');
  });

  it('the public value read is deterministic, fixed within a 21-day epoch, and redrawn each epoch at the stated sigma', () => {
    const s = run({}, 2);
    const cfg = s.config;
    const lnV = s.assets.map((a) => a.lnV);
    const a21 = publicValueLine(s.seed, cfg, lnV, 21);
    expect(publicValueLine(s.seed, cfg, lnV, 21)).toEqual(a21);
    const off = (r: number[]) => r.map((x, i) => x - lnV[i]!);
    // same epoch (days 21..41): the same offset per asset
    expect(off(a21)).toEqual(off(publicValueLine(s.seed, cfg, lnV, 41)));
    // next epoch (day 42): a fresh draw
    expect(off(a21)).not.toEqual(off(publicValueLine(s.seed, cfg, lnV, 42)));
    // the offsets are standard normal times sigma: sample sd over 40 epochs x all assets sits near 1 sigma
    const z: number[] = [];
    for (let e = 0; e < 40; e++) {
      const r = publicValueLine(s.seed, cfg, lnV, e * 21);
      r.forEach((x, i) => z.push((x - lnV[i]!) / PUBLIC_VALUE_SIGMA));
    }
    const mean = z.reduce((t, x) => t + x, 0) / z.length;
    const sd = Math.sqrt(z.reduce((t, x) => t + (x - mean) ** 2, 0) / z.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(sd).toBeGreaterThan(0.9);
    expect(sd).toBeLessThan(1.1);
  });

  it('an old save with no rival book loads and the books start from the config', () => {
    const s = run({}, 2);
    const old: WorldState = { ...s, ecology: { ...s.ecology!, rivals: undefined } };
    const next = stepMany(old, TPD * 2).state;
    expect(next.ecology?.rivals?.map((r) => r.id).sort()).toEqual(['hale', 'pinn', 'vetch']);
  });
});
