import { Rng, seedStream } from '@/engine';
import type { RngState } from '@/engine';
import historicalFlow from './historical-flow.json';
import { LP, NPC } from './constants';

/**
 * Meme-coin price action v2: one hidden archetype and one attention state per coin.
 *
 * Archetype (hidden, never on a view): what kind of story this coin is. It sets the drive schedule: how much interest the coin has
 * at each age and whether that interest leans to buying or selling. Every type ends in a fade.
 *   rug      insiders buy at launch and dump their bag within minutes; the crowd panics and leaves.
 *   quick    a few minutes of hype, a top, then it bleeds out (the majority).
 *   grinder  climbs in steps with long consolidations for a few game hours, then fades.
 *   trender  a long story that re-pumps when buzz arrives (viral shocks, promos) or on its own, then fades.
 *   runner   rare: stepped climb, god candles into a blow-off top, then a long bleed with shrinking candles.
 *
 * Attention (Hawkes-like): order arrivals per tick are Poisson(drive + excitation). Each settled order adds excitation in
 * proportion to its size (big prints wake more traders); the excitation decays with a half-life of a few ticks, and fresh buzz adds
 * to it. Order size also scales with attention, so candle size tracks volume and volatility clusters and decays smoothly. The fade is
 * the drive decaying on a half-life: fewer and smaller orders, so candles shrink instead of switching off.
 *
 * Tells (public, noisy): a coin's visible habits come from a tell profile. 70% of coins show their own type's profile, 30% mimic
 * another type, and every knob gets a small random drift. The habits are: how fast new wallets join (unique-buyer growth), how much
 * of the early supply the launch wallets take (holder concentration), whether those wallets sell early (dev sell timing), how hard
 * dips are bought, and the type odds lean on the launch buzz (public). Tells shift the odds; none confirms the type.
 *
 * Recorded Pump.fun flows (historical-flow.json) are no longer replayed as a coin's story. They only calibrate the order-size law:
 * each order draws its size, as a share of the reserve, from the recorded buy or sell sizes.
 */

export type Arch = 'rug' | 'quick' | 'grinder' | 'trender' | 'runner';
export const ARCHES: Arch[] = ['rug', 'quick', 'grinder', 'trender', 'runner'];
/** Base mix before the launch-buzz lean. */
export const ARCH_ODDS: Record<Arch, number> = { rug: 0.17, quick: 0.55, grinder: 0.16, trender: 0.085, runner: 0.035 };

/** One drive segment: [ticks, orders per tick, buy probability, size multiplier]. */
export type Seg = [number, number, number, number];

export interface PaState {
  v: 1;
  /** hidden archetype and the tell profile it shows (equal for 70% of coins) */
  arch: Arch;
  mimic: Arch;
  rng: RngState;
  born: number;
  /** self-excitation, orders per tick: a slow kernel (e) and a fast one (f) that follows big prints for a few ticks */
  e: number;
  f?: number;
  /** the slow price anchor (a geometric moving average) and the first price this flow saw */
  anc?: number;
  p0?: number;
  plan: Seg[];
  /** fade half-life in ticks, after the plan ends */
  fadeHalf: number;
  /** extra re-pump segments (trender), [start age, ticks, drive, buyP, size] */
  pumps: [number, number, number, number, number][];
  /** tell knobs */
  growth: number; insider: number; devSellAt: number; devSellFrac: number; dipBuy: number;
  /** wallets already in this coin's crowd (unique-buyer breadth) */
  breadth: number;
  /** rug: the tick age the insiders dump, and how many ticks the dump is spread over */
  rugAt: number; rugTicks: number;
  /** insiders' entry: ticks spent buying at launch */
  insiderDone: boolean;
  /** age after which the launch wallets join ordinary selling (before it they sell only in the dev sale or the rug) */
  insHold?: number;
  devSold: boolean;
  lastBuzz: number;
  lastRet: number;
  /** spectator net buying in dollars (the echo cap of the player-response block) */
  echo: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// Size law calibrated from the recorded flows: sorted reserve shares of buys and of sells.
const BUY_SIZES: number[] = [];
const SELL_SIZES: number[] = [];
for (const p of historicalFlow as { events: number[][] }[]) for (const e of p.events) {
  const s = e[1]!;
  if (s > 0) BUY_SIZES.push(s); else if (s < 0) SELL_SIZES.push(-s);
}
BUY_SIZES.sort((a, b) => a - b);
SELL_SIZES.sort((a, b) => a - b);
const pickSize = (list: number[], u: number) => list.length ? list[Math.min(list.length - 1, Math.floor(u * list.length))]! : 0.003;
/** A reserve share for one order, from the recorded law. */
export function sizeShare(side: 'buy' | 'sell', u: number): number {
  return pickSize(side === 'buy' ? BUY_SIZES : SELL_SIZES, u);
}

/** Launch-buzz lean: the buzz draw's own quantile (public buzz), high buzz leans to the long stories. */
function oddsFor(buzz0: number): Record<Arch, number> {
  const z = Math.max(0, buzz0) / NPC.BASE0;
  const hb = 1 - Math.pow(1 + z, -NPC.BASE0_ALPHA); // 0 for the quietest launch, near 1 for the loudest
  return {
    rug: ARCH_ODDS.rug * (1.25 - 0.5 * hb),
    quick: ARCH_ODDS.quick * (1.3 - 0.6 * hb),
    grinder: ARCH_ODDS.grinder,
    trender: ARCH_ODDS.trender * (0.5 + 1.0 * hb),
    runner: ARCH_ODDS.runner * (0.35 + 1.3 * hb),
  };
}
function draw(rng: Rng, odds: Record<Arch, number>, skip?: Arch): Arch {
  const keys = ARCHES.filter(a => a !== skip);
  const sum = keys.reduce((s, a) => s + odds[a], 0);
  let u = rng.uniform() * sum;
  for (const a of keys) { u -= odds[a]; if (u <= 0) return a; }
  return keys[keys.length - 1]!;
}
const U = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.uniform();
const I = (rng: Rng, lo: number, hi: number) => Math.floor(U(rng, lo, hi + 1));
/** Small multiplicative drift on a tell knob. */
const drift = (rng: Rng, x: number, s = 0.3) => x * Math.exp(s * (rng.uniform() * 2 - 1));

/** The drive schedule of one archetype (ticks: 12 a minute, 720 a game day). */
function planFor(arch: Arch, rng: Rng): { plan: Seg[]; fadeHalf: number; rugAt: number; rugTicks: number } {
  const plan: Seg[] = [];
  let rugAt = -1, rugTicks = 0, fadeHalf = 60;
  switch (arch) {
    case 'rug': {
      const hype = I(rng, 90, 300);
      plan.push([hype, U(rng, 0.7, 1.3), U(rng, 0.5, 0.53), 1]);
      rugAt = hype; rugTicks = I(rng, 1, 2);
      plan.push([I(rng, 12, 30), U(rng, 1.4, 2.2), U(rng, 0.2, 0.28), 2.5]);
      fadeHalf = I(rng, 6, 24);
      break;
    }
    case 'quick': {
      plan.push([I(rng, 48, 120), U(rng, 0.5, 1.0), U(rng, 0.53, 0.57), 1]);
      plan.push([I(rng, 48, 96), U(rng, 0.6, 1.2), U(rng, 0.44, 0.48), 1.1]);
      plan.push([I(rng, 48, 180), U(rng, 0.5, 1.0), U(rng, 0.33, 0.39), 1.5]);
      fadeHalf = I(rng, 12, 48);
      break;
    }
    case 'grinder': {
      plan.push([I(rng, 72, 160), U(rng, 0.6, 1.0), U(rng, 0.53, 0.56), 1]);
      // the first hour: the launch pump is sold into and chops sideways to lower
      plan.push([I(rng, 480, 840), U(rng, 0.3, 0.5), U(rng, 0.41, 0.44), 0.9]);
      const steps = I(rng, 3, 6);
      for (let k = 0; k < steps; k++) {
        plan.push([I(rng, 60, 200), U(rng, 0.25, 0.5), U(rng, 0.5, 0.525), 0.9]);
        plan.push([I(rng, 60, 240), U(rng, 0.15, 0.3), U(rng, 0.47, 0.5), 0.75]);
      }
      plan.push([I(rng, 120, 360), U(rng, 0.3, 0.5), U(rng, 0.4, 0.45), 0.85]);
      fadeHalf = I(rng, 180, 600);
      break;
    }
    case 'trender': {
      plan.push([I(rng, 72, 160), U(rng, 0.7, 1.2), U(rng, 0.53, 0.56), 1]);
      plan.push([I(rng, 480, 840), U(rng, 0.35, 0.6), U(rng, 0.41, 0.44), 1]);
      const steps = I(rng, 4, 8);
      for (let k = 0; k < steps; k++) {
        plan.push([I(rng, 90, 300), U(rng, 0.25, 0.5), U(rng, 0.495, 0.52), 1]);
        plan.push([I(rng, 120, 400), U(rng, 0.15, 0.35), U(rng, 0.465, 0.495), 0.8]);
      }
      plan.push([I(rng, 240, 720), U(rng, 0.3, 0.6), U(rng, 0.4, 0.45), 0.9]);
      fadeHalf = I(rng, 360, 900);
      break;
    }
    case 'runner': {
      plan.push([I(rng, 72, 160), U(rng, 0.8, 1.3), U(rng, 0.54, 0.58), 1]);
      plan.push([I(rng, 360, 720), U(rng, 0.5, 0.8), U(rng, 0.45, 0.48), 0.6]);
      const steps = I(rng, 2, 4);
      for (let k = 0; k < steps; k++) {
        plan.push([I(rng, 90, 240), U(rng, 0.8, 1.2), U(rng, 0.52, 0.55), 0.6]);
        plan.push([I(rng, 60, 180), U(rng, 0.5, 0.8), U(rng, 0.48, 0.505), 0.5]);
      }
      // the god candles, then the blow-off top
      plan.push([I(rng, 24, 60), U(rng, 2.5, 3.5), U(rng, 0.64, 0.7), 1.4]);
      plan.push([I(rng, 12, 30), U(rng, 1.2, 1.8), U(rng, 0.46, 0.5), 1]);
      plan.push([I(rng, 240, 600), U(rng, 0.5, 0.9), U(rng, 0.43, 0.47), 0.6]);
      fadeHalf = I(rng, 360, 1080);
      break;
    }
  }
  return { plan, fadeHalf, rugAt, rugTicks };
}

/** Tell profile knobs by type: [wallet growth per minute, insider share of purse, dev early-sell chance, dip-buy lean]. */
const TELL: Record<Arch, [number, number, number, number]> = {
  rug: [0.2, 0.9, 0.75, 0.0],
  quick: [0.4, 0.55, 0.25, 0.01],
  grinder: [1.2, 0.4, 0.12, 0.05],
  trender: [2.0, 0.35, 0.1, 0.05],
  runner: [3.0, 0.25, 0.06, 0.07],
};

export function initPa(seed: string, ticker: string, born: number, buzz0: number): PaState {
  const rng = new Rng(seedStream(seed, `lp:pa:${ticker}`));
  const arch = draw(rng, oddsFor(buzz0));
  const mimic = rng.uniform() < 0.3 ? draw(rng, ARCH_ODDS, arch) : arch;
  const p = planFor(arch, rng);
  const [growth, insider, devChance, dip] = TELL[mimic];
  const devSell = rng.uniform() < devChance;
  const pa: PaState = {
    v: 1, arch, mimic, rng: rng.state(), born, e: 0, plan: p.plan, fadeHalf: p.fadeHalf, pumps: [],
    growth: drift(rng, growth, 0.4), insider: clamp(drift(rng, insider, 0.25) * (arch === 'rug' ? 1.5 : 1), 0.1, 1), devSellAt: devSell ? I(rng, 30, 110) : -1,
    devSellFrac: U(rng, 0.2, 0.5), dipBuy: Math.max(0, dip + (rng.uniform() * 2 - 1) * 0.04), breadth: I(rng, 3, 6),
    rugAt: p.rugAt, rugTicks: p.rugTicks, insiderDone: false, devSold: false, lastBuzz: buzz0, lastRet: 0, echo: 0,
  };
  pa.insHold = arch === 'rug' ? p.rugAt : I(rng, 120, 360);
  pa.rng = rng.state();
  return pa;
}

/** The age at which the plan ends and the fade begins. */
export function planEnd(pa: PaState): number { return pa.plan.reduce((a, s) => a + s[0], 0); }

/** Drive, buy probability and size multiplier at this age. Pure. */
export function driveAt(pa: PaState, age: number): { drive: number; buyP: number; size: number } {
  let a = age;
  let last: Seg = pa.plan[pa.plan.length - 1] ?? [1, 0.3, 0.45, 1];
  let out: { drive: number; buyP: number; size: number } | null = null;
  for (const s of pa.plan) { if (a < s[0]) { out = { drive: s[1], buyP: s[2], size: s[3] }; break; } a -= s[0]; last = s; }
  if (!out) {
    const k = Math.pow(0.5, a / Math.max(1, pa.fadeHalf));
    out = { drive: last[1] * k, buyP: 0.41, size: Math.max(0.25, last[3] * Math.sqrt(k)) };
  }
  for (const [start, len, d, b, sz] of pa.pumps) {
    if (age >= start && age < start + len) { out = { drive: out.drive + d, buyP: b, size: Math.max(out.size, sz) }; }
    else if (age >= start + len && age < start + len + 2 * len) { out = { drive: out.drive + d * 0.6, buyP: Math.min(out.buyP, 0.42), size: out.size }; }
  }
  return out;
}

export const PA = {
  /** excitation half-life, ticks */
  EXCITE_HALF: 8,
  /** excitation per settled order, before the size factor */
  ALPHA: 0.012,
  /** fast kernel: half-life in ticks and excitation per order before the size factor */
  FAST_HALF: 2,
  FAST_ALPHA: 0.1,
  /** order size multiplier on the recorded size law */
  SIZE_SCALE: 5.2,
  /** sells aim this much larger than buys in dollars (they are then capped by the seller's bag) */
  SELL_SCALE: 5,
  /** the same for the long stories (grinder, trender, runner), whose holders sell in smaller pieces */
  LONG_SELL_SCALE: 3.5,
  /** pull toward the slow anchor, per unit of log distance, and its half-life in ticks */
  ANCHOR_PULL: 0.1,
  ANCHOR_HALF: 180,
  /** profit taking per unit of log distance above the first price */
  PROFIT_PULL: 0.07,
  /** excitation ceiling, orders per tick */
  E_MAX: 2,
  /** a fresh unit of buzz adds this much excitation (a trender takes TRENDER_BUZZ times more) */
  BUZZ_EXCITE: 0.05,
  TRENDER_BUZZ: 4,
  /** most orders one coin sends in one tick */
  MAX_ORDERS: 24,
  /** one buy may move at most this share of the curve's virtual cash */
  BUY_CAP: 0.12,
  /** a typical order as a share of the reserve, for the excitation size factor */
  TYPICAL_SHARE: 0.015,
  /** a live reply adds this much excitation per tick */
  REPLY_EXCITE: 0.01,
  /** buy size multiplier while the coin leans to selling (dip scalpers' clips) */
  FADE_BUY: 0.4,
  /** least share of that clip left at the launch price (the clip scales with log2 of the price over launch, up to one) */
  FLOOR_BUY: 0.15,
  /** extra sell lean per 10% fall inside one tick (the in-tick panic cascade) */
  PANIC: 0.35,
  /** a unit of viral drip adds this much excitation */
  VIRAL_EXCITE: 0.15,
  /** once attention is this low, holders abandon: each tick one may dump a slice of the bag with this chance */
  ABANDON_LAM: 0.12,
  ABANDON_P: 1 / 40,
  /** chance a seller on a fading rug or quick death exits the whole bag in one order */
  CAPITULATE: 0.25,
} as const;

export { LP };
