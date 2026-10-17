import { describe, expect, it } from 'vitest';
import { CREATOR, lpWorld, launch } from './fixture';
import { lpTick } from './flow';
import { barsOf } from './bars';
import { TPD } from './constants';
import type { LpBar } from './types';

/**
 * Minute candles of a fresh coin against the launch price, the open of the first candle.
 * The GeckoTerminal sample of live launches (October 2026, minute closes, gaps filled)
 * had a median peak of about 2.3× in ten minutes and about 4.8× within an hour, then
 * gave a large share of that back. These floors sit under that sample so a seed draw
 * can miss a coin without the ruler-flat tape passing.
 */
function minuteBars(seed: string, minutes: number): { bars: LpBar[]; graduated: boolean } {
  const g = lpWorld(seed);
  expect(launch(g, CREATOR, 'WAVE').ok).toBe(true);
  const t = g.launchpad!.tokens.WAVE!;
  let graduated = false;
  for (let k = 1; k <= minutes * 12; k++) {
    g.market = { ...g.market, tick: g.market.tick + 1 };
    lpTick(g, null);
    if (t.status === 'graduated') graduated = true;
  }
  return { bars: barsOf(t).m, graduated };
}

function shape(bars: LpBar[]) {
  const open = bars[0]![1];
  const closes = bars.map(b => b[4] / open);
  let peak = closes[0]!;
  let peakI = 0;
  for (let i = 0; i < closes.length; i++) if (closes[i]! > peak) { peak = closes[i]!; peakI = i; }
  let trough = peak;
  for (let i = peakI; i < closes.length; i++) trough = Math.min(trough, closes[i]!);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(closes[i]! / closes[i - 1]! - 1);
  const flat = (from: number, to: number) => {
    const slice = rets.slice(from, to);
    if (!slice.length) return 1;
    return slice.filter(r => Math.abs(r) < 0.01).length / slice.length;
  };
  const maxClose = (n: number) => Math.max(...closes.slice(0, Math.min(n + 1, closes.length)));
  const hour = rets.slice(0, 60);
  let flips = 0;
  let prev = 0;
  let run = 0;
  let maxUpRun = 0;
  let big = 0;
  for (const r of hour) {
    if (Math.abs(r) >= 0.15) big++;
    const sign = r > 0.01 ? 1 : r < -0.01 ? -1 : 0;
    if (sign === 0) continue;
    if (prev !== 0 && sign !== prev) flips++;
    prev = sign;
    if (sign > 0) { run++; maxUpRun = Math.max(maxUpRun, run); }
    else run = 0;
  }
  const medWick = (from: number, to: number) => {
    const ws = bars.slice(from, to).map(b => (b[2] - b[3]) / b[1]).filter(w => Number.isFinite(w)).sort((a, b) => a - b);
    return ws.length ? ws[Math.floor(ws.length / 2)]! : 0;
  };
  // Price action v2: the launch minutes carry the big candles, and they shrink as attention decays.
  const wick = medWick(0, 10);
  const lateWick = medWick(40, 60);
  return {
    peak10: maxClose(10),
    peak60: maxClose(60),
    peak,
    endOverPeak: closes[closes.length - 1]! / peak,
    troughOverPeak: trough / peak,
    flat30: flat(0, 30),
    maxDown: Math.min(...rets),
    maxUp: Math.max(...rets),
    flips,
    wick,
    lateWick,
    maxUpRun,
    big,
  };
}

describe('launch tape matches a real memecoin hour', () => {
  it('rallies by tens of percent, keeps the move on the minute chart, and often dumps', () => {
    const rows = ['tape-a', 'tape-b', 'tape-c', 'tape-d', 'tape-e', 'tape-f', 'tape-g', 'tape-h'].map(seed => {
      const run = minuteBars(seed, 90);
      return { ...shape(run.bars), graduated: run.graduated };
    });
    const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const peak10 = med(rows.map(r => r.peak10));
    const peak60 = med(rows.map(r => r.peak60));
    const flat30 = med(rows.map(r => r.flat30));
    const dumped = rows.filter(r => r.maxDown <= -0.25).length;
    const up2 = rows.filter(r => r.peak60 >= 2).length;
    const gave = rows.filter(r => r.peak >= 2 && r.troughOverPeak <= 0.6).length;
    // Real sample: median 2.34× by minute 10, 4.80× by minute 60, flat share about 10% in the first hour.
    expect(peak10, `10-minute median peak ${peak10.toFixed(2)}× the open`).toBeGreaterThan(1.8);
    // PA v2: most launches are quick deaths and rugs that top inside the first minutes (the real sample's 4.80× is the median of
    // coins that kept trading), so the floor is the one a quick death clears.
    expect(peak60, `60-minute median peak ${peak60.toFixed(2)}× the open`).toBeGreaterThan(2.2);
    // PA v2: a quick death or a rug has stopped trading by minute 20 to 30, so a typical launch is flat for much of its first half hour.
    expect(flat30, `first-30-minute flat share ${flat30.toFixed(2)}`).toBeLessThan(0.8);
    expect(up2, `coins reaching 2× the open within an hour: ${up2}`).toBeGreaterThanOrEqual(6);
    expect(dumped, `coins with a minute of -25% or worse: ${dumped}`).toBeGreaterThanOrEqual(4);
    expect(gave, `spikes that gave back to 60% of the peak: ${gave}`).toBeGreaterThanOrEqual(3);
    // A long green run with a 5% wick used to pass the floors above. Real launch hours flip
    // about every minute, and the launch minutes' wick is a large share of the open.
    const flips = med(rows.map(r => r.flips));
    const wick = med(rows.map(r => r.wick));
    const lateWick = med(rows.map(r => r.lateWick));
    const upRun = med(rows.map(r => r.maxUpRun));
    // PA v2: fewer live minutes in the hour (see flat30), so fewer flips.
    expect(flips, `direction changes in the first hour: ${flips}`).toBeGreaterThanOrEqual(8);
    expect(wick, `median wick, first 10 minutes ${(wick).toFixed(3)}`).toBeGreaterThanOrEqual(0.1);
    // Fade = attention decay: candles in minutes 40 to 60 are smaller than the launch candles (price action v2).
    expect(lateWick, `median wick, minutes 40-60 ${(lateWick).toFixed(3)}`).toBeLessThan(wick);
    expect(upRun, `longest green run: ${upRun}`).toBeLessThanOrEqual(8);
    // A viral shock or a rare runner can still finish a coin; most launches stop short of graduation.
    expect(rows.filter(r => r.graduated).length, 'graduated inside 90 minutes').toBeLessThanOrEqual(2);
  });

  it('does not graduate the idle world out of the 1% to 5% band', () => {
    const g = lpWorld('tape-grad', { npcLaunches: true });
    const days = 4;
    for (let k = 0; k < days * TPD; k++) {
      g.market = { ...g.market, tick: g.market.tick + 1 };
      lpTick(g, null);
    }
    const tokens = Object.values(g.launchpad!.tokens);
    const old = tokens.filter(t => g.market.tick - t.createdTick >= 2 * TPD);
    const graduatedOld = old.filter(t => t.status === 'graduated').length;
    const graduated = tokens.filter(t => t.status === 'graduated').length;
    const rate = graduatedOld / Math.max(1, old.length);
    const total = graduated / Math.max(1, tokens.length);
    expect(old.length).toBeGreaterThan(40);
    expect(rate, `aged graduation ${graduatedOld}/${old.length}`).toBeLessThanOrEqual(0.06);
    expect(total, `graduation ${graduated}/${tokens.length}`).toBeLessThanOrEqual(0.06);
  });
});
