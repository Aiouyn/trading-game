import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { dayRows, ecoArchive, explainMove } from './ecology';
import { openAccount } from './trading';
import type { AssetState, LnVParts, WorldState } from './types';

const TPD = 8;
const ASSET = 'OSTV';

/** A save from before the lnV split: the open day's accumulator is missing, as it is on a save loaded mid-day. */
function withoutSplit(s: WorldState): WorldState {
  return {
    ...s,
    assets: s.assets.map((a): AssetState => {
      const copy: AssetState = { ...a };
      delete copy.dayLnV;
      return copy;
    }),
  };
}

describe('the lnV split (D-1): the parts sum to the day lnV change wherever a split exists', () => {
  it('a day that began before a save with no split is unsplit (never a partial split), and its value cause is company noise', () => {
    let s = createWorld('split-midday', universeConfig({ ticksPerDay: TPD }));
    s = openAccount(s, 'p0');
    s = stepMany(s, 2 * TPD).state; // game days 0 and 1 close (ticks 8 and 16)
    s = stepMany(s, 3).state; // mid day 2 (tick 19): the save is loaded here
    s = withoutSplit(s);
    s = stepMany(s, TPD + (TPD - 3)).state; // day 2 closes at tick 24 (unsplit), day 3 closes at tick 32 (split)
    const arc = ecoArchive(s);
    const d2 = arc.find((d) => d.day === 2)!;
    const d3 = arc.find((d) => d.day === 3)!;
    const d1 = arc.find((d) => d.day === 1)!;
    for (const a of d2.assets) expect(a.lnVParts).toBeUndefined();
    for (let i = 0; i < d3.assets.length; i++) {
      const p = d3.assets[i]!.lnVParts!;
      expect(p).toBeDefined();
      const change = d3.assets[i]!.lnV - d2.assets[i]!.lnV;
      const sum = p.drift + p.market + p.sector + p.idio + p.news + p.event;
      expect(Math.abs(sum - change)).toBeLessThan(1e-10);
    }
    // a fully seen day before it still sums exactly
    for (let i = 0; i < d1.assets.length; i++) {
      const p = d1.assets[i]!.lnVParts!;
      const sum = p.drift + p.market + p.sector + p.idio + p.news + p.event;
      expect(Math.abs(sum - (d1.assets[i]!.lnV - arc.find((d) => d.day === 0)!.assets[i]!.lnV))).toBeLessThan(1e-10);
    }
  });

  it('the unsplit day still explains exactly: its value cause is Company noise, and the window sums to the move', () => {
    let s = createWorld('split-explain', universeConfig({ ticksPerDay: TPD }));
    s = openAccount(s, 'p0');
    s = stepMany(s, 2 * TPD).state;
    s = stepMany(s, 3).state;
    s = withoutSplit(s);
    s = stepMany(s, TPD + (TPD - 3)).state;
    const idx = s.config.assets.findIndex((a) => a.id === ASSET);
    const d2 = ecoArchive(s).find((d) => d.day === 2)!;
    const row = d2.assets[idx]!;
    const e = explainMove(s, ASSET, 2, 2);
    expect(e.parts.market).toBeUndefined();
    expect(e.parts.sector).toBeUndefined();
    expect(e.parts.event).toBeUndefined();
    const sum = Object.values(e.parts).reduce((a, b) => a + (b ?? 0), 0);
    expect(Math.abs(sum - e.totalLog)).toBeLessThan(1e-12);
    expect(dayRows(row, false).parts.company).toBe(row.cause.value);
  });
});

describe('the factor rows (D-1): company drift is not a market move', () => {
  const zeroCause = { value: 0.02, trend: 0, retail: 0, pension: 0, own: 0, maker: 0, news: 0, event: 0 };
  const base = { id: ASSET, lnS: 0, lnV: 0, cause: zeroCause, players: { accounts: 0, maxShare: 0 } };

  it('drift alone is Company noise, never Market', () => {
    const lv: LnVParts = { drift: 0.01, market: 0, sector: 0, idio: 0, news: 0, event: 0 };
    const r = dayRows({ ...base, lnVParts: lv }, false);
    expect(r.parts.market).toBe(0);
    expect(r.parts.company).toBeCloseTo(0.02, 12);
  });

  it('the market factor goes to Market and the drift to Company noise, in proportion to their sizes', () => {
    const lv: LnVParts = { drift: 0.01, market: 0.01, sector: 0, idio: 0, news: 0, event: 0 };
    const r = dayRows({ ...base, lnVParts: lv }, false);
    expect(r.parts.market).toBeCloseTo(0.01, 12);
    expect(r.parts.company).toBeCloseTo(0.01, 12);
    expect(r.parts.market + r.parts.company).toBeCloseTo(0.02, 12);
  });
});
