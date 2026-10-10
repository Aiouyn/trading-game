import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { depthByPool, ecologyLog, explainMove } from './ecology';
import { openAccount, placeOrder } from './trading';
import type { WorldState } from './types';

/**
 * R1 (H6): the folded Players flow cannot be isolated from public data. On a folded day the depth's Retail figure already
 * holds the folded player flow, and separating it needs the Retail pool's own noise draws, which come from the server-only
 * world seed (P5). This test plays the attacker: it sees only depthByPool, explainMove and the public day frames (never the
 * seed, never the ecology log's own-flow field) and tries the one-dimensional solve own = Retail - baseline, where the
 * baseline is the mean of the public Retail readings so far. The ecology log is read only to score the attacker.
 */

const TPD = 24;
const ASSET = 'OSTV';
const DAYS = 80;

/**
 * Two human accounts; only p0 trades ASSET, so each day folds to a lone account (fewer than 5 accounts, no 40% share). p0
 * buys 5% of ASSET's average daily volume on even days and sells it back on odd days: a signed own flow of about 0.05 ADV,
 * which is well below the Retail noise (the test measures it).
 */
function lonelyFold(seed: string): WorldState {
  let s = createWorld(seed, universeConfig({ ticksPerDay: TPD }));
  s = openAccount(s, 'p0', 1e8);
  s = openAccount(s, 'p1', 1e8);
  const def = s.config.assets.find((a) => a.id === ASSET)!;
  for (let d = 0; d < DAYS; d++) {
    const i = s.config.assets.indexOf(def);
    const qty = Math.max(1, Math.floor((0.05 * (def.advNotional ?? 0)) / Math.exp(s.assets[i]!.lnP)));
    const side = d % 2 === 0 ? 'buy' : 'sell';
    s = placeOrder(s, { playerId: 'p0', assetId: ASSET, side, type: 'market', qty }).state;
    s = stepMany(s, TPD).state;
  }
  return s;
}

function corr(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let c = 0;
  let a = 0;
  let b = 0;
  xs.forEach((x, i) => {
    c += (x - mx) * (ys[i]! - my);
    a += (x - mx) ** 2;
    b += (ys[i]! - my) ** 2;
  });
  return c / Math.sqrt(a * b);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

describe('R1: the folded lone-account flow is not recovered from public data', () => {
  it('the one-dimensional solve on public Retail leaves an error on the scale of the Retail noise, not the own flow', () => {
    const s = lonelyFold('fold-solve');
    // public: the depth's Retail on each closed day (folded, so it already holds p0's flow), and the window's cause rows
    const days = ecologyLog(s).map((d) => d.day).filter((d) => d >= 1 && d < DAYS);
    const publicRetail = days.map((d) => depthByPool(s, ASSET, d).desired.retail);
    const window = explainMove(s, ASSET, days[0]!, days[days.length - 1]!);
    expect(Object.keys(window.parts)).not.toContain('players');
    expect(Object.keys(window.parts)).not.toContain('you');

    // the attacker's solve: own_hat = Retail_k - mean of the public Retail readings before k
    const hat: number[] = [];
    const truth: number[] = [];
    for (let k = 1; k < days.length; k++) {
      hat.push(publicRetail[k]! - mean(publicRetail.slice(0, k)));
      // scoring only: the log's own flow for that day, never read by the attacker
      const a = ecologyLog(s).find((r) => r.day === days[k])!.assets.find((x) => x.id === ASSET)!;
      truth.push(a.desired.own);
    }
    const err = hat.map((h, i) => h - truth[i]!);
    // the Retail noise scale: Retail without the own flow (the retail pool and the NPC flow) day to day
    const retailNoise = sd(days.slice(1).map((d, i) => depthByPool(s, ASSET, d).desired.retail - truth[i]!));
    const errScale = sd(err);
    // the error is comparable to the Retail noise scale, so the solve does not recover the own flow
    expect(retailNoise).toBeGreaterThan(0);
    expect(errScale / retailNoise).toBeGreaterThan(0.5);
    expect(errScale / retailNoise).toBeLessThan(2);
    // the own flow is real (it is signed and not zero), yet the estimate is mostly noise: a weak correlation with it
    expect(sd(truth)).toBeGreaterThan(0);
    expect(Math.abs(corr(hat, truth))).toBeLessThan(0.5);
  });
});
