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
// Not copied, because this base has no such model: regimes and cycleBeta (no regime drift here), GARCH, the value pull
// and the ecology pools (docs/v1/LAUNCHPAD.md, owner decision on L4's "retail-heavy pool weights").
// Its own streams (`lp:<TICKER>` for the draws, `lp:<TICKER>:px` for the path), so no other asset's path changes.
import { rng } from "@/shell/contracts/mockFeed";

export const MEME_TEMPLATE = {
  id: "FROG", jumpsPerYear: 20, jumpUpMean: 0.25, jumpDownMean: 0.22, jumpUpProb: 0.5, floor: 1e-7, studentNu: 4, wMarket: 0.25, wCrypto: 0.75,
} as const;
/** p10 idioLoading: the unit-variance shock's own share once the factors take theirs. */
export const IDIO_LOADING = Math.sqrt(1 - MEME_TEMPLATE.wMarket ** 2 - MEME_TEMPLATE.wCrypto ** 2);
/** The world's crypto factor stream (one standard normal per clock tick, shared by every listed coin). */
export const CRYPTO_FACTOR_STREAM = "lp:crypto";
export const TICKS_PER_DAY = 720;
export const DAYS_PER_YEAR = 252;
export const DT = 1 / (TICKS_PER_DAY * DAYS_PER_YEAR);

/** p10's Rng draws over this base's mulberry32 stream. */
export class Draws {
  private readonly next: () => number;
  private spare: number | null = null;
  constructor(stream: string) {
    let seed = 0x811c9dc5;
    for (const ch of stream) seed = Math.imul(seed ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    this.next = rng(seed);
  }
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
  private readonly draws: Draws;
  constructor(readonly ticker: string, baseMinor: number, readonly dp: number) {
    ({ vol: this.vol, drift: this.drift } = memeParams(ticker));
    this.lnP = Math.log(baseMinor / 10 ** dp);
    this.draws = new Draws(`lp:${ticker}:px`);
  }
  /** One tick: diffusion (zMarket, zCrypto: this tick's unit-variance factor shocks, shared) plus at most one jump;
   *  returns the new price in minor units (at least the floor, at least 1). */
  step(zMarket: number, zCrypto: number): number {
    const t = MEME_TEMPLATE, d = this.draws;
    let jump = 0;
    if (d.chance(t.jumpsPerYear * DT)) jump = d.chance(t.jumpUpProb) ? d.exponential(t.jumpUpMean) : -d.exponential(t.jumpDownMean);
    const shock = t.wMarket * zMarket + t.wCrypto * zCrypto + IDIO_LOADING * d.studentT(t.studentNu);
    this.lnP += (this.drift - 0.5 * this.vol * this.vol) * DT + this.vol * Math.sqrt(DT) * shock + jump;
    this.lnP = Math.max(this.lnP, Math.log(t.floor));
    return this.minor();
  }
  /** A fill's permanent impact (src/server/broker/book.ts): the path moves by `logMove` now and steps on from there. */
  shift(logMove: number): number {
    this.lnP = Math.max(this.lnP + logMove, Math.log(MEME_TEMPLATE.floor));
    return this.minor();
  }
  minor(): number { return Math.max(1, Math.round(Math.exp(this.lnP) * 10 ** this.dp)); }
}
