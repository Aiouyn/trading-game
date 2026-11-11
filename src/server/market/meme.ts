// The meme template's price process for a listed (graduated) Launchpad coin, lead-launchpad L4: "priced by the engine with
// the meme template of the universe (vol about 1.9 to 2.0, drift -0.15 to -0.25, jumps about 20 a year ... copy the
// parameters from FROG/BONK)". Copied from the p10 engine, not invented:
//  - template FROG (origin/p10/lp src/engine/universe.ts): jumpsPerYear 20, jumpUpMean 0.25, jumpDownMean 0.22, with the
//    crypto defaults jumpUpProb 0.5 and floor 1e-7 $;
//  - per token (src/world/launchpad/graduate.ts): vol = 1.9 + 0.1u, drift = -(0.15 + 0.1u) from the token's own stream;
//  - per tick (src/engine/sim.ts, config.ts): dt = 1 / (720 ticks x 252 days); log step (mu - sigma^2/2) dt +
//    sigma sqrt(dt) eps, eps a unit-variance Student-t with nu = 4; compound Poisson jumps at rate jumpsPerYear dt, Kou
//    double exponential in log space (up with jumpUpProb: +Exp(jumpUpMean), else -Exp(jumpDownMean)).
//  - factor loadings (sim.ts shock; FROG over the crypto defaults, through config.ts normalizeLoadings, unchanged at
//    0.25^2 + 0.75^2 <= 0.95): wMarket 0.25 on the market factor, wCrypto 0.75 on the crypto factor, the rest
//    idio = sqrt(1 - 0.625) on the coin's own Student-t (docs/v1/LAUNCHPAD.md "Book liquidity path ... template factors").
//    The market factor is this base's index GX, read (its own tick step standardized), never redrawn; the crypto factor is
//    one normal a tick from the world stream `lp:crypto` (FactorDraws), shared by every listed coin.
// Not copied, because this base has no such model: cycleBeta, GARCH and the value pull. The trader pools (05 §6.2 meme
// weights) trade the coin through its book: src/server/broker/pools.ts.
// Applied on top (docs/v1/LAUNCHPAD.md "Graduated-coin trader inputs"): 06 §3.11.3 hype H on the path (vol × (1 + 2H),
// log drift + 3.0·H per 364-day game year for MEME, "05 applies"), 05 §3.3.5 the global regime's multipliers (vol, jump intensity,
// jump down-probability shift; a crypto asset reads 04's global regime) and 05 §3.3 factor jumps (`jump`).
// Its own streams (`lp:<TICKER>` for the draws, `lp:<TICKER>:px` for the path), so no other asset's path changes.
import { rng, type Rng } from "@/shell/contracts/mockFeed";

export const MEME_TEMPLATE = {
  id: "FROG", jumpsPerYear: 20, jumpUpMean: 0.25, jumpDownMean: 0.22, jumpUpProb: 0.5, floor: 1e-7, studentNu: 4, wMarket: 0.25, wCrypto: 0.75,
} as const;
/** p10 idioLoading: the unit-variance shock's own share once the factors take theirs. */
export const IDIO_LOADING = Math.sqrt(1 - MEME_TEMPLATE.wMarket ** 2 - MEME_TEMPLATE.wCrypto ** 2);
/** The world's crypto factor stream (one standard normal per clock tick, shared by every listed coin). */
export const CRYPTO_FACTOR_STREAM = "lp:crypto";
export const TICKS_PER_DAY = 720;
/** Game ticks a game hour (24 a game day). */
export const TICKS_PER_HOUR = TICKS_PER_DAY / 24;
/**
 * Day-counts (05 §3.3.1 / 20 / 00) — do not conflate:
 * - SESSION_DAYS_PER_YEAR (260): session assets + Fear rv21 annualization (05 Dy session; 20 tm_trading_days_per_year).
 * - CRYPTO_DAYS_PER_YEAR / GAME_DAYS_PER_GAME_YEAR (364): crypto σ_d and 00 game-year length / hype c·H basis.
 * - DAYS_PER_YEAR (252): inherited p10 meme SDE DT only (`DT = 1/(720·252)`). Not σ_d and not rv21.
 */
export const SESSION_DAYS_PER_YEAR = 260;
export const CRYPTO_DAYS_PER_YEAR = 364;
export const GAME_DAYS_PER_GAME_YEAR = CRYPTO_DAYS_PER_YEAR;
/** @deprecated alias — p10 meme SDE day-count only; prefer SESSION_/CRYPTO_ names for σ_d / rv21. */
export const DAYS_PER_YEAR = 252;
export const DT = 1 / (TICKS_PER_DAY * DAYS_PER_YEAR);
export const DT_GAME_YEAR = 1 / (TICKS_PER_DAY * GAME_DAYS_PER_GAME_YEAR);

/** 06 §3.11.3 hype, per token per game hour: dH = a(m + f − H) − bH + shock; a 0.15, b 0.06 (MEME); f = clamp(net
 *  player buy over 24 game hours / circulating cap × 20, 0, 1); drift_bonus c·H with c = 3.0 per 364-day game year
 *  (MEME): an annualized log-drift contribution (c·H/364 a game day), not a guaranteed or compounded return;
 *  vol_multiplier 1 + 2H. 06 §3.11.4: a new meme token's H₀ = 0.6. */
export const HYPE = { a: 0.15, b: 0.06, h0: 0.6, f: 20, c: 3.0, volK: 2 } as const;

/** The regime's price multipliers on the path (05 §3.3.5): vol, jump intensity, jump down-probability shift. */
export interface RegimeMults { vol: number; jump: number; skew: number }
/** What the path reads each tick besides its own draws: hype and the (blended) regime multipliers. */
export interface PathInputs { hype: number; reg: RegimeMults }
/** Neutral inputs: no hype, multipliers 1 (only for a caller with no world, e.g. a pure test of the template). */
export const NEUTRAL_PATH: PathInputs = { hype: 0, reg: { vol: 1, jump: 1, skew: 0 } };

/** p10's Rng draws over this base's mulberry32 stream. */
export class Draws {
  private readonly next: Rng;
  private spare: number | null = null;
  constructor(stream: string) {
    let seed = 0x811c9dc5;
    for (const ch of stream) seed = Math.imul(seed ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    this.next = rng(seed);
  }
  state(): { a: number; spare: number | null } { return { a: this.next.state(), spare: this.spare }; }
  hydrate(s: { a: number; spare: number | null }): void { this.next.restore(s.a); this.spare = s.spare; }
  /** Uniform in (0, 1), never exactly 0 or 1. */
  uniform(): number { return (Math.floor(this.next() * 4294967296) + 0.5) / 4294967296; }
  normal(): number {
    if (this.spare !== null) { const v = this.spare; this.spare = null; return v; }
    const u1 = this.uniform(), u2 = this.uniform(), r = Math.sqrt(-2 * Math.log(u1));
    this.spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  }
  studentT(nu: number): number {
    const z = this.normal();
    let chi2 = 0;
    for (let i = 0; i < nu; i++) { const g = this.normal(); chi2 += g * g; }
    return (z / Math.sqrt(chi2 / nu)) * Math.sqrt((nu - 2) / nu);
  }
  exponential(mean: number): number { return -Math.log(this.uniform()) * mean; }
  chance(p: number): boolean { return this.uniform() < p; }
}

/** The token's vol and drift, drawn once from its own stream (graduate.ts order: vol, then drift). */
export function memeParams(ticker: string): { vol: number; drift: number } {
  const d = new Draws(`lp:${ticker}`);
  const vol = 1.9 + 0.1 * d.uniform();
  const drift = -(0.15 + 0.1 * d.uniform());
  return { vol, drift };
}

/** One listed coin's path: log price in dollars, stepped once per clock tick. Prices leave as integer minor units. */
export class MemeProcess {
  readonly vol: number;
  readonly drift: number;
  private lnP: number;
  /** The sum of the permanent impacts applied to the path (log): lnV = lnP − offset is the template path without the
   *  flow's moves, the value the VALUE pool reads (05 §6.2 gap G = lnRef − lnV; docs/v1/LAUNCHPAD.md trader pools). */
  private offset = 0;
  private readonly draws: Draws;
  constructor(readonly ticker: string, baseMinor: number, readonly dp: number) {
    ({ vol: this.vol, drift: this.drift } = memeParams(ticker));
    this.lnP = Math.log(baseMinor / 10 ** dp);
    this.draws = new Draws(`lp:${ticker}:px`);
  }
  /** The path's effective annual vol now: vol × m_reg × (1 + 2H) (05 §3.3 σ_ann,eff without the 1.15 print scale, GARCH
   *  and m_event, which this base does not have). */
  sigmaEff(inp: PathInputs): number { return this.vol * inp.reg.vol * (1 + HYPE.volK * inp.hype); }
  /** One tick: diffusion (zMarket, zCrypto: this tick's unit-variance factor shocks, shared) plus at most one jump;
   *  returns the new price in minor units (at least the floor, at least 1). Same draws, in the same order, whatever the
   *  inputs: hype and the regime scale the step, never the stream. */
  step(zMarket: number, zCrypto: number, inp: PathInputs): number {
    const t = MEME_TEMPLATE, d = this.draws;
    const sigma = this.sigmaEff(inp);
    // the template's drift and vol on its inherited 252 basis (DT); the hype term per 364-day game year (DT_GAME_YEAR)
    let jump = 0;
    if (d.chance(t.jumpsPerYear * inp.reg.jump * DT)) jump = d.chance(t.jumpUpProb - inp.reg.skew) ? d.exponential(t.jumpUpMean) : -d.exponential(t.jumpDownMean);
    const shock = t.wMarket * zMarket + t.wCrypto * zCrypto + IDIO_LOADING * d.studentT(t.studentNu);
    this.lnP += (this.drift - 0.5 * sigma * sigma) * DT + HYPE.c * inp.hype * DT_GAME_YEAR + sigma * Math.sqrt(DT) * shock + jump;
    this.lnP = Math.max(this.lnP, Math.log(t.floor));
    return this.minor();
  }
  /** A factor jump (05 §3.3): a value move of `logMove` on the path (lnV moves with it: no gap). */
  jump(logMove: number): number {
    this.lnP = Math.max(this.lnP + logMove, Math.log(MEME_TEMPLATE.floor));
    return this.minor();
  }
  /** A fill's permanent impact (src/server/broker/book.ts): the path moves by `logMove` now and steps on from there. */
  shift(logMove: number): number {
    const from = this.lnP;
    this.lnP = Math.max(this.lnP + logMove, Math.log(MEME_TEMPLATE.floor));
    this.offset += this.lnP - from;
    return this.minor();
  }
  /** The template path's log value in dollars, without the flow's permanent moves. */
  lnV(): number { return this.lnP - this.offset; }
  minor(): number { return Math.max(1, Math.round(Math.exp(this.lnP) * 10 ** this.dp)); }
  snapshot(): { lnP: number; offset: number; draws: { a: number; spare: number | null } } {
    return { lnP: this.lnP, offset: this.offset, draws: this.draws.state() };
  }
  hydrate(s: { lnP: number; offset: number; draws: { a: number; spare: number | null } }): void {
    this.lnP = s.lnP;
    this.offset = s.offset;
    this.draws.hydrate(s.draws);
  }
}
