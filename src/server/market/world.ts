// The world inputs a graduated coin's path and trader pools read in this base (docs/v1/LAUNCHPAD.md "Fear Index full
// inputs"): 04's Fear Index F (hourly, full §3.14.1 formula) and 04's global business-cycle regime (daily), with
// 05 §3.3.5's regime multipliers. This base has no 04 engine on the live clock (packages/engine/macro is not wired to
// it), so this file plays 04's role for these two states only, with 04's own formulas and parameters (copied, cited;
// not imported). Inputs this base cannot supply hold their genesis / last values (04 §3.14.5), named below.
// Deterministic: GX path + per-day streams + live crisisTerm from the storm scheduler. Fear/regime bookkeeping is
// persisted with the storm-world store so a restart restores F (M1-05 / storm-durable pattern).
import { SESSION_DAYS_PER_YEAR, Draws, TICKS_PER_DAY, TICKS_PER_HOUR, type RegimeMults } from "./meme";

export type Regime = "EXPANSION" | "OVERHEATING" | "CONTRACTION" | "RECOVERY";

/** 04 §3.3.1 base chain, in the table's order (the target pick walks it). */
export const REGIME_ALLOWED: Readonly<Record<Regime, readonly Regime[]>> = {
  EXPANSION: ["OVERHEATING", "CONTRACTION"], OVERHEATING: ["CONTRACTION", "EXPANSION"], CONTRACTION: ["RECOVERY"], RECOVERY: ["EXPANSION", "CONTRACTION"],
};
export const REGIME_P_BASE: Readonly<Record<Regime, Partial<Record<Regime, number>>>> = {
  EXPANSION: { OVERHEATING: 0.8, CONTRACTION: 0.2 }, OVERHEATING: { CONTRACTION: 0.85, EXPANSION: 0.15 }, CONTRACTION: { RECOVERY: 1 }, RECOVERY: { EXPANSION: 0.9, CONTRACTION: 0.1 },
};
/** PARAM.macro_regime_mean_days_* / min_days_* (23 registry, 04 §3.3.1), game days. */
export const REGIME_DAYS: Readonly<Record<Regime, { mean: number; min: number }>> = {
  EXPANSION: { mean: 819, min: 182 }, OVERHEATING: { mean: 273, min: 63 }, CONTRACTION: { mean: 273, min: 91 }, RECOVERY: { mean: 273, min: 91 },
};
/** 04 §3.3.4 hazard weights on the one z this base can compute (fear); every other key has no source here and holds 0. */
export const REGIME_FEAR_WEIGHT: Readonly<Record<string, number>> = {
  "EXPANSION>CONTRACTION": 0.4, "OVERHEATING>CONTRACTION": 0.4, "CONTRACTION>RECOVERY": -0.3, "RECOVERY>EXPANSION": -0.2, "RECOVERY>CONTRACTION": 0.4,
};
/** 05 §3.3.5 (PARAM.mkt_regime_vol/jump/skew_*). */
export const REGIME_MULTS: Readonly<Record<Regime, RegimeMults>> = {
  EXPANSION: { vol: 0.9, jump: 0.8, skew: -0.05 }, OVERHEATING: { vol: 1.05, jump: 1.0, skew: 0.05 },
  CONTRACTION: { vol: 1.45, jump: 1.6, skew: 0.15 }, RECOVERY: { vol: 1.15, jump: 1.2, skew: 0 },
};
/** 05 §3.14.1 regimeTurnover (the ADV multiplier). */
export const REGIME_TURNOVER: Readonly<Record<Regime, number>> = { EXPANSION: 1.0, OVERHEATING: 1.1, CONTRACTION: 1.3, RECOVERY: 1.1 };
/** 05 §3.3.5: a regime change moves the multipliers linearly over 5 trading days. */
export const REGIME_DEPTH: Readonly<Record<Regime, number>> = { EXPANSION: 1.1, OVERHEATING: 1, CONTRACTION: 0.8, RECOVERY: 0.9 };
export const REGIME_BLEND_TICKS = 5 * TICKS_PER_DAY;

/** One day of 04 §3.3.2 for the global chain (no coupling): no transition before the minimum length; hazard
 *  H = λ Σ P_base·M, λ = 1/(mean − min), M = exp(w_fear × clamp(zFear, −2, 3)); transition when u1 < 1 − e^(−H); u2
 *  picks the target by P_base·M. */
export function regimeStep(from: Regime, daysIn: number, zFear: number, u1: number, u2: number): Regime {
  const d = REGIME_DAYS[from];
  if (daysIn < d.min) return from;
  const z = Math.min(3, Math.max(-2, zFear));
  const ws = REGIME_ALLOWED[from].map((to) => REGIME_P_BASE[from][to]! * Math.exp((REGIME_FEAR_WEIGHT[`${from}>${to}`] ?? 0) * z));
  const sum = ws.reduce((s, w) => s + w, 0);
  if (!(u1 < 1 - Math.exp(-sum / (d.mean - d.min)))) return from;
  let acc = 0;
  for (const [i, to] of REGIME_ALLOWED[from].entries()) { acc += ws[i]! / sum; if (u2 < acc) return to; }
  return REGIME_ALLOWED[from].at(-1)!;
}

/**
 * 04 §3.14.1 inputs (same shape as packages/engine/macro/rules/fear.ts FearInputs).
 * Live in this base: rv21Gx, gxReturnToday, gxReturn63d (from GX), crisisTerm (from StormScheduler).
 * Held / genesis (04 §3.14.5; V1-OUT / unbuilt sources disclosed in LAUNCHPAD): creditSpreadIdx, fsi, tension, hackRate.
 */
export interface FearInputs {
  rv21Gx: number;
  creditSpreadIdx: number;
  fsi: number;
  crisisTerm: number;
  tension: number;
  hackRate: number;
  gxReturnToday: number;
  gxReturn63d: number;
}

/** Genesis / held values for inputs with no 06/07/08/12/16 source on the live clock (T04-15 / 04 §3.14.5). */
export const FEAR_HELD = { creditSpreadIdx: 1, fsi: 0, tension: 30, hackRate: 0 } as const;
export const FEAR_GENESIS = 22;
/** Genesis rv21 (T04-15), held until 21 day returns of GX exist. */
export const RV21_GENESIS = 0.16;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** 100·σ(−1.2 + 3(rv − 0.16)/0.16 + 2(csi − 1) + 2.5·FSI + crisis + 0.8(T − 50)/50 + 0.5(H − 50)/50 + 2·max(0, −r)/0.03 − 0.5·r63/0.10). */
export function fearRaw(x: FearInputs): number {
  const z = -1.2 + (3 * (x.rv21Gx - 0.16)) / 0.16 + 2 * (x.creditSpreadIdx - 1) + 2.5 * x.fsi + 1.0 * x.crisisTerm
    + (0.8 * (x.tension - 50)) / 50 + (0.5 * (x.hackRate - 50)) / 50
    + (2 * Math.max(0, -x.gxReturnToday)) / 0.03 - (0.5 * x.gxReturn63d) / 0.1;
  return 100 * sigmoid(z);
}

/** One game hour of a 2-hour half-life. */
export const stepFear = (F: number, raw: number): number => F + (raw - F) * (1 - Math.SQRT1_2);

/** RA = 1 − F/50 (04 §3.14.1). */
export const riskAppetite = (F: number): number => 1 - F / 50;

/** 1 while a major is in TRIGGER/CONTAGION; 0.5 while a storm is active; else 0. */
export type CrisisTerm = 0 | 0.5 | 1;
export function crisisTermFromStorm(active: boolean): CrisisTerm {
  return active ? 0.5 : 0;
}

/** Backward-compat helper for tests that pass only the GX legs (held inputs filled from FEAR_HELD). */
export function fearRawGx(x: { rv21: number; rToday: number; r63: number; crisisTerm?: number }): number {
  return fearRaw({
    rv21Gx: x.rv21, gxReturnToday: x.rToday, gxReturn63d: x.r63,
    creditSpreadIdx: FEAR_HELD.creditSpreadIdx, fsi: FEAR_HELD.fsi, tension: FEAR_HELD.tension, hackRate: FEAR_HELD.hackRate,
    crisisTerm: x.crisisTerm ?? 0,
  });
}

export interface WorldView { regime: Regime; fear: number; riskAppetite: number }

/** Durable Fear / regime bookkeeping (persisted with the storm-world store). */
export interface WorldSnapshot {
  readonly fear: number;
  readonly regime: Regime;
  readonly daysIn: number;
  readonly change: { from: Regime; tick: number } | null;
  readonly closes: readonly number[];
  readonly dayOpen: number;
  readonly lastHour: number | null;
  readonly lastDay: number | null;
}

export function emptyWorldSnapshot(): WorldSnapshot {
  return { fear: FEAR_GENESIS, regime: "EXPANSION", daysIn: 0, change: null, closes: [], dayOpen: 0, lastHour: null, lastDay: null };
}

/**
 * The clock's world state, observed once per tick at its start (the state published at the end of N−1): every game
 * hour F steps; every game day the GX day close is kept and the regime steps once on `macro:global:regime:<day>`.
 * `crisisTerm` is the live 04 term from the storm scheduler (0.5 while a storm is active).
 */
export class WorldInputs {
  fear = FEAR_GENESIS;
  regime: Regime = "EXPANSION";
  private daysIn = 0;
  /** The last regime change, for the 5-day blend (null: none since genesis). */
  private change: { from: Regime; tick: number } | null = null;
  private closes: number[] = [];
  private dayOpen = 0;
  private lastHour: number | null = null;
  private lastDay: number | null = null;

  snapshot(): WorldSnapshot {
    return {
      fear: this.fear, regime: this.regime, daysIn: this.daysIn,
      change: this.change ? { ...this.change } : null,
      closes: this.closes.slice(), dayOpen: this.dayOpen, lastHour: this.lastHour, lastDay: this.lastDay,
    };
  }

  hydrate(snap: WorldSnapshot): void {
    this.fear = snap.fear;
    this.regime = snap.regime;
    this.daysIn = snap.daysIn;
    this.change = snap.change ? { ...snap.change } : null;
    this.closes = snap.closes.slice();
    this.dayOpen = snap.dayOpen;
    this.lastHour = snap.lastHour;
    this.lastDay = snap.lastDay;
  }

  /** Tick N is about to run; `gx` is GX's mark at the end of N−1 (minor units). `crisisTerm` from storms at that tick. */
  observe(tick: number, gx: number, crisisTerm: CrisisTerm = 0): void {
    const day = Math.floor(tick / TICKS_PER_DAY), hour = Math.floor(tick / TICKS_PER_HOUR);
    if (this.lastDay === null) { this.lastDay = day; this.dayOpen = gx; this.lastHour = hour; return; }
    if (day > this.lastDay) {
      this.closes.push(gx);
      if (this.closes.length > 64) this.closes.shift();
      for (let d = this.lastDay + 1; d <= day; d++) {
        const r = new Draws(`macro:global:regime:${d}`);
        const u1 = r.uniform(), u2 = r.uniform();
        this.daysIn += 1;
        const next = regimeStep(this.regime, this.daysIn, (this.fear - 50) / 20, u1, u2);
        if (next !== this.regime) { this.change = { from: this.regime, tick }; this.regime = next; this.daysIn = 0; }
      }
      this.lastDay = day;
      this.dayOpen = gx;
    }
    if (hour > this.lastHour!) {
      const x = this.fearInputs(gx, crisisTerm);
      for (let h = this.lastHour! + 1; h <= hour; h++) this.fear = stepFear(this.fear, fearRaw(x));
      this.lastHour = hour;
    }
  }

  /** rv21 from the last 21 GX day returns (annualized, √260 session Dy per 05 §3.3.1 / 20), else genesis; today's and the 63-day return; live crisisTerm. */
  fearInputs(gx: number, crisisTerm: CrisisTerm = 0): FearInputs {
    const c = this.closes, n = c.length;
    let rv21 = RV21_GENESIS;
    if (n >= 22) {
      const r = c.slice(-22).slice(1).map((v, i) => Math.log(v / c[n - 22 + i]!));
      const m = r.reduce((s, v) => s + v, 0) / r.length;
      rv21 = Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(SESSION_DAYS_PER_YEAR);
    }
    return {
      rv21Gx: rv21,
      creditSpreadIdx: FEAR_HELD.creditSpreadIdx,
      fsi: FEAR_HELD.fsi,
      crisisTerm,
      tension: FEAR_HELD.tension,
      hackRate: FEAR_HELD.hackRate,
      gxReturnToday: this.dayOpen > 0 ? Math.log(gx / this.dayOpen) : 0,
      gxReturn63d: n >= 64 ? Math.log(gx / c[n - 64]!) : 0,
    };
  }

  /** The regime multipliers at `tick`, moving linearly over 5 trading days after a change. */
  mults(tick: number): RegimeMults {
    const to = REGIME_MULTS[this.regime];
    if (!this.change) return to;
    const k = Math.min(1, (tick - this.change.tick) / REGIME_BLEND_TICKS), from = REGIME_MULTS[this.change.from];
    return { vol: from.vol + (to.vol - from.vol) * k, jump: from.jump + (to.jump - from.jump) * k, skew: from.skew + (to.skew - from.skew) * k };
  }

  depth(tick: number): number {
    const to = REGIME_DEPTH[this.regime];
    if (!this.change) return to;
    const k = Math.min(1, Math.max(0, (tick - this.change.tick) / REGIME_BLEND_TICKS));
    return REGIME_DEPTH[this.change.from] + (to - REGIME_DEPTH[this.change.from]) * k;
  }

  view(): WorldView { return { regime: this.regime, fear: this.fear, riskAppetite: riskAppetite(this.fear) }; }
}
