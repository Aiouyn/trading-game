// 05 §6.3 belief overlay for graduated meme coins (docs/v1/LAUNCHPAD.md "NPC trader belief").
// Full 15/16 claim authors are V1-OUT: synthetic claims from Wire large-move news + PUMP_CLAIM (22 §4.11)
// gated by hype / attention / Fear. Resolution→lnV handoff is out (no coin fact owner); claims only decay.
import { HYPE, TICKS_PER_DAY } from "@/server/market/meme";
import type { PoolInputs } from "@/server/market/shockFeed";

export const BELIEF = {
  /** PARAM.mkt_belief_cap (23 / 05 §6.3). */
  cap: 0.5,
  /** PARAM.mkt_belief_spread_ticks. */
  spreadTicks: 30,
  /** PARAM.mkt_belief_hl_days → ticks (5 × 720). */
  hlTicks: 5 * TICKS_PER_DAY,
  /** Cap on |a| for a Wire move claim (no 22 meme-move row; CRYPTO_INCIDENT-sized). */
  moveACap: 0.15,
  /** 22 §4.11 PUMP_CLAIM assertedMove. */
  pumpA: 0.10,
  /** Open pump when H ≥ H₀ + this. */
  pumpHGate: 0.15,
  pumpFearOpen: 50,
  pumpFearClose: 70,
  /** RETAIL/DEGEN amplify: × (1 + 2|b| / 0.1) when belief active (05 §6.2). */
  amplifyDenom: 0.1,
  /** Keep at most this many decaying claims on the coin. */
  keep: 16,
} as const;

/** One unresolved (or closed-but-decaying) claim on a coin. */
export interface BeliefClaim {
  id: string;
  a: number;
  cr: number;
  reach: number;
  t0: number;
  /** Pump only: stopped opening; contribution still decays. */
  closed?: true;
}

/** Wire move seed the pools read (from coinNews, published before this tick). */
export interface BeliefMoveSeed {
  id: string;
  tick: number;
  a: number;
  nw: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** b_c(t) = a·cr·reach·(1 − e^{−age/τ})·decay; decay halves every hlTicks. */
export function claimContribution(c: BeliefClaim, tick: number): number {
  const age = Math.max(0, tick - c.t0);
  const spread = 1 - Math.exp(-age / BELIEF.spreadTicks);
  const decay = Math.pow(0.5, age / BELIEF.hlTicks);
  return c.a * c.cr * c.reach * spread * decay;
}

export function sumBelief(claims: readonly BeliefClaim[], tick: number): number {
  let s = 0;
  for (const c of claims) s += claimContribution(c, tick);
  return clamp(s, -BELIEF.cap, BELIEF.cap);
}

/** RETAIL/DEGEN multiplier when belief is active (|b| > 0). */
export const beliefAmplify = (b: number): number =>
  Math.abs(b) > 0 ? 1 + (2 * Math.abs(b)) / BELIEF.amplifyDenom : 1;

/** Credibility for a Wire move claim from its newsworthiness (scaled into [0,1]). */
export const moveCredibility = (nw: number): number => clamp(nw / 0.3, 0, 1);

/** Asserted log move from a Wire large-move item (sign × min(|ln(to/from)|, cap)). */
export function moveAsserted(sign: -1 | 0 | 1, from: number, to: number): number {
  if (sign === 0 || !(from > 0) || !(to > 0)) return 0;
  return sign * Math.min(Math.abs(Math.log(to / from)), BELIEF.moveACap);
}

export interface BeliefUpdate {
  claims: BeliefClaim[];
  /** Next pump episode counter (ids are pump:<n>). */
  pump: number;
  b: number;
}

/**
 * Open move/pump claims idempotently, close pump on H/F/attention gates, prune stale, return overlay b.
 * `pump` is the highest pump episode index already used (0 = none yet).
 */
export function updateBelief(
  prior: readonly BeliefClaim[],
  tick: number,
  h: number,
  pump: number,
  inp: Pick<PoolInputs, "attention" | "fear" | "mentions"> & { moves?: readonly BeliefMoveSeed[] },
): BeliefUpdate {
  const claims: BeliefClaim[] = prior.map((c) => ({ ...c }));
  const seen = new Set(claims.map((c) => c.id));

  for (const m of inp.moves ?? []) {
    if (seen.has(m.id) || m.tick >= tick || m.a === 0) continue;
    const reach = Math.max(clamp(inp.attention - 1, 0, 1), 0.05);
    claims.push({ id: m.id, a: clamp(m.a, -BELIEF.moveACap, BELIEF.moveACap), cr: moveCredibility(m.nw), reach, t0: m.tick });
    seen.add(m.id);
  }

  const openPump = claims.find((c) => c.id.startsWith("pump:") && !c.closed);
  if (
    !openPump
    && h >= HYPE.h0 + BELIEF.pumpHGate
    && inp.attention > 1
    && inp.fear < BELIEF.pumpFearOpen
  ) {
    const cr = clamp(
      0.15
        + 0.45 * ((h - HYPE.h0) / Math.max(1e-9, 1 - HYPE.h0))
        + 0.25 * Math.min(1, inp.attention - 1)
        - 0.30 * (inp.fear / 100),
      0,
      1,
    );
    const reach = Math.min(1, Math.max(inp.mentions, 0.05));
    const next = pump + 1;
    const id = `pump:${next}`;
    if (!seen.has(id)) {
      claims.push({ id, a: BELIEF.pumpA, cr, reach, t0: tick });
      pump = next;
    }
  } else if (openPump && (h < HYPE.h0 || inp.fear >= BELIEF.pumpFearClose || inp.attention <= 1)) {
    openPump.closed = true;
  }

  const kept = claims
    .filter((c) => {
      const age = tick - c.t0;
      if (age < BELIEF.hlTicks * 4) return true;
      return Math.abs(claimContribution(c, tick)) > 1e-6;
    })
    .slice(-BELIEF.keep);

  return { claims: kept, pump, b: sumBelief(kept, tick) };
}

/** One tick of public inputs for a multi-day belief catch-up (storm-style jump). */
export interface BeliefPathTick {
  tick: number;
  h: number;
  attention: number;
  fear: number;
  mentions: number;
  moves?: readonly BeliefMoveSeed[];
}

/**
 * Advance belief across a multi-tick window in one call (ordered path ticks).
 * Semantically identical to calling `updateBelief` once per path entry tick-by-tick.
 * Used to prove jump ≡ step for GK (eng/trader-belief ask).
 */
export function catchUpBelief(
  prior: readonly BeliefClaim[],
  pump: number,
  path: readonly BeliefPathTick[],
): BeliefUpdate {
  let claims: BeliefClaim[] = prior.map((c) => ({ ...c }));
  let p = pump;
  let b = 0;
  for (const step of path) {
    const u = updateBelief(claims, step.tick, step.h, p, {
      attention: step.attention, fear: step.fear, mentions: step.mentions, moves: step.moves,
    });
    claims = u.claims;
    p = u.pump;
    b = u.b;
  }
  return { claims, pump: p, b };
}
