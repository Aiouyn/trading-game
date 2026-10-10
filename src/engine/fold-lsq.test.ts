import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { depthByPool, ecologyLog, explainMove } from './ecology';
import { openAccount, placeOrder } from './trading';
import { Rng, seedStream } from './rng';
import type { WorldState } from './types';

/**
 * R1, measured (Tape hunt fold_solve, stronger attacker). The attacker sees everything a client can see about one asset:
 * depthByPool on every closed day (the public Retail figure, which on a folded day holds the lone account's flow), the
 * public value, trend and pension desired flows from the same depth, explainMove for each closed day (its folded flag and
 * its exact parts), and the public day list. It never reads the ecology log's own-flow field, the retail draws, or the seed.
 * It solves by least squares: on the folded days it regresses the public Retail figure on the public pool flows and takes
 * the residual as its estimate of the lone account's flow, then pools the 20 seeds.
 *
 * The truth (desired.own in the log) and the Retail noise scale (q.retail + NPC flow) are read here only to score the
 * attacker. The window is the 21 days the detailed log keeps.
 */

const TPD = 24;
const DAYS = 60;
const WINDOW = 21;
const SEEDS = 20;
/**
 * The world under test is the default universe (its ecology carries DEFAULT_ECOLOGY.foldBlur). Measuring another blur:
 * FOLDBLUR=<sd> with R1_OUT=<file> writes the numbers to that file. Nothing is written otherwise.
 */
const OVERRIDE = process.env.FOLDBLUR === undefined ? {} : { ecology: { mode: 'full' as const, weight: 1, newsPrint: 1, ratePrint: 0.5, foldBlur: Number(process.env.FOLDBLUR) } };
const BLUR = Number(process.env.FOLDBLUR ?? NaN);

/** Two human accounts; only p0 trades. Its daily flow is a random-sign share of the asset's ADV. */
function lone(seed: string, asset: string, share: number): WorldState {
  let s = createWorld(seed, universeConfig({ ticksPerDay: TPD, ...OVERRIDE }));
  s = openAccount(s, 'p0', 1e10);
  s = openAccount(s, 'p1', 1e10);
  const i = s.config.assets.findIndex((a) => a.id === asset);
  const def = s.config.assets[i]!;
  const coin = new Rng(seedStream(seed, 'lsq:sign'));
  for (let d = 0; d < DAYS; d++) {
    const px = Math.exp(s.assets[i]!.lnP);
    const qty = Math.max(1, Math.round((share * (def.advNotional ?? 1e9)) / px));
    const side = coin.uniform() < 0.5 ? 'buy' : 'sell';
    s = placeOrder(s, { playerId: 'p0', assetId: asset, side, type: 'market', qty }).state;
    s = stepMany(s, TPD).state;
  }
  return s;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function corr(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let c = 0, a = 0, b = 0;
  xs.forEach((x, i) => {
    c += (x - mx) * (ys[i]! - my);
    a += (x - mx) ** 2;
    b += (ys[i]! - my) ** 2;
  });
  return c / Math.sqrt(a * b);
}

/** Solve y = X b by normal equations (X includes its own intercept column). Small systems only. */
function lstsq(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  X.forEach((row, r) => {
    for (let i = 0; i < k; i++) {
      b[i]! += row[i]! * y[r]!;
      for (let j = 0; j < k; j++) A[i]![j]! += row[i]! * row[j]!;
    }
  });
  // a tiny ridge keeps a column that is always zero (a pool idle all window) from making the system singular
  for (let i = 0; i < k; i++) A[i]![i]! += 1e-9;
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    [A[c], A[p]] = [A[p]!, A[c]!];
    [b[c], b[p]] = [b[p]!, b[c]!];
    for (let r = c + 1; r < k; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      for (let j = c; j < k; j++) A[r]![j]! -= f * A[c]![j]!;
      b[r]! -= f * b[c]!;
    }
  }
  const x = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let j = r + 1; j < k; j++) s -= A[r]![j]! * x[j]!;
    x[r] = s / A[r]![r]!;
  }
  return x;
}

interface Solve { hat: number[]; truth: number[]; noise: number[] }

/** One seed: the attacker's estimate and the truth over the detailed window, on folded days only. */
function attack(s: WorldState, asset: string): Solve {
  const days = ecologyLog(s).map((d) => d.day).slice(-WINDOW);
  const folded = new Set(explainMove(s, asset, days[0]!, days[days.length - 1]!).foldedDays);
  const pubDays = days.filter((d) => folded.has(d));
  const pub = pubDays.map((d) => depthByPool(s, asset, d).desired);
  const X = pub.map((p) => [1, p.value, p.trend, p.pension]);
  const y = pub.map((p) => p.retail);
  const beta = lstsq(X, y);
  const hat = y.map((v, i) => v - X[i]!.reduce((a, x, j) => a + x * beta[j]!, 0));
  const log = ecologyLog(s);
  const truth: number[] = [];
  const noise: number[] = [];
  for (const d of pubDays) {
    const a = log.find((r) => r.day === d)!.assets.find((x) => x.id === asset)!;
    truth.push(a.desired.own);
    // the public Retail less the lone account's flow: the pool's own noise, the NPC flow and the R1 blur
    noise.push(a.desired.retail + (a.desired.npc ?? 0) + (a.blur ?? 0));
  }
  return { hat, truth, noise };
}

describe('R1 measured: a least-squares attacker on every public signal, 20 seeds', () => {
  for (const share of [0.05, 0.25, 0.5, 1]) {
    it(`a lone account at ${share} ADV a day (random sign): the attacker's error and correlation`, { timeout: 240_000 }, () => {
      const hats: number[] = [];
      const truths: number[] = [];
      const noises: number[] = [];
      const perSeedCorr: number[] = [];
      for (let k = 0; k < SEEDS; k++) {
        const s = lone(`fold-lsq-${k}`, 'OSTV', share);
        const r = attack(s, 'OSTV');
        hats.push(...r.hat);
        truths.push(...r.truth);
        noises.push(...r.noise);
        perSeedCorr.push(corr(r.hat, r.truth));
      }
      const hatC = hats.map((h) => h - mean(hats));
      const truthC = truths.map((t) => t - mean(truths));
      const err = hatC.map((h, i) => h - truthC[i]!);
      const pooled = corr(hats, truths);
      const noiseSd = sd(noises);
      const report = {
        share, blur: Number.isNaN(BLUR) ? 'default' : BLUR, n: hats.length, poolCorr: +pooled.toFixed(3),
        perSeedCorrMean: +mean(perSeedCorr).toFixed(3), ownSd: +sd(truths).toFixed(4), noiseSd: +noiseSd.toFixed(4),
        errSdOverNoise: +(sd(err) / noiseSd).toFixed(3),
      };
      if (process.env.R1_OUT) fs.appendFileSync(process.env.R1_OUT, JSON.stringify(report) + '\n');
      expect(hats.length).toBeGreaterThan(0);
      expect(Number.isFinite(pooled)).toBe(true);
      // R1 gate (tape-research-desk.md, hunt fold_solve): a lone account's flow is not recovered, corr at or under one half,
      // at every flow size up to 1 ADV a day. Measured numbers are in docs/V1-PRIVACY.md section 7 (R1).
      expect(pooled).toBeLessThan(0.5);
    });
  }
});
